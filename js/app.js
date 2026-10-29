'use strict';
/* ═════════ 앱 상태 · 데이터 변경 · 초기화 ═════════ */
const DEFAULT_COLORS = [
  { id: 'blue', name: '업무', hex: '#4f8cff' }, { id: 'teal', name: '개인', hex: '#1fb39e' }, { id: 'green', name: '건강', hex: '#5fb85a' },
  { id: 'amber', name: '휴가', hex: '#e8a33d' }, { id: 'orange', name: '약속', hex: '#f07b3f' }, { id: 'red', name: '중요', hex: '#e5534b' },
  { id: 'pink', name: '가족', hex: '#d660a8' }, { id: 'purple', name: '공부', hex: '#8b6cf0' }, { id: 'gray', name: '기타', hex: '#8a94a6' }
];
const defaultSettings = () => ({
  theme: 'titanium', weekStart: 0, holidays: true, hourH: 48, colors: clone(DEFAULT_COLORS),
  pomo: { focus: 25, short: 5, long: 15, longEvery: 4, autoNext: false, sound: true },
  ledger: DEF_LEDGER()
});
const S = {
  settings: defaultSettings(), events: [], pomos: [], view: 'month', cur: todayS(), sel: todayS(), miniCur: null,
  goals: [], tomb: {}, accounts: [], txns: [], notes: [], noteId: null, noteTag: null, nq: '', mcur: null, mtab: 'daily', msel: null, mq: '', areaFilter: null, lastCal: 'month', hidden: new Set(), tagFilter: null, occMap: new Map(), listBack: 0, listFwd: 0, listScroll: true, tgScroll: null, undo: null, installEvt: null
};

function newEvent(o) {
  const d = o.startDate || S.sel || todayS();
  return Object.assign({
    id: uid(), title: '', notes: '', location: '', type: 'event', allDay: true, startDate: d, endDate: d, startTime: null, endTime: null,
    color: S.settings.colors[0].id, tags: [], priority: 0, goalId: null, reminder: null, rrule: null, exdates: [], doneDates: [], done: false, pomos: 0, created: Date.now()
  }, o, { startDate: d, endDate: o.endDate || d });
}
async function saveEv(...evs) {
  for (const ev of evs) {
    ev.updated = Date.now();
    const i = S.events.findIndex(x => x.id === ev.id);
    if (i < 0) S.events.push(ev); else S.events[i] = ev;
    await DB.put('events', ev);
  }
  markDirty();
}
async function removeEv(ev) {
  S.events = S.events.filter(x => x.id !== ev.id);
  S.tomb[ev.id] = Date.now();
  await DB.del('events', ev.id); await DB.set('tomb', S.tomb);
  markDirty();
}
async function saveSettings() { S.settings._u = Date.now(); await DB.set('settings', S.settings); markDirty(); }
// 여러 항목을 한꺼번에 추가·교체할 때 (가져오기 등)
async function putEvents(list) { const now = Date.now(); list.forEach(e => e.updated = now); await DB.putMany('events', list); markDirty(); }
function snapshot() { S.undo = JSON.stringify(S.events); }
async function undoLast() {
  if (!S.undo) return;
  const prev = JSON.parse(S.undo), ids = new Set(prev.map(e => e.id)), now = Date.now();
  for (const e of S.events) if (!ids.has(e.id)) S.tomb[e.id] = now;
  prev.forEach(e => { e.updated = now; delete S.tomb[e.id]; });
  S.events = prev; S.undo = null;
  await DB.clear('events'); await DB.putMany('events', S.events); await DB.set('tomb', S.tomb);
  markDirty();
  toast('되돌렸습니다'); render();
}

