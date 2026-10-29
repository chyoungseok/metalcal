'use strict';
/* 자연어 빠른 추가 파서
   예) "내일 오후 3시 팀 회의 #업무 !1", "매주 월수금 7시 헬스", "다음주 금요일 10:30~12시 미팅", "매월 25일 카드값" */
const QW = '일월화수목금토';
const TIME_RE = '(오전|오후|아침|낮|저녁|밤|새벽)?\\s*(\\d{1,2})(?::(\\d{2})|시(?!간)(?:\\s*(\\d{1,2})분|\\s*(반))?)';
const TIME_RANGE = new RegExp(TIME_RE + '(?:\\s*(?:~|-|–|부터)\\s*' + TIME_RE + '(?:\\s*까지)?)?(?:에|부터)?');

function qmin(ap, h, mm, mm2, half, colon) {
  h = +h;
  let m = mm ? +mm : mm2 ? +mm2 : half ? 30 : 0;
  if (/오후|저녁|밤|낮/.test(ap || '') && h < 12) h += 12;
  if (/오전|새벽|아침/.test(ap || '') && h === 12) h = 0;
  if (!ap && !colon && h >= 1 && h <= 6) h += 12; // "3시 회의" → 오후 3시
  if (h > 23 || m > 59) return null;
  return h * 60 + m;
}

