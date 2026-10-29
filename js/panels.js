'use strict';
/* ═════════ 검색 · 빠른 추가 · 설정 · 백업/가져오기 ═════════ */

function toast(msg, undo) {
  const t = document.createElement('div');
  t.className = 'tst';
  t.innerHTML = `<span>${esc(msg)}</span>${undo && S.undo ? '<button>실행 취소</button>' : ''}`;
  $('#toast').appendChild(t);
  const b = t.querySelector('button');
  if (b) b.onclick = () => { t.remove(); undoLast(); };
  setTimeout(() => t.remove(), undo ? 5000 : 2600);
}

/* ── 검색 (과거/미래 키워드) ── */
function openSearch() {
  const st = { q: '', when: 'all', color: null };
  const ov = modal(`<div class="dlg-h"><b>일정 검색</b><button class="btn sm" data-x>닫기</button></div>
    <div class="srch"><input class="in" id="sQ" placeholder="키워드 (제목·메모·장소·#태그) — 공백으로 여러 단어" autocomplete="off" enterkeyhint="search">
    <div class="seg full" id="sWhen">${[['all', '전체'], ['future', '예정'], ['past', '지난 일정']].map(([k, l]) => `<button data-when="${k}" class="${k === 'all' ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="chips" id="sCol">${S.settings.colors.map(c => `<button class="chip" data-scol="${c.id}" style="box-shadow:inset 3px 0 0 ${c.hex}">${esc(c.name)}</button>`).join('')}</div></div>
    <div class="sres" id="sRes"></div>`, 'wide');
  const dlg = ov.firstChild, q = $('#sQ', dlg);
  const run = () => {
    const words = st.q.toLowerCase().split(/\s+/).filter(Boolean);
    HL = words.length ? new RegExp(words.map(w => w.replace(/^#/, '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi') : null;
    const today = todayS(), from = addDaysS(today, -365 * 5), to = addDaysS(today, 365 * 3);
    const res = [];
    if (words.length || st.color) {
      for (const ev of S.events) {
        if (st.color && ev.color !== st.color) continue;
        const hay = [ev.title, ev.notes, ev.location, ...(ev.tags || []).map(t => '#' + t), colorOf(ev.color).name].join(' ').toLowerCase();
        if (!words.every(w => hay.includes(w))) continue;
        let occs = expandEvent(ev, st.when === 'future' ? today : from, st.when === 'past' ? addDaysS(today, -1) : to);
        if (st.when === 'past') occs = occs.filter(o => o.dispEnd < today);
        if (ev.rrule && !ev.rrule.afterDone) {
          // 반복 일정은 가장 가까운 지난 1개 + 다가올 3개만
          const past = occs.filter(o => o.date < today), fut = occs.filter(o => o.date >= today);
          occs = [...past.slice(-1), ...fut.slice(0, st.when === 'past' ? 0 : 3)];
          if (st.when === 'past') occs = past.slice(-3);
        }
        res.push(...occs);
      }
    }
    res.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
    if (st.when === 'past') res.reverse();
    res.forEach(o => S.occMap.set(o.key, o));
    const box = $('#sRes', dlg);
    if (!words.length && !st.color) { box.innerHTML = '<div class="empty">찾을 일정의 키워드를 입력하세요.<br>예) <b>회의</b>, <b>#업무</b>, <b>강남</b></div>'; return; }
    const fut = res.filter(o => o.dispEnd >= today), past = res.filter(o => o.dispEnd < today);
    const notes = words.length && !st.color ? S.notes.filter(n => { const h = (n.title + ' ' + n.body + ' ' + noteTags(n).map(t => '#' + t).join(' ')).toLowerCase(); return words.every(w => h.includes(w.replace(/^#/, ''))); }) : [];
    if (!res.length && !notes.length) { box.innerHTML = '<div class="empty">검색 결과가 없습니다.</div>'; return; }
    box.innerHTML = (notes.length ? `<div class="gh">기록장 · ${notes.length}</div>` + notes.map(n => `<div class="li" data-snote="${n.id}" style="--c:var(--accent)"><div class="lt"><b>📝 ${hl(noteTitle(n))}</b><small>${esc(noteTags(n).map(t => '#' + t).join(' ') || relDay(ymd(new Date(n.updated))))}</small></div></div>`).join('') : '') + (fut.length ? `<div class="gh">예정 · ${fut.length}</div>` + fut.map(o => occLine(o, true)).join('') : '') +
      (past.length ? `<div class="gh">지난 일정 · ${past.length}</div>` + past.map(o => occLine(o, true)).join('') : '');
  };
  q.addEventListener('input', () => { st.q = q.value; run(); });
  dlg.addEventListener('click', e => {
    const sn = e.target.closest('[data-snote]');
    if (sn) { closeModal(ov); S.noteId = sn.dataset.snote; setView('notes'); return; }
    const b = e.target.closest('[data-when],[data-scol],[data-x],[data-occ],[data-check]');
    if (!b) return;
    if (b.dataset.x != null) return closeModal(ov);
    if (b.dataset.check) { toggleDone(b.dataset.check).then(run); return; }
    if (b.dataset.when) { st.when = b.dataset.when; $$('[data-when]', dlg).forEach(x => x.classList.toggle('on', x === b)); run(); }
    else if (b.dataset.scol) { st.color = st.color === b.dataset.scol ? null : b.dataset.scol; $$('[data-scol]', dlg).forEach(x => x.classList.toggle('drop-hi', x.dataset.scol === st.color)); run(); }
    else if (b.dataset.occ) {
      const o = S.occMap.get(b.dataset.occ);
      closeModal(ov);
      S.cur = S.sel = o.date;
      if (!['month', 'week', 'day'].includes(S.view)) S.view = 'day';
      render();
      openEditor(S.occMap.get(o.key) || o);
    }
  });
  ov._onClose = () => { HL = null; };
  setTimeout(() => q.focus(), 60);
  run();
}

/* ── 빠른 추가 시트 (모바일 + 버튼, 매트릭스 +) ── */
function openQuick(opts = {}) {
  let type = opts.type || 'event';
  const ov = modal(`<div class="dlg-h"><button class="btn" data-x>취소</button><b>빠른 추가</b><button class="btn primary" data-qgo>추가</button></div>
    <div class="ed"><input class="in title-in" id="qIn" placeholder="예: 내일 오후 3시 팀 회의 #업무" autocomplete="off" enterkeyhint="done">
    <div class="seg full" id="qType">${[['event', '일정'], ['task', '할 일'], ['mark', '날짜 표시·휴가']].map(([k, l]) => `<button data-qt="${k}" class="${k === type ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="qprev" id="qPrev"></div>
    <div class="qhelp">자연어로 입력하면 날짜·시간·반복이 자동 인식됩니다.<br>
      <code>모레 7시 저녁 약속</code> <code>다음주 금요일 10:30~12시 미팅</code> <code>매주 월수금 아침 7시 헬스</code>
      <code>매월 25일 카드 결제</code> <code>평일마다 9시 스탠드업</code> <code>#태그</code> <code>!1~!4 (우선순위)</code></div>
    <div class="fr" style="justify-content:flex-end"><button class="btn" data-qdetail>상세 입력…</button></div></div>`);
  const dlg = ov.firstChild, inp = $('#qIn', dlg);
  const o2 = () => Object.assign({}, opts, { type });
  const upd = () => { const p = parseQuick(inp.value); $('#qPrev', dlg).innerHTML = inp.value.trim() ? quickPreview(p, o2()) : `<span>${fmtDateK(opts.date || S.sel || todayS())}에 추가됩니다.</span>`; };
  const go = async () => {
    if (!inp.value.trim()) return inp.focus();
    const ev = quickToEvent(parseQuick(inp.value), o2());
    snapshot(); await saveEv(ev); closeModal(ov);
    toast(`「${ev.title}」 ${relDay(ev.startDate)}에 추가됨`, true);
    render();
  };
  inp.addEventListener('input', upd);
  inp.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); go(); } });
  dlg.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.x != null) closeModal(ov);
    else if (b.dataset.qgo != null) go();
    else if (b.dataset.qt) { type = b.dataset.qt; $$('[data-qt]', dlg).forEach(x => x.classList.toggle('on', x === b)); upd(); }
    else if (b.dataset.qdetail != null) {
      const ev = quickToEvent(parseQuick(inp.value || ''), o2());
      if (!inp.value.trim()) ev.title = '';
      closeModal(ov);
      openEditor(ev);
    }
  });
  upd();
  setTimeout(() => inp.focus(), 80);
}

