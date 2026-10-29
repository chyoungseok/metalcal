'use strict';
/* ═════════ 모달 · 일정 편집기 ═════════ */
function modal(html, cls = '') {
  const ov = document.createElement('div');
  ov.className = 'ov';
  ov.innerHTML = `<div class="dlg ${cls}">${html}</div>`;
  document.body.appendChild(ov);
  ov.addEventListener('pointerdown', e => { ov._downSelf = e.target === ov; });
  ov.addEventListener('click', e => { if (e.target === ov && ov._downSelf) closeModal(ov); });
  return ov;
}
function closeModal(ov) {
  if (!ov || !ov.isConnected) return;
  ov.remove();
  if (ov._onClose) ov._onClose();
}
window.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || DR.drag) return;
  const ovs = $$('.ov');
  if (ovs.length) closeModal(ovs[ovs.length - 1]);
});

function choose(title, msg, options) {
  return new Promise(res => {
    const ov = modal(`<div class="dlg-h"><b>${esc(title)}</b><button class="btn sm" data-c="">취소</button></div>
      <div class="scope">${msg ? `<p>${esc(msg)}</p>` : ''}${options.map(([v, l, cls]) => `<button class="btn ${cls || ''}" data-c="${v}">${esc(l)}</button>`).join('')}</div>`);
    ov._onClose = () => res(null);
    ov.addEventListener('click', e => {
      const b = e.target.closest('[data-c]');
      if (!b) return;
      ov._onClose = null; ov.remove(); res(b.dataset.c || null);
    });
  });
}
const askScope = (title = '반복 일정') => choose(title, '어느 일정에 적용할까요?', [['one', '이 일정만'], ['following', '이 일정 및 이후 일정'], ['all', '모든 반복 일정', 'primary']]);

/* 반복 프리셋 */
function presetList(start) {
  const d = parseYmd(start), wd = WD[d.getDay()], n = nthOf(d);
  return [['none', '반복 안 함'], ['daily', '매일'], ['weekdays', '평일마다 (월–금)'], ['weekly', `매주 ${wd}요일`], ['biweekly', `격주 ${wd}요일`],
    ['monthly', `매월 ${d.getDate()}일`], ['monthlyNth', `매월 ${NTH[n.n]} ${wd}요일`], ...(n.last ? [['monthlyLastWd', `매월 마지막 ${wd}요일`]] : []),
    ['monthlyLast', '매월 마지막 날'], ['yearly', `매년 ${d.getMonth() + 1}월 ${d.getDate()}일`], ['custom', '사용자 지정…']];
}
function presetRule(k, start, prev) {
  const d = parseYmd(start), wd = d.getDay(), n = nthOf(d);
  const base = { daily: { freq: 'daily', interval: 1 }, weekdays: { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] },
    weekly: { freq: 'weekly', interval: 1, byDay: [wd] }, biweekly: { freq: 'weekly', interval: 2, byDay: [wd] },
    monthly: { freq: 'monthly', interval: 1, monthMode: 'date' }, monthlyNth: { freq: 'monthly', interval: 1, monthMode: 'nth', nth: n.n },
    monthlyLastWd: { freq: 'monthly', interval: 1, monthMode: 'nth', nth: -1 }, monthlyLast: { freq: 'monthly', interval: 1, monthMode: 'last' },
    yearly: { freq: 'yearly', interval: 1 } }[k];
  if (k === 'none') return null;
  const keep = prev ? { until: prev.until || null, count: prev.count || null, skip: prev.skip || null, afterDone: !!prev.afterDone } : {};
  if (k === 'custom') return Object.assign({ freq: 'weekly', interval: 1, byDay: [wd] }, prev || {}, { custom: true });
  return Object.assign({}, base, keep);
}
function rulePreset(r, start) {
  if (!r) return 'none';
  if (r.custom) return 'custom';
  const norm = x => JSON.stringify([x.freq, +x.interval || 1, (x.byDay || []).slice().sort(), x.monthMode || '', x.nth || 0]);
  for (const [k] of presetList(start)) {
    if (k === 'none' || k === 'custom') continue;
    const p = presetRule(k, start);
    if (norm(p) === norm(Object.assign({}, r, r.freq === 'weekly' ? {} : { byDay: [] }))) return k;
  }
  return 'custom';
}

function draftFromOcc(o) {
  const D = clone(Object.assign({}, o.ev));
  D.startDate = o.date; D.endDate = o.end;
  D.r = D.rrule ? clone(D.rrule) : null;
  return D;
}