function parseQuick(input, base) {
  const today = todayS();
  let s = ' ' + input.trim() + ' ';
  const r = { title: '', date: null, time: null, endTime: null, rrule: null, tags: [], priority: 0, type: null, monthDay: null };
  const take = (re, fn) => {
    const m = s.match(re);
    if (!m) return false;
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
    fn(m);
    return true;
  };
  while (take(/\s#([^\s#!]+)/, m => r.tags.push(m[1])));
  take(/\s!([1-4])(?=\s)/, m => r.priority = +m[1]);
  take(/^\s*(?:할\s?일|todo|투두)\s*[:：]?\s/i, () => r.type = 'task');

  // 반복
  const days = str => [...new Set([...str].filter(c => QW.includes(c)).map(c => QW.indexOf(c)))];
  take(/매일(?:마다)?/, () => r.rrule = { freq: 'daily', interval: 1 }) ||
    take(/(?:매\s?)?평일(?:마다)?/, () => r.rrule = { freq: 'weekly', interval: 1, byDay: [1, 2, 3, 4, 5] }) ||
    take(/주말마다|매\s?주말/, () => r.rrule = { freq: 'weekly', interval: 1, byDay: [0, 6] }) ||
    take(/(매주|격주|(\d+)주마다)\s*([일월화수목금토](?:요일)?(?:[,·/]?\s?[일월화수목금토](?:요일)?)*)(?:마다|에)?(?=\s)/,
      m => r.rrule = { freq: 'weekly', interval: m[1] === '격주' ? 2 : m[2] ? +m[2] : 1, byDay: days(m[3].replace(/요일/g, '')) }) ||
    take(/(매주|격주|(\d+)주마다)/, m => r.rrule = { freq: 'weekly', interval: m[1] === '격주' ? 2 : m[2] ? +m[2] : 1, byDay: [] }) ||
    take(/(?:매월|매달)\s*마지막\s*날/, () => r.rrule = { freq: 'monthly', interval: 1, monthMode: 'last' }) ||
    take(/(?:매월|매달)\s*(첫째|둘째|셋째|넷째|마지막)\s*주?\s*([일월화수목금토])요일/, m => {
      r.rrule = { freq: 'monthly', interval: 1, monthMode: 'nth', nth: m[1] === '마지막' ? -1 : NTH.indexOf(m[1]) };
      r.nthWd = QW.indexOf(m[2]);
    }) ||
    take(/(?:매월|매달)\s*(\d{1,2})일/, m => { r.rrule = { freq: 'monthly', interval: 1, monthMode: 'date' }; r.monthDay = +m[1]; }) ||
    take(/매월|매달/, () => r.rrule = { freq: 'monthly', interval: 1, monthMode: 'date' }) ||
    take(/매년|매해/, () => r.rrule = { freq: 'yearly', interval: 1 });

  // 날짜
  const setD = d => { if (!r.date) r.date = d; };
  const T = parseYmd(today);
  take(/(\d+)\s?일\s?(?:후|뒤)(?:에)?/, m => setD(addDaysS(today, +m[1]))) ||
    take(/(\d+)\s?주\s?(?:후|뒤)(?:에)?/, m => setD(addDaysS(today, 7 * m[1]))) ||
    take(/(오늘|금일)(?:은|에)?(?=\s)/, () => setD(today)) ||
    take(/(내일)(?:은|에)?(?=\s)/, () => setD(addDaysS(today, 1))) ||
    take(/(모레)(?:는|에)?(?=\s)/, () => setD(addDaysS(today, 2))) ||
    take(/(글피)(?:는|에)?(?=\s)/, () => setD(addDaysS(today, 3))) ||
    take(/(이번\s?주|다음\s?주|담주|다다음\s?주)?\s*([일월화수목금토])요일(?:에|은|날)?(?=\s)/, m => {
      const wd = QW.indexOf(m[2]);
      if (!m[1]) return setD(addDaysS(today, (wd - T.getDay() + 7) % 7));
      const wk = /다다음/.test(m[1]) ? 2 : /다음|담/.test(m[1]) ? 1 : 0;
      setD(ymd(addDays(startOfWeek(T, 1), wk * 7 + (wd + 6) % 7)));
    }) ||
    take(/(?:(\d{4})\s*[.\-/년]\s*)?(\d{1,2})\s*(?:월|[.\-/])\s*(\d{1,2})\s*일?(?:에|은)?(?=\s)/, m => {
      const d = new Date(m[1] ? +m[1] : T.getFullYear(), +m[2] - 1, +m[3]);
      if (d.getMonth() === +m[2] - 1) setD(ymd(d));
    }) ||
    take(/(\d{1,2})일(?:에|은)?(?=\s)/, m => {
      let d = new Date(T.getFullYear(), T.getMonth(), +m[1]);
      if (ymd(d) < today) d = new Date(T.getFullYear(), T.getMonth() + 1, +m[1]);
      setD(ymd(d));
    });

  // 시간
  take(TIME_RANGE, m => {
    const a = qmin(m[1], m[2], m[3], m[4], m[5], !!m[3]);
    if (a == null) return;
    r.time = m2t(a);
    if (m[7]) {
      let b = qmin(m[6] || null, m[7], m[8], m[9], m[10], true);
      if (b != null && !m[6] && !m[8] && +m[7] <= 12) { // "3시~5시" → 같은 오전/오후로 맞춤
        const h = +m[7]; b = (a >= 720 && h < 12 ? h + 12 : h) * 60 + (m[9] ? +m[9] : m[10] ? 30 : 0);
      }
      if (b != null && b > a) r.endTime = m2t(b);
    }
  });

  // 반복 + 날짜 보정
  if (r.rrule) {
    const b = r.date || base || today;
    if (r.rrule.freq === 'weekly' && r.rrule.byDay.length && !r.date) {
      for (let i = 0; i < 7; i++) { const d = addDaysS(b, i); if (r.rrule.byDay.includes(parseYmd(d).getDay())) { r.date = d; break; } }
    }
    if (r.monthDay && !r.date) {
      const B = parseYmd(b);
      let d = new Date(B.getFullYear(), B.getMonth(), r.monthDay);
      if (ymd(d) < b) d = new Date(B.getFullYear(), B.getMonth() + 1, r.monthDay);
      r.date = ymd(d);
    }
    if (r.rrule.monthMode === 'nth' && r.nthWd != null && !r.date) {
      const B = parseYmd(b);
      for (let k = 0; k < 3 && !r.date; k++) {
        const s0 = new Date(B.getFullYear(), B.getMonth() + k, 1);
        while (s0.getDay() !== r.nthWd) s0.setDate(s0.getDate() + 1);
        const fake = { startDate: ymd(s0), rrule: r.rrule };
        iterRule(fake, d => { if (d >= b) { r.date = d; return false; } if (d > addDaysS(b, 400)) return false; });
      }
    }
  }
  r.title = s.replace(/\s+/g, ' ').trim().replace(/^(에|은|는|부터)\s+/, '').replace(/\s+(에|까지)$/, '');
  return r;
}

function quickToEvent(p, opts = {}) {
  const date = p.date || opts.date || S.sel || todayS();
  const type = opts.type || p.type || 'event';
  const ev = newEvent({
    title: p.title || '(제목 없음)', type, startDate: date, endDate: date,
    tags: p.tags, goalId: opts.goalId || null, priority: type === 'mark' ? 0 : (p.priority || opts.priority || 0),
    rrule: p.rrule ? clone(p.rrule) : null,
    color: colorFromTags(p.tags) || opts.color || (type === 'mark' ? markColor() : S.settings.colors[0].id)
  });
  if (p.time && type !== 'mark') {
    ev.allDay = false;
    ev.startTime = p.time;
    const end = p.endTime ? dtOf(date, p.endTime) : new Date(dtOf(date, p.time).getTime() + 3600e3);
    [ev.endDate, ev.endTime] = splitDT(end);
  }
  if (ev.rrule && ev.rrule.freq === 'weekly' && !(ev.rrule.byDay || []).length) ev.rrule.byDay = [parseYmd(date).getDay()];
  return ev;
}

function quickPreview(p, opts = {}) {
  if (!p.title && !p.date && !p.time && !p.rrule) return '';
  const date = p.date || opts.date || S.sel || todayS();
  const bits = [`📅 ${fmtDateK(date)}`];
  bits.push(p.time ? `🕒 ${fmtTime(p.time)}${p.endTime ? ' – ' + fmtTime(p.endTime) : ''}` : '종일');
  if (p.rrule) bits.push('↻ ' + describeRule(Object.assign({ byDay: [] }, p.rrule, (p.rrule.byDay || []).length ? {} : { byDay: [parseYmd(date).getDay()] }), date));
  if (p.tags.length) bits.push(p.tags.map(t => '#' + t).join(' '));
  if (p.priority) bits.push(PRIO[p.priority].short);
  return `<b>${esc(p.title || '(제목 없음)')}</b> · ${bits.map(esc).join(' · ')}`;
}
