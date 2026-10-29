'use strict';
/* ═════════ 목표 설계 ═════════
   ① 현황 파악(주관적 자료·객관적 자료) → ② 핵심 과제(문제·원인·근거) → ③ 목표(SMART + 핵심 결과)
   → ④ 실행 계획(장애물·If-Then 계획, WOOP) → ⑤ 평가(달성·부분 달성·미달성) */
const GOAL_STATUS = {
  active: ['진행 중', '#4f8cff'], achieved: ['달성', '#5fb85a'], partial: ['부분 달성', '#e8a33d'],
  notmet: ['미달성', '#e5534b'], paused: ['보류', '#8a94a6']
};
const GSTEPS = ['현황 파악', '핵심 과제', '목표', '실행 계획', '평가'];
/* 목표 영역 — ‘삶의 수레바퀴(Wheel of Life)’ 8영역을 바탕으로 본업·부업을 분리해 재구성 */
const GOAL_AREAS = [
  { id: 'finance', name: '금융·재정', short: '금융', icon: '💰', desc: '저축·투자·부채 상환·지출 관리·노후 준비' },
  { id: 'career', name: '본업·커리어', short: '본업', icon: '💼', desc: '업무 성과·승진·전문성·이직' },
  { id: 'side', name: '부업·사업', short: '부업', icon: '🚀', desc: '부수입·프리랜스·창업·콘텐츠' },
  { id: 'health', name: '건강·체력', short: '건강', icon: '💪', desc: '운동·식단·수면·검진' },
  { id: 'growth', name: '자기계발·학습', short: '자기계발', icon: '📚', desc: '자격증·어학·독서·기술' },
  { id: 'relation', name: '관계·가족', short: '관계', icon: '❤️', desc: '가족·연인·친구·인맥' },
  { id: 'leisure', name: '여가·취미', short: '여가', icon: '🎨', desc: '여행·취미·휴식·경험' },
  { id: 'mind', name: '마음·생활', short: '마음·생활', icon: '🧘', desc: '정서·습관·주거 환경·봉사' }
];
const areaOf = id => GOAL_AREAS.find(a => a.id === id) || { id: '', name: '미분류', short: '미분류', icon: '🏷️' };
// 영역 필터 칩 (사이드바·목표·매트릭스 공용) — 캘린더·목록·매트릭스에 모두 적용
function areaChipsHTML(withCounts = true) {
  const cnt = id => S.goals.filter(g => (g.area || '') === id && g.status === 'active').length;
  return `<div class="achips"><button class="achip ${!S.areaFilter ? 'on' : ''}" data-area="">전체</button>${GOAL_AREAS.map(a => `<button class="achip ${S.areaFilter === a.id ? 'on' : ''}" data-area="${a.id}" title="${a.desc}">${a.icon} ${a.short}${withCounts && cnt(a.id) ? `<em>${cnt(a.id)}</em>` : ''}</button>`).join('')}<button class="achip ${S.areaFilter === 'none' ? 'on' : ''}" data-area="none">목표 없음</button></div>`;
}
function setArea(id) {
  S.areaFilter = id || null;
  try { localStorage.setItem('mc-area', S.areaFilter || ''); } catch (e) { }
  render();
}
function areaMatch(ev) {
  if (!S.areaFilter || ev.type === 'mark') return true;
  const m = goalOf(ev);
  return S.areaFilter === 'none' ? !m : !!m && (m.g.area || '') === S.areaFilter;
}