async function openEditor(arg) {
  const occ = arg && arg.ev ? arg : null;
  const D = occ ? draftFromOcc(occ) : Object.assign(newEvent({}), arg || {});
  if (!occ) D.r = D.rrule ? clone(D.rrule) : null;
  if (!D.startTime) D._st = '09:00';
  const isNew = !occ;
  const ov = modal('', 'editor');
  const dlg = ov.firstChild;
  const draw = () => {
    const sc = dlg.scrollTop;
    dlg.innerHTML = edHTML(D, isNew, occ);
    dlg.scrollTop = sc;
  };
  draw();
  if (isNew) setTimeout(() => { const t = $('[data-f="title"]', dlg); if (t && innerWidth > 640) t.focus(); }, 60);

  // 입력 중 포커스를 잃지 않도록 날짜·시간 변경은 다시 그리지 않고 관련 칸만 갱신
  const syncEnd = () => {
    const ed = $('[data-f="endDate"]', dlg), et = $('[data-f="endTime"]', dlg);
    if (ed) ed.value = D.endDate;
    if (et && D.endTime) et.value = D.endTime;
  };
  const syncRule = () => {
    const sel = $('[data-preset]', dlg), pr = rulePreset(D.r, D.startDate);
    if (sel) sel.innerHTML = presetList(D.startDate).map(([k, l]) => `<option value="${k}"${pr === k ? ' selected' : ''}>${l}</option>`).join('');
    const sum = $('.rp-sum', dlg);
    if (sum) sum.textContent = '↻ ' + describeRule(D.r, D.startDate);
  };
  const setTime = (f, v) => {
    if (f === 'startTime' && D.startTime && D.endTime) {
      const dur = dtOf(D.endDate, D.endTime) - dtOf(D.startDate, D.startTime);
      D.startTime = v;
      [D.endDate, D.endTime] = splitDT(new Date(dtOf(D.startDate, v).getTime() + Math.max(dur, 15 * 60000)));
      syncEnd(); return;
    }
    D[f] = v;
  };
  dlg.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.f && !['startDate', 'endDate', 'startTime', 'endTime', 'allDay'].includes(t.dataset.f)) D[t.dataset.f] = t.value;
    if (t.dataset.r && D.r) {
      const k = t.dataset.r;
      D.r[k] = t.type === 'checkbox' ? t.checked : t.type === 'number' ? Math.max(1, +t.value || 1) : (t.value || null);
      const sum = $('.rp-sum', dlg);
      if (sum) sum.textContent = '↻ ' + describeRule(D.r, D.startDate);
    }
  });
  dlg.addEventListener('change', e => {
    const t = e.target, f = t.dataset.f;
    if (f === 'allDay') {
      D.allDay = t.checked;
      if (!D.allDay && !D.startTime) { D.startTime = '09:00'; D.endTime = '10:00'; D.endDate = D.startDate; }
      draw();
    } else if (f === 'startDate' && t.value) {
      const delta = diffDays(D.startDate, t.value), oldWd = parseYmd(D.startDate).getDay();
      D.startDate = t.value; D.endDate = addDaysS(D.endDate, delta);
      if (D.r && D.r.freq === 'weekly' && (D.r.byDay || []).length === 1 && D.r.byDay[0] === oldWd) D.r.byDay = [parseYmd(t.value).getDay()];
      syncEnd(); syncRule();
    } else if (f === 'endDate' && t.value) { D.endDate = t.value < D.startDate ? D.startDate : t.value; syncEnd(); }
    else if ((f === 'startTime' || f === 'endTime') && t.value) setTime(f, t.value);
    else if (t.dataset.preset != null) { D.r = presetRule(t.value, D.startDate, D.r); draw(); }
    else if (t.dataset.endmode != null) {
      if (!D.r) return;
      D.r.until = t.value === 'until' ? (D.r.until || addDaysS(D.startDate, 90)) : null;
      D.r.count = t.value === 'count' ? (D.r.count || 10) : null;
      draw();
    } else if (t.dataset.r === 'freq') {
      D.r.freq = t.value;
      if (t.value === 'weekly' && !(D.r.byDay || []).length) D.r.byDay = [parseYmd(D.startDate).getDay()];
      if (t.value === 'monthly' && !D.r.monthMode) D.r.monthMode = 'date';
      draw();
    } else if (f === 'reminder') D.reminder = t.value === '' ? null : +t.value;
    else if (f === 'goalId') { D.goalId = t.value || null; if (D.goalId && !D._colorTouched) { const g = S.goals.find(x => x.id === D.goalId); if (g) D.color = g.color; } draw(); }
  });
  const addTag = v => {
    v = v.replace(/^#/, '').trim();
    if (v && !D.tags.includes(v)) { D.tags.push(v); if (!D._colorTouched) { const c = colorFromTags([v]); if (c) D.color = c; } }
    draw();
    setTimeout(() => { const i = $('[data-tagin]', dlg); if (i) i.focus(); }, 0);
  };
  dlg.addEventListener('keydown', e => {
    if (e.target.dataset.tagin != null && (e.key === 'Enter' || e.key === ',') && !e.isComposing) {
      e.preventDefault(); addTag(e.target.value);
    } else if (e.key === 'Enter' && e.target.dataset.f === 'title' && !e.isComposing) { e.preventDefault(); save(); }
  });
  dlg.addEventListener('focusout', e => { if (e.target.dataset.tagin != null && e.target.value.trim()) addTag(e.target.value); });

  const save = async () => {
    const p = draftToPatch(D);
    if (isNew) {
      const ev = Object.assign(newEvent({}), p);
      snapshot();
      await saveEv(ev);
      closeModal(ov);
      S.sel = ev.startDate;
      toast(`「${ev.title}」 추가됨`);
    } else {
      const ok = await applyOccPatch(occ, p, null, true);
      if (ok === false) return;
      closeModal(ov);
    }
    render();
  };

  dlg.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const ds = b.dataset;
    if (ds.settype) {
      D.type = ds.settype;
      if (D.type === 'mark') { D.allDay = true; D.priority = 0; if (!D._colorTouched) D.color = markColor(); }
      if (D.type !== 'task' && D.r) D.r.afterDone = false;
      draw();
    } else if (ds.mkt) { D.title = ds.mkt; draw(); }
    else if (ds.color) { D.color = ds.color; D._colorTouched = true; draw(); }
    else if (ds.prio != null) { D.priority = +ds.prio; draw(); }
    else if (ds.wd != null) {
      const w = +ds.wd, a = D.r.byDay || [];
      D.r.byDay = a.includes(w) ? (a.length > 1 ? a.filter(x => x !== w) : a) : [...a, w];
      draw();
    } else if (ds.mm) {
      if (ds.mm === 'date') Object.assign(D.r, { monthMode: 'date', nth: null });
      if (ds.mm === 'nth') Object.assign(D.r, { monthMode: 'nth', nth: nthOf(parseYmd(D.startDate)).n });
      if (ds.mm === 'lastwd') Object.assign(D.r, { monthMode: 'nth', nth: -1 });
      if (ds.mm === 'last') Object.assign(D.r, { monthMode: 'last', nth: null });
      draw();
    } else if (ds.rmtag) { D.tags = D.tags.filter(t => t !== ds.rmtag); draw(); }
    else if (ds.sugtag) addTag(ds.sugtag);
    else if (ds.ed === 'cancel') closeModal(ov);
    else if (ds.ed === 'save') save();
    else if (ds.ed === 'del') { closeModal(ov); await deleteOcc(occ); }
    else if (ds.ed === 'dup') {
      const c = Object.assign(newEvent({}), draftToPatch(D), { title: D.title + ' (복사본)' });
      snapshot(); await saveEv(c); closeModal(ov); toast('복제했습니다', true); render();
    } else if (ds.ed === 'pomo') {
      Pomo.st.taskId = occ.ev.id; Pomo.save(); closeModal(ov); setView('pomo');
    }
  });
}

