'use strict';
/* ═════════ 보기 렌더링: 월 / 주 / 일 / 연 / 목록 / 매트릭스 ═════════ */
const ICON = {
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  left: '<path d="M15 18l-6-6 6-6"/>', right: '<path d="M9 18l6-6-6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  month: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01"/>',
  week: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M9 9v12M15 9v12"/>',
  day: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M7 13h10M7 17h6"/>',
  year: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  matrix: '<path d="M12 3v18M3 12h18"/><rect x="3" y="3" width="18" height="18" rx="2"/>',
  goal: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  wallet: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2M6 6l9-3 2 3"/>',
  cal: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4"/>',
  note: '<path d="M5 3h10l4 4v14H5z"/><path d="M15 3v4h4M8 12h8M8 16h5"/>',
  pomo: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9 2h6"/>'
};
const ico = (k, cls = 'i') => `<svg class="${cls}" viewBox="0 0 24 24">${ICON[k]}</svg>`;
const VIEWS = [['month', '월', 'month'], ['week', '주', 'week'], ['day', '일', 'day'], ['year', '연', 'year'], ['list', '목록', 'list'], ['goals', '목표', 'goal'], ['matrix', '매트릭스', 'matrix'], ['money', '가계부', 'wallet'], ['notes', '기록장', 'note'], ['pomo', '뽀모도로', 'pomo']];
const PRIO = {
  0: { name: '없음', short: '없음', desc: '' },
  1: { name: '긴급 · 중요', short: 'Q1 긴급·중요', desc: '지금 바로 하기' },
  2: { name: '중요 · 긴급하지 않음', short: 'Q2 중요', desc: '계획하고 일정 잡기' },
  3: { name: '긴급 · 중요하지 않음', short: 'Q3 긴급', desc: '위임하거나 빨리 처리' },
  4: { name: '긴급하지도 중요하지도 않음', short: 'Q4 나중에', desc: '줄이거나 버리기' }
};

const colorOf = id => S.settings.colors.find(c => c.id === id) || S.settings.colors[0] || { id: 'x', hex: '#8a94a6', name: '' };
const colorHex = id => colorOf(id).hex;
const colorIdx = id => { const i = S.settings.colors.findIndex(c => c.id === id); return i < 0 ? 999 : i; };
const markColor = () => (S.settings.colors.find(c => /휴가|휴일|연차/.test(c.name)) || S.settings.colors[0]).id;
const colorFromTags = tags => { for (const t of tags || []) { const c = S.settings.colors.find(c => c.name === t); if (c) return c.id; } return null; };

function visible(ev) {
  if (S.hidden.has(ev.color)) return false;
  if (S.tagFilter && !(ev.tags || []).includes(S.tagFilter)) return false;
  return areaMatch(ev);
}
function getOccs(from, to) {
  const items = [], marks = new Map();
  for (const ev of S.events) {
    if (!visible(ev)) continue;
    for (const o of expandEvent(ev, from, to)) {
      S.occMap.set(o.key, o);
      if (ev.type === 'mark') {
        for (let d = o.date < from ? from : o.date; d <= o.dispEnd && d <= to; d = addDaysS(d, 1)) {
          if (!marks.has(d)) marks.set(d, []);
          marks.get(d).push(o);
        }
      } else items.push(o);
    }
  }
  return { items, marks };
}
const sortKey = o => (o.allDay ? '0' : '1') + (o.st || '') + o.ev.title;