function newGoal(o = {}) {
  return Object.assign({
    id: 'g' + uid(), area: S.areaFilter && S.areaFilter !== 'none' ? S.areaFilter : '', title: '', why: '', must: true, deadline: addDaysS(todayS(), 90), color: S.settings.colors[0].id, keywords: [],
    subjective: '', objective: '', problem: '', cause: '', evidence: '', attainable: false,
    krs: [], plans: [], status: 'active', reviews: [], reviewEvery: 7, created: Date.now(), updated: Date.now()
  }, o);
}
async function saveGoal(g) {
  g.updated = Date.now();
  const i = S.goals.findIndex(x => x.id === g.id);
  if (i < 0) S.goals.push(g); else S.goals[i] = g;
  await DB.set('goals', S.goals);
  markDirty();
}
async function removeGoal(g) {
  S.goals = S.goals.filter(x => x.id !== g.id);
  S.tomb[g.id] = Date.now();
  await DB.set('goals', S.goals); await DB.set('tomb', S.tomb);
  for (const ev of S.events.filter(e => e.goalId === g.id)) { ev.goalId = null; await saveEv(ev); }
  markDirty();
}
const activeGoals = () => S.goals.filter(g => g.status === 'active');
const krCur = (k, g) => k.link ? ledgerMetric(k.link, g) : k.current;
function krPct(k, g) {
  const cur = krCur(k, g);
  const s = +k.start || 0, t = parseFloat(k.target), c = cur === '' || cur == null ? s : +cur;
  if (!isFinite(t) || !isFinite(c)) return 0;
  if (t === s) return c === t ? 1 : 0;
  return Math.max(0, Math.min(1, (c - s) / (t - s)));
}
function goalItems(g) { return S.events.filter(e => e.goalId === g.id); }
function goalPct(g) {
  if (g.krs.length) return g.krs.reduce((a, k) => a + krPct(k, g), 0) / g.krs.length;
  const t = goalItems(g).filter(e => e.type === 'task' && !(e.rrule && !e.rrule.afterDone));
  return t.length ? t.filter(e => e.done).length / t.length : 0;
}
function nextReview(g) {
  const last = g.reviews.length ? g.reviews[g.reviews.length - 1].date : ymd(new Date(g.created));
  return addDaysS(last, g.reviewEvery || 7);
}
function smartCheck(g) {
  return [
    ['S', '구체적', !!(g.title.trim().length >= 4 && (g.problem || g.why)), '무엇을 바꿀지 분명한 문장으로'],
    ['M', '측정 가능', g.krs.some(k => k.title && isFinite(parseFloat(k.target))), '숫자 목표가 있는 핵심 결과 1개 이상'],
    ['A', '달성 가능', !!g.attainable, '현재 자료로 볼 때 현실적인가'],
    ['R', '관련성', !!g.why.trim(), '왜 꼭 이뤄야 하는지'],
    ['T', '기한', !!g.deadline, '언제까지']
  ];
}

/* ── 👍 아이젠하워 추천 ──
   중요도: ‘꼭 이뤄야 할(필수)’ 진행 중 목표에 연결(또는 키워드 일치) → 중요
   긴급도: 기한 지남·2일 이내, 또는 목표 기한 7일 이내 항목 → 긴급 */
function goalOf(ev) {
  if (ev.goalId) { const g = S.goals.find(x => x.id === ev.goalId && x.status === 'active'); if (g) return { g, how: 'link' }; }
  const hay = (ev.title + ' ' + (ev.tags || []).join(' ')).toLowerCase();
  for (const g of activeGoals()) {
    const kws = (g.keywords || []).map(k => k.toLowerCase().trim()).filter(k => k.length >= 2);
    if (kws.some(k => hay.includes(k))) return { g, how: 'keyword' };
  }
  return null;
}
function recommend(o) {
  const ev = o.ev, today = todayS(), m = goalOf(ev), days = diffDays(today, o.date), why = [];
  let imp = false, urg = false;
  if (m) {
    imp = m.g.must || m.how === 'link';
    why.push(`목표 「${m.g.title}」${m.g.must ? '(필수)' : ''} ${m.how === 'link' ? '연결' : '키워드 일치'}`);
    const gd = diffDays(today, m.g.deadline);
    if (gd >= 0 && gd <= 7 && days <= 3) { urg = true; why.push(`목표 기한 D-${gd}`); }
  } else why.push('연결된 목표 없음');
  if (days < 0 && ev.type === 'task') { urg = true; why.push('기한 지남'); }
  else if (days >= 0 && days <= 1) { urg = true; why.push(days === 0 ? '오늘 마감' : '내일 마감'); }
  return { q: imp && urg ? 1 : imp ? 2 : urg ? 3 : 4, why: why.join(' · '), goal: m && m.g };
}

