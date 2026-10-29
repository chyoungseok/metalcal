'use strict';
/* ═════════ 기기 간 동기화 (종단간 암호화) ═════════
   - 동기화 코드(100비트 무작위)에서 암호키·보관함 ID·접근 토큰을 파생 (PBKDF2)
   - 모든 데이터는 기기에서 AES-256-GCM 으로 암호화된 뒤 전송 → 서버는 내용을 볼 수 없음
   - 항목별 최신 수정 우선 병합 + 삭제 기록(tombstone) → 여러 기기에서 동시에 써도 수렴 */
const SYNC = { cfg: null, keys: null, state: 'off', last: 0, err: '', busy: false, again: false, timer: 0 };

function syncLabel() {
  if (!SYNC.cfg) return '☁ 동기화 꺼짐 · 설정';
  if (SYNC.state === 'busy') return '☁ 동기화 중…';
  if (SYNC.state === 'err') return '⚠ 동기화 오류 · 확인';
  return SYNC.last ? `☁ 동기화됨 · ${pad(new Date(SYNC.last).getHours())}:${pad(new Date(SYNC.last).getMinutes())}` : '☁ 동기화 대기';
}
function setSync(state, err = '') {
  SYNC.state = state; SYNC.err = err;
  $$('.syncline').forEach(b => { b.className = 'syncline ' + state; b.textContent = syncLabel(); b.title = err; });
  const s = $('#syncStat'); if (s) s.textContent = err || syncLabel();
}
function genSyncCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789', r = crypto.getRandomValues(new Uint8Array(20));
  return [...r].map((b, i) => A[b % 32] + (i % 4 === 3 && i < 19 ? '-' : '')).join('');
}
const normCode = c => (c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
async function deriveSync(code) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(normCode(code)), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode('metalcal-sync-v1'), iterations: 200000, hash: 'SHA-256' }, base, 512));
  const hex = u => [...u].map(b => b.toString(16).padStart(2, '0')).join('');
  return {
    key: await crypto.subtle.importKey('raw', bits.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']),
    vault: hex(new Uint8Array(await crypto.subtle.digest('SHA-256', bits.slice(32, 48)))).slice(0, 32),
    token: hex(bits.slice(48, 64))
  };
}
async function syncLoad() {
  SYNC.cfg = (await DB.get('sync')) || null;
  if (SYNC.cfg) { SYNC.keys = await deriveSync(SYNC.cfg.code); setSync('idle'); }
}

/* ── 병합 ── */
const ts = x => x.updated || x.end || x.created || 0;
function mergeList(a, b, tomb) {
  const m = new Map();
  for (const x of [...a, ...b]) { const c = m.get(x.id); if (!c || ts(x) > ts(c)) m.set(x.id, x); }
  return [...m.values()].filter(x => !(tomb[x.id] >= ts(x))).sort((x, y) => x.id < y.id ? -1 : 1);
}
function localPayload() {
  return { v: 2, events: S.events, pomos: S.pomos, goals: S.goals, accounts: S.accounts, txns: S.txns, notes: S.notes, settings: S.settings, tomb: S.tomb };
}
function mergePayload(L, R) {
  const tomb = Object.assign({}, R.tomb || {});
  for (const [k, v] of Object.entries(L.tomb || {})) if (!(tomb[k] >= v)) tomb[k] = v;
  const cut = Date.now() - 180 * 864e5;
  for (const k in tomb) if (tomb[k] < cut) delete tomb[k];
  return {
    v: 1, tomb,
    events: mergeList(L.events, R.events || [], tomb),
    pomos: mergeList(L.pomos, R.pomos || [], tomb),
    goals: mergeList(L.goals, R.goals || [], tomb),
    accounts: mergeList(L.accounts || [], R.accounts || [], tomb),
    txns: mergeList(L.txns || [], R.txns || [], tomb),
    notes: mergeList(L.notes || [], R.notes || [], tomb),
    settings: ((R.settings && R.settings._u) || 0) >= ((L.settings && L.settings._u) || 0) ? R.settings : L.settings
  };
}
const canon = (list) => JSON.stringify((list || []).slice().sort((x, y) => x.id < y.id ? -1 : 1));
const canonP = p => canon(p.events) + canon(p.pomos) + canon(p.goals) + canon(p.accounts) + canon(p.txns) + canon(p.notes) + JSON.stringify(p.settings) + JSON.stringify(Object.keys(p.tomb || {}).sort().map(k => [k, p.tomb[k]]));

