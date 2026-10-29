'use strict';
/* ═════════ 길게 눌러 끌어서 이동 (터치·마우스 공통) ═════════
   - 터치: 0.45초 길게 누르면 집어 올림 → 원하는 날짜/시간에 놓기
   - 마우스: 길게 누르거나 바로 끌기
   - 주/일 보기의 일정 하단 손잡이로 길이 조절 */
const DR = { press: null, drag: null, suppress: 0, raf: 0 };

function initDrag() {
  const V = $('#view');
  V.addEventListener('pointerdown', onPDown);
  window.addEventListener('pointermove', onPMove, { passive: false });
  window.addEventListener('pointerup', onPUp);
  window.addEventListener('pointercancel', () => { if (DR.drag) endDrag(false); else cancelPress(); });
  window.addEventListener('touchmove', e => { if (DR.drag) e.preventDefault(); }, { passive: false });
  V.addEventListener('contextmenu', e => { if (e.target.closest('[data-occ]')) e.preventDefault(); });
  V.addEventListener('click', e => { if (Date.now() - DR.suppress < 400) { e.stopPropagation(); e.preventDefault(); } }, true);
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && DR.drag) endDrag(false); });
}
function cancelPress() { if (DR.press) clearTimeout(DR.press.timer); DR.press = null; }

function onPDown(e) {
  if (e.button > 0 || DR.drag || S.view === 'list') return;
  const el = e.target.closest('[data-occ]');
  if (!el || e.target.closest('[data-check],[data-rec]')) return;
  const occ = S.occMap.get(el.dataset.occ);
  if (!occ) return;
  const rz = !!e.target.closest('.rz');
  const mouse = e.pointerType === 'mouse';
  DR.press = { el, occ, x: e.clientX, y: e.clientY, rz, mouse, r: el.getBoundingClientRect() };
  DR.press.timer = setTimeout(startDrag, rz ? 0 : mouse ? 300 : 450);
  if (rz) e.preventDefault();
}
function onPMove(e) {
  const p = DR.press;
  if (p && !DR.drag) {
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 7) {
      if (p.mouse) startDrag(); else { cancelPress(); return; }
    } else return;
  }
  if (!DR.drag) return;
  e.preventDefault();
  DR.drag.x = e.clientX; DR.drag.y = e.clientY;
  updateDrag();
}
function onPUp() {
  if (DR.drag) { endDrag(true); return; }
  cancelPress();
}