/* 색상별 행 배치: 같은 색은 같은 행(lane)에, 색상 순서대로 위에서 아래로 */
function layoutLanes(segs) {
  segs.sort((a, b) => a.ci - b.ci || a.s - b.s || (b.e - b.s) - (a.e - a.s) || (a.sk < b.sk ? -1 : a.sk > b.sk ? 1 : 0));
  let base = 0, i = 0;
  while (i < segs.length) {
    const ci = segs[i].ci, lanes = [];
    for (; i < segs.length && segs[i].ci === ci; i++) {
      const g = segs[i];
      let L = lanes.findIndex(end => end < g.s);
      if (L < 0) { L = lanes.length; lanes.push(-1); }
      lanes[L] = g.e;
      g.lane = base + L;
    }
    base += lanes.length;
  }
  return base;
}
function barHTML(g, top, h, n) {
  const o = g.o, ev = o.ev, c = colorHex(ev.color);
  const timedSingle = !o.allDay && o.date === o.dispEnd;
  const cls = ['bar', timedSingle ? 'timed' : '', g.cl ? 'cl' : '', g.cr ? 'cr' : '', o.done ? 'done' : ''].join(' ');
  return `<div class="${cls}" data-occ="${o.key}" data-seg="${g.segDate}" data-col="${g.s}" data-n="${n}" title="${esc(ev.title)}" ` +
    `style="top:${top}px;height:${h}px;left:calc(${g.s} * 100% / ${n} + 2px);width:calc(${g.e - g.s + 1} * 100% / ${n} - 4px);--c:${c};--tc:${idealText(c)}">` +
    `${ev.type === 'task' ? `<i class="ck${o.done ? ' on' : ''}" data-check="${o.key}"></i>` : ''}` +
    `${!o.allDay && !g.cl ? `<b class="tm">${o.st}</b>` : ''}<span>${esc(ev.title)}</span>${ev.rrule ? '<i class="rp">↻</i>' : ''}</div>`;
}
function markChip(o, ds) {
  const c = colorHex(o.ev.color);
  return `<span class="mk" data-occ="${o.key}" data-seg="${ds}" style="--c:${c};--tc:${idealText(c)}" title="${esc(o.ev.title)}">${esc(o.ev.title)}</span>`;
}

/* ── 월 ── */
function renderMonth(V) {
  const ws = S.settings.weekStart, cur = parseYmd(S.cur), y = cur.getFullYear(), m = cur.getMonth();
  const first = new Date(y, m, 1), gs = startOfWeek(first, ws);
  const nW = Math.ceil((diffDays(ymd(gs), ymd(first)) + daysInMonth(y, m)) / 7);
  const from = ymd(gs), to = addDaysS(from, nW * 7 - 1);
  const { items, marks } = getOccs(from, to);
  const today = todayS();
  let h = '<div class="month"><div class="mhead">';
  for (let i = 0; i < 7; i++) { const wd = (ws + i) % 7; h += `<div class="${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">${WD[wd]}</div>`; }
  h += '</div><div class="mweeks">';
  for (let w = 0; w < nW; w++) {
    h += '<div class="mweek"><div class="mdays">';
    for (let i = 0; i < 7; i++) {
      const ds = addDaysS(from, w * 7 + i), d = parseYmd(ds), wd = d.getDay(), hol = holidayName(ds), mk = marks.get(ds) || [];
      const cls = ['mday', d.getMonth() !== m ? 'out' : '', ds === today ? 'today' : '', ds === S.sel ? 'sel' : '',
        (wd === 0 || hol) ? 'sun' : wd === 6 ? 'sat' : '', mk.length ? 'marked' : ''].join(' ');
      // 기간 표시는 시작일·주 첫날에만 이름 표기 (나머지는 색 띠)
      const chips = mk.filter(o => o.date === ds || i === 0).map(o => markChip(o, ds)).join('');
      h += `<div class="${cls}" data-date="${ds}" data-drop="day"${mk.length ? ` style="--mk:${colorHex(mk[0].ev.color)}"` : ''}>` +
        `<div class="dh"><span class="dnum" data-goday="${ds}">${d.getDate()}</span>${hol ? `<span class="hol">${esc(hol)}</span>` : ''}${chips}</div>` +
        `<button class="more" data-goday="${ds}" hidden></button></div>`;
    }
    h += '</div><div class="mbars"></div></div>';
  }
  V.innerHTML = h + '</div></div>';
  const small = innerWidth < 640, laneH = small ? 16 : 20, top = small ? 22 : 26;
  $$('.mweek', V).forEach((wEl, w) => {
    const wsd = addDaysS(from, w * 7), wed = addDaysS(wsd, 6), segs = [];
    for (const o of items) {
      if (o.date > wed || o.dispEnd < wsd) continue;
      const s = Math.max(0, diffDays(wsd, o.date)), e = Math.min(6, diffDays(wsd, o.dispEnd));
      segs.push({ o, s, e, ci: colorIdx(o.ev.color), sk: sortKey(o), cl: o.date < wsd, cr: o.dispEnd > wed, segDate: addDaysS(wsd, s) });
    }
    const lanes = layoutLanes(segs);
    const cap = Math.max(0, Math.floor((wEl.clientHeight - top - 1) / laneH));
    const vis = lanes > cap ? Math.max(0, cap - 1) : cap;
    const hidden = [0, 0, 0, 0, 0, 0, 0];
    let bh = '';
    for (const g of segs) {
      if (g.lane >= vis) { for (let c = g.s; c <= g.e; c++) hidden[c]++; continue; }
      bh += barHTML(g, top + g.lane * laneH, laneH - 2, 7);
    }
    wEl.querySelector('.mbars').innerHTML = bh;
    const cells = wEl.querySelectorAll('.mday');
    hidden.forEach((n, c) => { if (n) { const b = cells[c].querySelector('.more'); b.hidden = false; b.textContent = `+${n}개 더`; } });
  });
}

