'use strict';
/* ═════════ 뽀모도로 타이머 ═════════
   종료 시각을 저장하므로 새로고침·화면 꺼짐 후에도 시간이 정확히 이어집니다 */
let AC = null;
function unlockAudio() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) { } }
function beep() {
  if (!S.settings.pomo.sound) return;
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  if (!AC) return;
  const t = AC.currentTime;
  [0, 0.28, 0.56].forEach((d, i) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.value = i === 2 ? 1320 : 880;
    g.gain.setValueAtTime(0.0001, t + d);
    g.gain.exponentialRampToValueAtTime(0.3, t + d + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.24);
    o.connect(g).connect(AC.destination); o.start(t + d); o.stop(t + d + 0.26);
  });
}
const PM_LABEL = { focus: '집중', short: '짧은 휴식', long: '긴 휴식' };
const R_C = 2 * Math.PI * 112;

const Pomo = {
  st: null,
  load() {
    try { this.st = JSON.parse(localStorage.getItem('mc-pomo')); } catch (e) { }
    if (!this.st) this.st = { mode: 'focus', running: false, endAt: 0, remain: null, cycle: 0, taskId: null };
  },
  save() { try { localStorage.setItem('mc-pomo', JSON.stringify(this.st)); } catch (e) { } },
  dur(m = this.st.mode) { const p = S.settings.pomo; return (m === 'focus' ? p.focus : m === 'short' ? p.short : p.long) * 60000; },
  left() { return this.st.running ? Math.max(0, this.st.endAt - Date.now()) : (this.st.remain != null ? this.st.remain : this.dur()); },
  start() {
    unlockAudio();
    if (this.st.running) return;
    this.st.endAt = Date.now() + this.left();
    this.st.running = true; this.st.remain = null;
    this.save(); this.ui();
    if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  },
  pause() { if (!this.st.running) return; this.st.remain = this.left(); this.st.running = false; this.save(); this.ui(); },
  reset() { Object.assign(this.st, { running: false, remain: null, endAt: 0 }); this.save(); this.ui(); },
  setMode(m) { this.st.mode = m; this.reset(); },
  async finish(skip) {
    const m = this.st.mode;
    this.st.running = false; this.st.remain = null;
    if (m === 'focus') {
      if (!skip) {
        this.st.cycle++;
        const ev = S.events.find(e => e.id === this.st.taskId);
        const rec = { id: uid(), end: Date.now(), updated: Date.now(), min: Math.round(this.dur('focus') / 60000), taskId: ev ? ev.id : null, title: ev ? ev.title : '' };
        S.pomos.push(rec); await DB.put('pomos', rec); markDirty();
        if (ev) { ev.pomos = (ev.pomos || 0) + 1; await saveEv(ev); }
        notify('🍅 집중 완료!', ev ? `「${ev.title}」 ${S.settings.pomo.focus}분 집중했습니다. 잠시 쉬세요.` : '잠시 휴식하세요.');
      }
      this.st.mode = !skip && this.st.cycle % S.settings.pomo.longEvery === 0 ? 'long' : 'short';
    } else {
      if (!skip) notify('☕ 휴식 끝', '다시 집중할 시간입니다.');
      this.st.mode = 'focus';
    }
    if (!skip) beep();
    this.save();
    if (S.settings.pomo.autoNext && !skip) this.start(); else this.ui();
    if (S.view === 'pomo') render();
  },
  tick() { if (this.st.running && Date.now() >= this.st.endAt) this.finish(false); else this.ui(); },
  fmt(ms) { const s = Math.ceil(ms / 1000); return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`; },
  ui() {
    const left = this.left(), run = this.st.running;
    document.title = run ? `${this.fmt(left)} · ${PM_LABEL[this.st.mode]}` : 'Metal Calendar';
    const badge = $('#pmBadge');
    if (badge) { badge.hidden = !run; badge.textContent = this.fmt(left); }
    const t = $('#pTime');
    if (!t) return;
    t.textContent = this.fmt(left);
    const ring = $('#pRing');
    ring.style.strokeDashoffset = R_C * (1 - left / this.dur());
    ring.setAttribute('class', 'arc ' + this.st.mode);
    $('#pStart').textContent = run ? '일시정지' : (this.st.remain != null ? '계속' : '시작');
    $$('[data-pmode]').forEach(b => b.classList.toggle('on', b.dataset.pmode === this.st.mode));
    const k = PM_KEY[this.st.mode], m = S.settings.pomo[k];
    const dv = $('#pDur'); if (dv) dv.textContent = m + '분';
    $$('[data-pdur]').forEach(b => { b.disabled = run; if (b.dataset.pdur.startsWith('=')) b.classList.toggle('on', +b.dataset.pdur.slice(1) === m); });
    const h = $('#pDurHint'); if (h) h.hidden = !run;
  }
};
const PM_KEY = { focus: 'focus', short: 'short', long: 'long' };
const PM_PRESETS = { focus: [15, 25, 30, 45, 50, 60, 90], short: [3, 5, 10, 15], long: [10, 15, 20, 30] };
// 뽀모도로 화면에서 직접 시간 설정: '+5' / '-5' / '=45' / 'ask'
async function pomoDuration(cmd) {
  if (Pomo.st.running) return toast('일시정지한 뒤 시간을 바꿀 수 있어요');
  const k = PM_KEY[Pomo.st.mode], cur = S.settings.pomo[k];
  let v = cur;
  if (cmd === 'ask') {
    const t = await askText(`${PM_LABEL[Pomo.st.mode]} 시간 설정`, '분 단위로 입력하세요 (1–180).', 'number');
    if (t == null || t === '') return;
    v = Math.round(+t);
  } else if (cmd[0] === '=') v = +cmd.slice(1);
  else v = cur + +cmd;
  v = Math.max(1, Math.min(180, v || cur));
  if (v === cur) return;
  S.settings.pomo[k] = v;
  await saveSettings();
  Pomo.st.remain = null; Pomo.save();
  render();
}

function renderPomo(V) {
  const today = todayS(), P = S.settings.pomo;
  const todays = S.pomos.filter(p => ymd(new Date(p.end)) === today);
  const week = Array.from({ length: 7 }, (_, i) => addDaysS(today, i - 6));
  const counts = week.map(d => S.pomos.filter(p => ymd(new Date(p.end)) === d).length);
  const max = Math.max(1, ...counts);
  const tasks = S.events.filter(e => e.type === 'task' && !e.done).sort((a, b) => (a.priority || 9) - (b.priority || 9) || (a.startDate < b.startDate ? -1 : 1)).slice(0, 60);
  const inCycle = Pomo.st.cycle % P.longEvery;
  const recent = S.pomos.slice().sort((a, b) => b.end - a.end).slice(0, 12);
  V.innerHTML = `<div class="pomo">
    <div class="pm-card">
      <div class="seg">${['focus', 'short', 'long'].map(m => `<button data-pmode="${m}" class="${Pomo.st.mode === m ? 'on' : ''}">${PM_LABEL[m]}</button>`).join('')}</div>
      <div class="dial"><div class="bezel"></div>
        <svg viewBox="0 0 270 270"><circle class="trk" cx="135" cy="135" r="112"/><circle id="pRing" class="arc ${Pomo.st.mode}" cx="135" cy="135" r="112" stroke-dasharray="${R_C}" stroke-dashoffset="0"/></svg>
        <div class="face"><div id="pTime">--:--</div><div id="pSub">${PM_LABEL[Pomo.st.mode]} · 오늘 ${todays.length}회</div></div></div>
      <div class="pm-dur"><button class="btn icon sm" data-pdur="-5">−</button><button class="durv" id="pDur" data-pdur="ask" title="눌러서 직접 입력">${P[PM_KEY[Pomo.st.mode]]}분</button><button class="btn icon sm" data-pdur="+5">+</button></div>
      <div class="chips pm-pre">${PM_PRESETS[Pomo.st.mode].map(m => `<button class="chip" data-pdur="=${m}">${m}분</button>`).join('')}<button class="chip" data-pdur="ask">직접 입력</button></div>
      <small class="hint" id="pDurHint" hidden>실행 중에는 시간을 바꿀 수 없어요 · 일시정지 후 변경</small>
      <div class="cycle" title="긴 휴식까지">${Array.from({ length: P.longEvery }, (_, i) => `<i class="${i < inCycle ? 'on' : ''}"></i>`).join('')}</div>
      <div class="pm-ctl"><button class="btn icon" data-pact="reset" title="초기화">↺</button><button class="btn primary big" id="pStart" data-pact="toggle">시작</button><button class="btn icon" data-pact="skip" title="건너뛰기">⏭</button></div>
      <div class="pm-task"><span>🎯</span><select class="in" data-ptask><option value="">연결할 할 일 선택 (선택)</option>${tasks.map(t => `<option value="${t.id}"${Pomo.st.taskId === t.id ? ' selected' : ''}>${t.priority ? `[Q${t.priority}] ` : ''}${esc(t.title)}${t.pomos ? ` · 🍅${t.pomos}` : ''}</option>`).join('')}</select></div>
    </div>
    <div class="pm-stats">
      <div class="stat-row"><div class="stat"><b>${todays.length}</b><span>오늘 완료</span></div><div class="stat"><b>${todays.reduce((a, p) => a + p.min, 0)}</b><span>오늘 집중(분)</span></div><div class="stat"><b>${S.pomos.length}</b><span>누적</span></div></div>
      <div><h4 style="margin:0 0 10px;font-size:12px;color:var(--tx3);letter-spacing:1px">최근 7일</h4>
      <div class="wbars">${week.map((d, i) => `<div><span>${counts[i] || ''}</span><i style="height:${counts[i] / max * 80}%"></i><span>${WD[parseYmd(d).getDay()]}</span></div>`).join('')}</div></div>
      <div><h4 style="margin:0 0 8px;font-size:12px;color:var(--tx3);letter-spacing:1px">기록</h4>
      <div class="plog">${recent.length ? recent.map(p => { const d = new Date(p.end); return `<div><b>${esc(p.title || '집중')}</b><span>${relDay(ymd(d))} ${pad(d.getHours())}:${pad(d.getMinutes())} · ${p.min}분</span></div>`; }).join('') : '<span class="empty-s">아직 기록이 없습니다. 첫 집중을 시작해 보세요!</span>'}</div></div>
    </div></div>`;
  Pomo.ui();
}
