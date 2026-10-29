#!/usr/bin/env python3
# Metal Calendar - USB(휴대용) 실행기 / Mac
# http://localhost:8765 에서 앱을 띄우고, 모든 데이터를 이 폴더의 data/metalcal-data.json 에 저장합니다.
import datetime, http.server, json, os, shutil, socketserver, sys, webbrowser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, 'data')
DATA_FILE = os.path.join(DATA_DIR, 'metalcal-data.json')
BACKUP_DIR = os.path.join(DATA_DIR, 'backup')
PORT = int(sys.argv[sys.argv.index('--port') + 1]) if '--port' in sys.argv else 8765
URL = f'http://localhost:{PORT}/'
ALLOWED_HOSTS = {f'localhost:{PORT}', f'127.0.0.1:{PORT}'}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store' if self.path.startswith('/__portable') else 'no-cache')
        super().end_headers()

    def log_message(self, *a):
        pass

    def send_json(self, code, obj=None, raw=None):
        b = raw if raw is not None else json.dumps(obj).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def host_ok(self):
        return self.headers.get('Host', '') in ALLOWED_HOSTS

    def do_GET(self):
        if not self.host_ok():
            return self.send_json(403, {'error': 'host'})
        p = self.path.split('?')[0]
        if p == '/__portable/info':
            return self.send_json(200, {'app': 'metalcal-portable', 'path': DATA_FILE})
        if p == '/__portable/data':
            if not os.path.exists(DATA_FILE):
                return self.send_json(404, {'error': 'empty'})
            with open(DATA_FILE, 'rb') as f:
                return self.send_json(200, raw=f.read())
        if p.startswith('/data/') or p.startswith('/mac/') or p.startswith('/windows/'):
            return self.send_json(404, {'error': 'not found'})
        return super().do_GET()

    def do_PUT(self):
        if not self.host_ok() or self.path.split('?')[0] != '/__portable/data':
            return self.send_json(404, {'error': 'not found'})
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        try:
            json.loads(body)
        except Exception:
            return self.send_json(400, {'error': 'bad json'})
        os.makedirs(BACKUP_DIR, exist_ok=True)
        tmp = DATA_FILE + '.tmp'
        with open(tmp, 'wb') as f:
            f.write(body)
        os.replace(tmp, DATA_FILE)
        # 하루 한 개씩 자동 백업 (최근 30개 보관)
        shutil.copyfile(DATA_FILE, os.path.join(BACKUP_DIR, f'metalcal-{datetime.date.today().isoformat()}.json'))
        for old in sorted(f for f in os.listdir(BACKUP_DIR) if f.startswith('metalcal-'))[:-30]:
            os.remove(os.path.join(BACKUP_DIR, old))
        return self.send_json(200, {'ok': True})


class Server(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True


if __name__ == '__main__':
    try:
        srv = Server(('127.0.0.1', PORT), Handler)
    except OSError:
        webbrowser.open(URL)  # 이미 실행 중
        sys.exit(0)
    print(f'메탈 캘린더 실행 중: {URL}\n데이터 파일: {DATA_FILE}\n이 창을 닫으면 파일 저장이 멈춥니다 (앱은 계속 열 수 있음).')
    if '--no-open' not in sys.argv:
        webbrowser.open(URL)
    srv.serve_forever()