/* ── 주 / 일 (시간표) ── */
function layoutCols(evs) {
  evs.sort((a, b) => a.s - b.s || b.e - a.e);
  let cl = [], end = -1;
  const flush = () => {
    const cols = [];
    for (const x of cl) { let c = cols.findIndex(e => e <= x.s); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = x.e; x.col = c; }
    cl.forEach(x => x.ncol = cols.length);
    cl = [];
  };
  for (const x of evs) { if (cl.length && x.s >= end) { flush(); end = -1; } cl.push(x); end = Math.max(end, x.e); }
  if (cl.length) flush();
}
function tevHTML(x, H) {
  const o = x.o, ev = o.ev, c = colorHex(ev.color);
  const top = x.s / 60 * H, ht = Math.max(18, (x.e - x.s) / 60 * H - 2), w = 100 / x.ncol;
  return `<div class="tev${o.done ? ' done' : ''}${ht < 36 ? ' short' : ''}" data-occ="${o.key}" ` +
    `style="top:${top}px;height:${ht}px;left:calc(${x.col * w}% + 1px);width:calc(${w}% - 3px);--c:${c};--tc:${idealText(c)}">` +
    `<b>${ev.type === 'task' ? `<i class="ck${o.done ? ' on' : ''}" data-check="${o.key}"></i>` : ''}${ev.rrule ? '↻ ' : ''}${esc(ev.title)}</b>` +
    `<small>${o.st}${o.et ? ' – ' + o.et : ''}${ev.location ? ' · ' + esc(ev.location) : ''}</small><i class="rz"></i></div>`;
}
function renderTimeGrid(V, dates) {
  const n = dates.length, from = dates[0], to = dates[n - 1], H = S.settings.hourH, today = todayS();
  const { items, marks } = getOccs(from, to);
  const allday = items.filter(o => o.allDay || o.date !== o.dispEnd);
  const timed = items.filter(o => !o.allDay && o.date === o.dispEnd);
  let h = `<div class="tg" style="--n:${n};--H:${H}px"><div class="tg-head"><div class="gut"></div><div class="tg-hc">`;
  for (const ds of dates) {
    const d = parseYmd(ds), wd = d.getDay(), hol = holidayName(ds), mk = marks.get(ds) || [];
    h += `<div class="tgh ${ds === today ? 'today' : ''} ${(wd === 0 || hol) ? 'sun' : wd === 6 ? 'sat' : ''} ${mk.length ? 'marked' : ''}" data-date="${ds}" data-drop="day" data-goday="${ds}"` +
      `${mk.length ? ` style="--mk:${colorHex(mk[0].ev.color)}"` : ''}><span class="wd">${WD[wd]}</span><span class="dn">${d.getDate()}</span>` +
      `<div class="lbl">${hol ? `<span class="hol">${esc(hol)}</span>` : ''}${mk.map(o => markChip(o, ds)).join('')}</div></div>`;
  }
  h += '</div></div>';
  const segs = allday.map(o => {
    const s = Math.max(0, diffDays(from, o.date)), e = Math.min(n - 1, diffDays(from, o.dispEnd));
    return { o, s, e, ci: colorIdx(o.ev.color), sk: sortKey(o), cl: o.date < from, cr: o.dispEnd > to, segDate: addDaysS(from, s) };
  });
  const lanes = layoutLanes(segs), LH = 22;
  h += `<div class="tg-all"><div class="gut">종일</div><div class="tg-allc" style="height:${Math.max(1, lanes) * LH + 4}px">`;
  for (const ds of dates) h += `<div class="tac" data-date="${ds}" data-drop="day"></div>`;
  h += `<div class="mbars">${segs.map(g => barHTML(g, 2 + g.lane * LH, LH - 3, n)).join('')}</div></div></div>`;
  h += `<div class="tg-scroll"><div class="tg-body" style="height:${24 * H}px"><div class="gut hours">`;
  for (let i = 1; i < 24; i++) h += `<span style="top:${i * H}px">${i < 12 ? '오전 ' + i : i === 12 ? '오후 12' : '오후 ' + (i - 12)}시</span>`;
  h += '</div><div class="tg-cols">';
  for (const ds of dates) {
    h += `<div class="tgc${ds === today ? ' today' : ''}" data-date="${ds}" data-drop="tg">`;
    const col = timed.filter(o => o.date === ds).map(o => {
      const s = t2m(o.st);
      const e = o.et ? (o.end > o.date ? 1440 : t2m(o.et)) : s + 30;
      return { o, s, e: Math.max(e, s + 15) };
    });
    layoutCols(col);
    for (const x of col) h += tevHTML(x, H);
    if (ds === today) h += `<div class="now" style="top:${nowMin() / 60 * H}px"></div>`;
    h += '</div>';
  }
  V.innerHTML = h + '</div></div></div></div>';
  const sc = $('.tg-scroll', V);
  sc.scrollTop = S.tgScroll != null ? S.tgScroll : Math.max(0, (dates.includes(today) ? nowMin() / 60 - 2 : 8) * H);
  sc.addEventListener('scroll', () => { S.tgScroll = sc.scrollTop; }, { passive: true });
}
function weekDates() {
  const s = startOfWeek(parseYmd(S.cur), S.settings.weekStart);
  return Array.from({ length: 7 }, (_, i) => ymd(addDays(s, i)));
}

