'use strict';
/* ───────── 공통 유틸 ───────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const addDaysS = (s, n) => ymd(addDays(parseYmd(s), n));
const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 864e5); // b - a
const todayS = () => ymd(new Date());
const startOfWeek = (d, ws) => addDays(d, -((d.getDay() - ws + 7) % 7));
const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
const WD = ['일', '월', '화', '수', '목', '금', '토'];
const NTH = ['', '첫째', '둘째', '셋째', '넷째', '다섯째'];
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const t2m = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const m2t = m => pad(Math.floor(m / 60)) + ':' + pad(m % 60);
const clone = o => JSON.parse(JSON.stringify(o));
const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const dtOf = (date, time) => { const d = parseYmd(date); if (time) { const [h, m] = time.split(':').map(Number); d.setHours(h, m, 0, 0); } return d; };
const splitDT = d => [ymd(d), pad(d.getHours()) + ':' + pad(d.getMinutes())];

function fmtTime(t) {
  if (!t) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h < 12 ? '오전' : '오후'} ${h % 12 || 12}${m ? ':' + pad(m) : '시'}`;
}
function fmtDateK(s, withYear) {
  const d = parseYmd(s);
  return `${withYear ? d.getFullYear() + '년 ' : ''}${d.getMonth() + 1}월 ${d.getDate()}일 (${WD[d.getDay()]})`;
}
function relDay(s) {
  const n = diffDays(todayS(), s);
  if (n === 0) return '오늘'; if (n === 1) return '내일'; if (n === -1) return '어제'; if (n === 2) return '모레';
  const d = parseYmd(s);
  const y = d.getFullYear() !== new Date().getFullYear() ? `${String(d.getFullYear()).slice(2)}.` : '';
  return `${y}${d.getMonth() + 1}.${d.getDate()}(${WD[d.getDay()]})`;
}
function idealText(hex) {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 160 ? '#15181c' : '#ffffff';
}
function nthOf(d) { return { n: Math.ceil(d.getDate() / 7), last: d.getDate() + 7 > daysInMonth(d.getFullYear(), d.getMonth()) }; }

/* ───────── 대한민국 공휴일 ─────────
   고정 공휴일은 매년 적용, 음력·대체·선거일은 2025~2028 수록 (설정에서 끌 수 있음) */
const HOLI_FIXED = { '01-01': '신정', '03-01': '삼일절', '05-05': '어린이날', '06-06': '현충일', '08-15': '광복절', '10-03': '개천절', '10-09': '한글날', '12-25': '성탄절' };
const HOLI_VAR = {
  '2025-01-27': '임시공휴일', '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴', '2025-03-03': '대체공휴일',
  '2025-05-05': '어린이날·부처님오신날', '2025-05-06': '대체공휴일', '2025-06-03': '대통령선거', '2025-10-05': '추석 연휴', '2025-10-06': '추석',
  '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일',
  '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴', '2026-03-02': '대체공휴일', '2026-05-24': '부처님오신날',
  '2026-05-25': '대체공휴일', '2026-06-03': '지방선거', '2026-08-17': '대체공휴일', '2026-09-24': '추석 연휴', '2026-09-25': '추석',
  '2026-09-26': '추석 연휴', '2026-10-05': '대체공휴일',
  '2027-02-05': '설날 연휴', '2027-02-06': '설날', '2027-02-07': '설날 연휴', '2027-02-08': '대체공휴일', '2027-05-13': '부처님오신날',
  '2027-08-16': '대체공휴일', '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴', '2027-10-04': '대체공휴일',
  '2027-10-11': '대체공휴일', '2027-12-27': '대체공휴일',
  '2028-01-25': '설날 연휴', '2028-01-26': '설날', '2028-01-27': '설날 연휴', '2028-04-12': '국회의원선거', '2028-05-02': '부처님오신날',
  '2028-10-02': '추석 연휴', '2028-10-03': '추석·개천절', '2028-10-04': '추석 연휴', '2028-10-05': '대체공휴일'
};
function holidayName(s) {
  if (!S.settings.holidays) return '';
  return HOLI_VAR[s] || HOLI_FIXED[s.slice(5)] || '';
}
function isHolidayRaw(s) { return !!(HOLI_VAR[s] || HOLI_FIXED[s.slice(5)]); }

/* ───────── 스마트 반복 엔진 ─────────
   rrule = { freq:'daily'|'weekly'|'monthly'|'yearly', interval, byDay:[0-6], monthMode:'date'|'nth'|'last', nth:1..5|-1,
             until:'YYYY-MM-DD', count, skip:'weekend'|'holiday'|'both', afterDone:bool } */