async function applyMerged(M) {
  let changed = false;
  if (canon(M.events) !== canon(S.events)) { S.events = M.events; await DB.clear('events'); await DB.putMany('events', S.events); changed = true; }
  if (canon(M.pomos) !== canon(S.pomos)) { S.pomos = M.pomos; await DB.clear('pomos'); await DB.putMany('pomos', S.pomos); changed = true; }
  if (canon(M.goals) !== canon(S.goals)) { S.goals = M.goals; await DB.set('goals', S.goals); changed = true; }
  if (canon(M.accounts) !== canon(S.accounts)) { S.accounts = M.accounts; await DB.set('accounts', S.accounts); changed = true; }
  if (canon(M.notes) !== canon(S.notes)) {
    // 지금 편집 중인 기록은 내 쪽 내용을 유지
    if (isTypingNote()) { const mine = S.notes.find(n => n.id === S.noteId); if (mine) M.notes = M.notes.map(n => n.id === mine.id ? mine : n); }
    S.notes = M.notes; await DB.set('notes', S.notes); changed = true;
  }
  if (canon(M.txns) !== canon(S.txns)) { S.txns = M.txns; await DB.set('txns', S.txns); changed = true; }
  if (JSON.stringify(M.settings) !== JSON.stringify(S.settings)) {
    S.settings = Object.assign(defaultSettings(), M.settings, { pomo: Object.assign(defaultSettings().pomo, M.settings.pomo || {}), ledger: Object.assign(DEF_LEDGER(), M.settings.ledger || {}) });
    await DB.set('settings', S.settings); applyTheme(); changed = true;
  }
  S.tomb = M.tomb; await DB.set('tomb', S.tomb);
  return changed;
}

/* ── 서버 통신 ── */
const vaultURL = () => SYNC.cfg.url.replace(/\/+$/, '') + '/v/' + SYNC.keys.vault;
async function pull() {
  const r = await fetch(vaultURL(), { headers: { Authorization: 'Bearer ' + SYNC.keys.token }, cache: 'no-store' });
  if (r.status === 404) return { rev: 0, data: null };
  if (r.status === 403) throw new Error('이 코드의 접근 권한이 없습니다');
  if (!r.ok) throw new Error('서버 응답 오류 ' + r.status);
  const j = await r.json();
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(j.iv) }, SYNC.keys.key, b64d(j.data));
  return { rev: j.rev, data: JSON.parse(new TextDecoder().decode(pt)) };
}
async function push(rev, payload) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, SYNC.keys.key, new TextEncoder().encode(JSON.stringify(payload)));
  const r = await fetch(vaultURL(), { method: 'PUT', headers: { Authorization: 'Bearer ' + SYNC.keys.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ rev, iv: b64e(iv), data: b64e(new Uint8Array(ct)) }) });
  if (r.status === 409) return false;
  if (!r.ok) throw new Error('업로드 실패 ' + r.status);
  return true;
}
async function syncNow() {
  if (!SYNC.cfg || !SYNC.keys) return;
  if (SYNC.busy || DR.drag) { SYNC.again = true; return; }
  if (!navigator.onLine) return setSync('err', '오프라인 — 연결되면 자동 동기화');
  SYNC.busy = true; setSync('busy');
  try {
    for (let i = 0; i < 4; i++) {
      const R = await pull();
      const M = R.data ? mergePayload(localPayload(), R.data) : localPayload();
      if (R.data && await applyMerged(M)) { portableDirty(); if ((!$('.ov') || S.view === 'pomo') && !isTypingNote()) render(); else renderSide(); }
      if (R.data && canonP(M) === canonP(R.data)) break;
      if (await push(R.rev, M)) break;
    }
    SYNC.last = Date.now();
    setSync('idle');
  } catch (e) {
    setSync('err', e.message === 'Failed to fetch' ? '서버에 연결할 수 없습니다 (주소 확인)' : e.message);
  } finally {
    SYNC.busy = false;
    if (SYNC.again) { SYNC.again = false; setTimeout(syncNow, 500); }
  }
}
function markDirty() {
  portableDirty();
  if (!SYNC.cfg) return;
  clearTimeout(SYNC.timer);
  SYNC.timer = setTimeout(syncNow, 2000);
}