/* ── 연 ── */
function renderYear(V) {
  const y = parseYmd(S.cur).getFullYear(), from = `${y}-01-01`, to = `${y}-12-31`, today = todayS();
  const { items, marks } = getOccs(from, to);
  const map = new Map();
  for (const o of items) {
    for (let d = o.date < from ? from : o.date; d <= o.dispEnd && d <= to; d = addDaysS(d, 1)) {
      if (!map.has(d)) map.set(d, new Set());
      map.get(d).add(colorHex(o.ev.color));
    }
  }
  const ws = S.settings.weekStart, curM = parseYmd(S.cur).getMonth();
  let h = '<div class="year">';
  for (let m = 0; m < 12; m++) {
    h += `<div class="ym${m === curM ? ' cur' : ''}"><button class="ymh" data-month="${y}-${pad(m + 1)}-01">${m + 1}월</button><div class="ygrid">`;
    for (let i = 0; i < 7; i++) h += `<span>${WD[(ws + i) % 7]}</span>`;
    const lead = (new Date(y, m, 1).getDay() - ws + 7) % 7;
    for (let i = 0; i < lead; i++) h += '<i></i>';
    for (let d = 1; d <= daysInMonth(y, m); d++) {
      const ds = `${y}-${pad(m + 1)}-${pad(d)}`, wd = new Date(y, m, d).getDay(), mk = marks.get(ds), hol = holidayName(ds);
      const dots = [...(map.get(ds) || [])].slice(0, 3).map(c => `<i style="--c:${c}"></i>`).join('');
      h += `<div class="yd ${ds === today ? 'today' : ''} ${(wd === 0 || hol) ? 'sun' : wd === 6 ? 'sat' : ''} ${mk ? 'marked' : ''}" data-goday="${ds}"` +
        `${mk ? ` style="--mk:${colorHex(mk[0].ev.color)}"` : ''} title="${esc([hol, ...(mk || []).map(o => o.ev.title)].filter(Boolean).join(', '))}"><span>${d}</span><span class="dots">${dots}</span></div>`;
    }
    h += '</div></div>';
  }
  V.innerHTML = h + '</div>';
  const c = V.querySelector('.ym.cur');
  if (c && curM > 1) V.firstChild.scrollTop = c.offsetTop - 14;
}