/* ── 백업 · 암호화 · ICS ── */
const b64e = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
const b64d = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass, salt) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 250000, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encryptObj(obj, pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(pass, salt);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { format: 'metalcal-enc', v: 1, kdf: 'PBKDF2-SHA256-250000', salt: b64e(salt), iv: b64e(iv), data: b64e(new Uint8Array(ct)) };
}
async function decryptObj(o, pass) {
  const key = await deriveKey(pass, b64d(o.salt));
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64d(o.iv) }, key, b64d(o.data));
  return JSON.parse(new TextDecoder().decode(pt));
}
async function saveFile(name, text, mime) {
  const blob = new Blob([text], { type: mime });
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare) {
    const file = new File([blob], name, { type: mime });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function pickFile(accept) {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file'; i.accept = accept;
    i.onchange = () => { const f = i.files[0]; if (!f) return res(null); f.text().then(res); };
    i.click();
  });
}
function askText(title, label, type = 'password') {
  return new Promise(res => {
    const ov = modal(`<div class="dlg-h"><button class="btn" data-x>취소</button><b>${esc(title)}</b><button class="btn primary" data-ok>확인</button></div>
      <div class="ed"><p class="hint">${esc(label)}</p><input class="in" type="${type}" id="askIn" autocomplete="new-password"></div>`);
    const inp = $('#askIn', ov);
    ov._onClose = () => res(null);
    const ok = () => { ov._onClose = null; ov.remove(); res(inp.value); };
    ov.addEventListener('click', e => { if (e.target.closest('[data-x]')) closeModal(ov); if (e.target.closest('[data-ok]')) ok(); });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
    setTimeout(() => inp.focus(), 60);
  });
}
const stamp = () => { const d = new Date(); return `${ymd(d)}_${pad(d.getHours())}${pad(d.getMinutes())}`; };

