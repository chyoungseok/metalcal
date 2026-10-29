'use strict';
/* ═════════ 가계부 (수기 입력 · 편한 가계부 스타일) ═════════
   txn = { id, type:'expense'|'income'|'transfer', date, time, amount, acc, to, cat, sub, memo, repeat:{freq}|null, tpl, updated }
   account = { id, name, group:'cash'|'bank'|'card'|'saving'|'loan'|'etc', init, payDay, order, updated } */
const ACC_GROUPS = [['cash', '현금'], ['bank', '은행'], ['card', '카드'], ['saving', '저축·투자'], ['loan', '대출'], ['etc', '기타']];
const DEF_LEDGER = () => ({
  monthStart: 1,
  exp: [
    ['식비', '🍚', ['식재료', '외식', '배달', '커피·간식']], ['주거·통신', '🏠', ['월세·관리비', '공과금', '통신비', '인터넷·구독']],
    ['교통·차량', '🚌', ['대중교통', '택시', '주유', '주차·통행', '정비']], ['생활용품', '🧴', ['마트', '생필품', '가구·가전']],
    ['쇼핑·미용', '👕', ['의류', '신발·잡화', '미용']], ['문화·여가', '🎬', ['영화·공연', '여행', '취미', '구독']],
    ['건강·의료', '💊', ['병원', '약국', '운동']], ['교육·자기계발', '📚', ['도서', '강의', '자격증']],
    ['경조사·선물', '🎁', ['경조사비', '선물', '회비']], ['가족', '👨‍👩‍👧', ['부모님', '자녀', '반려동물']],
    ['금융', '🏦', ['보험', '이자', '수수료', '세금']], ['기타', '📦', []]
  ].map(([name, icon, subs], i) => ({ id: 'e' + i, name, icon, subs })),
  inc: [
    ['월급', '💵', ['기본급', '수당']], ['상여', '🎉', []], ['부수입', '🚀', ['부업', '프리랜스', '중고판매']],
    ['금융소득', '📈', ['이자', '배당', '투자수익']], ['용돈', '🧧', []], ['기타', '📦', []]
  ].map(([name, icon, subs], i) => ({ id: 'i' + i, name, icon, subs })),
  budgets: {}
});
// 범주 색: 목록 순서대로 고정 (순위가 바뀌어도 색은 그대로). 9번째부터는 회색 ‘기타 계열’
const CAT_HUES = { light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7', '#e34948'], dark: ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#008300', '#9085e9', '#e66767'] };
const isDark = () => document.documentElement.dataset.theme !== 'silver';
function catColor(type, id) {
  const list = type === 'income' ? L().inc : L().exp, i = list.findIndex(c => c.id === id);
  return i >= 0 && i < 8 ? CAT_HUES[isDark() ? 'dark' : 'light'][i] : (isDark() ? '#6c7480' : '#9aa3ad');
}
const L = () => S.settings.ledger;
const won = n => (n < 0 ? '-' : '') + Math.abs(Math.round(n)).toLocaleString('ko-KR');
const wonS = n => won(n) + '원';
const catOf = (type, id) => (type === 'income' ? L().inc : L().exp).find(c => c.id === id) || { name: '미분류', icon: '❔', subs: [] };
const accOf = id => S.accounts.find(a => a.id === id);

/* ── 저장 ── */
async function saveTx(...list) {
  for (const t of list) {
    t.updated = Date.now();
    const i = S.txns.findIndex(x => x.id === t.id);
    if (i < 0) S.txns.push(t); else S.txns[i] = t;
  }
  await DB.set('txns', S.txns); markDirty();
}
async function removeTx(t) {
  S.txns = S.txns.filter(x => x.id !== t.id); S.tomb[t.id] = Date.now();
  await DB.set('txns', S.txns); await DB.set('tomb', S.tomb); markDirty();
}
async function saveAcc(a) {
  a.updated = Date.now();
  const i = S.accounts.findIndex(x => x.id === a.id);
  if (i < 0) S.accounts.push(a); else S.accounts[i] = a;
  await DB.set('accounts', S.accounts); markDirty();
}
function defaultAccounts() {
  return [['acc-cash', '현금', 'cash'], ['acc-bank', '주거래 통장', 'bank'], ['acc-card', '신용카드', 'card']]
    .map(([id, name, group], i) => ({ id, name, group, init: 0, payDay: group === 'card' ? 14 : null, order: i, updated: 1 }));
}
function sampleTxns() {
  const t = todayS(), d = n => addDaysS(t, -n);
  return [
    ['income', d(10), 2800000, 'acc-bank', 'i0', '기본급', '10월 급여'], ['expense', d(9), 650000, 'acc-bank', 'e1', '월세·관리비', '월세'],
    ['expense', d(6), 12500, 'acc-card', 'e0', '외식', '점심 김치찌개'], ['expense', d(5), 4800, 'acc-card', 'e0', '커피·간식', '카페'],
    ['expense', d(4), 55000, 'acc-card', 'e2', '주유', ''], ['expense', d(3), 89000, 'acc-card', 'e4', '의류', '가을 셔츠'],
    ['income', d(2), 150000, 'acc-bank', 'i2', '부업', '디자인 외주'], ['expense', d(1), 23000, 'acc-cash', 'e0', '배달', '치킨'],
    ['expense', t, 32000, 'acc-card', 'e3', '마트', '장보기']
  ].map(([type, date, amount, acc, cat, sub, memo], i) => ({ id: 'sample-tx-' + i, type, date, time: '', amount, acc, to: null, cat, sub, memo, repeat: null, sample: true, updated: 1 }));
}

/* ── 기간 · 집계 ── */
function periodOf(label) { // label 'YYYY-MM-01' → [시작, 끝]
  const d = parseYmd(label), ms = L().monthStart || 1;
  const s = new Date(d.getFullYear(), d.getMonth(), Math.min(ms, daysInMonth(d.getFullYear(), d.getMonth())));
  const e = addDays(new Date(d.getFullYear(), d.getMonth() + 1, Math.min(ms, daysInMonth(d.getFullYear(), d.getMonth() + 1))), -1);
  return [ymd(s), ymd(e)];
}
function labelOfDate(ds) {
  const d = parseYmd(ds), ms = L().monthStart || 1;
  const m = d.getDate() >= ms ? d.getMonth() : d.getMonth() - 1;
  return ymd(new Date(d.getFullYear(), m, 1));
}
const txIn = (a, b) => S.txns.filter(t => t.date >= a && t.date <= b);
function sums(list) {
  let inc = 0, exp = 0;
  for (const t of list) { if (t.type === 'income') inc += t.amount; else if (t.type === 'expense') exp += t.amount; }
  return { inc, exp, net: inc - exp };
}
function accBalance(a, upto = todayS()) {
  let b = +a.init || 0;
  for (const t of S.txns) {
    if (t.date > upto) continue;
    if (t.type === 'income' && t.acc === a.id) b += t.amount;
    else if (t.type === 'expense' && t.acc === a.id) b -= t.amount;
    else if (t.type === 'transfer') { if (t.acc === a.id) b -= t.amount; if (t.to === a.id) b += t.amount; }
  }
  return b;
}
const netWorth = () => S.accounts.reduce((s, a) => s + accBalance(a), 0);
// 목표 핵심 결과 자동 연동 값
function ledgerMetric(link, g) {
  const [p0, p1] = periodOf(labelOfDate(todayS()));
  if (link === 'net') return netWorth();
  if (link === 'm-exp') return sums(txIn(p0, p1)).exp;
  if (link === 'm-inc') return sums(txIn(p0, p1)).inc;
  if (link === 'm-save') return sums(txIn(p0, p1)).net;
  if (link.startsWith('acc:')) { const a = accOf(link.slice(4)); return a ? accBalance(a) : 0; }
  if (link.startsWith('cat:')) { const since = g && g.created ? ymd(new Date(g.created)) : '0000'; return S.txns.filter(t => t.cat === link.slice(4) && t.date >= since).reduce((s, t) => s + t.amount, 0); }
  return 0;
}
const LINK_OPTS = () => [['', '직접 입력'], ['net', '💰 순자산'], ['m-save', '💰 이번 달 저축액(수입−지출)'], ['m-inc', '💰 이번 달 수입'], ['m-exp', '💰 이번 달 지출'],
  ...S.accounts.map(a => ['acc:' + a.id, `🏦 ${a.name} 잔액`]), ...L().inc.map(c => ['cat:' + c.id, `${c.icon} ${c.name} 누적(목표 시작 후)`]), ...L().exp.map(c => ['cat:' + c.id, `${c.icon} ${c.name} 지출 누적`])];

/* 반복 거래 자동 생성 (예: 매월 월세) — 고정 ID 로 기기 간 중복 방지 */
function nextRepeat(date, freq, k) {
  const d = parseYmd(date);
  if (freq === 'weekly') return ymd(addDays(d, 7 * k));
  const y = d.getFullYear() + (freq === 'yearly' ? k : 0), m = d.getMonth() + (freq === 'monthly' ? k : 0);
  const f = new Date(y, m, 1);
  return ymd(new Date(f.getFullYear(), f.getMonth(), Math.min(d.getDate(), daysInMonth(f.getFullYear(), f.getMonth()))));
}
async function genRecurring() {
  const today = todayS(), add = [];
  const have = new Set(S.txns.map(t => t.id));
  for (const t of S.txns) {
    if (!t.repeat || t.tpl) continue;
    for (let k = 1; k < 400; k++) {
      const d = nextRepeat(t.date, t.repeat.freq, k);
      if (d > today) break;
      const id = `${t.id}@${d}`;
      if (have.has(id) || S.tomb[id]) continue;
      add.push(Object.assign(clone(t), { id, date: d, repeat: null, tpl: t.id, updated: Date.now() }));
    }
  }
  if (add.length) { S.txns.push(...add); await DB.set('txns', S.txns); markDirty(); }
  return add.length;
}

/* ── 화면 ── */
const MTABS = [['daily', '일일'], ['cal', '달력'], ['monthly', '월별'], ['stats', '통계'], ['budget', '예산'], ['assets', '자산']];
function txRow(t) {
  const c = t.type === 'transfer' ? { icon: '🔁', name: '이체' } : catOf(t.type, t.cat);
  const a = accOf(t.acc), to = accOf(t.to);
  return `<div class="tx" data-tx="${t.id}"><span class="txi" style="--cc:${t.type === 'transfer' ? 'var(--tx3)' : catColor(t.type, t.cat)}">${c.icon}</span>
    <div class="txm"><b>${esc(t.memo || (t.sub ? t.sub : c.name))}</b><small>${esc(c.name)}${t.sub ? ' · ' + esc(t.sub) : ''} · ${esc(a ? a.name : '?')}${t.type === 'transfer' ? ' → ' + esc(to ? to.name : '?') : ''}${t.repeat ? ' · ↻' : ''}${t.tpl ? ' · ↻자동' : ''}</small></div>
    <span class="amt ${t.type}">${t.type === 'expense' ? '-' : t.type === 'income' ? '+' : ''}${won(t.amount)}</span></div>`;
}
function dayGroups(list) {
  const by = new Map();
  for (const t of list.slice().sort((a, b) => b.date < a.date ? -1 : b.date > a.date ? 1 : (b.time || '') < (a.time || '') ? -1 : 1)) {
    if (!by.has(t.date)) by.set(t.date, []);
    by.get(t.date).push(t);
  }
  return [...by].map(([ds, ts]) => {
    const d = parseYmd(ds), s = sums(ts), wd = d.getDay();
    return `<div class="tday"><div class="tdh"><b>${d.getDate()}</b><span class="${wd === 0 || holidayName(ds) ? 'sun' : wd === 6 ? 'sat' : ''}">${WD[wd]}요일</span><small>${d.getFullYear()}.${pad(d.getMonth() + 1)}</small>
      <em class="inc">${s.inc ? '+' + won(s.inc) : ''}</em><em class="exp">${s.exp ? '-' + won(s.exp) : ''}</em></div>${ts.map(txRow).join('')}</div>`;
  }).join('');
}
function renderMoney(V) {
  const lab = S.mcur, [p0, p1] = periodOf(lab), list = txIn(p0, p1), s = sums(list), tab = S.mtab;
  let body = '';
  if (tab === 'daily') {
    const q = (S.mq || '').trim().toLowerCase();
    const src = q ? S.txns.filter(t => [t.memo, t.sub, catOf(t.type, t.cat).name, (accOf(t.acc) || {}).name, String(t.amount)].join(' ').toLowerCase().includes(q)) : list;
    body = `<div class="msearch"><input class="in" id="mQ" placeholder="🔍 내용·분류·자산·금액 검색 (전체 기간)" value="${esc(S.mq || '')}" autocomplete="off"></div>
      ${q ? `<div class="mnote">검색 결과 ${src.length}건 · 수입 ${won(sums(src).inc)} · 지출 ${won(sums(src).exp)}</div>` : ''}
      ${src.length ? dayGroups(src) : `<div class="empty">${q ? '검색 결과가 없습니다.' : '이 달의 내역이 없습니다.<br>+ 버튼으로 수입·지출을 기록하세요.'}</div>`}`;
  } else if (tab === 'cal') {
    const gs = startOfWeek(parseYmd(p0), S.settings.weekStart), n = Math.ceil((diffDays(ymd(gs), p1) + 1) / 7) * 7, today = todayS();
    let g = '<div class="mcal">';
    for (let i = 0; i < 7; i++) { const wd = (S.settings.weekStart + i) % 7; g += `<span class="${wd === 0 ? 'sun' : wd === 6 ? 'sat' : ''}">${WD[wd]}</span>`; }
    for (let i = 0; i < n; i++) {
      const ds = addDaysS(ymd(gs), i), ss = sums(S.txns.filter(t => t.date === ds)), d = parseYmd(ds), wd = d.getDay();
      g += `<button class="mcd ${ds < p0 || ds > p1 ? 'out' : ''} ${ds === today ? 'today' : ''} ${ds === S.msel ? 'sel' : ''}" data-msel="${ds}">
        <span class="${wd === 0 || holidayName(ds) ? 'sun' : wd === 6 ? 'sat' : ''}">${d.getDate()}</span>${ss.inc ? `<em class="inc">${won(ss.inc)}</em>` : ''}${ss.exp ? `<em class="exp">${won(ss.exp)}</em>` : ''}</button>`;
    }
    const sel = S.msel && S.txns.filter(t => t.date === S.msel);
    body = g + '</div>' + (sel ? (sel.length ? dayGroups(sel) : `<div class="mnote">${fmtDateK(S.msel)} — 내역 없음 <button class="btn sm" data-txnew="${S.msel}">+ 이 날 기록</button></div>`) : '<div class="mnote">날짜를 누르면 그날 내역이 보입니다.</div>');
  } else if (tab === 'monthly') {
    const y = parseYmd(lab).getFullYear();
    const rows = Array.from({ length: 12 }, (_, m) => { const lb = ymd(new Date(y, m, 1)), [a, b] = periodOf(lb); return [lb, m, sums(txIn(a, b))]; });
    const mx = Math.max(1, ...rows.map(r => Math.max(r[2].inc, r[2].exp)));
    const ys = rows.reduce((acc, r) => ({ inc: acc.inc + r[2].inc, exp: acc.exp + r[2].exp }), { inc: 0, exp: 0 });
    body = `<div class="mnote">${y}년 합계 · 수입 <b class="inc">${won(ys.inc)}</b> · 지출 <b class="exp">${won(ys.exp)}</b> · 합계 <b>${won(ys.inc - ys.exp)}</b></div>
      <div class="mlegend"><span><i class="inc"></i>수입</span><span><i class="exp"></i>지출</span></div>
      <div class="mmon">${rows.map(([lb, m, r]) => `<button class="mrow ${lb === lab ? 'on' : ''}" data-mjump="${lb}"><b>${m + 1}월</b>
        <div class="mbars2"><i class="inc" style="width:${r.inc / mx * 100}%" title="수입 ${wonS(r.inc)}"></i><i class="exp" style="width:${r.exp / mx * 100}%" title="지출 ${wonS(r.exp)}"></i></div>
        <span><em class="inc">${r.inc ? won(r.inc) : '-'}</em><em class="exp">${r.exp ? won(r.exp) : '-'}</em><em>${r.inc || r.exp ? won(r.net) : ''}</em></span></button>`).join('')}</div>`;
  } else if (tab === 'stats') {
    const ty = S.mstat || 'expense', pick = list.filter(t => t.type === ty), tot = pick.reduce((a, t) => a + t.amount, 0);
    const prev = periodOf(ymd(new Date(parseYmd(lab).getFullYear(), parseYmd(lab).getMonth() - 1, 1))), prevList = txIn(prev[0], prev[1]).filter(t => t.type === ty);
    const by = {};
    for (const t of pick) by[t.cat] = (by[t.cat] || 0) + t.amount;
    const cats = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const prevBy = {}; for (const t of prevList) prevBy[t.cat] = (prevBy[t.cat] || 0) + t.amount;
    const open = S.mcat;
    body = `<div class="seg full"><button data-mstat="expense" class="${ty === 'expense' ? 'on' : ''}">지출 ${won(s.exp)}</button><button data-mstat="income" class="${ty === 'income' ? 'on' : ''}">수입 ${won(s.inc)}</button></div>`;
    if (!tot) body += '<div class="empty">이 달의 내역이 없습니다.</div>';
    else {
      body += `<div class="stackbar" role="img" aria-label="분류별 비율">${cats.map(([id, v]) => `<i style="flex:${v};background:${catColor(ty, id)}" title="${esc(catOf(ty, id).name)} ${wonS(v)} (${(v / tot * 100).toFixed(1)}%)"></i>`).join('')}</div>
        <div class="clist">${cats.map(([id, v]) => {
          const c = catOf(ty, id), pv = prevBy[id] || 0, diff = pv ? Math.round((v - pv) / pv * 100) : null;
          let sub = '';
          if (open === id) {
            const sb = {}; for (const t of pick.filter(t => t.cat === id)) sb[t.sub || '(소분류 없음)'] = (sb[t.sub || '(소분류 없음)'] || 0) + t.amount;
            sub = `<div class="csub">${Object.entries(sb).sort((a, b) => b[1] - a[1]).map(([n, x]) => `<div><span>${esc(n)}</span><b>${won(x)}</b></div>`).join('')}</div>` + dayGroups(pick.filter(t => t.cat === id));
          }
          return `<div class="crow2 ${open === id ? 'open' : ''}"><button data-mcat="${id}"><i style="background:${catColor(ty, id)}"></i><span class="cn">${c.icon} ${esc(c.name)}</span><span class="cp">${(v / tot * 100).toFixed(1)}%</span>
            <b>${won(v)}</b>${diff == null ? '<small></small>' : `<small class="${(diff > 0) === (ty === 'expense') ? 'up' : 'down'}">지난달 ${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}%</small>`}</button>${sub}</div>`;
        }).join('')}</div>`;
    }
  } else if (tab === 'budget') {
    const B = L().budgets || {}, total = Object.values(B).reduce((a, x) => a + (+x || 0), 0);
    const spent = {}; for (const t of list) if (t.type === 'expense') spent[t.cat] = (spent[t.cat] || 0) + t.amount;
    const today = todayS(), left = today >= p0 && today <= p1 ? diffDays(today, p1) + 1 : null;
    const meter = (name, b, u, key) => {
      const pct = b ? u / b : 0, over = b && u > b;
      return `<button class="bud ${over ? 'over' : ''}" data-bud="${key}"><div class="bh"><span>${name}</span><b>${b ? `${won(u)} / ${won(b)}` : `${won(u)} · 예산 없음`}</b></div>
        ${b ? `<div class="meter"><i style="width:${Math.min(100, pct * 100)}%"></i></div><small>${over ? `⚠ ${won(u - b)}원 초과` : `남은 예산 ${won(b - u)}원${left ? ` · 하루 ${won((b - u) / left)}원` : ''}`}</small>` : '<small>눌러서 예산 설정</small>'}</button>`;
    };
    body = `<div class="mnote">분류별 월 예산을 정하면 사용률과 하루 권장 지출을 알려 줍니다. 항목을 눌러 설정하세요.</div>
      ${meter('<b>전체 예산</b>', total, s.exp, '__all')}<div class="buds">${L().exp.map(c => meter(`${c.icon} ${esc(c.name)}`, +B[c.id] || 0, spent[c.id] || 0, c.id)).join('')}</div>`;
  } else if (tab === 'assets') {
    const bal = S.accounts.map(a => [a, accBalance(a)]);
    const asset = bal.filter(([, b]) => b > 0).reduce((x, [, b]) => x + b, 0), debt = bal.filter(([, b]) => b < 0).reduce((x, [, b]) => x + b, 0);
    body = `<div class="msum3"><div><span>자산</span><b class="inc">${won(asset)}</b></div><div><span>부채</span><b class="exp">${won(-debt)}</b></div><div><span>순자산</span><b>${won(asset + debt)}</b></div></div>
      ${ACC_GROUPS.map(([g, gn]) => { const ac = bal.filter(([a]) => a.group === g); if (!ac.length) return ''; return `<div class="agrp"><h4>${gn}<span>${won(ac.reduce((x, [, b]) => x + b, 0))}</span></h4>
        ${ac.map(([a, b]) => { const use = a.group === 'card' ? sums(txIn(p0, p1).filter(t => t.acc === a.id)).exp : 0; return `<button class="acc" data-acc="${a.id}"><span>${esc(a.name)}${a.group === 'card' && a.payDay ? `<small>매월 ${a.payDay}일 결제 · 이번 달 사용 ${won(use)}</small>` : ''}</span><b class="${b < 0 ? 'exp' : ''}">${won(b)}</b></button>`; }).join('')}</div>`; }).join('')}
      <div class="btns"><button class="btn sm primary" data-accnew>+ 자산 추가</button><button class="btn sm" data-txnew="transfer">🔁 이체 (카드 대금 납부 등)</button><button class="btn sm" data-act="csv">CSV 내보내기 (엑셀)</button></div>`;
  }
  V.innerHTML = `<div class="money"><div class="msum"><div><span>수입</span><b class="inc">${won(s.inc)}</b></div><div><span>지출</span><b class="exp">${won(s.exp)}</b></div><div><span>합계</span><b>${won(s.net)}</b></div></div>
    <div class="mperiod">${p0.slice(5).replace('-', '.')} ~ ${p1.slice(5).replace('-', '.')}</div>
    <div class="seg full mtabs">${MTABS.map(([k, l]) => `<button data-mtab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="mbody">${body}</div></div>`;
  const q = $('#mQ', V);
  if (q) q.addEventListener('input', () => { S.mq = q.value; const pos = q.selectionStart; render(); const q2 = $('#mQ'); q2.focus(); q2.setSelectionRange(pos, pos); });
}

/* ── 입력 화면 ── */
function evalAmount(s) {
  s = String(s || '').replace(/[,원\s]/g, '').replace(/[×x]/g, '*').replace(/÷/g, '/');
  if (!/^[\d+\-*/().]+$/.test(s)) return NaN;
  try { const v = Function('"use strict";return (' + s + ')')(); return isFinite(v) ? Math.round(v) : NaN; } catch (e) { return NaN; }
}
function openTxn(t0, opts = {}) {
  const isNew = !t0;
  const T = t0 ? clone(t0) : opts.copy ? opts.copy : { id: 'tx' + uid(), type: opts.type || 'expense', date: opts.date || (S.view === 'money' && S.mtab === 'cal' && S.msel) || todayS(), time: '', amount: 0, acc: (S.accounts.find(a => a.group === 'card') || S.accounts[0] || {}).id, to: null, cat: null, sub: '', memo: '', repeat: null };
  if (T.type === 'transfer' && !T.to) { T.acc = (S.accounts.find(a => a.group === 'bank') || S.accounts[0] || {}).id; T.to = (S.accounts.find(a => a.group === 'card') || S.accounts[1] || {}).id; }
  let amtStr = T.amount ? String(T.amount) : '';
  const ov = modal('', 'txdlg'), dlg = ov.firstChild;
  const draw = () => {
    const cats = T.type === 'income' ? L().inc : L().exp, c = cats.find(x => x.id === T.cat);
    const v = evalAmount(amtStr);
    const accChips = (key) => `<div class="chips">${S.accounts.map(a => `<button class="chip ${T[key] === a.id ? 'on' : ''}" data-tacc="${key}:${a.id}">${esc(a.name)}</button>`).join('')}</div>`;
    dlg.innerHTML = `<div class="dlg-h"><button class="btn" data-tx-x>취소</button>
      <div class="seg tseg">${[['income', '수입'], ['expense', '지출'], ['transfer', '이체']].map(([k, l]) => `<button class="${T.type === k ? 'on ' + k : ''}" data-ttype="${k}">${l}</button>`).join('')}</div>
      <button class="btn primary" data-tx-save>저장</button></div>
      <div class="ed">
        <div class="amtbox ${T.type}"><input class="in" id="tAmt" inputmode="decimal" placeholder="0" value="${esc(amtStr)}" autocomplete="off"><span>원</span></div>
        <div class="amthint" id="tAmtHint">${/[+\-*/]/.test(amtStr) && isFinite(v) ? `= ${wonS(v)}` : '계산식도 됩니다 (예: 12000+3500)'}</div>
        <div class="fr"><span class="k">날짜</span><input type="date" class="in" data-tf="date" value="${T.date}"><input type="time" class="in" data-tf="time" value="${T.time || ''}"></div>
        ${T.type === 'transfer' ? `<div class="fr col"><span class="k">출금</span>${accChips('acc')}</div><div class="fr col"><span class="k">입금</span>${accChips('to')}</div>`
        : `<div class="fr col"><span class="k">분류</span><div class="catgrid">${cats.map(x => `<button class="catb ${T.cat === x.id ? 'on' : ''}" data-tcat="${x.id}" style="--cc:${catColor(T.type, x.id)}"><span>${x.icon}</span>${esc(x.name)}</button>`).join('')}</div>
          ${c && c.subs.length ? `<div class="chips subs">${c.subs.map(sb => `<button class="chip ${T.sub === sb ? 'on' : ''}" data-tsub="${esc(sb)}">${esc(sb)}</button>`).join('')}</div>` : ''}</div>
          <div class="fr col"><span class="k">자산</span>${accChips('acc')}</div>`}
        <div class="fr"><span class="k">내용</span><input class="in" data-tf="memo" value="${esc(T.memo)}" placeholder="메모 (예: 점심 김치찌개)"></div>
        ${!T.tpl ? `<div class="fr"><span class="k">반복</span><select class="in" data-tf="repeat">${[['', '반복 안 함'], ['weekly', '매주'], ['monthly', '매월 (고정 지출·월급 등)'], ['yearly', '매년']].map(([k, l]) => `<option value="${k}"${(T.repeat && T.repeat.freq) === k || (!T.repeat && !k) ? ' selected' : ''}>${l}</option>`).join('')}</select></div>` : '<p class="hint">↻ 반복 거래로 자동 생성된 항목입니다.</p>'}
        <div class="ed-foot">${isNew ? '<button class="btn" data-tx-more>저장 후 계속 입력</button>' : '<button class="btn" data-tx-dup>복사</button><button class="btn danger" data-tx-del>삭제</button>'}</div>
      </div>`;
  };
  draw();
  setTimeout(() => { const a = $('#tAmt', dlg); if (a && isNew) a.focus(); }, 80);
  const save = async (more) => {
    const v = evalAmount(amtStr);
    if (!(v > 0)) { toast('금액을 입력하세요'); return $('#tAmt', dlg).focus(); }
    if (T.type === 'transfer' && (!T.acc || !T.to || T.acc === T.to)) return toast('출금·입금 자산을 서로 다르게 고르세요');
    if (T.type !== 'transfer' && !T.cat) T.cat = (T.type === 'income' ? L().inc : L().exp).slice(-1)[0].id;
    if (!T.acc) return toast('자산을 고르세요');
    T.amount = v;
    if (T.type !== 'transfer') T.to = null;
    await saveTx(T);
    if (T.repeat) await genRecurring();
    if (S.mtab === 'cal') S.msel = T.date;
    toast(`${T.type === 'income' ? '수입' : T.type === 'expense' ? '지출' : '이체'} ${wonS(v)} 저장됨`);
    render();
    if (more) { closeModal(ov); openTxn(null, { type: T.type, date: T.date }); } else closeModal(ov);
  };
  dlg.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'tAmt') { amtStr = t.value; const v = evalAmount(amtStr); $('#tAmtHint', dlg).textContent = /[+\-*/]/.test(amtStr) && isFinite(v) ? `= ${wonS(v)}` : (isFinite(v) && v ? wonS(v) : '계산식도 됩니다 (예: 12000+3500)'); }
    else if (t.dataset.tf === 'repeat') T.repeat = t.value ? { freq: t.value } : null;
    else if (t.dataset.tf) T[t.dataset.tf] = t.value;
  });
  dlg.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing && e.target.tagName === 'INPUT') { e.preventDefault(); save(false); } });
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.txX != null) closeModal(ov);
    else if (d.txSave != null) save(false);
    else if (d.txMore != null) save(true);
    else if (d.ttype) {
      if (T.type !== d.ttype) { T.type = d.ttype; T.cat = null; T.sub = ''; if (T.type === 'transfer' && !T.to) T.to = (S.accounts.find(a => a.id !== T.acc) || {}).id; }
      draw();
    } else if (d.tcat) { T.cat = d.tcat; T.sub = ''; draw(); }
    else if (d.tsub != null) { T.sub = T.sub === d.tsub ? '' : d.tsub; draw(); }
    else if (d.tacc) { const [k, id] = d.tacc.split(':'); T[k] = id; draw(); }
    else if (d.txDel != null) {
      closeModal(ov);
      await removeTx(t0);
      toast('삭제했습니다'); render();
    } else if (d.txDup != null) {
      closeModal(ov);
      openTxn(null, { copy: Object.assign(clone(T), { id: 'tx' + uid(), date: todayS(), repeat: null, tpl: null }) });
    }
  });
}

function openAccount(a0) {
  const A = a0 ? clone(a0) : { id: 'acc' + uid(), name: '', group: 'bank', init: 0, payDay: null, order: S.accounts.length };
  const ov = modal(`<div class="dlg-h"><button class="btn" data-ax>취소</button><b>${a0 ? '자산 편집' : '자산 추가'}</b><button class="btn primary" data-asave>저장</button></div>
    <div class="ed"><input class="in title-in" id="aName" placeholder="예: 국민은행 월급통장, 삼성카드" value="${esc(A.name)}">
    <div class="seg full" style="flex-wrap:wrap">${ACC_GROUPS.map(([g, n]) => `<button data-agrp="${g}" class="${A.group === g ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div class="fr"><span class="k">시작 잔액</span><input class="in" id="aInit" inputmode="decimal" value="${A.init || ''}" placeholder="0 (카드·대출은 빚이면 -금액)"></div>
    <div class="fr" id="aPayRow" ${A.group === 'card' ? '' : 'hidden'}><span class="k">결제일</span><input class="in num" id="aPay" type="number" min="1" max="31" value="${A.payDay || ''}"><span>일</span></div>
    ${a0 ? `<p class="hint">현재 잔액 ${wonS(accBalance(a0))} · 이 자산의 거래 ${S.txns.filter(t => t.acc === a0.id || t.to === a0.id).length}건</p><div class="ed-foot"><button class="btn danger" data-adel>삭제</button></div>` : ''}</div>`);
  ov.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.ax != null) closeModal(ov);
    else if (b.dataset.agrp) { A.group = b.dataset.agrp; $$('[data-agrp]', ov).forEach(x => x.classList.toggle('on', x === b)); $('#aPayRow', ov).hidden = A.group !== 'card'; }
    else if (b.dataset.asave != null) {
      A.name = $('#aName', ov).value.trim() || '이름 없는 자산';
      A.init = evalAmount($('#aInit', ov).value || '0') || 0;
      A.payDay = A.group === 'card' ? (+$('#aPay', ov).value || null) : null;
      await saveAcc(A); closeModal(ov); render();
    } else if (b.dataset.adel != null) {
      const n = S.txns.filter(t => t.acc === a0.id || t.to === a0.id).length;
      if (n) return toast(`거래 ${n}건이 연결되어 있어 삭제할 수 없습니다`);
      S.accounts = S.accounts.filter(x => x.id !== a0.id); S.tomb[a0.id] = Date.now();
      await DB.set('accounts', S.accounts); await DB.set('tomb', S.tomb); markDirty(); closeModal(ov); render();
    }
  });
}
async function setBudget(key) {
  const cur = key === '__all' ? null : (L().budgets || {})[key];
  if (key === '__all') return toast('전체 예산은 분류별 예산의 합계입니다. 분류를 눌러 설정하세요');
  const c = catOf('expense', key);
  const v = await askText(`${c.icon} ${c.name} 월 예산`, '금액을 입력하세요 (0 또는 빈칸이면 해제).', 'text');
  if (v == null) return;
  const n = evalAmount(v || '0') || 0;
  L().budgets = Object.assign({}, L().budgets);
  if (n > 0) L().budgets[key] = n; else delete L().budgets[key];
  await saveSettings(); render();
  return cur;
}
function exportCSV() {
  const rows = [['날짜', '시간', '구분', '분류', '소분류', '금액', '자산', '입금 자산', '내용']];
  for (const t of S.txns.slice().sort((a, b) => a.date < b.date ? -1 : 1)) {
    const c = t.type === 'transfer' ? { name: '이체' } : catOf(t.type, t.cat);
    rows.push([t.date, t.time || '', { income: '수입', expense: '지출', transfer: '이체' }[t.type], c.name, t.sub || '', t.amount, (accOf(t.acc) || {}).name || '', (accOf(t.to) || {}).name || '', t.memo || '']);
  }
  const csv = '﻿' + rows.map(r => r.map(x => /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x).join(',')).join('\r\n');
  saveFile(`metalcal-가계부_${stamp()}.csv`, csv, 'text/csv');
}
async function handleMoneyClick(t) {
  const q = s => t.closest(s);
  let b;
  if ((b = q('[data-mtab]'))) { S.mtab = b.dataset.mtab; S.mcat = null; render(); }
  else if ((b = q('[data-tx]'))) { const x = S.txns.find(y => y.id === b.dataset.tx); if (x) openTxn(x); }
  else if ((b = q('[data-msel]'))) { S.msel = b.dataset.msel; render(); }
  else if ((b = q('[data-mjump]'))) { S.mcur = b.dataset.mjump; S.mtab = 'daily'; render(); }
  else if ((b = q('[data-mstat]'))) { S.mstat = b.dataset.mstat; S.mcat = null; render(); }
  else if ((b = q('[data-mcat]'))) { S.mcat = S.mcat === b.dataset.mcat ? null : b.dataset.mcat; render(); }
  else if ((b = q('[data-bud]'))) setBudget(b.dataset.bud);
  else if ((b = q('[data-acc]'))) openAccount(accOf(b.dataset.acc));
  else if (q('[data-accnew]')) openAccount(null);
  else if ((b = q('[data-txnew]'))) openTxn(null, b.dataset.txnew === 'transfer' ? { type: 'transfer' } : { date: b.dataset.txnew });
  else if ((b = q('[data-act="csv"]'))) exportCSV();
  else return false;
  return true;
}