/* 반복 일정 일부/이후/전체 변경 */
function applySeries(ev, o, patch, delta) {
  const dur = diffDays(patch.startDate || o.date, patch.endDate || o.end);
  const { startDate, endDate, ...rest } = patch;
  const hasRule = 'rrule' in patch;
  Object.assign(ev, rest);
  ev.startDate = addDaysS(ev.startDate, delta);
  ev.endDate = addDaysS(ev.startDate, Math.max(0, dur));
  if (hasRule) ev.rrule = patch.rrule ? clone(patch.rrule) : null;
  else if (delta && ev.rrule && ev.rrule.freq === 'weekly' && ev.rrule.byDay) ev.rrule = Object.assign({}, ev.rrule, { byDay: ev.rrule.byDay.map(x => ((x + delta) % 7 + 7) % 7) });
}
async function applyOccPatch(o, patch, scope, fromEditor) {
  const ev = o.ev;
  if (!o.rec) {
    snapshot();
    Object.assign(ev, patch);
    if (ev.type !== 'task') ev.done = false;
    await saveEv(ev);
    return true;
  }
  scope = scope || await askScope(fromEditor ? '반복 일정 수정' : '반복 일정 이동');
  if (!scope) { render(); return false; }
  snapshot();
  const delta = patch.startDate ? diffDays(o.date, patch.startDate) : 0;
  if (scope === 'one') {
    ev.exdates = [...(ev.exdates || []), o.date];
    const c = Object.assign(clone(ev), { startDate: o.date, endDate: o.end }, patch, { id: uid(), rrule: null, exdates: [], doneDates: [], done: o.done, created: Date.now() });
    await saveEv(ev, c);
  } else if (scope === 'all' || o.date === ev.startDate) {
    applySeries(ev, o, patch, delta);
    await saveEv(ev);
  } else {
    const nev = Object.assign(clone(ev), { id: uid(), created: Date.now(), startDate: o.date, endDate: o.end,
      exdates: (ev.exdates || []).filter(x => x >= o.date), doneDates: (ev.doneDates || []).filter(x => x >= o.date) });
    if (ev.rrule.count) nev.rrule.count = Math.max(1, ev.rrule.count - countBefore(ev, o.date));
    applySeries(nev, o, patch, delta);
    ev.rrule = Object.assign({}, ev.rrule, { until: addDaysS(o.date, -1) });
    ev.exdates = (ev.exdates || []).filter(x => x < o.date);
    ev.doneDates = (ev.doneDates || []).filter(x => x < o.date);
    await saveEv(ev, nev);
  }
  return true;
}
async function deleteOcc(o) {
  const ev = o.ev;
  if (!o.rec) {
    snapshot(); await removeEv(ev);
    toast(`「${ev.title}」 삭제됨`, true); render(); return;
  }
  const sc = await askScope('반복 일정 삭제');
  if (!sc) return;
  snapshot();
  if (sc === 'one') { ev.exdates = [...(ev.exdates || []), o.date]; await saveEv(ev); }
  else if (sc === 'following' && o.date !== ev.startDate) { ev.rrule = Object.assign({}, ev.rrule, { until: addDaysS(o.date, -1) }); await saveEv(ev); }
  else await removeEv(ev);
  toast('삭제됨', true); render();
}
async function toggleDone(key) {
  const o = S.occMap.get(key);
  if (!o) return;
  const ev = o.ev;
  snapshot();
  if (o.rec) {
    const s = new Set(ev.doneDates || []);
    s.has(o.date) ? s.delete(o.date) : s.add(o.date);
    ev.doneDates = [...s];
  } else if (ev.rrule && ev.rrule.afterDone && !ev.done) {
    // 스마트 반복: 완료한 날로부터 다음 일정 계산
    const dur = diffDays(ev.startDate, ev.endDate);
    ev.startDate = addInterval(todayS(), ev.rrule.freq, ev.rrule.interval);
    ev.endDate = addDaysS(ev.startDate, dur);
    ev.lastDone = todayS();
    toast(`완료! 다음 반복: ${relDay(ev.startDate)}`, true);
  } else ev.done = !ev.done;
  if (!o.done && navigator.vibrate) navigator.vibrate(8);
  await saveEv(ev);
  render();
}

