'use strict';
/* ═════════ USB(휴대용) 저장 ═════════
   start-windows.bat / start-mac.command 로 실행하면, 모든 데이터를 USB 폴더의 data/metalcal-data.json 에 저장합니다.
   - 실행할 때 파일을 읽어 이 컴퓨터의 데이터와 합치고, 변경될 때마다 파일에 다시 씀
   - 파일 비밀번호(선택)를 정하면 AES-256 으로 암호화해 저장 → USB 를 잃어버려도 안전
   - 동기화 코드를 쓰면 웹·휴대폰과도 계속 연동 */
const PORT = { on: false, ok: false, blocked: false, path: '', last: 0, err: '', timer: 0, pass: null };

function portLabel() {
  if (!PORT.on) return '';
  if (PORT.blocked) return '🔒 USB 파일 잠김 · 비밀번호 필요';
  if (PORT.err) return '⚠ USB 저장 안 됨 · ' + PORT.err;
  return PORT.last ? `💾 USB 저장됨 · ${pad(new Date(PORT.last).getHours())}:${pad(new Date(PORT.last).getMinutes())}` : '💾 USB 저장 준비';
}
function setPort(err = '') {
  PORT.err = err;
  $$('.portline').forEach(b => { b.textContent = portLabel(); b.className = 'syncline portline ' + (err || PORT.blocked ? 'err' : 'idle'); });
}
async function portableInit() {
  let info = null;
  try {
    const r = await fetch('/__portable/info', { cache: 'no-store' });
    if (r.ok) info = await r.json();
  } catch (e) { }
  if (!info || info.app !== 'metalcal-portable') {
    // 설치된 앱을 실행기 없이 연 경우: 나중에 실행기를 켜면 자동으로 저장
    try { if (localStorage.getItem('mc-portable')) { PORT.on = true; setPort('실행 파일(start)을 켜 주세요'); } } catch (e) { }
    return;
  }
  PORT.on = true; PORT.path = info.path;
  try { localStorage.setItem('mc-portable', '1'); } catch (e) { }
  PORT.pass = sessionStorage.getItem('mc-filepass') || null;
  await portableLoad();
  renderSide();
}
async function portableLoad() {
  const r = await fetch('/__portable/data', { cache: 'no-store' });
  if (r.status === 404) { await portableSave(); return; }   // 첫 실행: 지금 데이터로 파일 생성
  let data = await r.json();
  if (data.format === 'metalcal-enc') {
    for (let tries = 0; ; tries++) {
      if (!PORT.pass) PORT.pass = await askText('USB 파일 잠금 해제', tries ? '비밀번호가 틀렸습니다. 다시 입력하세요.' : 'USB 데이터 파일의 비밀번호를 입력하세요.');
      if (!PORT.pass) { PORT.blocked = true; setPort(); toast('비밀번호 없이 열어 USB 파일에는 저장하지 않습니다'); return; }
      try { data = await decryptObj(data, PORT.pass); sessionStorage.setItem('mc-filepass', PORT.pass); break; }
      catch (e) { PORT.pass = null; }
    }
  }
  const payload = data.payload || data;
  const M = mergePayload(localPayload(), payload);
  if (await applyMerged(M)) render();
  PORT.blocked = false;
  await portableSave();
}
async function portableSave() {
  if (!PORT.on || PORT.blocked) return;
  try {
    let body = { format: 'metalcal-file', v: 1, savedAt: new Date().toISOString(), payload: localPayload() };
    if (PORT.pass) body = await encryptObj(body, PORT.pass);
    const r = await fetch('/__portable/data', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('쓰기 실패 ' + r.status);
    PORT.last = Date.now(); PORT.ok = true;
    setPort();
  } catch (e) {
    PORT.ok = false;
    setPort(e.message === 'Failed to fetch' ? '실행 파일(start)을 켜 주세요' : e.message);
  }
}
function portableDirty() {
  if (!PORT.on || PORT.blocked) return;
  clearTimeout(PORT.timer);
  PORT.timer = setTimeout(portableSave, 800);
}
window.addEventListener('pagehide', () => { if (PORT.on && !PORT.blocked && PORT.timer) { clearTimeout(PORT.timer); portableSave(); } });

function portableSectionHTML() {
  if (!PORT.on) return '';
  return `<section><h4>USB 휴대용 저장</h4>
    <p class="note">이 앱은 <b>USB 폴더 안의 데이터 파일</b>에 저장되고 있습니다. USB를 다른 컴퓨터에 꽂고 <b>start-windows.bat</b>(윈도우) 또는 <b>start-mac.command</b>(맥)를 실행하면 그대로 이어서 쓸 수 있습니다. 하루 한 번 자동 백업(최근 30개)도 함께 남습니다.</p>
    <div class="srow"><span>상태<small>${esc(portLabel())}</small></span><button class="btn sm primary" data-pt="save">지금 저장</button></div>
    ${PORT.path ? `<div class="srow"><span>파일 위치<small class="code" style="letter-spacing:0;font-size:12px!important">${esc(PORT.path)}</small></span></div>` : ''}
    <div class="srow"><span>파일 비밀번호 (권장)<small>${PORT.pass ? '🔒 암호화되어 저장 중 — USB를 잃어버려도 내용을 볼 수 없습니다' : '설정 안 됨 — 파일이 암호화되지 않은 상태입니다'}</small></span>
      <button class="btn sm" data-pt="pass">${PORT.pass ? '비밀번호 변경' : '비밀번호 설정'}</button>${PORT.pass ? '<button class="btn sm" data-pt="nopass">해제</button>' : ''}</div></section>`;
}
async function portableAction(a, redraw) {
  if (a === 'save') { await portableSave(); toast(PORT.err ? PORT.err : 'USB에 저장했습니다'); }
  else if (a === 'pass') {
    const p1 = await askText('USB 파일 비밀번호', '파일을 열 때마다 묻습니다. 잊으면 복구할 수 없으니 꼭 기억하세요.');
    if (!p1) return;
    const p2 = await askText('비밀번호 확인', '같은 비밀번호를 한 번 더 입력하세요.');
    if (p1 !== p2) return toast('비밀번호가 일치하지 않습니다');
    PORT.pass = p1; sessionStorage.setItem('mc-filepass', p1);
    await portableSave(); toast('🔒 USB 파일을 암호화했습니다');
  } else if (a === 'nopass') {
    if (!(await choose('암호화 해제', 'USB 파일이 암호 없이 저장됩니다. USB를 잃어버리면 내용이 노출될 수 있습니다.', [['ok', '해제', 'danger']]))) return;
    PORT.pass = null; sessionStorage.removeItem('mc-filepass');
    await portableSave(); toast('암호화를 해제했습니다');
  }
  redraw();
}