/* ── 목표 보기 ── */
function renderGoals(V) {
  const today = todayS();
  const inArea = g => !S.areaFilter || (S.areaFilter === 'none' ? false : (g.area || '') === S.areaFilter);
  const act = S.goals.filter(g => (g.status === 'active' || g.status === 'paused') && inArea(g));
  const done = S.goals.filter(g => !['active', 'paused'].includes(g.status) && inArea(g));
  const wheel = GOAL_AREAS.map(a => { const gs = S.goals.filter(g => g.area === a.id && g.status === 'active'); return [a, gs.length, gs.length ? gs.reduce((x, g) => x + goalPct(g), 0) / gs.length : 0]; });
  const card = g => {
    const p = goalPct(g), dd = diffDays(today, g.deadline), items = goalItems(g), c = colorHex(g.color);
    const tasks = items.filter(e => e.type === 'task'), nr = nextReview(g);
    return `<div class="gcard" data-gopen="${g.id}" style="--c:${c}">
      <div class="garea">${areaOf(g.area).icon} ${areaOf(g.area).name}</div>
      <div class="gch"><span class="gst" style="--s:${GOAL_STATUS[g.status][1]}">${GOAL_STATUS[g.status][0]}</span>${g.must ? '<span class="gmust">필수 👍</span>' : ''}<span class="gdd ${dd < 0 ? 'over' : dd <= 7 ? 'soon' : ''}">${dd < 0 ? `기한 ${-dd}일 지남` : dd === 0 ? 'D-Day' : `D-${dd}`}</span></div>
      <h3>${esc(g.title || '(이름 없는 목표)')}</h3>
      ${g.why ? `<p class="gwhy">${esc(g.why)}</p>` : ''}
      <div class="gbar"><i style="width:${Math.round(p * 100)}%"></i></div>
      <div class="gmeta"><b>${Math.round(p * 100)}%</b>${g.krs.slice(0, 3).map(k => { const c = krCur(k, g); return `<span>${k.link ? '🔗' : ''}${esc(k.title)} ${esc(typeof c === 'number' && Math.abs(c) >= 1000 ? won(c) : (c ?? ''))}/${esc(isFinite(+k.target) && Math.abs(+k.target) >= 1000 ? won(+k.target) : k.target)}${esc(k.unit || '')}</span>`; }).join('')}</div>
      <div class="gfoot"><span>🔗 할 일 ${tasks.filter(t => t.done).length}/${tasks.length} · 일정 ${items.length - tasks.length}</span>${g.status === 'active' && nr <= today ? '<span class="gdue">점검할 때예요</span>' : `<span>다음 점검 ${relDay(nr)}</span>`}</div>
    </div>`;
  };
  V.innerHTML = `<div class="goals">
    <div class="g-intro"><div><b>🎯 꼭 이뤄야 할 목표를 설계하세요</b><p>현황 파악 → 핵심 과제 → SMART 목표 → 실행 계획(If-Then) → 평가의 5단계. 필수 목표에 연결된 할 일은 매트릭스에서 👍 추천됩니다.</p></div><button class="btn primary" data-gnew>+ 새 목표</button></div>
    ${areaChipsHTML()}
    ${!S.areaFilter && S.goals.length ? `<div class="wheel"><h4>영역별 균형 <small>진행 중 목표의 평균 진척도 — 비어 있는 영역이 없는지 살펴보세요</small></h4>${wheel.map(([a, n, p]) => `<button class="wrow" data-area="${a.id}"><span>${a.icon} ${a.short}</span><div class="meter"><i style="width:${p * 100}%"></i></div><b>${n ? Math.round(p * 100) + '%' : '—'}</b><small>${n}개</small></button>`).join('')}</div>` : ''}
    ${S.areaFilter && S.areaFilter !== 'none' ? `<div class="mnote">${areaOf(S.areaFilter).icon} <b>${areaOf(S.areaFilter).name}</b> — ${areaOf(S.areaFilter).desc}</div>` : ''}
    ${act.length ? `<div class="ggrid">${act.map(card).join('')}</div>` : `<div class="empty">${S.areaFilter ? '이 영역에 진행 중인 목표가 없습니다.' : '아직 목표가 없습니다.'}<br>‘+ 새 목표’로 목표를 설계해 보세요.</div>`}
    ${done.length ? `<h4 class="gsec">완료·평가된 목표</h4><div class="ggrid">${done.map(card).join('')}</div>` : ''}
  </div>`;
}

