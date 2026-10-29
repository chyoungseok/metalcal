'use strict';
/* ═════════ 기록장 ═════════
   note = { id, title, body, tags:[], pinned, date, created, updated }
   태그 = 직접 붙인 태그 + 본문 속 #태그 자동 인식 */
const bodyTags = s => [...new Set([...String(s || '').matchAll(/(?:^|\s)#([^\s#.,!?()[\]{}"']+)/g)].map(m => m[1]))];
const noteTags = n => [...new Set([...(n.tags || []), ...bodyTags(n.body)])];
const noteTitle = n => n.title.trim() || (n.body || '').trim().split('\n')[0].slice(0, 40) || '새 기록';

async function saveNote(n) {
  n.updated = Date.now();
  const i = S.notes.findIndex(x => x.id === n.id);
  if (i < 0) S.notes.push(n); else S.notes[i] = n;
  await DB.set('notes', S.notes); markDirty();
}
async function removeNote(n) {
  S.notes = S.notes.filter(x => x.id !== n.id); S.tomb[n.id] = Date.now();
  await DB.set('notes', S.notes); await DB.set('tomb', S.tomb); markDirty();
}
function newNote(o = {}) {
  return Object.assign({ id: 'n' + uid(), title: '', body: '', tags: S.noteTag && S.noteTag !== '__pin' ? [S.noteTag] : [], pinned: false, date: todayS(), created: Date.now(), updated: Date.now() }, o);
}
function filteredNotes() {
  const words = (S.nq || '').toLowerCase().split(/\s+/).filter(Boolean);
  return S.notes.filter(n => {
    if (S.noteTag === '__pin' && !n.pinned) return false;
    if (S.noteTag && S.noteTag !== '__pin' && !noteTags(n).includes(S.noteTag)) return false;
    const hay = (n.title + ' ' + n.body + ' ' + noteTags(n).map(t => '#' + t).join(' ')).toLowerCase();
    return words.every(w => hay.includes(w.replace(/^#/, '')) );
  }).sort((a, b) => (b.pinned - a.pinned) || b.updated - a.updated);
}
function noteItemHTML(n) {
  const ex = (n.title.trim() ? n.body : n.body.split('\n').slice(1).join(' ')).replace(/\s+/g, ' ').trim().slice(0, 90);
  const d = new Date(n.updated);
  return `<button class="nitem ${S.noteId === n.id ? 'on' : ''}" data-nopen="${n.id}">
    <b>${n.pinned ? '📌 ' : ''}${esc(noteTitle(n))}</b>${ex ? `<span>${esc(ex)}</span>` : ''}
    <small>${relDay(ymd(d))} ${pad(d.getHours())}:${pad(d.getMinutes())}${noteTags(n).length ? ' · ' + noteTags(n).slice(0, 4).map(t => '#' + esc(t)).join(' ') : ''}</small></button>`;
}
function renderNotes(V) {
  const list = filteredNotes(), all = {};
  for (const n of S.notes) for (const t of noteTags(n)) all[t] = (all[t] || 0) + 1;
  const tags = Object.keys(all).sort();
  const cur = S.notes.find(n => n.id === S.noteId);
  const mobileEdit = innerWidth <= 900 && cur;
  const side = `<div class="nlist">
    <div class="ntools"><input class="in" id="nQ" placeholder="🔍 기록 검색" value="${esc(S.nq || '')}" autocomplete="off"><button class="btn sm primary" data-nnew>+ 새 기록</button><button class="btn sm" data-njournal title="오늘 날짜 기록 열기">📔 오늘</button></div>
    <div class="ntags"><button class="achip ${!S.noteTag ? 'on' : ''}" data-ntag="">전체 <em>${S.notes.length}</em></button><button class="achip ${S.noteTag === '__pin' ? 'on' : ''}" data-ntag="__pin">📌 고정</button>${tags.map(t => `<button class="achip ${S.noteTag === t ? 'on' : ''}" data-ntag="${esc(t)}">#${esc(t)} <em>${all[t]}</em></button>`).join('')}</div>
    <div class="nitems">${list.length ? list.map(noteItemHTML).join('') : `<div class="empty">${S.notes.length ? '조건에 맞는 기록이 없습니다.' : '아직 기록이 없습니다.<br>‘+ 새 기록’으로 생각·회의록·아이디어를 남겨 보세요.<br>본문에 <b>#태그</b>를 쓰면 자동으로 분류됩니다.'}</div>`}</div></div>`;
  const editor = cur ? `<div class="nedit" data-nid="${cur.id}">
    <div class="nbar">${innerWidth <= 900 ? '<button class="btn sm" data-nback>← 목록</button>' : ''}<span class="nsaved" id="nSaved">저장됨</span>
      <button class="btn sm ${cur.pinned ? 'primary' : ''}" data-npin>📌 ${cur.pinned ? '고정됨' : '고정'}</button><button class="btn sm danger" data-ndel>삭제</button></div>
    <input class="in ntitle" id="nTitle" placeholder="제목" value="${esc(cur.title)}">
    <div class="nmeta"><input type="date" class="in" id="nDate" value="${cur.date || ''}">
      <div class="tagbox">${(cur.tags || []).map(t => `<span class="tagc">#${esc(t)}<button data-nrmtag="${esc(t)}">×</button></span>`).join('')}${bodyTags(cur.body).filter(t => !(cur.tags || []).includes(t)).map(t => `<span class="tagc auto" title="본문에서 자동 인식">#${esc(t)}</span>`).join('')}<input class="in" id="nTagIn" placeholder="태그 추가 (Enter)"></div></div>
    <textarea class="in nbody" id="nBody" placeholder="자유롭게 기록하세요. 본문에 #태그 를 쓰면 자동 분류됩니다.">${esc(cur.body)}</textarea>
    <div class="nfoot">${cur.body.length.toLocaleString()}자 · 만든 날 ${ymd(new Date(cur.created))}</div></div>`
    : `<div class="nedit empty-ed"><div class="empty">왼쪽에서 기록을 고르거나<br><button class="btn primary" data-nnew>+ 새 기록</button></div></div>`;
  V.innerHTML = `<div class="notes ${mobileEdit ? 'm-edit' : ''}">${mobileEdit ? '' : side}${innerWidth <= 900 && !cur ? '' : editor}</div>`;
  bindNoteEditor(V);
}

let NT = 0;
// 본문 #태그가 바뀌면 태그 표시만 갱신 (입력 중 포커스 유지)
function refreshNoteTags(V, n) {
  const box = $('.nedit .tagbox', V);
  if (box) { $$('.tagc.auto', box).forEach(x => x.remove()); box.querySelector('#nTagIn').insertAdjacentHTML('beforebegin', bodyTags(n.body).filter(t => !(n.tags || []).includes(t)).map(t => `<span class="tagc auto" title="본문에서 자동 인식">#${esc(t)}</span>`).join('')); }
  const bar = $('.ntags', V);
  if (bar) { const all = {}; for (const x of S.notes) for (const t of noteTags(x)) all[t] = (all[t] || 0) + 1;
    bar.innerHTML = `<button class="achip ${!S.noteTag ? 'on' : ''}" data-ntag="">전체 <em>${S.notes.length}</em></button><button class="achip ${S.noteTag === '__pin' ? 'on' : ''}" data-ntag="__pin">📌 고정</button>` + Object.keys(all).sort().map(t => `<button class="achip ${S.noteTag === t ? 'on' : ''}" data-ntag="${esc(t)}">#${esc(t)} <em>${all[t]}</em></button>`).join(''); }
}
function bindNoteEditor(V) {
  const q = $('#nQ', V);
  if (q) q.addEventListener('input', () => { S.nq = q.value; const box = $('.nitems', V), list = filteredNotes(); box.innerHTML = list.length ? list.map(noteItemHTML).join('') : '<div class="empty">조건에 맞는 기록이 없습니다.</div>'; });
  const ed = $('.nedit[data-nid]', V);
  if (!ed) return;
  const n = S.notes.find(x => x.id === ed.dataset.nid);
  const flag = t => { const s = $('#nSaved', V); if (s) s.textContent = t; };
  const later = () => {
    flag('입력 중…'); clearTimeout(NT);
    NT = setTimeout(async () => {
      await saveNote(n); flag('저장됨');
      const it = $(`[data-nopen="${n.id}"]`, V);
      if (it) it.outerHTML = noteItemHTML(n);
      refreshNoteTags(V, n);
    }, 500);
  };
  const ta = $('#nBody', V);
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.max(260, ta.scrollHeight + 4) + 'px'; };
  grow();
  ta.addEventListener('input', () => { n.body = ta.value; grow(); later(); });
  $('#nTitle', V).addEventListener('input', e => { n.title = e.target.value; later(); });
  $('#nDate', V).addEventListener('change', e => { n.date = e.target.value; later(); });
  const ti = $('#nTagIn', V);
  ti.addEventListener('keydown', async e => {
    if ((e.key === 'Enter' || e.key === ',') && !e.isComposing) {
      e.preventDefault();
      const v = ti.value.replace(/^#/, '').trim();
      if (v && !(n.tags || []).includes(v)) { n.tags = [...(n.tags || []), v]; await saveNote(n); render(); setTimeout(() => { const x = $('#nTagIn'); if (x) x.focus(); }, 0); }
    }
  });
}
async function handleNotesClick(t) {
  const q = s => t.closest(s);
  let b;
  const n = S.notes.find(x => x.id === S.noteId);
  if (q('[data-nnew]')) {
    const nn = newNote(); await saveNote(nn); S.noteId = nn.id; render();
    setTimeout(() => { const x = $('#nTitle'); if (x) x.focus(); }, 30);
  } else if (q('[data-njournal]')) {
    const ds = todayS(), title = `${fmtDateK(ds, true)} 기록`;
    let j = S.notes.find(x => x.title === title);
    if (!j) { j = newNote({ title, tags: ['일기'] }); await saveNote(j); }
    S.noteId = j.id; render();
    setTimeout(() => { const x = $('#nBody'); if (x) { x.focus(); x.setSelectionRange(x.value.length, x.value.length); } }, 30);
  } else if ((b = q('[data-nopen]'))) {
    clearTimeout(NT); if (n) await saveNote(n);
    S.noteId = b.dataset.nopen; render();
  } else if ((b = q('[data-ntag]'))) { S.noteTag = b.dataset.ntag || null; render(); }
  else if (q('[data-nback]')) { clearTimeout(NT); if (n) await saveNote(n); S.noteId = null; render(); }
  else if (q('[data-npin]') && n) { n.pinned = !n.pinned; await saveNote(n); render(); }
  else if ((b = q('[data-nrmtag]')) && n) { n.tags = n.tags.filter(x => x !== b.dataset.nrmtag); await saveNote(n); render(); }
  else if (q('[data-ndel]') && n) {
    if (!(await choose('기록 삭제', `「${noteTitle(n)}」을(를) 삭제할까요?`, [['ok', '삭제', 'danger']]))) return true;
    clearTimeout(NT); await removeNote(n); S.noteId = null; toast('기록을 삭제했습니다'); render();
  } else return false;
  return true;
}
const isTypingNote = () => S.view === 'notes' && document.activeElement && !!document.activeElement.closest('.nedit');