/* ── 렌더 · 탐색 ── */
function render() {
  S.occMap = new Map();
  const V = $('#view');
  V.className = 'v-' + S.view;
  switch (S.view) {
    case 'month': renderMonth(V); break;
    case 'week': renderTimeGrid(V, weekDates()); break;
    case 'day': renderTimeGrid(V, [S.cur]); break;
    case 'year': renderYear(V); break;
    case 'list': renderList(V); break;
    case 'matrix': renderMatrix(V); break;
    case 'pomo': renderPomo(V); break;
    case 'goals': renderGoals(V); break;
    case 'money': renderMoney(V); break;
    case 'notes': renderNotes(V); break;
  }
  $('#title').textContent = headerTitle();
  const isCal = ['month', 'week', 'day', 'year'].includes(S.view);
  if (isCal) S.lastCal = S.view;
  $$('[data-view]').forEach(b => b.classList.toggle('on', b.dataset.view === S.view || (b.dataset.view === 'cal' && isCal)));
  const cal = isCal || S.view === 'list' || S.view === 'money';
  $('.navg').style.visibility = cal ? '' : 'hidden';
  $('#subbar').classList.toggle('on', isCal);
  $('#subbar').innerHTML = isCal ? `<div class="seg full">${VIEWS.slice(0, 4).map(([k, l]) => `<button data-view="${k}" class="${S.view === k ? 'on' : ''}">${l}</button>`).join('')}</div>` : '';
  $('#fab').hidden = S.view === 'pomo' || (S.view === 'notes' && !!S.noteId && innerWidth <= 900);
  renderSide();
}
function setView(v) {
  if (v === 'cal') v = S.lastCal || 'month';
  if (S.view !== v) { S.tgScroll = null; S.listBack = 0; S.listFwd = 0; S.listScroll = true; }
  S.view = v;
  try { localStorage.setItem('mc-view', v); } catch (e) { }
  document.body.classList.remove('side-open');
  render();
}
function nav(dir) {
  const d = parseYmd(S.cur);
  if (S.view === 'month') S.cur = ymd(new Date(d.getFullYear(), d.getMonth() + dir, 1));
  else if (S.view === 'week') S.cur = addDaysS(S.cur, 7 * dir);
  else if (S.view === 'day') S.cur = addDaysS(S.cur, dir);
  else if (S.view === 'year') S.cur = ymd(new Date(d.getFullYear() + dir, 0, 1));
  else if (S.view === 'money') { S.mcur = ymd(new Date(d0m().getFullYear(), d0m().getMonth() + dir, 1)); S.msel = null; }
  else if (S.view === 'list') { S.cur = addDaysS(S.cur, 30 * dir); S.listBack = 0; S.listFwd = 0; S.listScroll = true; }
  else return;
  S.miniCur = null;
  render();
}
const d0m = () => parseYmd(S.mcur);
function goToday() { S.mcur = labelOfDate(todayS()); S.msel = null; S.cur = S.sel = todayS(); S.miniCur = null; S.tgScroll = null; S.listScroll = true; S.listBack = 0; render(); }
function goDay(ds) { S.cur = S.sel = ds; setView('day'); }

/* ── 알림 ── */
async function notify(title, body) {
  try {
    if ('Notification' in window && Notification.permission === 'granted') {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg) return reg.showNotification(title, { body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: title + body });
      return new Notification(title, { body, icon: 'icons/icon-192.png' });
    }
  } catch (e) { }
  toast(`🔔 ${title} — ${body}`);
}
function checkReminders() {
  const now = Date.now(), today = todayS();
  let fired = {};
  try { fired = JSON.parse(localStorage.getItem('mc-fired') || '{}'); } catch (e) { }
  for (const ev of S.events) {
    if (ev.reminder == null || ev.type === 'mark') continue;
    for (const o of expandEvent(ev, addDaysS(today, -1), addDaysS(today, 2))) {
      if (o.done) continue;
      const at = dtOf(o.date, o.allDay ? '09:00' : o.st).getTime() - ev.reminder * 60000, k = o.key + '@' + ev.reminder;
      if (now >= at && now - at < 30 * 60000 && !fired[k]) {
        fired[k] = now;
        notify(ev.title, `${relDay(o.date)} ${o.allDay ? '종일' : fmtTime(o.st)}${ev.location ? ' · ' + ev.location : ''}`);
      }
    }
  }
  for (const k in fired) if (now - fired[k] > 3 * 864e5) delete fired[k];
  try { localStorage.setItem('mc-fired', JSON.stringify(fired)); } catch (e) { }
}