function startDrag() {
  const p = DR.press;
  if (!p || DR.drag) return;
  clearTimeout(p.timer);
  const o = p.occ, el = p.el;
  const d = { p, occ: o, el, x: p.x, y: p.y, rz: p.rz, kind: el.classList.contains('tev') ? 'timed' : 'day', target: null };
  if (d.kind === 'timed') d.grabMin = (p.y - p.r.top) / S.settings.hourH * 60;
  if (el.dataset.col != null) {
    const n = +el.dataset.n || 7, box = el.parentElement.getBoundingClientRect();
    const col = Math.min(n - 1, Math.max(0, Math.floor((p.x - box.left) / (box.width / n))));
    d.grabDays = diffDays(o.date, el.dataset.seg) + Math.max(0, col - +el.dataset.col);
  } else d.grabDays = el.dataset.seg ? diffDays(o.date, el.dataset.seg) : 0;

  if (!d.rz) {
    const g = el.cloneNode(true);
    g.classList.add('ghost');
    g.classList.remove('dragging');
    const w = Math.min(p.r.width, 240), h = Math.min(p.r.height, 90);
    Object.assign(g.style, { width: w + 'px', height: h + 'px', left: '0px', top: '0px' });
    d.offX = Math.min(p.x - p.r.left, w - 10); d.offY = Math.min(p.y - p.r.top, h - 6);
    document.body.appendChild(g);
    d.ghost = g;
  }
  el.classList.add(d.rz ? 'resizing' : 'dragging');
  document.body.classList.add('is-dragging');
  if (navigator.vibrate) navigator.vibrate(12);
  DR.drag = d;
  updateDrag();
  autoScroll();
}
function autoScroll() {
  cancelAnimationFrame(DR.raf);
  const step = () => {
    const d = DR.drag;
    if (!d) return;
    const sc = $('.tg-scroll') || $('.matrix') || $('.year');
    if (sc) {
      const r = sc.getBoundingClientRect();
      let v = 0;
      if (d.y < r.top + 40 && d.y > r.top - 60) v = -12; else if (d.y > r.bottom - 40) v = 12;
      if (v) { sc.scrollTop += v; updateDrag(); }
    }
    DR.raf = requestAnimationFrame(step);
  };
  DR.raf = requestAnimationFrame(step);
}
function dropTargetAt(d) {
  const el = document.elementFromPoint(d.x, d.y);
  const t = el && el.closest('[data-drop]');
  if (!t) return null;
  const res = { el: t, type: t.dataset.drop, date: t.dataset.date, q: t.dataset.q };
  if (res.type === 'tg') {
    const r = t.getBoundingClientRect(), H = S.settings.hourH;
    let min = (d.y - r.top) / H * 60 - (d.kind === 'timed' ? d.grabMin : 0);
    min = Math.round(min / 15) * 15;
    res.min = Math.max(0, Math.min(1440 - 15, min));
  }
  return res;
}
function updateDrag() {
  const d = DR.drag;
  if (!d) return;
  $$('.drop-hi').forEach(x => x.classList.remove('drop-hi'));
  $$('.drop-prev').forEach(x => x.remove());
  const H = S.settings.hourH;
  if (d.rz) {
    const col = d.el.closest('.tgc'), r = col.getBoundingClientRect();
    const st = t2m(d.occ.st);
    let end = Math.round(((d.y - r.top) / H * 60) / 15) * 15;
    end = Math.max(st + 15, Math.min(1440, end));
    d.newEnd = end;
    d.el.style.height = Math.max(18, (end - st) / 60 * H - 2) + 'px';
    const sm = d.el.querySelector('small');
    if (sm) sm.textContent = `${d.occ.st} – ${m2t(end % 1440)}`;
    return;
  }
  d.ghost.style.left = (d.x - d.offX) + 'px';
  d.ghost.style.top = (d.y - d.offY) + 'px';
  const t = dropTargetAt(d);
  d.target = t;
  if (!t) return;
  if (t.type === 'tg') {
    const o = d.occ;
    const dur = o.allDay ? 60 : Math.max(15, (dtOf(o.end, o.et || o.st) - dtOf(o.date, o.st)) / 60000);
    const pv = document.createElement('div');
    pv.className = 'drop-prev';
    pv.style.top = (t.min / 60 * H) + 'px';
    pv.style.height = Math.max(18, Math.min(dur, 1440 - t.min) / 60 * H) + 'px';
    pv.textContent = m2t(t.min);
    t.el.appendChild(pv);
  } else {
    let hi = t.el;
    if (t.type === 'day' && d.grabDays) {
      const nd = $(`[data-drop="day"][data-date="${addDaysS(t.date, -d.grabDays)}"]`);
      if (nd) hi = nd;
    }
    hi.classList.add('drop-hi');
  }
}
function endDrag(apply) {
  const d = DR.drag;
  DR.drag = null; DR.press = null;
  cancelAnimationFrame(DR.raf);
  if (d.ghost) d.ghost.remove();
  d.el.classList.remove('dragging', 'resizing');
  document.body.classList.remove('is-dragging');
  $$('.drop-hi').forEach(x => x.classList.remove('drop-hi'));
  $$('.drop-prev').forEach(x => x.remove());
  DR.suppress = Date.now();
  if (apply) applyDrop(d); else render();
}

async function applyDrop(d) {
  const o = d.occ, ev = o.ev, t = d.target;
  if (d.rz) {
    if (d.newEnd == null) return render();
    const [ed, et] = splitDT(new Date(dtOf(o.date, '00:00').getTime() + d.newEnd * 60000));
    if (ed === o.end && et === o.et) return render();
    await applyOccPatch(o, { endDate: ed, endTime: et });
    return render();
  }
  if (!t) return render();
  if (t.type === 'quad') {
    const q = +t.q;
    if (ev.priority === q) return render();
    snapshot();
    ev.priority = q;
    await saveEv(ev);
    toast(q ? `「${ev.title}」 → ${PRIO[q].short}` : '우선순위를 해제했습니다', true);
    return render();
  }
  let patch = null;
  if (t.type === 'day') {
    const ns = addDaysS(t.date, -d.grabDays);
    if (ns === o.date) return render();
    const delta = diffDays(o.date, ns);
    patch = { startDate: ns, endDate: addDaysS(o.end, delta) };
  } else if (t.type === 'tg') {
    const st = m2t(t.min);
    if (o.allDay) {
      const [ed, et] = splitDT(new Date(dtOf(t.date, st).getTime() + 3600e3));
      patch = { allDay: false, startDate: t.date, startTime: st, endDate: ed, endTime: et };
    } else {
      if (t.date === o.date && st === o.st) return render();
      const dur = dtOf(o.end, o.et || o.st) - dtOf(o.date, o.st);
      const [ed, et] = splitDT(new Date(dtOf(t.date, st).getTime() + Math.max(dur, 15 * 60000)));
      patch = { startDate: t.date, startTime: st, endDate: ed, endTime: et };
    }
  }
  if (!patch) return render();
  if (ev.type === 'mark') { patch.allDay = true; delete patch.startTime; delete patch.endTime; if (t.type === 'tg') { patch.startDate = t.date; patch.endDate = addDaysS(o.end, diffDays(o.date, t.date)); } }
  const ok = await applyOccPatch(o, patch);
  if (ok !== false) toast(`「${ev.title}」 → ${fmtDateK(patch.startDate)}${patch.startTime ? ' ' + fmtTime(patch.startTime) : ''}`, true);
  render();
}