/* ── 목록 ── */
function occLine(o, withDate) {
  const ev = o.ev, c = colorHex(ev.color), bits = [];
  if (withDate) bits.push(relDay(o.date));
  bits.push(o.allDay ? (o.dispEnd !== o.date ? `종일 ~ ${relDay(o.dispEnd)}` : '종일') : `${fmtTime(o.st)}${o.et ? ' – ' + fmtTime(o.et) : ''}`);
  if (ev.rrule) bits.push('↻ ' + describeRule(ev.rrule, ev.startDate));
  if (ev.location) bits.push('📍 ' + ev.location);
  if ((ev.tags || []).length) bits.push(ev.tags.map(t => '#' + t).join(' '));
  if (ev.pomos) bits.push('🍅 ' + ev.pomos);
  return `<div class="li${o.done ? ' done' : ''}${o.dispEnd < todayS() ? ' past' : ''}" data-occ="${o.key}" style="--c:${c}">` +
    `${ev.type === 'task' ? `<i class="ck${o.done ? ' on' : ''}" data-check="${o.key}"></i>` : ''}` +
    `<div class="lt"><b>${hl(ev.title)}</b><small>${esc(bits.join(' · '))}</small></div>` +
    `${ev.priority ? `<span class="pbadge pb${ev.priority}">Q${ev.priority}</span>` : ''}</div>`;
}
let HL = null;
const hl = s => { const e = esc(s); if (!HL) return e; return e.replace(HL, m => `<mark>${m}</mark>`); };

function renderList(V) {
  const from = addDaysS(S.cur, -S.listBack), to = addDaysS(S.cur, 90 + S.listFwd), today = todayS();
  const { items, marks } = getOccs(from, to);
  const by = new Map();
  for (const o of items) { const d = o.date < from ? from : o.date; if (!by.has(d)) by.set(d, []); by.get(d).push(o); }
  for (const [d] of marks) if (!by.has(d)) by.set(d, []);
  const days = [...by.keys()].sort();
  let h = `<div class="list"><div class="lmore"><button class="btn sm" data-act="past">↑ 이전 30일 더 보기</button></div>`;
  if (!days.length) h += `<div class="empty">이 기간에 일정이 없습니다.<br>+ 버튼이나 빠른 추가로 일정을 만들어 보세요.</div>`;
  for (const ds of days) {
    const d = parseYmd(ds), wd = d.getDay(), hol = holidayName(ds), mk = marks.get(ds) || [];
    const list = by.get(ds).sort((a, b) => sortKey(a) < sortKey(b) ? -1 : 1);
    h += `<div class="lday ${ds === today ? 'today' : ''} ${(wd === 0 || hol) ? 'sun' : wd === 6 ? 'sat' : ''}" data-ld="${ds}">` +
      `<div class="ldh"><b>${d.getDate()}</b><span>${d.getMonth() + 1}월 ${WD[wd]}</span></div><div class="lit">` +
      `${hol || mk.length ? `<div class="lmarks">${hol ? `<span class="hol">${esc(hol)}</span>` : ''}${mk.map(o => markChip(o, ds)).join('')}</div>` : ''}` +
      list.map(o => occLine(o)).join('') + '</div></div>';
  }
  h += `<div class="lmore"><button class="btn sm" data-act="fwd">↓ 더 보기</button></div></div>`;
  V.innerHTML = h;
  if (S.listScroll) {
    const t = V.querySelector(`[data-ld="${S.cur}"]`) || [...V.querySelectorAll('[data-ld]')].find(x => x.dataset.ld >= S.cur);
    if (t) V.firstChild.scrollTop = t.offsetTop - 8;
    S.listScroll = false;
  }
}