/* ── 테마 · 설치 ── */
function applyTheme() {
  let t = S.settings.theme;
  if (t === 'auto') t = matchMedia('(prefers-color-scheme: light)').matches ? 'silver' : 'titanium';
  document.documentElement.dataset.theme = t;
  $('meta[name=theme-color]').content = t === 'silver' ? '#e6e9ed' : '#1d2126';
}
async function doInstall() {
  if (!S.installEvt) return toast('브라우저 메뉴에서 ‘앱 설치’ 또는 ‘홈 화면에 추가’를 선택하세요');
  S.installEvt.prompt();
  await S.installEvt.userChoice;
  S.installEvt = null;
  render();
}

/* ── 첫 실행 예시 ── */
function seed() {
  const t = todayS(), T = parseYmd(t), mon = ymd(addDays(startOfWeek(T, 1), 7));
  const at = (n) => addDaysS(t, n);
  const list = [
    { title: '여름 휴가', type: 'mark', color: 'amber', startDate: addDaysS(mon, 2), endDate: addDaysS(mon, 4) },
    { title: '주간 팀 회의', color: 'blue', allDay: false, startDate: ymd(addDays(startOfWeek(T, 1), 0)), startTime: '10:00', endTime: '11:00', rrule: { freq: 'weekly', interval: 1, byDay: [1], skip: 'holiday' }, tags: ['업무'], priority: 2, location: '3층 회의실' },
    { title: '헬스', color: 'green', allDay: false, startDate: t, startTime: '19:00', endTime: '20:00', rrule: { freq: 'weekly', interval: 1, byDay: [2, 4] }, tags: ['운동'] },
    { title: '분기 보고서 작성', type: 'task', color: 'blue', startDate: t, priority: 1, tags: ['업무'] },
    { title: '책 30쪽 읽기', type: 'task', color: 'purple', startDate: t, rrule: { freq: 'daily', interval: 1, afterDone: true }, priority: 2, tags: ['독서'] },
    { title: '친구 저녁 약속', color: 'orange', allDay: false, startDate: at(3), startTime: '18:30', endTime: '21:00', location: '강남역' },
    { title: '워크숍', color: 'blue', startDate: at(12), endDate: at(13), tags: ['업무'] },
    { title: '카드 결제일', type: 'task', color: 'red', startDate: ymd(new Date(T.getFullYear(), T.getMonth() + (T.getDate() > 25 ? 1 : 0), 25)), rrule: { freq: 'monthly', interval: 1, monthMode: 'date' }, priority: 3 },
    { title: '엄마 생신', color: 'pink', startDate: at(20), rrule: { freq: 'yearly', interval: 1 }, tags: ['가족'] },
    { title: '이메일 정리', type: 'task', color: 'gray', startDate: at(1), priority: 4 }
  ];
  // 고정 ID·낮은 수정시각 → 여러 기기에서 동기화해도 중복되거나 삭제 후 되살아나지 않음
  const evs = list.map((o, i) => newEvent(Object.assign({ sample: true }, o, { id: 'sample-' + i, created: null, updated: 1, endDate: o.endDate || o.startDate })));
  evs.forEach(e => { if (e.type === 'mark') e.allDay = true; });
  return evs;
}