async function exportBackup(encrypt) {
  const data = { format: 'metalcal', v: 2, exportedAt: new Date().toISOString(), settings: S.settings, events: S.events, pomos: S.pomos, goals: S.goals, accounts: S.accounts, txns: S.txns, notes: S.notes };
  let out = data;
  if (encrypt) {
    const p1 = await askText('암호화 백업', '백업 파일 비밀번호를 정하세요. (잊으면 복구할 수 없습니다)');
    if (!p1) return;
    const p2 = await askText('비밀번호 확인', '같은 비밀번호를 한 번 더 입력하세요.');
    if (p1 !== p2) return toast('비밀번호가 일치하지 않습니다');
    out = await encryptObj(data, p1);
  }
  await saveFile(`metalcal-backup_${stamp()}${encrypt ? '.locked' : ''}.json`, JSON.stringify(out), 'application/json');
  await DB.set('lastBackup', Date.now());
  toast('백업 파일을 저장했습니다');
}
async function importBackup() {
  const txt = await pickFile('.json,application/json');
  if (!txt) return;
  let data;
  try { data = JSON.parse(txt); } catch (e) { return toast('올바른 백업 파일이 아닙니다'); }
  if (data.format === 'metalcal-enc') {
    const pass = await askText('암호화된 백업', '백업할 때 정한 비밀번호를 입력하세요.');
    if (!pass) return;
    try { data = await decryptObj(data, pass); } catch (e) { return toast('비밀번호가 틀렸거나 파일이 손상되었습니다'); }
  }
  if (data.format !== 'metalcal' || !Array.isArray(data.events)) return toast('메탈 캘린더 백업 파일이 아닙니다');
  const how = await choose('백업 가져오기', `일정 ${data.events.length}개가 들어 있습니다.`, [['merge', '기존 일정과 합치기', 'primary'], ['replace', '모두 교체 (현재 데이터 삭제)', 'danger']]);
  if (!how) return;
  snapshot();
  if (how === 'replace') {
    const now = Date.now();
    for (const x of [...S.events, ...S.pomos, ...S.goals, ...S.txns, ...S.accounts, ...S.notes]) S.tomb[x.id] = now - 1;
    await DB.clear('events'); await DB.clear('pomos');
    S.events = []; S.pomos = []; S.goals = []; S.txns = []; S.accounts = []; S.notes = [];
    if (data.settings) { S.settings = Object.assign(defaultSettings(), data.settings); await saveSettings(); }
  }
  const ids = new Set(S.events.map(e => e.id));
  const add = data.events.filter(e => how === 'replace' || !ids.has(e.id));
  S.events.push(...add); await putEvents(add);
  const pids = new Set(S.pomos.map(p => p.id)), padd = (data.pomos || []).filter(p => !pids.has(p.id));
  S.pomos.push(...padd); await DB.putMany('pomos', padd);
  const gids = new Set(S.goals.map(g => g.id)), gadd = (data.goals || []).filter(g => !gids.has(g.id));
  gadd.forEach(g => g.updated = Date.now());
  S.goals.push(...gadd); await DB.set('goals', S.goals); await DB.set('tomb', S.tomb);
  for (const [k, store] of [['accounts', S.accounts], ['txns', S.txns], ['notes', S.notes]]) {
    const ids = new Set(store.map(x => x.id)), add2 = (data[k] || []).filter(x => !ids.has(x.id));
    add2.forEach(x => x.updated = Date.now()); store.push(...add2); await DB.set(k, store);
  }
  markDirty();
  toast(`${add.length}개 일정을 가져왔습니다`, true);
  render();
}