/* ── 아이젠하워 매트릭스 ── */
function matrixItems() {
  const today = todayS(), out = [];
  for (const ev of S.events) {
    if (ev.type === 'mark' || !visible(ev)) continue;
    let o = null;
    if (ev.rrule && !ev.rrule.afterDone) {
      const list = expandEvent(ev, addDaysS(today, -14), addDaysS(today, 120));
      o = ev.type === 'task' ? list.find(x => !x.done) : list.find(x => x.dispEnd >= today);
    } else {
      o = mkOcc(ev, ev.startDate, Math.max(0, diffDays(ev.startDate, ev.endDate)));
      if (o.done || (ev.type !== 'task' && o.dispEnd < today)) o = null;
    }
    if (!o) continue;
    S.occMap.set(o.key, o);
    out.push(o);
  }
  return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : sortKey(a) < sortKey(b) ? -1 : 1);
}
function miHTML(o) {
  const ev = o.ev, c = colorHex(ev.color), today = todayS(), rc = recommend(o);
  const when = relDay(o.date) + (o.allDay ? '' : ' ' + o.st);
  const rec = (ev.priority || 0) === rc.q
    ? `<span class="thumb" title="👍 추천과 일치 — ${esc(rc.why)}">👍</span>`
    : `<button class="rec q${rc.q}" data-rec="${o.key}" data-q="${rc.q}" title="${esc(rc.why)}">👍 Q${rc.q}</button>`;
  return `<div class="mi" data-occ="${o.key}" style="--c:${c}">${ev.type === 'task' ? `<i class="ck" data-check="${o.key}"></i>` : '<i class="dot"></i>'}` +
    `<span class="t">${rc.goal ? '<em class="gtag">🎯</em>' : ''}${esc(ev.title)}</span><span class="d${ev.type === 'task' && o.date < today ? ' over' : ''}">${ev.rrule ? '↻ ' : ''}${when}</span>${rec}</div>`;
}
function renderMatrix(V) {
  const items = matrixItems(), today = todayS();
  const off = items.filter(o => (o.ev.priority || o.ev.type === 'task') && (o.ev.priority || 0) !== recommend(o).q).length;
  const ag = activeGoals(), must = ag.filter(g => g.must);
  let h = '<div class="matrix">' + areaChipsHTML();
  h += ag.length
    ? `<div class="mx-rec"><span>🎯</span><div><b>목표 기반 👍 추천</b><small>필수 목표 ${must.length}개 · ${must.map(g => esc(g.title)).join(', ') || '없음'} — 중요도는 목표 연결, 긴급도는 마감일로 판단합니다.</small></div>${off ? `<button class="btn sm primary" data-recall>추천대로 ${off}개 정리</button>` : '<span class="ok">👍 모두 추천과 일치</span>'}</div>`
    : `<div class="mx-rec"><span>🎯</span><div><b>목표를 설정하면 👍 추천이 정확해집니다</b><small>꼭 이뤄야 할 목표에 연결된 할 일을 ‘중요’로 판단해 사분면을 추천합니다.</small></div><button class="btn sm primary" data-view="goals">목표 설정</button></div>`;
  h += '<div class="mx-grid">';
  for (const q of [1, 2, 3, 4]) {
    const list = items.filter(o => o.ev.priority === q);
    h += `<div class="quad q${q}" data-drop="quad" data-q="${q}"><div class="qh"><span class="qn">${q}</span><div><b>${PRIO[q].name}</b><small>${PRIO[q].desc} · ${list.length}개</small></div>` +
      `<button class="btn icon sm" data-qadd="${q}" aria-label="추가">+</button></div><div class="ql">` +
      (list.length ? list.map(miHTML).join('') : '<div class="qempty">항목을 길게 눌러 이곳으로 끌어오세요</div>') + '</div></div>';
  }
  const tray = items.filter(o => !o.ev.priority && o.ev.type === 'task' && o.date <= addDaysS(today, 14));
  h += `</div><div class="tray" data-drop="quad" data-q="0"><div class="qh"><div><b>미분류 할 일</b><small>2주 이내 · 길게 눌러 사분면으로 끌어 놓으세요</small></div></div><div class="ql">` +
    (tray.length ? tray.map(miHTML).join('') : '<div class="qempty">미분류 할 일이 없습니다</div>') + '</div></div></div>';
  V.innerHTML = h;
}