/* ── UI 바인딩 ── */
function bindUI() {
  $('#bMenu').innerHTML = ico('menu');
  $('#bPrev').innerHTML = ico('left');
  $('#bNext').innerHTML = ico('right');
  $('#bSearch').innerHTML = ico('search');
  $('#bSet').innerHTML = ico('gear');
  $('#qaIcon').outerHTML = ico('bolt');
  $('#segViews').innerHTML = VIEWS.map(([k, l]) => `<button data-view="${k}">${l}</button>`).join('');
  // 모바일 하단 탭: 캘린더(월·주·일·연은 상단 보조 탭) + 목록·목표·매트릭스·가계부·집중
  $('#bottom').innerHTML = [['cal', '캘린더', 'cal'], ...VIEWS.slice(4)].map(([k, l, i]) => `<button data-view="${k}">${ico(i)}<span>${k === 'pomo' ? '집중' : l}</span>${k === 'pomo' ? '<span class="badge" id="pmBadge" hidden></span>' : ''}</button>`).join('');

  $('#bMenu').onclick = () => document.body.classList.toggle('side-open');
  $('#scrim').onclick = () => document.body.classList.remove('side-open');
  $('#bPrev').onclick = () => nav(-1);
  $('#bNext').onclick = () => nav(1);
  $('#bToday').onclick = goToday;
  $('#bSearch').onclick = openSearch;
  $('#bSet').onclick = openSettings;
  $('#title').onclick = () => { if (S.view === 'day' || S.view === 'week') setView('month'); else if (S.view === 'month') setView('year'); };
  document.addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  $('#fab').onclick = () => S.view === 'notes' ? handleNotesClick($('[data-nnew]') || document.body) : S.view === 'money' ? openTxn(null) : S.view === 'goals' ? openGoal(null) : S.view === 'matrix' ? openQuick({ type: 'task' }) : openQuick({ date: S.sel || S.cur });

  // 데스크톱 빠른 추가
  const qa = $('#qa'), hint = $('#qaHint');
  qa.addEventListener('input', () => { hint.innerHTML = qa.value.trim() ? quickPreview(parseQuick(qa.value), { date: S.sel }) + '<br><small>Enter: 추가 · Shift+Enter: 상세 입력</small>' : ''; });
  qa.addEventListener('keydown', async e => {
    if (e.key === 'Escape') { qa.value = ''; hint.innerHTML = ''; qa.blur(); }
    if (e.key !== 'Enter' || e.isComposing || !qa.value.trim()) return;
    e.preventDefault();
    const ev = quickToEvent(parseQuick(qa.value), { date: S.sel, type: S.view === 'matrix' ? 'task' : undefined });
    qa.value = ''; hint.innerHTML = '';
    if (e.shiftKey) return openEditor(ev);
    snapshot(); await saveEv(ev);
    toast(`「${ev.title}」 ${relDay(ev.startDate)}에 추가됨`, true);
    render();
  });
  qa.addEventListener('blur', () => setTimeout(() => { hint.innerHTML = ''; }, 150));

  // 사이드바
  $('#side').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.mini) {
      S.cur = S.sel = d.mini;
      if (!['month', 'week', 'day'].includes(S.view)) S.view = 'day';
      document.body.classList.remove('side-open');
      S.tgScroll = null; render();
    } else if (d.minim) { const m = parseYmd(S.miniCur || S.cur); S.miniCur = ymd(new Date(m.getFullYear(), m.getMonth() + +d.minim, 1)); renderSide(); }
    else if (d.area != null) { document.body.classList.remove('side-open'); setArea(d.area); }
    else if (d.tag) { S.tagFilter = S.tagFilter === d.tag ? null : d.tag; render(); }
    else if (d.act === 'search') { document.body.classList.remove('side-open'); openSearch(); }
    else if (d.act === 'settings') { document.body.classList.remove('side-open'); openSettings(); }
    else if (d.act === 'install') doInstall();
  });
  $('#side').addEventListener('change', e => {
    const id = e.target.dataset.vis;
    if (!id) return;
    e.target.checked ? S.hidden.delete(id) : S.hidden.add(id);
    try { localStorage.setItem('mc-hidden', JSON.stringify([...S.hidden])); } catch (err) { }
    render();
  });

  // 보기 영역 클릭
  const V = $('#view');
  V.addEventListener('click', async e => {
    const t = e.target;
    if (t.closest('[data-gnew],[data-gopen],[data-rec],[data-recall],[data-area]')) { e.stopPropagation(); return handleGoalClick(t); }
    if (S.view === 'money') return handleMoneyClick(t);
    if (S.view === 'notes') return handleNotesClick(t);
    const pd = t.closest('[data-pdur]');
    if (pd) return pomoDuration(pd.dataset.pdur);
    const ck = t.closest('[data-check]');
    if (ck) { e.stopPropagation(); return toggleDone(ck.dataset.check); }
    const oc = t.closest('[data-occ]');
    if (oc) { const o = S.occMap.get(oc.dataset.occ); if (o) openEditor(o); return; }
    const gd = t.closest('[data-goday]');
    if (gd && !(S.view === 'day' && t.closest('.tgh'))) return goDay(gd.dataset.goday);
    const mo = t.closest('[data-month]');
    if (mo) { S.cur = mo.dataset.month; return setView('month'); }
    const qa = t.closest('[data-qadd]');
    if (qa) return openQuick({ type: 'task', priority: +qa.dataset.qadd });
    const act = t.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'past') { S.listBack += 30; const L = $('.list'), h0 = L.scrollHeight, s0 = L.scrollTop; render(); const L2 = $('.list'); L2.scrollTop = s0 + (L2.scrollHeight - h0); }
      if (act.dataset.act === 'fwd') { const s0 = $('.list').scrollTop; S.listFwd += 60; render(); $('.list').scrollTop = s0; }
      return;
    }
    const pm = t.closest('[data-pmode]');
    if (pm) return Pomo.setMode(pm.dataset.pmode), render();
    const pa = t.closest('[data-pact]');
    if (pa) {
      const a = pa.dataset.pact;
      if (a === 'toggle') Pomo.st.running ? Pomo.pause() : Pomo.start();
      else if (a === 'reset') Pomo.reset();
      else if (a === 'skip') Pomo.finish(true);
      return;
    }
    const day = t.closest('.mday');
    if (day) {
      // 첫 탭: 날짜 선택 / 같은 날짜 다시 탭: 새 일정
      if (S.sel === day.dataset.date) return openQuick({ date: day.dataset.date });
      $$('.mday.sel').forEach(x => x.classList.remove('sel'));
      day.classList.add('sel');
      S.sel = day.dataset.date;
      renderSide();
      return;
    }
    const tac = t.closest('.tac');
    if (tac) { S.sel = tac.dataset.date; return openQuick({ date: tac.dataset.date }); }
    const col = t.closest('.tgc');
    if (col) {
      const r = col.getBoundingClientRect(), H = S.settings.hourH;
      const m = Math.max(0, Math.min(1410, Math.floor((e.clientY - r.top) / H * 2) * 30));
      const [ed, et] = splitDT(new Date(dtOf(col.dataset.date, m2t(m)).getTime() + 3600e3));
      S.sel = col.dataset.date;
      openEditor(newEvent({ startDate: col.dataset.date, allDay: false, startTime: m2t(m), endDate: ed, endTime: et }));
    }
  });
  V.addEventListener('change', e => {
    if (e.target.dataset.ptask != null) { Pomo.st.taskId = e.target.value || null; Pomo.save(); }
  });

  // 좌우 스와이프로 이전/다음
  let sx = 0, sy = 0, st = 0;
  V.addEventListener('touchstart', e => { const p = e.touches[0]; sx = p.clientX; sy = p.clientY; st = Date.now(); }, { passive: true });
  V.addEventListener('touchend', e => {
    if (DR.drag || Date.now() - DR.suppress < 400 || !['month', 'week', 'day', 'year'].includes(S.view)) return;
    const p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6 && Date.now() - st < 600) nav(dx < 0 ? 1 : -1);
  }, { passive: true });

  // 키보드
  window.addEventListener('keydown', e => {
    if (e.target.closest('input,textarea,select') || $('.ov') || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.toLowerCase();
    const map = { m: 'month', w: 'week', d: 'day', y: 'year', l: 'list', g: 'goals', e: 'matrix', b: 'money', r: 'notes', p: 'pomo' };
    if (map[k]) setView(map[k]);
    else if (k === 'arrowleft') nav(-1);
    else if (k === 'arrowright') nav(1);
    else if (k === 't') goToday();
    else if (k === 'n') { e.preventDefault(); openQuick({ date: S.sel }); }
    else if (k === '/') { e.preventDefault(); openSearch(); }
  });

  let rt;
  window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { if (!DR.drag && S.view === 'month') render(); }, 150); });
  matchMedia('(prefers-color-scheme: light)').addEventListener('change', applyTheme);
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); S.installEvt = e; renderSide(); });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { Pomo.tick(); checkReminders(); genRecurring(); syncNow(); if (S.view !== 'pomo' && !$('.ov') && !isTypingNote()) render(); } });
  window.addEventListener('online', () => syncNow());
}