/* ICS (구글 캘린더·아이폰 캘린더 등과 호환) */
const RR_WD = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const icsUnesc = s => String(s || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');
const icsD = s => s.replace(/-/g, '');
const icsDT = (d, t) => icsD(d) + 'T' + t.replace(':', '') + '00';
function fold(line) { const out = []; while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); } out.push(line); return out.join('\r\n'); }
function exportICS() {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MetalCalendar//KO', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:메탈 캘린더'];
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  for (const ev of S.events) {
    L.push('BEGIN:VEVENT', `UID:${ev.id}@metalcal`, `DTSTAMP:${now}`);
    if (ev.allDay) L.push(`DTSTART;VALUE=DATE:${icsD(ev.startDate)}`, `DTEND;VALUE=DATE:${icsD(addDaysS(ev.endDate, 1))}`);
    else L.push(`DTSTART:${icsDT(ev.startDate, ev.startTime)}`, `DTEND:${icsDT(ev.endDate, ev.endTime)}`);
    L.push(fold('SUMMARY:' + icsEsc(ev.title)));
    if (ev.notes) L.push(fold('DESCRIPTION:' + icsEsc(ev.notes)));
    if (ev.location) L.push(fold('LOCATION:' + icsEsc(ev.location)));
    const cats = [...(ev.tags || []), colorOf(ev.color).name, ev.type === 'task' ? '할 일' : ev.type === 'mark' ? '날짜 표시' : ''].filter(Boolean);
    if (cats.length) L.push(fold('CATEGORIES:' + cats.map(icsEsc).join(',')));
    if (ev.priority) L.push(`PRIORITY:${[0, 1, 3, 5, 9][ev.priority]}`);
    const r = ev.rrule;
    if (r && !r.afterDone) {
      let s = `RRULE:FREQ=${r.freq.toUpperCase()};INTERVAL=${r.interval || 1}`;
      const sd = parseYmd(ev.startDate);
      if (r.freq === 'weekly') s += ';BYDAY=' + (r.byDay && r.byDay.length ? r.byDay : [sd.getDay()]).map(x => RR_WD[x]).join(',');
      if (r.freq === 'monthly' && r.monthMode === 'nth') s += `;BYDAY=${r.nth}${RR_WD[sd.getDay()]}`;
      if (r.freq === 'monthly' && r.monthMode === 'last') s += ';BYMONTHDAY=-1';
      if (r.until) s += `;UNTIL=${icsD(r.until)}${ev.allDay ? '' : 'T235959'}`;
      if (r.count) s += `;COUNT=${r.count}`;
      L.push(s);
      for (const x of ev.exdates || []) L.push(ev.allDay ? `EXDATE;VALUE=DATE:${icsD(x)}` : `EXDATE:${icsDT(x, ev.startTime)}`);
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  saveFile(`metalcal_${stamp()}.ics`, L.join('\r\n'), 'text/calendar');
}
function parseIcsDate(v, params) {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);
  if (!m) return null;
  if (!m[4] || /VALUE=DATE(?!-)/.test(params)) return { date: `${m[1]}-${m[2]}-${m[3]}`, time: null };
  if (m[7]) { const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5])); const [dd, tt] = splitDT(d); return { date: dd, time: tt }; }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
}
async function importICS() {
  const txt = await pickFile('.ics,text/calendar');
  if (!txt) return;
  const lines = txt.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const evs = [], overrides = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') { if (cur) evs.push(cur); cur = null; continue; }
    if (!cur) continue;
    const i = line.indexOf(':');
    if (i < 0) continue;
    const left = line.slice(0, i), val = line.slice(i + 1), [name, ...ps] = left.split(';');
    const params = ps.join(';');
    if (name === 'EXDATE') { (cur.EXDATE = cur.EXDATE || []).push(...val.split(',').map(v => parseIcsDate(v, params)).filter(Boolean).map(x => x.date)); }
    else cur[name] = { val, params };
  }
  const existing = new Set(S.events.map(e => e.id)), byUid = {}, out = [];
  for (const c of evs) {
    if (!c.DTSTART) continue;
    const s = parseIcsDate(c.DTSTART.val, c.DTSTART.params);
    if (!s) continue;
    let e = c.DTEND ? parseIcsDate(c.DTEND.val, c.DTEND.params) : null;
    const allDay = !s.time;
    if (!e) e = allDay ? { date: addDaysS(s.date, 1) } : { date: s.date, time: m2t(Math.min(t2m(s.time) + 60, 1439)) };
    const ev = newEvent({
      title: icsUnesc(c.SUMMARY ? c.SUMMARY.val : '(제목 없음)'), notes: icsUnesc(c.DESCRIPTION ? c.DESCRIPTION.val : ''),
      location: icsUnesc(c.LOCATION ? c.LOCATION.val : ''), allDay, startDate: s.date, startTime: s.time,
      endDate: allDay ? (e.date > s.date ? addDaysS(e.date, -1) : s.date) : e.date, endTime: allDay ? null : e.time,
      exdates: c.EXDATE || []
    });
    const uidv = c.UID ? c.UID.val : null;
    if (c.RRULE) {
      const R = Object.fromEntries(c.RRULE.val.split(';').map(x => x.split('=')));
      const freq = (R.FREQ || '').toLowerCase();
      if (['daily', 'weekly', 'monthly', 'yearly'].includes(freq)) {
        const r = { freq, interval: +R.INTERVAL || 1 };
        if (R.BYDAY) {
          const parts = R.BYDAY.split(',');
          const nm = parts[0].match(/^(-?\d)([A-Z]{2})$/);
          if (freq === 'monthly' && nm) { r.monthMode = 'nth'; r.nth = +nm[1]; }
          else r.byDay = parts.map(p => RR_WD.indexOf(p.slice(-2))).filter(x => x >= 0);
        }
        if (freq === 'monthly' && R.BYMONTHDAY === '-1') r.monthMode = 'last';
        if (freq === 'monthly' && !r.monthMode) r.monthMode = 'date';
        if (R.UNTIL) r.until = parseIcsDate(R.UNTIL, '').date;
        if (R.COUNT) r.count = +R.COUNT;
        ev.rrule = r;
      }
    }
    if (c['RECURRENCE-ID'] && uidv) { overrides.push({ uid: uidv, date: parseIcsDate(c['RECURRENCE-ID'].val, c['RECURRENCE-ID'].params).date }); ev.rrule = null; }
    else if (uidv) {
      const id = 'ics-' + uidv.replace(/[^\w.@-]/g, '').slice(0, 80);
      if (existing.has(id)) continue;
      ev.id = id; byUid[uidv] = ev;
    }
    out.push(ev);
  }
  for (const o of overrides) if (byUid[o.uid]) byUid[o.uid].exdates.push(o.date);
  if (!out.length) return toast('가져올 새 일정이 없습니다');
  snapshot();
  S.events.push(...out);
  await putEvents(out);
  toast(`${out.length}개 일정을 가져왔습니다`, true);
  render();
}