function draftToPatch(D) {
  const p = {
    title: (D.title || '').trim() || '(제목 없음)', type: D.type, allDay: D.type === 'mark' ? true : !!D.allDay,
    startDate: D.startDate, endDate: D.endDate < D.startDate ? D.startDate : D.endDate, startTime: null, endTime: null,
    color: D.color, tags: D.tags.slice(), priority: D.type === 'mark' ? 0 : +D.priority || 0,
    reminder: D.type === 'mark' ? null : (D.reminder == null || D.reminder === '' ? null : +D.reminder),
    location: D.location || '', notes: D.notes || '', rrule: D.r ? clone(D.r) : null, goalId: D.type === 'mark' ? null : (D.goalId || null)
  };
  if (!p.allDay) {
    p.startTime = D.startTime || '09:00';
    p.endTime = D.endTime || m2t(Math.min(t2m(p.startTime) + 60, 1439));
    if (dtOf(p.endDate, p.endTime) <= dtOf(p.startDate, p.startTime)) [p.endDate, p.endTime] = splitDT(new Date(dtOf(p.startDate, p.startTime).getTime() + 3600e3));
  }
  if (p.rrule) {
    delete p.rrule.custom;
    if (p.rrule.freq === 'weekly' && !(p.rrule.byDay || []).length) p.rrule.byDay = [parseYmd(p.startDate).getDay()];
    if (p.type !== 'task') p.rrule.afterDone = false;
    if (!p.rrule.until) delete p.rrule.until;
    if (!p.rrule.count) delete p.rrule.count;
    if (!p.rrule.skip) delete p.rrule.skip;
  }
  return p;
}