async function init() {
  try {
    await DB.open();
    const st = await DB.get('settings');
    if (st) S.settings = Object.assign(defaultSettings(), st, { pomo: Object.assign(defaultSettings().pomo, st.pomo || {}), ledger: Object.assign(DEF_LEDGER(), st.ledger || {}) });
    S.events = await DB.all('events');
    S.pomos = await DB.all('pomos');
    S.goals = (await DB.get('goals')) || [];
    S.tomb = (await DB.get('tomb')) || {};
    S.accounts = (await DB.get('accounts')) || [];
    S.txns = (await DB.get('txns')) || [];
    S.notes = (await DB.get('notes')) || [];
    if (!(await DB.get('ledgerSeeded'))) {
      const accs = defaultAccounts().filter(a => !S.accounts.some(x => x.id === a.id));
      S.accounts.push(...accs); await DB.set('accounts', S.accounts);
      const tx = sampleTxns().filter(t => !S.tomb[t.id] && !S.txns.some(x => x.id === t.id));
      S.txns.push(...tx); await DB.set('txns', S.txns); await DB.set('ledgerSeeded', true);
    }
    await syncLoad();
    if (!S.events.length && !(await DB.get('seeded'))) {
      const evs = seed();
      S.events = evs; await DB.putMany('events', evs); await DB.set('seeded', true);
      setTimeout(() => toast('예시 일정이 추가되었습니다 · 설정에서 한 번에 지울 수 있어요'), 600);
    }
  } catch (e) {
    console.error(e);
    setTimeout(() => toast('저장소를 열 수 없습니다 (사생활 보호 모드?) — 데이터가 저장되지 않습니다'), 300);
  }
  try {
    S.hidden = new Set(JSON.parse(localStorage.getItem('mc-hidden') || '[]'));
    S.areaFilter = localStorage.getItem('mc-area') || null;
    const v = localStorage.getItem('mc-view');
    if (v && VIEWS.some(x => x[0] === v)) S.view = v;
  } catch (e) { }
  S.mcur = labelOfDate(todayS());
  await genRecurring();
  Pomo.load();
  applyTheme();
  bindUI();
  initDrag();
  render();
  await portableInit();
  setInterval(() => Pomo.tick(), 500);
  setInterval(checkReminders, 30000);
  setInterval(() => { if (!document.hidden) syncNow(); }, 60000);
  setTimeout(syncNow, 800);
  setTimeout(checkReminders, 2000);
  setInterval(() => {
    const n = $('.now');
    if (n) n.style.top = (nowMin() / 60 * S.settings.hourH) + 'px';
  }, 60000);
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(e => console.warn('SW', e));
}
init();