/* ── 설정 화면 ── */
function syncSectionHTML() {
  if (!SYNC.cfg) return `<section><h4>기기 간 동기화 (종단간 암호화)</h4>
    <p class="note">웹·모바일·다른 컴퓨터의 기록을 하나로 맞춥니다. 데이터는 이 기기에서 <b>동기화 코드로 암호화된 뒤</b> 내 동기화 서버(Cloudflare 무료)에 보관되므로, 서버 운영자도 내용을 볼 수 없습니다.
    서버 만드는 법은 <b>README의 ‘동기화 서버 만들기’</b>(약 5분)를 참고하세요.</p>
    <label class="gf"><span>동기화 서버 주소</span><input class="in" id="syUrl" placeholder="https://metalcal-sync.내계정.workers.dev" value="${esc(localStorage.getItem('mc-syurl') || '')}"></label>
    <div class="btns"><button class="btn sm primary" data-sy="new">처음 기기: 새 동기화 시작</button><button class="btn sm" data-sy="join">다른 기기의 코드 입력</button></div></section>`;
  return `<section><h4>기기 간 동기화 (종단간 암호화)</h4>
    <div class="srow"><span>상태<small id="syncStat">${esc(SYNC.err || syncLabel())}</small></span><button class="btn sm primary" data-sy="now">지금 동기화</button></div>
    <div class="srow"><span>서버<small>${esc(SYNC.cfg.url)}</small></span></div>
    <div class="srow"><span>동기화 코드 — 다른 기기에서 이 코드를 입력하세요<small class="code" id="syCode">${'•••• '.repeat(5)}</small></span><button class="btn sm" data-sy="show">보기</button><button class="btn sm" data-sy="copy">복사</button></div>
    <p class="note">⚠ 동기화 코드는 <b>암호 열쇠</b>입니다. 잃어버리면 서버의 데이터를 복구할 수 없고(각 기기의 데이터는 그대로), 남에게 알려지면 일정이 노출됩니다.</p>
    <div class="btns"><button class="btn sm danger" data-sy="off">이 기기 동기화 해제</button></div></section>`;
}
async function syncAction(a, redraw) {
  if (a === 'new' || a === 'join') {
    const url = ($('#syUrl').value || '').trim().replace(/\/+$/, '');
    if (!/^https?:\/\//.test(url)) return toast('동기화 서버 주소를 입력하세요');
    localStorage.setItem('mc-syurl', url);
    try { const r = await fetch(url, { cache: 'no-store' }); const j = await r.json(); if (j.app !== 'metalcal-sync') throw 0; }
    catch (e) { return toast('메탈 캘린더 동기화 서버가 아닙니다. 주소를 확인하세요'); }
    let code;
    if (a === 'new') code = genSyncCode();
    else {
      code = await askText('동기화 코드 입력', '처음 기기의 설정 → 동기화에 표시된 코드(XXXX-XXXX-XXXX-XXXX-XXXX)를 입력하세요.', 'text');
      if (!code) return;
      if (normCode(code).length !== 20) return toast('코드는 20자리입니다');
    }
    SYNC.cfg = { url, code: normCode(code).match(/.{4}/g).join('-') };
    setSync('busy');
    SYNC.keys = await deriveSync(SYNC.cfg.code);
    if (a === 'join') {
      try { const R = await pull(); if (!R.data && !(await choose('데이터 없음', '이 코드로 저장된 데이터가 없습니다. 코드가 맞나요? 맞다면 이 기기의 데이터로 새로 시작합니다.', [['ok', '계속', 'primary']]))) { SYNC.cfg = null; SYNC.keys = null; return redraw(); } }
      catch (e) { SYNC.cfg = null; SYNC.keys = null; toast(e.message); return redraw(); }
    }
    await DB.set('sync', SYNC.cfg);
    await syncNow();
    redraw();
    if (a === 'new') { await navigator.clipboard?.writeText(SYNC.cfg.code).catch(() => { }); toast('동기화 시작! 코드를 복사했습니다 — 다른 기기에서 입력하세요'); }
    else toast('동기화되었습니다');
  } else if (a === 'now') syncNow();
  else if (a === 'show') { const c = $('#syCode'); c.textContent = c.textContent.includes('•') ? SYNC.cfg.code : '•••• '.repeat(5); }
  else if (a === 'copy') { try { await navigator.clipboard.writeText(SYNC.cfg.code); toast('코드를 복사했습니다'); } catch (e) { toast(SYNC.cfg.code); } }
  else if (a === 'off') {
    if (!(await choose('동기화 해제', '이 기기의 데이터는 그대로 남고, 더 이상 다른 기기와 맞추지 않습니다.', [['ok', '해제', 'danger']]))) return;
    SYNC.cfg = null; SYNC.keys = null; await DB.set('sync', null); setSync('off'); redraw();
  }
}