function isSkipped(s, skip) {
  if (!skip) return false;
  const wd = parseYmd(s).getDay();
  const we = wd === 0 || wd === 6;
  if (skip === 'weekend') return we;
  if (skip === 'holiday') return isHolidayRaw(s);
  return we || isHolidayRaw(s);
}
function monthlyDate(y, m, r, start) {
  const first = new Date(y, m, 1), Y = first.getFullYear(), M = first.getMonth(), dim = daysInMonth(Y, M);
  if (r.monthMode === 'last') return new Date(Y, M, dim);
  if (r.monthMode === 'nth') {
    const wd = start.getDay();
    if (r.nth === -1) { let d = dim; while (new Date(Y, M, d).getDay() !== wd) d--; return new Date(Y, M, d); }
    const off = (wd - first.getDay() + 7) % 7, day = 1 + off + (r.nth - 1) * 7;
    return day <= dim ? new Date(Y, M, day) : null;
  }
  const day = start.getDate();
  return day <= dim ? new Date(Y, M, day) : null;
}
// 반복 날짜를 순서대로 생성. cb(dateStr) 가 false 를 반환하면 중단
function iterRule(ev, cb) {
  const r = ev.rrule, start = parseYmd(ev.startDate), iv = Math.max(1, +r.interval || 1);
  let n = 0, guard = 0;
  const emit = d => {
    const s = ymd(d);
    if (s < ev.startDate) return true;
    if (r.until && s > r.until) return false;
    if (isSkipped(s, r.skip)) return true;
    n++;
    if (r.count && n > r.count) return false;
    return cb(s) !== false;
  };
  if (r.freq === 'daily') {
    for (let k = 0; guard++ < 40000; k++) if (!emit(addDays(start, k * iv))) return;
  } else if (r.freq === 'weekly') {
    const days = (r.byDay && r.byDay.length ? r.byDay : [start.getDay()]).slice().sort((a, b) => a - b);
    const ws = addDays(start, -start.getDay());
    for (let w = 0; guard++ < 6000; w++) {
      const base = addDays(ws, w * 7 * iv);
      for (const wd of days) if (!emit(addDays(base, wd))) return;
    }
  } else if (r.freq === 'monthly') {
    for (let k = 0; guard++ < 2400; k++) {
      const d = monthlyDate(start.getFullYear(), start.getMonth() + k * iv, r, start);
      if (d && !emit(d)) return;
    }
  } else if (r.freq === 'yearly') {
    for (let k = 0; guard++ < 400; k++) {
      const d = new Date(start.getFullYear() + k * iv, start.getMonth(), start.getDate());
      if (d.getMonth() !== start.getMonth()) continue;
      if (!emit(d)) return;
    }
  }
}
function mkOcc(ev, date, dur) {
  const end = addDaysS(date, dur);
  let dispEnd = end;
  if (!ev.allDay && ev.endTime === '00:00' && dur > 0) dispEnd = addDaysS(end, -1);
  const rec = !!(ev.rrule && !ev.rrule.afterDone);
  const done = ev.type === 'task' && (rec ? (ev.doneDates || []).includes(date) : !!ev.done);
  return { key: ev.id + '|' + date, ev, date, end, dispEnd, allDay: !!ev.allDay, st: ev.startTime, et: ev.endTime, done, rec };
}
function expandEvent(ev, from, to) {
  const dur = Math.max(0, diffDays(ev.startDate, ev.endDate || ev.startDate));
  const out = [];
  if (!ev.rrule || ev.rrule.afterDone) {
    if (ev.startDate <= to && addDaysS(ev.startDate, dur) >= from) out.push(mkOcc(ev, ev.startDate, dur));
    return out;
  }
  const ex = new Set(ev.exdates || []), lo = addDaysS(from, -dur);
  iterRule(ev, d => {
    if (d > to) return false;
    if (d >= lo && !ex.has(d)) out.push(mkOcc(ev, d, dur));
  });
  return out;
}
function countBefore(ev, date) {
  let n = 0;
  iterRule(ev, d => { if (d >= date) return false; n++; });
  return n;
}
function addInterval(s, freq, iv) {
  const d = parseYmd(s);
  iv = Math.max(1, +iv || 1);
  if (freq === 'daily') return ymd(addDays(d, iv));
  if (freq === 'weekly') return ymd(addDays(d, 7 * iv));
  const y = d.getFullYear() + (freq === 'yearly' ? iv : 0), m = d.getMonth() + (freq === 'monthly' ? iv : 0);
  const first = new Date(y, m, 1);
  return ymd(new Date(first.getFullYear(), first.getMonth(), Math.min(d.getDate(), daysInMonth(first.getFullYear(), first.getMonth()))));
}
function describeRule(r, start) {
  if (!r) return '';
  const d = parseYmd(start), iv = Math.max(1, +r.interval || 1);
  let t = '';
  if (r.afterDone) {
    t = `완료 ${iv}${{ daily: '일', weekly: '주', monthly: '개월', yearly: '년' }[r.freq]} 후 다시`;
  } else if (r.freq === 'daily') t = iv === 1 ? '매일' : `${iv}일마다`;
  else if (r.freq === 'weekly') {
    const days = r.byDay && r.byDay.length ? r.byDay : [d.getDay()];
    const wk = days.length === 5 && [1, 2, 3, 4, 5].every(x => days.includes(x));
    t = (iv === 1 ? '매주' : iv === 2 ? '격주' : `${iv}주마다`) + ' ' +
      (wk ? '평일' : days.slice().sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map(x => WD[x]).join('·') + '요일');
  } else if (r.freq === 'monthly') {
    const p = iv === 1 ? '매월' : `${iv}개월마다`;
    if (r.monthMode === 'nth') t = `${p} ${r.nth === -1 ? '마지막' : NTH[r.nth]} ${WD[d.getDay()]}요일`;
    else if (r.monthMode === 'last') t = `${p} 마지막 날`;
    else t = `${p} ${d.getDate()}일`;
  } else if (r.freq === 'yearly') t = (iv === 1 ? '매년' : `${iv}년마다`) + ` ${d.getMonth() + 1}월 ${d.getDate()}일`;
  if (r.skip) t += { weekend: ' · 주말 제외', holiday: ' · 공휴일 제외', both: ' · 주말·공휴일 제외' }[r.skip];
  if (r.until) t += ` · ${relDay(r.until)}까지`;
  if (r.count) t += ` · ${r.count}회`;
  return t;
}