function edHTML(D, isNew, occ) {
  const C = S.settings.colors, preset = rulePreset(D.r, D.startDate);
  const allTags = [...new Set(S.events.flatMap(e => e.tags || []))].filter(t => !D.tags.includes(t)).slice(0, 12);
  const sd = parseYmd(D.startDate), n = nthOf(sd);
  const reminders = [['', '없음'], [0, '정시'], [5, '5분 전'], [10, '10분 전'], [30, '30분 전'], [60, '1시간 전'], [1440, '1일 전']];
  const endMode = D.r ? (D.r.until ? 'until' : D.r.count ? 'count' : 'never') : 'never';
  const order = Array.from({ length: 7 }, (_, i) => (S.settings.weekStart + i) % 7);
  let rp = '';
  if (D.r) {
    rp = '<div class="rp-panel">';
    if (preset === 'custom') {
      rp += `<div class="fr"><span class="k">간격</span><span>매</span><input type="number" min="1" max="99" class="in num" data-r="interval" value="${D.r.interval || 1}">
        <select class="in" data-r="freq">${[['daily', '일'], ['weekly', '주'], ['monthly', '개월'], ['yearly', '년']].map(([v, l]) => `<option value="${v}"${D.r.freq === v ? ' selected' : ''}>${l}</option>`).join('')}</select><span>마다</span></div>`;
      if (D.r.freq === 'weekly') rp += `<div class="wdchips">${order.map(i => `<button class="${(D.r.byDay || []).includes(i) ? 'on' : ''}" data-wd="${i}">${WD[i]}</button>`).join('')}</div>`;
      if (D.r.freq === 'monthly') {
        const mm = D.r.monthMode === 'nth' ? (D.r.nth === -1 ? 'lastwd' : 'nth') : (D.r.monthMode || 'date');
        rp += `<div class="seg full" style="flex-wrap:wrap">${[['date', `${sd.getDate()}일`], ['nth', `${NTH[n.n]} ${WD[sd.getDay()]}요일`], ...(n.last ? [['lastwd', `마지막 ${WD[sd.getDay()]}요일`]] : []), ['last', '말일']]
          .map(([k, l]) => `<button class="${mm === k ? 'on' : ''}" data-mm="${k}">${l}</button>`).join('')}</div>`;
      }
    }
    rp += `<div class="fr"><span class="k">종료</span><select class="in" data-endmode>${[['never', '계속 반복'], ['until', '날짜까지'], ['count', '횟수 지정']].map(([v, l]) => `<option value="${v}"${endMode === v ? ' selected' : ''}>${l}</option>`).join('')}</select>
      ${endMode === 'until' ? `<input type="date" class="in" data-r="until" value="${D.r.until}">` : endMode === 'count' ? `<input type="number" min="1" class="in num" data-r="count" value="${D.r.count}"><span>회</span>` : ''}</div>
      <div class="fr"><span class="k">건너뛰기</span><select class="in" data-r="skip">${[['', '건너뛰지 않음'], ['weekend', '주말 건너뛰기'], ['holiday', '공휴일 건너뛰기'], ['both', '주말·공휴일 건너뛰기']].map(([v, l]) => `<option value="${v}"${(D.r.skip || '') === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
      ${D.type === 'task' ? `<div class="fr"><label class="sw"><input type="checkbox" data-r="afterDone" ${D.r.afterDone ? 'checked' : ''}><i></i></label><span class="hint">완료한 날을 기준으로 다음 반복 계산 (예: 완료 3일 후 다시)</span></div>` : ''}
      <div class="rp-sum">↻ ${esc(describeRule(D.r, D.startDate))}</div></div>`;
  }
  const meta = occ ? `${occ.ev.pomos ? `🍅 ${occ.ev.pomos}회 · ` : ''}${occ.ev.created ? '생성 ' + ymd(new Date(occ.ev.created)) : ''}` : '';
  return `
  <div class="dlg-h"><button class="btn" data-ed="cancel">취소</button><b>${isNew ? '새 항목' : '편집'}</b><button class="btn primary" data-ed="save">저장</button></div>
  <div class="ed">
    <input class="in title-in" data-f="title" placeholder="${D.type === 'mark' ? '예: 여름 휴가' : D.type === 'task' ? '할 일' : '일정 제목'}" value="${esc(D.title)}" autocomplete="off" enterkeyhint="done">
    <div class="seg full">${[['event', '일정'], ['task', '할 일'], ['mark', '날짜 표시·휴가']].map(([k, l]) => `<button data-settype="${k}" class="${D.type === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    ${D.type === 'mark' ? `<div class="chips">${['휴가', '연차', '반차', '출장', '재택', '기념일', '생일'].map(t => `<button class="chip" data-mkt="${t}">${t}</button>`).join('')}</div>
      <p class="hint">‘날짜 표시’는 달력의 날짜 칸 자체에 색과 이름으로 기록되어, 등록된 일정 막대와 겹치지 않습니다.</p>` : ''}
    ${D.type !== 'mark' ? `<div class="fr"><span class="k">종일</span><label class="sw"><input type="checkbox" data-f="allDay" ${D.allDay ? 'checked' : ''}><i></i></label></div>` : ''}
    <div class="fr"><span class="k">시작</span><input type="date" class="in" data-f="startDate" value="${D.startDate}">${D.allDay ? '' : `<input type="time" class="in" data-f="startTime" step="300" value="${D.startTime || '09:00'}">`}</div>
    <div class="fr"><span class="k">종료</span><input type="date" class="in" data-f="endDate" value="${D.endDate}">${D.allDay ? '' : `<input type="time" class="in" data-f="endTime" step="300" value="${D.endTime || '10:00'}">`}</div>
    <div class="fr"><span class="k">반복</span><select class="in" data-preset>${presetList(D.startDate).map(([k, l]) => `<option value="${k}"${preset === k ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
    ${rp}
    <div class="fr col"><span class="k">색상 분류</span><div class="colors">${C.map(c => `<button class="cdot ${D.color === c.id ? 'on' : ''}" data-color="${c.id}" style="--c:${c.hex}"><i></i><span>${esc(c.name)}</span></button>`).join('')}</div></div>
    <div class="fr col"><span class="k">태그</span><div class="tagbox">${D.tags.map(t => `<span class="tagc">#${esc(t)}<button data-rmtag="${esc(t)}">×</button></span>`).join('')}<input class="in" data-tagin placeholder="태그 입력 후 Enter" enterkeyhint="enter"></div>
      ${allTags.length ? `<div class="sugg">${allTags.map(t => `<button data-sugtag="${esc(t)}">#${esc(t)}</button>`).join('')}</div>` : ''}</div>
    ${D.type !== 'mark' ? `<div class="fr col"><span class="k">우선순위 (아이젠하워)</span><div class="prio">${[1, 2, 3, 4, 0].map(q => `<button class="pq q${q} ${(+D.priority || 0) === q ? 'on' : ''}" data-prio="${q}">${PRIO[q].short}</button>`).join('')}</div></div>
    <div class="fr"><span class="k">목표</span><select class="in" data-f="goalId"><option value="">연결 안 함</option>${activeGoals().map(g => `<option value="${g.id}"${D.goalId === g.id ? ' selected' : ''}>🎯 ${esc(g.title)}${g.must ? ' (필수)' : ''}</option>`).join('')}</select></div>
    ${(() => { const rc = recommend(mkOcc(Object.assign({}, D, { goalId: D.goalId || null, rrule: null }), D.startDate, 0)); return `<div class="recline"><span>👍 추천 <b>${PRIO[rc.q].short}</b> — ${esc(rc.why)}</span>${(+D.priority || 0) === rc.q ? '<em>적용됨</em>' : `<button class="btn sm" data-prio="${rc.q}">추천 적용</button>`}</div>`; })()}` : ''}
    ${D.type !== 'mark' ? `<div class="fr"><span class="k">알림</span><select class="in" data-f="reminder">${reminders.map(([v, l]) => `<option value="${v}"${String(D.reminder ?? '') === String(v) ? ' selected' : ''}>${l}${D.allDay && v !== '' ? ' (오전 9시 기준)' : ''}</option>`).join('')}</select></div>` : ''}
    <div class="fr"><span class="k">장소</span><input class="in" data-f="location" value="${esc(D.location)}" placeholder="장소 (선택)"></div>
    <div class="fr col"><span class="k">메모</span><textarea class="in" data-f="notes" rows="3" placeholder="메모 (선택)">${esc(D.notes)}</textarea></div>
    ${!isNew ? `<div class="ed-foot"><span class="ed-meta">${meta}</span>${D.type === 'task' ? '<button class="btn" data-ed="pomo">🍅 집중</button>' : ''}<button class="btn" data-ed="dup">복제</button><button class="btn danger" data-ed="del">삭제</button></div>` : ''}
  </div>`;
}