/* ── 목표 편집기 ── */
function openGoal(id, step = 0) {
  const orig = S.goals.find(g => g.id === id);
  const G = clone(orig || newGoal());
  const isNew = !orig;
  let st = step;
  const ov = modal('', 'wide goal-dlg'), dlg = ov.firstChild;
  const fld = (k, label, ph, ta) => `<label class="gf"><span>${label}</span>${ta ? `<textarea class="in" rows="3" data-g="${k}" placeholder="${esc(ph)}">${esc(G[k])}</textarea>` : `<input class="in" data-g="${k}" value="${esc(G[k])}" placeholder="${esc(ph)}">`}</label>`;
  const body = () => {
    if (st === 0) return `<p class="ghint">지금 상태를 <b>느낌</b>과 <b>사실</b>로 나눠 적으면 진짜 문제가 보입니다.</p>
      ${fld('subjective', '주관적 자료 — 내가 느끼고 말하는 것', '예: 요즘 계단만 올라도 숨이 차고 오후마다 너무 피곤하다', true)}
      ${fld('objective', '객관적 자료 — 측정·관찰 가능한 사실', '예: 체중 72kg · 주당 운동 0회 · 평균 수면 5시간 (최근 2주 기록)', true)}`;
    if (st === 1) return `<p class="ghint">자료를 근거로 <b>문제 · 원인 · 근거</b>를 한 줄씩 정리하세요.</p>
      ${fld('problem', '문제 — 무엇을 바꿔야 하나', '예: 체력 저하')}
      ${fld('cause', '원인 — 왜 생겼나', '예: 운동 부족과 불규칙한 수면')}
      ${fld('evidence', '근거 — 어떤 자료가 보여주나', '예: 주당 운동 0회, 수면 5시간, 계단 오를 때 숨참')}
      ${G.problem ? `<div class="gsum">“${esc(G.evidence || '…')}”로 볼 때, <b>${esc(G.cause || '…')}</b>와 관련된 <b>${esc(G.problem)}</b></div>` : ''}`;
    if (st === 2) return `
      <div class="gf"><span>영역</span><div class="achips">${GOAL_AREAS.map(a => `<button class="achip ${G.area === a.id ? 'on' : ''}" data-garea="${a.id}" title="${a.desc}">${a.icon} ${a.name}</button>`).join('')}</div></div>
      ${fld('title', '목표 — 무엇을 이룰 것인가', '예: 12월 말까지 체중 67kg, 주 3회 운동 습관 만들기')}
      ${fld('why', '왜 꼭 이뤄야 하나 (목적)', '예: 건강하게 오래 일하고 가족과 시간을 보내려고', true)}
      <div class="grow2"><label class="gf"><span>기한</span><input type="date" class="in" data-g="deadline" value="${G.deadline || ''}"></label>
      <label class="gf"><span>꼭 이뤄야 할 목표 (👍 추천 기준)</span><label class="sw"><input type="checkbox" data-gb="must" ${G.must ? 'checked' : ''}><i></i></label></label></div>
      <label class="gf"><span>관련 키워드 — 이 단어가 들어간 일정도 목표와 연결된 것으로 추천</span><input class="in" data-gkw value="${esc(G.keywords.join(', '))}" placeholder="예: 운동, 헬스, 식단, 걷기"></label>
      <div class="gf"><span>색상</span><div class="colors">${S.settings.colors.map(c => `<button class="cdot ${G.color === c.id ? 'on' : ''}" data-gcolor="${c.id}" style="--c:${c.hex}"><i></i><span>${esc(c.name)}</span></button>`).join('')}</div></div>
      <div class="gf"><span>핵심 결과 (OKR) — 숫자로 확인할 수 있는 결과</span>
        <div class="krs">${G.krs.map((k, i) => `<div class="kr"><input class="in" data-kr="${i}" data-k="title" value="${esc(k.title)}" placeholder="지표 (예: 체중)">
          <input class="in num" data-kr="${i}" data-k="start" value="${esc(k.start ?? '')}" placeholder="시작" inputmode="decimal"><span>→</span>
          <input class="in num" data-kr="${i}" data-k="target" value="${esc(k.target ?? '')}" placeholder="목표" inputmode="decimal">
          <input class="in num" data-kr="${i}" data-k="unit" value="${esc(k.unit || '')}" placeholder="단위"><button class="btn icon sm" data-krdel="${i}">✕</button>
          <select class="in krlink" data-kr="${i}" data-k="link">${LINK_OPTS().map(([v, l]) => `<option value="${v}"${(k.link || '') === v ? ' selected' : ''}>${v ? '자동: ' : ''}${esc(l)}</option>`).join('')}</select></div>`).join('')}
        <button class="btn sm" data-kradd>+ 핵심 결과 추가</button></div></div>
      <label class="gf row"><label class="sw"><input type="checkbox" data-gb="attainable" ${G.attainable ? 'checked' : ''}><i></i></label><span>현황 자료로 볼 때 현실적으로 달성 가능하다</span></label>
      <div class="smart">${smartCheck(G).map(([l, n, ok, h]) => `<div class="${ok ? 'ok' : ''}" title="${h}"><b>${l}</b><span>${n}</span><small>${ok ? '✓' : h}</small></div>`).join('')}</div>`;
    if (st === 3) {
      const items = orig ? goalItems(orig) : [];
      return `<p class="ghint"><b>장애물</b>을 미리 떠올리고 <b>“만약 ~하면, 나는 ~하겠다”</b>로 대응을 정해 두면 실행률이 크게 오릅니다.</p>
      <div class="plans">${G.plans.map((p, i) => `<div class="plan"><div><span>만약</span><input class="in" data-pl="${i}" data-k="obstacle" value="${esc(p.obstacle)}" placeholder="예: 퇴근이 늦어 헬스장에 못 가면"></div>
        <div><span>나는</span><input class="in" data-pl="${i}" data-k="action" value="${esc(p.action)}" placeholder="예: 집에서 20분 맨몸 운동을 한다"></div><button class="btn icon sm" data-pldel="${i}">✕</button></div>`).join('')}
        <button class="btn sm" data-pladd>+ If-Then 계획 추가</button></div>
      <div class="gf"><span>연결된 할 일·일정 ${items.length}개</span>
        <div class="glinks">${items.map(e => `<div class="glink" style="--c:${colorHex(e.color)}"><i></i>${e.type === 'task' ? (e.done ? '☑' : '☐') : '📅'} ${esc(e.title)}<small>${e.rrule ? '↻ ' + esc(describeRule(e.rrule, e.startDate)) : relDay(e.startDate)}</small></div>`).join('') || '<span class="empty-s">아래에서 실행할 할 일을 만들어 연결하세요.</span>'}</div>
        ${orig ? `<div class="gadd"><input class="in" id="gTask" placeholder="예: 매주 월수금 7시 헬스 / 매일 체중 기록" autocomplete="off"><button class="btn sm primary" data-gtask>할 일 추가</button></div><div class="qprev" id="gTaskPrev"></div>` : '<p class="hint">목표를 저장하면 할 일을 만들어 연결할 수 있습니다.</p>'}</div>`;
    }
    return `<p class="ghint">정기적으로 진척을 기록하고 <b>달성 · 부분 달성 · 미달성</b>으로 평가하세요. 미달성이면 1단계로 돌아가 다시 설계합니다.</p>
      ${G.krs.length ? `<div class="gf"><span>핵심 결과 현재값</span>${G.krs.map((k, i) => `<div class="kr cur"><b>${esc(k.title || '지표')}</b>${k.link ? `<span class="krauto">🔗 가계부 자동 ${won(krCur(k, G))}</span>` : `<input class="in num" data-kr="${i}" data-k="current" value="${esc(k.current ?? '')}" inputmode="decimal">`}<span>/ ${esc(k.target)}${esc(k.unit || '')}</span><div class="gbar"><i style="width:${Math.round(krPct(k, G) * 100)}%"></i></div></div>`).join('')}</div>` : ''}
      <div class="grow2"><label class="gf"><span>점검 주기</span><select class="in" data-g="reviewEvery">${[[1, '매일'], [7, '매주'], [14, '2주마다'], [30, '매월']].map(([v, l]) => `<option value="${v}"${+G.reviewEvery === v ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="gf"><span>상태</span><select class="in" data-g="status">${Object.entries(GOAL_STATUS).map(([k, [l]]) => `<option value="${k}"${G.status === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label></div>
      <div class="gf"><span>점검 기록 남기기</span><div class="seg full">${[['active', '진행 중'], ['achieved', '달성'], ['partial', '부분 달성'], ['notmet', '미달성']].map(([k, l]) => `<button data-rvres="${k}">${l}</button>`).join('')}</div>
        <textarea class="in" rows="2" id="rvNote" placeholder="잘된 점 · 막힌 점 · 다음에 바꿀 점"></textarea></div>
      <div class="rvs">${G.reviews.slice().reverse().map(r => `<div><b style="color:${GOAL_STATUS[r.result][1]}">${GOAL_STATUS[r.result][0]}</b> <span>${relDay(r.date)} · ${Math.round((r.pct || 0) * 100)}%</span>${r.note ? `<p>${esc(r.note)}</p>` : ''}</div>`).join('') || '<span class="empty-s">아직 점검 기록이 없습니다.</span>'}</div>`;
  };
  const draw = () => {
    const sc = dlg.scrollTop;
    dlg.innerHTML = `<div class="dlg-h"><button class="btn" data-gx>취소</button><b>${isNew ? '새 목표' : '목표'}</b><button class="btn primary" data-gsave>저장</button></div>
      <div class="gsteps">${GSTEPS.map((s, i) => `<button class="${i === st ? 'on' : ''}" data-gstep="${i}"><i>${i + 1}</i>${s}</button>`).join('')}</div>
      <div class="ed gbody">${body()}</div>
      <div class="gnav">${!isNew ? '<button class="btn danger sm" data-gdel>삭제</button>' : ''}<span></span>${st > 0 ? `<button class="btn" data-gstep="${st - 1}">← 이전</button>` : ''}${st < 4 ? `<button class="btn primary" data-gstep="${st + 1}">다음 →</button>` : ''}</div>`;
    dlg.scrollTop = sc;
  };
  draw();
  const save = async (close = true) => {
    if (!G.title.trim()) G.title = G.problem ? `${G.problem} 해결` : '새 목표';
    G.krs = G.krs.filter(k => k.title || k.target !== '');
    G.plans = G.plans.filter(p => p.obstacle || p.action);
    await saveGoal(G);
    if (close) { closeModal(ov); toast(`목표 「${G.title}」 저장됨`); }
    render();
  };
  dlg.addEventListener('input', e => {
    const t = e.target, d = t.dataset;
    if (d.g) G[d.g] = d.g === 'reviewEvery' ? +t.value : t.value;
    else if (d.gkw != null) G.keywords = t.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    else if (d.kr != null) G.krs[+d.kr][d.k] = t.value;
    else if (d.pl != null) G.plans[+d.pl][d.k] = t.value;
    else if (t.id === 'gTask') { const p = parseQuick(t.value); $('#gTaskPrev', dlg).innerHTML = t.value.trim() ? quickPreview(p, { type: 'task' }) : ''; }
  });
  dlg.addEventListener('change', e => {
    const d = e.target.dataset;
    if (d.gb) { G[d.gb] = e.target.checked; draw(); }
    else if (d.g === 'status' || d.k === 'target' || d.k === 'link' || d.g === 'title' || d.g === 'why') draw();
  });
  dlg.addEventListener('keydown', e => { if (e.target.id === 'gTask' && e.key === 'Enter' && !e.isComposing) { e.preventDefault(); $('[data-gtask]', dlg).click(); } });
  dlg.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const d = b.dataset;
    if (d.gx != null) closeModal(ov);
    else if (d.gsave != null) save();
    else if (d.gstep != null) { st = +d.gstep; draw(); dlg.scrollTop = 0; }
    else if (d.gcolor) { G.color = d.gcolor; draw(); }
    else if (d.garea) { G.area = d.garea; draw(); }
    else if (d.kradd != null) { G.krs.push({ id: uid(), title: '', start: '', target: '', current: '', unit: '' }); draw(); }
    else if (d.krdel != null) { G.krs.splice(+d.krdel, 1); draw(); }
    else if (d.pladd != null) { G.plans.push({ id: uid(), obstacle: '', action: '' }); draw(); }
    else if (d.pldel != null) { G.plans.splice(+d.pldel, 1); draw(); }
    else if (d.rvres) {
      G.reviews.push({ date: todayS(), result: d.rvres, note: $('#rvNote', dlg).value.trim(), pct: goalPct(G) });
      if (d.rvres !== 'active') G.status = d.rvres;
      await save(false); toast('점검을 기록했습니다'); draw();
    } else if (d.gtask != null) {
      const inp = $('#gTask', dlg);
      if (!inp.value.trim()) return inp.focus();
      const ev = quickToEvent(parseQuick(inp.value), { type: 'task', color: G.color, goalId: G.id });
      if (!ev.priority) ev.priority = recommend(mkOcc(ev, ev.startDate, 0)).q;
      snapshot(); await saveEv(ev);
      inp.value = ''; toast(`「${ev.title}」 → ${PRIO[ev.priority].short}`);
      draw(); render();
    } else if (d.gdel != null) {
      if (await choose('목표 삭제', `「${G.title}」 목표를 삭제할까요? 연결된 할 일은 남아 있습니다.`, [['ok', '삭제', 'danger']])) { closeModal(ov); await removeGoal(G); render(); }
    }
  });
}

/* 보기 영역의 목표·추천 관련 클릭 */
async function handleGoalClick(t) {
  const ar = t.closest('[data-area]');
  if (ar) return setArea(ar.dataset.area), true;
  const n = t.closest('[data-gnew]'), o = t.closest('[data-gopen]'), r = t.closest('[data-rec]'), all = t.closest('[data-recall]');
  if (n) return openGoal(null), true;
  if (o) { const g = S.goals.find(x => x.id === o.dataset.gopen); if (g) openGoal(g.id, g.status === 'active' ? 4 : 2); return true; }
  if (r) {
    const occ = S.occMap.get(r.dataset.rec);
    if (!occ) return true;
    snapshot(); occ.ev.priority = +r.dataset.q; await saveEv(occ.ev);
    toast(`👍 「${occ.ev.title}」 → ${PRIO[+r.dataset.q].short}`, true); render(); return true;
  }
  if (all) {
    const list = matrixItems().map(x => [x, recommend(x)]).filter(([x, rc]) => x.ev.priority !== rc.q && (x.ev.priority || x.ev.type === 'task'));
    if (!list.length) return true;
    snapshot();
    for (const [x, rc] of list) { x.ev.priority = rc.q; await saveEv(x.ev); }
    toast(`👍 추천대로 ${list.length}개 항목을 재배치했습니다`, true); render(); return true;
  }
  return false;
}