/* ── 사이드바 · 헤더 ── */
function renderSide() {
  const mc = parseYmd(S.miniCur || S.cur), y = mc.getFullYear(), m = mc.getMonth(), ws = S.settings.weekStart, today = todayS();
  const gs = startOfWeek(new Date(y, m, 1), ws), from = ymd(gs), to = addDaysS(from, 41);
  const has = new Set();
  for (const ev of S.events) if (visible(ev) && ev.type !== 'mark') for (const o of expandEvent(ev, from, to)) has.add(o.date);
  let mini = '';
  for (let i = 0; i < 7; i++) mini += `<span>${WD[(ws + i) % 7]}</span>`;
  for (let i = 0; i < 42; i++) {
    const ds = addDaysS(from, i), d = parseYmd(ds), wd = d.getDay();
    mini += `<button class="${d.getMonth() !== m ? 'out' : ''} ${ds === today ? 'today' : ''} ${ds === S.sel ? 'sel' : ''} ${(wd === 0 || holidayName(ds)) ? 'sun' : wd === 6 ? 'sat' : ''} ${has.has(ds) ? 'has' : ''}" data-mini="${ds}">${d.getDate()}</button>`;
  }
  const counts = {}, tagc = {};
  for (const ev of S.events) { counts[ev.color] = (counts[ev.color] || 0) + 1; for (const t of ev.tags || []) tagc[t] = (tagc[t] || 0) + 1; }
  const tags = Object.keys(tagc).sort();
  $('#side').innerHTML = `
    <div class="brand"><img src="icons/icon-192.png" alt=""><div><b>METAL</b> CALENDAR</div></div>
    ${PORT.on ? `<button class="syncline portline ${PORT.err || PORT.blocked ? 'err' : 'idle'}" data-act="settings">${esc(portLabel())}</button>` : ''}
    <button class="syncline ${SYNC.state}" data-act="settings" title="${esc(SYNC.err || '')}">${syncLabel()}</button>
    <div class="mini"><div class="mini-h"><button class="btn icon sm flat" data-minim="-1">${ico('left')}</button><span>${y}년 ${m + 1}월</span><button class="btn icon sm flat" data-minim="1">${ico('right')}</button></div><div class="mini-g">${mini}</div></div>
    <div class="sec"><h4>색상 분류</h4>${S.settings.colors.map(c => `<label class="crow"><input type="checkbox" data-vis="${c.id}" ${S.hidden.has(c.id) ? '' : 'checked'}><i style="--c:${c.hex}"></i><span>${esc(c.name)}</span><em>${counts[c.id] || ''}</em></label>`).join('')}</div>
    <div class="sec"><h4>목표 영역 (캘린더·목록·매트릭스 필터)</h4>${areaChipsHTML(false)}</div>
    <div class="sec"><h4>태그</h4>${tags.length ? `<div class="tags">${tags.map(t => `<button class="tag${S.tagFilter === t ? ' on' : ''}" data-tag="${esc(t)}">#${esc(t)}<em>${tagc[t]}</em></button>`).join('')}</div>` : '<div class="empty-s">일정에 #태그 를 붙이면 여기에서 걸러 볼 수 있어요.</div>'}</div>
    <div class="sec links"><button class="btn" data-act="search">${ico('search')} 일정 검색</button><button class="btn" data-act="settings">${ico('gear')} 설정 · 백업</button>${S.installEvt ? `<button class="btn primary" data-act="install">⬇ 앱으로 설치</button>` : ''}</div>`;
}
function headerTitle() {
  const d = parseYmd(S.cur);
  switch (S.view) {
    case 'month': return `${d.getFullYear()}년 ${d.getMonth() + 1}월`;
    case 'week': { const w = weekDates(), a = parseYmd(w[0]), b = parseYmd(w[6]); return a.getMonth() === b.getMonth() ? `${a.getMonth() + 1}월 ${a.getDate()}–${b.getDate()}일` : `${a.getMonth() + 1}.${a.getDate()} – ${b.getMonth() + 1}.${b.getDate()}`; }
    case 'day': return fmtDateK(S.cur);
    case 'year': return `${d.getFullYear()}년`;
    case 'list': return '일정 목록';
    case 'goals': return '목표 설계';
    case 'notes': return '기록장';
    case 'money': { const m = parseYmd(S.mcur); return `${m.getFullYear()}년 ${m.getMonth() + 1}월 가계부`; }
    case 'matrix': return '우선순위 매트릭스';
    case 'pomo': return '뽀모도로';
  }
}
