# Metal Calendar - USB(휴대용) 실행기 / Windows
# 내장 PowerShell 로 http://localhost:8765 에서 앱을 띄우고,
# 모든 데이터를 이 폴더의 data\metalcal-data.json 파일에 저장합니다. (서버·인터넷 불필요)
$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$dataDir = Join-Path $root 'data'
$dataFile = Join-Path $dataDir 'metalcal-data.json'
$backupDir = Join-Path $dataDir 'backup'
$port = 8765
$url = "http://localhost:$port/"

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add($url)
try { $listener.Start() } catch {
  # 이미 실행 중이거나 포트 사용 중 → 브라우저만 열기
  Start-Process $url
  exit
}
Start-Process $url

$types = @{
  '.html' = 'text/html; charset=utf-8'; '.js' = 'text/javascript; charset=utf-8'; '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json'; '.webmanifest' = 'application/manifest+json'; '.png' = 'image/png'
  '.svg' = 'image/svg+xml'; '.ico' = 'image/x-icon'
}
$utf8 = New-Object System.Text.UTF8Encoding($false)

function Send($res, [int]$code, [byte[]]$bytes, [string]$type) {
  $res.StatusCode = $code
  $res.ContentType = $type
  $res.Headers.Add('Cache-Control', 'no-store')
  $res.ContentLength64 = $bytes.Length
  $res.OutputStream.Write($bytes, 0, $bytes.Length)
}
function SendJson($res, [int]$code, [string]$json) { Send $res $code $utf8.GetBytes($json) 'application/json; charset=utf-8' }

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request
  $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/__portable/info') {
      SendJson $res 200 (@{ app = 'metalcal-portable'; path = $dataFile } | ConvertTo-Json -Compress)
    }
    elseif ($path -eq '/__portable/data') {
      if ($req.HttpMethod -eq 'GET') {
        if (Test-Path -LiteralPath $dataFile) { Send $res 200 ([IO.File]::ReadAllBytes($dataFile)) 'application/json; charset=utf-8' }
        else { SendJson $res 404 '{"error":"empty"}' }
      }
      elseif ($req.HttpMethod -eq 'PUT') {
        $reader = New-Object IO.StreamReader($req.InputStream, $utf8)
        $body = $reader.ReadToEnd()
        $reader.Close()
        if (-not $body.TrimStart().StartsWith('{')) { SendJson $res 400 '{"error":"bad"}' }
        else {
          New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
          $tmp = "$dataFile.tmp"
          [IO.File]::WriteAllText($tmp, $body, $utf8)
          Move-Item -LiteralPath $tmp -Destination $dataFile -Force
          # 하루 한 개씩 자동 백업 (최근 30개 보관)
          Copy-Item -LiteralPath $dataFile -Destination (Join-Path $backupDir ("metalcal-" + (Get-Date -Format 'yyyy-MM-dd') + ".json")) -Force
          Get-ChildItem -LiteralPath $backupDir -Filter 'metalcal-*.json' | Sort-Object Name -Descending | Select-Object -Skip 30 | Remove-Item -Force
          SendJson $res 200 '{"ok":true}'
        }
      }
      else { SendJson $res 405 '{"error":"method"}' }
    }
    else {
      $rel = $path.TrimStart('/')
      if ($rel -eq '') { $rel = 'index.html' }
      $file = [IO.Path]::GetFullPath((Join-Path $root $rel))
      $blocked = $file.StartsWith($dataDir, [StringComparison]::OrdinalIgnoreCase)
      if ($blocked -or -not $file.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -or -not (Test-Path -LiteralPath $file -PathType Leaf)) {
        SendJson $res 404 '{"error":"not found"}'
      } else {
        $ext = [IO.Path]::GetExtension($file).ToLower()
        $type = $(if ($types.ContainsKey($ext)) { $types[$ext] } else { 'application/octet-stream' })
        Send $res 200 ([IO.File]::ReadAllBytes($file)) $type
      }
    }
  } catch {
    try { SendJson $res 500 '{"error":"server"}' } catch {}
  } finally {
    $res.Close()
  }
}