/* ── 설정 ── */
function openSettings() {
  const ov = modal('', 'wide');
  const dlg = ov.firstChild;
  const draw = async () => {
    const st = S.settings, P = st.pomo;
    const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : false;
    const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
    const lb = await DB.get('lastBackup');
    const perm = 'Notification' in window ? Notification.permission : 'unsupported';
    const seg = (key, opts, val) => `<div class="seg">${opts.map(([v, l]) => `<button data-set="${key}" data-v="${v}" class="${String(val) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const num = (k, v, min, max) => `<input type="number" class="in num" min="${min}" max="${max}" data-pomo="${k}" value="${v}">`;
    const sw = (k, v, attr = 'data-sw') => `<label class="sw"><input type="checkbox" ${attr}="${k}" ${v ? 'checked' : ''}><i></i></label>`;
    dlg.innerHTML = `<div class="dlg-h"><span></span><b>설정 · 백업</b><button class="btn" data-x>닫기</button></div><div class="sets">
    <section><h4>화면</h4>
      <div class="srow"><span>테마</span>${seg('theme', [['titanium', '티타늄 (다크)'], ['silver', '실버 (라이트)'], ['auto', '시스템']], st.theme)}</div>
      <div class="srow"><span>한 주의 시작</span>${seg('weekStart', [[0, '일요일'], [1, '월요일']], st.weekStart)}</div>
      <div class="srow"><span>시간표 칸 높이</span>${seg('hourH', [[36, '좁게'], [48, '보통'], [64, '넓게']], st.hourH)}</div>
      <div class="srow"><span>대한민국 공휴일 표시<small>설·추석·대체공휴일은 2025–2028년 수록</small></span>${sw('holidays', st.holidays)}</div>
    </section>
    <section><h4>색상 분류 (색상별로 같은 행에 정렬됩니다 · 위에서부터 순서)</h4>
      ${st.colors.map((c, i) => `<div class="ccol"><input type="color" value="${c.hex}" data-chex="${i}"><input class="in" value="${esc(c.name)}" data-cname="${i}">
        <button class="btn icon sm" data-cup="${i}" ${i ? '' : 'disabled'}>↑</button><button class="btn icon sm" data-cdel="${i}" ${st.colors.length > 1 ? '' : 'disabled'}>✕</button></div>`).join('')}
      <div class="btns"><button class="btn sm" data-cadd>+ 색상 추가</button></div>
    </section>
    <section><h4>가계부</h4>
      <div class="srow"><span>한 달 시작일<small>월급일 기준으로 맞추면 편합니다 (예: 25일)</small></span><select class="in" data-lms style="max-width:110px">${Array.from({ length: 28 }, (_, i) => `<option value="${i + 1}"${(st.ledger.monthStart || 1) === i + 1 ? ' selected' : ''}>${i + 1}일</option>`).join('')}</select></div>
      ${[['exp', '지출 분류'], ['inc', '수입 분류']].map(([k, l]) => `<div class="gf"><span>${l} — 아이콘 · 이름 · 소분류(쉼표로 구분)</span>${st.ledger[k].map((c, i) => `<div class="ccol"><input class="in" style="max-width:52px;text-align:center" value="${esc(c.icon)}" data-lc="${k}:${i}:icon"><input class="in" style="max-width:130px" value="${esc(c.name)}" data-lc="${k}:${i}:name"><input class="in" value="${esc(c.subs.join(', '))}" data-lc="${k}:${i}:subs"><button class="btn icon sm" data-lcdel="${k}:${i}">✕</button></div>`).join('')}<div class="btns"><button class="btn sm" data-lcadd="${k}">+ 분류 추가</button></div></div>`).join('')}
    </section>
    <section><h4>뽀모도로</h4>
      <div class="srow"><span>집중 (분)</span>${num('focus', P.focus, 1, 180)}</div>
      <div class="srow"><span>짧은 휴식 (분)</span>${num('short', P.short, 1, 60)}</div>
      <div class="srow"><span>긴 휴식 (분)</span>${num('long', P.long, 1, 90)}</div>
      <div class="srow"><span>긴 휴식 간격 (집중 횟수)</span>${num('longEvery', P.longEvery, 2, 10)}</div>
      <div class="srow"><span>다음 단계 자동 시작</span>${sw('autoNext', P.autoNext, 'data-psw')}</div>
      <div class="srow"><span>완료 알림음 · 진동</span>${sw('sound', P.sound, 'data-psw')}</div>
    </section>
    <section><h4>알림</h4>
      <div class="srow"><span>알림 권한: <b>${{ granted: '허용됨', denied: '차단됨 (기기 설정에서 허용 필요)', default: '아직 요청 안 함', unsupported: '이 브라우저에서 미지원' }[perm]}</b>
        <small>서버 없이 동작하므로 앱(또는 탭)이 열려 있을 때 일정 알림·뽀모도로 알림이 표시됩니다. 아이폰은 홈 화면에 설치한 뒤 허용할 수 있습니다.</small></span>
        ${perm === 'default' ? '<button class="btn sm" data-act="notify">알림 허용</button>' : ''}</div>
    </section>
    ${portableSectionHTML()}
    ${syncSectionHTML()}
    <section><h4>데이터 · 보안</h4>
      <p class="note">모든 일정은 <b>이 기기의 브라우저 저장소(IndexedDB)에만</b> 저장되며 어떤 서버로도 전송되지 않습니다. 계정·로그인·추적 코드가 없습니다.
      기기 간 이동이나 기기 교체 시에는 <b>백업 파일</b>을 사용하세요. (권장: 비밀번호 암호화 백업, AES-256)</p>
      <div class="srow"><span>저장소 보호 (자동 삭제 방지)<small>${persisted ? '보호됨 ✓' : '미보호 — 홈 화면에 설치하면 보호가 강화됩니다'}${est ? ` · 사용량 ${(est.usage / 1024).toFixed(0)}KB` : ''}</small></span>${persisted ? '' : '<button class="btn sm" data-act="persist">보호 요청</button>'}</div>
      <div class="srow"><span>마지막 백업<small>${lb ? new Date(lb).toLocaleString('ko-KR') : '아직 없음'}</small></span></div>
      <div class="btns"><button class="btn sm primary" data-act="bk-enc">🔒 암호화 백업 저장</button><button class="btn sm" data-act="bk">백업 저장 (JSON)</button><button class="btn sm" data-act="restore">백업 불러오기</button></div>
      <div class="btns"><button class="btn sm" data-act="ics-out">ICS 내보내기</button><button class="btn sm" data-act="ics-in">ICS 가져오기 (구글·애플 캘린더)</button></div>
      <div class="btns"><button class="btn sm" data-act="rm-sample">예시 일정·가계부 삭제</button><button class="btn sm" data-act="csv">가계부 CSV (엑셀)</button><button class="btn sm danger" data-act="wipe">모든 데이터 삭제</button></div>
    </section>
    <section><h4>앱 설치 (무료 · 오프라인 사용)</h4>
      ${S.installEvt ? '<div class="btns"><button class="btn primary" data-act="install">⬇ 이 기기에 앱으로 설치</button></div>' : ''}
      <p class="note"><b>아이폰/아이패드</b> Safari → 공유 버튼 → ‘홈 화면에 추가’<br><b>안드로이드</b> Chrome → ⋮ 메뉴 → ‘앱 설치’ 또는 ‘홈 화면에 추가’<br>
      <b>맥</b> Safari → 파일 → ‘Dock에 추가’ (또는 Chrome 주소창의 설치 아이콘)<br><b>윈도우</b> Edge/Chrome 주소창 오른쪽의 ‘앱 설치’ 아이콘</p>
      <p class="note">Metal Calendar v1.1 · 키보드: ←/→ 이동 · T 오늘 · M/W/D/Y/L/G/E/P 보기 전환 · N 새 일정 · / 검색</p>
    </section></div>`;
  };
  draw();
  const upd = async (fn, rerender = true) => { fn(); await saveSettings(); applyTheme(); render(); if (rerender) draw(); };
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.x != null) return closeModal(ov);
    if (d.set) return upd(() => { S.settings[d.set] = isNaN(+d.v) ? d.v : +d.v; if (d.set === 'hourH' || d.set === 'weekStart') S.tgScroll = null; });
    if (d.cup) return upd(() => { const a = S.settings.colors, i = +d.cup; [a[i - 1], a[i]] = [a[i], a[i - 1]]; });
    if (d.cdel) {
      const c = S.settings.colors[+d.cdel], used = S.events.filter(e => e.color === c.id).length;
      if (used && !(await choose('색상 삭제', `「${c.name}」 색상을 쓰는 일정 ${used}개는 첫 번째 색상으로 표시됩니다.`, [['ok', '삭제', 'danger']]))) return;
      return upd(() => S.settings.colors.splice(+d.cdel, 1));
    }
    if (d.lcadd) return upd(() => S.settings.ledger[d.lcadd].push({ id: d.lcadd[0] + uid(), name: '새 분류', icon: '🏷️', subs: [] }));
    if (d.lcdel) {
      const [k, i] = d.lcdel.split(':'), c = S.settings.ledger[k][+i], n = S.txns.filter(t => t.cat === c.id).length;
      if (n) return toast(`「${c.name}」 분류에 거래 ${n}건이 있어 삭제할 수 없습니다 (이름을 바꿔 쓰세요)`);
      return upd(() => S.settings.ledger[k].splice(+i, 1));
    }
    if (d.cadd != null) return upd(() => S.settings.colors.push({ id: 'c' + uid(), name: '새 분류', hex: '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0') }));
    if (d.sy) return syncAction(d.sy, draw);
    if (d.pt) return portableAction(d.pt, draw);
    const act = d.act;
    if (act === 'notify') { await Notification.requestPermission(); draw(); }
    else if (act === 'persist') { const ok = navigator.storage && await navigator.storage.persist(); toast(ok ? '저장소가 보호되었습니다' : '브라우저가 요청을 거절했습니다. 앱을 설치하면 보호됩니다.'); draw(); }
    else if (act === 'bk') { await exportBackup(false); draw(); }
    else if (act === 'bk-enc') { await exportBackup(true); draw(); }
    else if (act === 'restore') { await importBackup(); draw(); }
    else if (act === 'ics-out') exportICS();
    else if (act === 'csv') exportCSV();
    else if (act === 'ics-in') { await importICS(); draw(); }
    else if (act === 'install') doInstall();
    else if (act === 'rm-sample') {
      const s = S.events.filter(e => e.sample), st = S.txns.filter(t => t.sample);
      if (!s.length && !st.length) return toast('예시 데이터가 없습니다');
      snapshot();
      for (const ev of s) await removeEv(ev);
      for (const t of st) await removeTx(t);
      toast(`예시 일정 ${s.length}개를 삭제했습니다`, true); render(); draw();
    } else if (act === 'wipe') {
      const c = await choose('모든 데이터 삭제', '이 기기의 모든 일정·뽀모도로 기록이 삭제됩니다. 먼저 백업하세요.', [['wipe', '모두 삭제', 'danger']]);
      if (c !== 'wipe') return;
      snapshot();
      const now = Date.now();
      for (const x of [...S.events, ...S.pomos, ...S.goals, ...S.txns, ...S.notes]) S.tomb[x.id] = now;
      await DB.clear('events'); await DB.clear('pomos');
      S.events = []; S.pomos = []; S.goals = []; S.txns = []; S.notes = [];
      await DB.set('goals', []); await DB.set('txns', []); await DB.set('notes', []); await DB.set('tomb', S.tomb); markDirty();
      toast('모든 데이터를 삭제했습니다', true); render(); draw();
    }
  });
  dlg.addEventListener('change', e => {
    const t = e.target, d = t.dataset;
    if (d.sw) upd(() => S.settings[d.sw] = t.checked, false);
    else if (d.psw) upd(() => S.settings.pomo[d.psw] = t.checked, false);
    else if (d.pomo) upd(() => { S.settings.pomo[d.pomo] = Math.max(+t.min, Math.min(+t.max, +t.value || 1)); Pomo.ui(); }, false);
    else if (d.lms != null) upd(() => { S.settings.ledger.monthStart = +t.value; S.mcur = labelOfDate(todayS()); }, false);
    else if (d.lc) { const [k, i, f] = d.lc.split(':'); upd(() => { const c = S.settings.ledger[k][+i]; c[f] = f === 'subs' ? t.value.split(/[,，]/).map(x => x.trim()).filter(Boolean) : (t.value.trim() || c[f]); }, false); }
    else if (d.chex) upd(() => S.settings.colors[+d.chex].hex = t.value, false);
    else if (d.cname) upd(() => S.settings.colors[+d.cname].name = t.value.trim() || '이름 없음', false);
  });
}
