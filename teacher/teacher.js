/* ================================================================
   teacher.js — Teacher Portal client
   Proctor v2 — teacher management interface.
   All API calls go through the same Apps Script /exec endpoint as
   the student portal. Teacher actions require a valid ID token AND
   an email in the TEACHER_EMAILS Script Property.
   ================================================================ */

import { initializeApp }           from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut,
         onAuthStateChanged, setPersistence, browserLocalPersistence }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

import { FIREBASE_CONFIG, API_URL, validateConfig } from '../config.js';

/* ---- config guard ---- */
(function () {
  const err = validateConfig();
  if (!err) return;
  document.getElementById('scTLoading').hidden = true;
  document.getElementById('scTDenied').hidden = false;
  document.getElementById('tDeniedText').textContent =
    'The exam site is missing an important setting. Please ask your teacher about this matter.';
  console.error('[Proctor-teacher] config: ' + err);
  throw new Error(err);
}());

const $ = id => document.getElementById(id);

/* ================================================================
   Theme toggle
   ================================================================ */

const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const activeTheme = () => document.documentElement.dataset.theme || (prefersDark() ? 'dark' : 'light');

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('exam_theme_v1', t); } catch {}
}

$('btnTheme').onclick = () => setTheme(activeTheme() === 'dark' ? 'light' : 'dark');

/* ================================================================
   Firebase auth
   ================================================================ */

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
await setPersistence(auth, browserLocalPersistence);

let _idToken = null;

async function idToken() {
  const u = auth.currentUser;
  if (!u) throw new Error('not-signed-in');
  _idToken = await u.getIdToken();
  return _idToken;
}

/* ================================================================
   API helper — same pattern as app.js
   ================================================================ */

async function api(action, body = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({ action, ...body }),
    headers: {}    // simple request — no preflight
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  return res.json();
}

/* ================================================================
   Screen / tab routing
   ================================================================ */

const SCREENS = [
  'scTLoading', 'scTSignIn', 'scTDenied',
  'scTDashboard', 'scTExams', 'scTExamDetail',
  'scTStudents', 'scTResults'
];

const TAB_SCREENS = {
  dashboard: 'scTDashboard',
  exams:     'scTExams',
  students:  'scTStudents',
  results:   'scTResults'
};
const SCREEN_TAB = Object.fromEntries(
  Object.entries(TAB_SCREENS).map(([t, s]) => [s, t])
);

const BAR_HIDDEN = new Set(['scTLoading', 'scTSignIn', 'scTDenied', 'scTExamDetail']);

function show(id) {
  SCREENS.forEach(s => { $(s).hidden = s !== id; });

  const bar = $('tAppBar');
  if (!bar) return;

  if (BAR_HIDDEN.has(id)) { bar.hidden = true; return; }
  bar.hidden = false;

  const tab = SCREEN_TAB[id] || null;
  document.querySelectorAll('.appbar-tab').forEach(btn => {
    btn.setAttribute('aria-selected', btn.dataset.tab === tab ? 'true' : 'false');
  });
}

// App bar tab click
document.querySelectorAll('#tAppBar .appbar-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    const target = TAB_SCREENS[btn.dataset.tab];
    if (target) showTab(btn.dataset.tab);
  });
});

async function showTab(tab) {
  show(TAB_SCREENS[tab]);
  if (tab === 'dashboard') await loadDashboard();
  if (tab === 'exams')     await loadExams();
  if (tab === 'students')  await loadStudents();
  if (tab === 'results')   resetResults();
}

/* ================================================================
   iOS keyboard detection
   ================================================================ */

if (window.visualViewport) {
  let _kbTimer = null;
  visualViewport.addEventListener('resize', () => {
    const open = visualViewport.height < window.innerHeight * 0.75;
    if (open) {
      document.documentElement.dataset.keyboard = 'open';
      clearTimeout(_kbTimer);
    } else {
      _kbTimer = setTimeout(() => delete document.documentElement.dataset.keyboard, 80);
    }
  });
}

/* ================================================================
   Auth state
   ================================================================ */

onAuthStateChanged(auth, async user => {
  if (!user) { show('scTSignIn'); return; }
  $('tLoadingText').textContent = 'Checking access…';
  show('scTLoading');

  try {
    const token = await idToken();
    const r = await api('teacherBootstrap', { idToken: token });

    if (!r.ok) {
      if (r.authFailed) { await signOut(auth); show('scTSignIn'); return; }
      if (!r.authorized) { show('scTDenied'); return; }
      show('scTDenied');
      return;
    }

    $('topRole').hidden = false;
    $('topRole').textContent = user.email;
    await loadDashboard();
    show('scTDashboard');
  } catch (err) {
    console.error('[teacher] bootstrap error', err);
    show('scTDenied');
  }
});

/* Sign in */
$('btnTSignIn').onclick = async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch (err) {
    if (err.code !== 'auth/popup-closed-by-user') {
      $('tSignInErr').textContent = err.message;
      $('tSignInErr').hidden = false;
    }
  }
};

/* Sign out */
$('btnTDeniedOut').onclick = () => signOut(auth);

/* ================================================================
   Dashboard
   ================================================================ */

async function loadDashboard() {
  try {
    const r = await api('teacherDashboard', { idToken: await idToken() });
    if (!r.ok) return;
    $('dashOpenNum').textContent    = r.openExams   ?? '—';
    $('dashStudentNum').textContent = r.students    ?? '—';
    $('dashTodayNum').textContent   = r.today       ?? '—';

    const list = $('dashRecentList');
    if (!r.recent?.length) { list.textContent = 'No submissions yet today.'; return; }
    list.replaceChildren();
    r.recent.slice(0, 8).forEach(sub => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;gap:10px;padding:4px 0;border-bottom:1px solid var(--edge);';
      const name = document.createElement('span');
      name.textContent = sub.name;
      const meta = document.createElement('span');
      meta.style.cssText = 'color:var(--fg-3);font-size:.8125rem;white-space:nowrap;';
      meta.textContent = sub.exam + '  · ' + (sub.score != null ? sub.score + '/' + sub.total : 'Submitted');
      row.append(name, meta);
      list.append(row);
    });
  } catch (err) {
    console.error('[teacher] dashboard', err);
  }
}

/* ================================================================
   Exams
   ================================================================ */

let _exams = [];

async function loadExams() {
  const wrap = $('examCards');
  wrap.textContent = '…';
  try {
    const r = await api('teacherListExams', { idToken: await idToken() });
    if (!r.ok) { wrap.textContent = r.message || 'Error loading exams.'; return; }
    _exams = r.exams || [];
    renderExamCards(_exams);
    populateResultsPicker(_exams);
  } catch (err) { wrap.textContent = 'Could not load exams.'; console.error(err); }
}

function renderExamCards(exams) {
  const wrap = $('examCards');
  wrap.replaceChildren();
  if (!exams.length) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = 'No exams yet. Use the Sheet menu (📝 Exam ▸ ① Make a new exam) to create one.';
    wrap.append(p); return;
  }
  exams.forEach(ex => {
    const card = document.createElement('div');
    card.className = 'card exam-card liftable';
    card.innerHTML = `
      <div class="exam-card-top">
        <span class="exam-card-code">${esc(ex.code)}</span>
        ${statusChip(ex.status)}
      </div>
      <div class="exam-card-title">${esc(ex.title || ex.code)}</div>
      <div class="exam-card-meta">
        ${ex.questions ?? '—'} question${ex.questions === 1 ? '' : 's'}
        ${ex.subject ? ' · ' + esc(ex.subject) : ''}
        ${ex.opensAt ? ' · Opens ' + esc(ex.opensAt) : ''}
        ${ex.closesAt ? ' · Closes ' + esc(ex.closesAt) : ''}
      </div>
      <div class="exam-card-actions" id="actions-${esc(ex.code)}"></div>`;

    // Status toggle buttons
    const actionRow = card.querySelector('#actions-' + CSS.escape(ex.code));
    const statuses = ['open', 'draft', 'closed'];
    statuses.forEach(st => {
      if (st === ex.status) return;
      const btn = document.createElement('button');
      btn.className = 'btn-sm btn-outline';
      btn.type = 'button';
      btn.textContent = st === 'open' ? '▶ Open' : st === 'draft' ? '✏ Draft' : '■ Close';
      btn.onclick = async (e) => {
        e.stopPropagation();
        await setExamStatus(ex.code, st, card);
      };
      actionRow.append(btn);
    });

    const detailBtn = document.createElement('button');
    detailBtn.className = 'btn-sm btn-outline';
    detailBtn.type = 'button';
    detailBtn.textContent = '📊 Results';
    detailBtn.onclick = (e) => { e.stopPropagation(); openExamDetail(ex); };
    actionRow.append(detailBtn);

    card.addEventListener('click', () => openExamDetail(ex));
    $('examCards').append(card);
  });
}

function statusChip(status) {
  const cls = status === 'open' ? 'chip-open' : status === 'draft' ? 'chip-draft' : 'chip-closed';
  const lbl = status === 'open' ? 'Open' : status === 'draft' ? 'Draft' : 'Closed';
  return `<span class="chip ${cls}">${lbl}</span>`;
}

async function setExamStatus(code, status, card) {
  try {
    const r = await api('teacherSetStatus', { idToken: await idToken(), code, status });
    if (r.ok) await loadExams();
    else alert(r.message || 'Could not update status.');
  } catch (err) { console.error(err); }
}

/* Create new exam modal */
$('btnNewExam').onclick = () => {
  $('newExamModal').hidden = false;
  $('newExamOut').replaceChildren();
  $('newExamCode').value = '';
  $('newExamTitle').value = '';
  $('newExamSubject').value = '';
  $('newExamCode').focus();
};

$('btnCloseNewExam').onclick = $('btnCancelNewExam').onclick = () => {
  $('newExamModal').hidden = true;
};

$('newExamTimerMode').onchange = () => {
  const isWhole = $('newExamTimerMode').value === 'whole-exam';
  $('lblTimerDuration').textContent = isWhole ? 'Minutes for whole exam' : 'Seconds per question';
  $('newExamDuration').value = isWhole ? '30' : '45';
};

$('btnSubmitNewExam').onclick = async () => {
  const code = $('newExamCode').value.trim().toUpperCase();
  if (!code) { alert('Please enter an Exam Code.'); $('newExamCode').focus(); return; }

  const title = $('newExamTitle').value.trim();
  const subject = $('newExamSubject').value.trim().toUpperCase();
  const course = $('newExamCourse').value;
  const year = $('newExamYear').value;
  const timerMode = $('newExamTimerMode').value;
  const duration = parseInt($('newExamDuration').value, 10) || (timerMode === 'whole-exam' ? 30 : 45);
  const tries = $('newExamTries').value;
  const status = $('newExamStatus').value;

  const btn = $('btnSubmitNewExam');
  btn.disabled = true; btn.textContent = 'Creating…';
  $('newExamOut').textContent = '';

  try {
    const payload = {
      idToken: await idToken(),
      code, title, subject, course, year, timerMode,
      defaultTimer: timerMode === 'per-question' ? duration : 45,
      wholeExamMinutes: timerMode === 'whole-exam' ? duration : 30,
      tries, status
    };

    const r = await api('teacherCreateExam', payload);
    if (r.ok) {
      $('newExamModal').hidden = true;
      await loadExams();
      alert(`Exam "${code}" created successfully!`);
    } else {
      $('newExamOut').innerHTML = `<div class="msg bad" style="color:var(--bad);margin-top:6px;font-size:12px;">${esc(r.message || 'Could not create exam.')}</div>`;
    }
  } catch (err) {
    $('newExamOut').innerHTML = `<div class="msg bad" style="color:var(--bad);margin-top:6px;font-size:12px;">Error: ${esc(err.message)}</div>`;
  } finally {
    btn.disabled = false; btn.textContent = 'Create Exam';
  }
};

/* ================================================================
   Exam Detail
   ================================================================ */

async function openExamDetail(ex) {
  $('detailCode').textContent = ex.code + (ex.title ? ' — ' + ex.title : '');
  $('detailStats').innerHTML = `
    <div><p class="eyebrow">Status</p>${statusChip(ex.status)}</div>
    <div><p class="eyebrow">Questions</p><p class="stat-num-sm" id="detailQCount">${ex.questions ?? '—'}</p></div>
    <div><p class="eyebrow">Finished</p><p class="stat-num-sm" id="detailFinished">…</p></div>
    <div><p class="eyebrow">Average</p><p class="stat-num-sm" id="detailAvg">…</p></div>`;

  show('scTExamDetail');
  await loadExamResults(ex.code);
}

$('btnExamBack').onclick = () => { show('scTExams'); };

async function loadExamResults(code) {
  try {
    const r = await api('teacherGetResults', { idToken: await idToken(), code });
    if (!r.ok) { $('detailResultsList').textContent = r.message || 'Could not load results.'; return; }

    if ($('detailFinished')) $('detailFinished').textContent = r.finished ?? '—';
    if ($('detailAvg'))      $('detailAvg').textContent      = r.average  != null ? r.average + '/' + r.total : '—';

    const list = $('detailResultsList');
    if (!r.rows?.length) { list.textContent = 'No submissions yet.'; return; }
    renderResultsTable(list, r.rows, r.total);
  } catch (err) { console.error('[teacher] results', err); }
}

/* ================================================================
   Students
   ================================================================ */

async function loadStudents() {
  const wrap = $('studentTable');
  wrap.textContent = '…';
  try {
    const r = await api('teacherListStudents', { idToken: await idToken() });
    if (!r.ok) { wrap.textContent = r.message || 'Error'; return; }
    renderStudentTable(r.students || []);
    populateStudentFilters(r.students || []);
  } catch (err) { wrap.textContent = 'Could not load students.'; console.error(err); }
}

const DEFAULT_COURSES  = ['BSIT', 'BSED', 'BEED', 'BSHM', 'BSTM', 'BSCRIM'];
const DEFAULT_SECTIONS = Array.from({ length: 20 }, (_, i) => String(i + 1));

function populateStudentFilters(students) {
  const customCourses  = (students || []).map(s => s.course).filter(Boolean);
  const customSections = (students || []).map(s => s.section).filter(Boolean);
  const courses  = [...new Set([...DEFAULT_COURSES, ...customCourses])].sort();
  const sections = [...new Set([...DEFAULT_SECTIONS, ...customSections])].sort((a,b)=>+a-+b);
  const fill = (sel, items) => {
    while (sel.options.length > 1) sel.remove(1);
    items.forEach(v => { const o = new Option(v, v); sel.add(o); });
  };
  fill($('filterCourse'),  courses);
  fill($('filterSection'), sections);
}

function renderStudentTable(students) {
  const course   = $('filterCourse').value;
  const section  = $('filterSection').value;
  const filtered = students.filter(s =>
    (!course  || s.course  === course) &&
    (!section || String(s.section) === section)
  );
  const wrap = $('studentTable');
  wrap.replaceChildren();
  if (!filtered.length) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = 'No students match the filter.';
    wrap.append(p); return;
  }
  filtered.forEach(s => {
    const row = document.createElement('div');
    row.className = 'student-row';
    const name = document.createElement('div');
    name.innerHTML = `<div class="student-name">${esc(s.lastName)}, ${esc(s.firstName)}</div>
      <div class="student-meta">${esc(s.course || '')} ${s.section ? '· Section ' + s.section : ''}</div>`;
    const email = document.createElement('span');
    email.className = 'student-meta';
    email.textContent = s.email || '—';
    row.append(name, email);
    wrap.append(row);
  });
}

$('filterCourse').onchange = $('filterSection').onchange = async () => {
  const r = await api('teacherListStudents', { idToken: await idToken() });
  if (r.ok) renderStudentTable(r.students || []);
};

/* Add students modal */
$('btnAddStudents').onclick = () => {
  populateAddModal();
  $('addStudentsModal').hidden = false;
};
$('btnCloseAdd').onclick    = () => { $('addStudentsModal').hidden = true; $('addOut').replaceChildren(); };

$('btnCheckStudents').onclick = async () => {
  const course  = $('addCourse').value;
  const section = $('addSection').value;
  const paste   = $('addPaste').value.trim();
  if (!course || !section || !paste) { alert('Please fill in Course, Section, and paste the class list.'); return; }
  try {
    const r = await api('teacherCheckStudents', { idToken: await idToken(), course, section, paste });
    if (!r.ok) { $('addOut').textContent = r.message || 'Error'; return; }
    $('addOut').textContent = r.preview || (r.count + ' students ready to add.');
    $('btnDoAdd').disabled = false;
  } catch (err) { $('addOut').textContent = 'Error: ' + err.message; }
};

$('btnDoAdd').onclick = async () => {
  const course  = $('addCourse').value;
  const section = $('addSection').value;
  const paste   = $('addPaste').value.trim();
  try {
    const r = await api('teacherAddStudents', { idToken: await idToken(), course, section, paste });
    if (r.ok) {
      $('addStudentsModal').hidden = true;
      $('addOut').replaceChildren();
      $('btnDoAdd').disabled = true;
      await loadStudents();
      alert((r.added || 0) + ' student(s) added to the Roster.');
    } else { $('addOut').textContent = r.message || 'Error adding students.'; }
  } catch (err) { $('addOut').textContent = 'Error: ' + err.message; }
};

/* Populate course/section dropdowns in the add modal */
function populateAddModal() {
  const courseSel = $('addCourse');
  const sectionSel = $('addSection');
  courseSel.replaceChildren(new Option('Choose course…', ''));
  sectionSel.replaceChildren(new Option('Choose section…', ''));
  DEFAULT_COURSES.forEach(c => courseSel.add(new Option(c, c)));
  DEFAULT_SECTIONS.forEach(s => sectionSel.add(new Option('Section ' + s, s)));
}
populateAddModal();

/* ================================================================
   Results
   ================================================================ */

function populateResultsPicker(exams) {
  const sel = $('resultsExamPicker');
  while (sel.options.length > 1) sel.remove(1);
  exams.forEach(ex => sel.add(new Option(ex.code + (ex.title ? ' — ' + ex.title : ''), ex.code)));
}

function resetResults() {
  $('resultsContent').innerHTML = '<div class="card center solo muted small">Select an exam above to view results.</div>';
}

$('resultsExamPicker').onchange = async function () {
  const code = this.value;
  if (!code) { resetResults(); return; }
  $('resultsContent').innerHTML = '<div class="card center solo"><div class="spinner"></div></div>';
  try {
    const r = await api('teacherGetResults', { idToken: await idToken(), code });
    if (!r.ok) { $('resultsContent').textContent = r.message || 'Error'; return; }
    const wrap = document.createElement('div');
    wrap.className = 'stack';
    // Summary card
    const summary = document.createElement('div');
    summary.className = 'card';
    summary.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:14px;">
      <div><p class="eyebrow">Finished</p><p class="stat-num-sm">${r.finished ?? '—'}</p></div>
      <div><p class="eyebrow">In progress</p><p class="stat-num-sm">${r.inProgress ?? '—'}</p></div>
      <div><p class="eyebrow">Flagged</p><p class="stat-num-sm">${r.flagged ?? '—'}</p></div>
      <div><p class="eyebrow">Average</p><p class="stat-num-sm">${r.average != null ? r.average + '/' + r.total : '—'}</p></div>
    </div>`;
    wrap.append(summary);
    if (r.rows?.length) {
      const tCard = document.createElement('div');
      tCard.className = 'card';
      tCard.innerHTML = '<p class="eyebrow">All submissions</p>';
      const tableWrap = document.createElement('div');
      tableWrap.style.overflowX = 'auto';
      renderResultsTable(tableWrap, r.rows, r.total);
      tCard.append(tableWrap);
      // Export CSV button
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn-sm btn-outline';
      exportBtn.type = 'button';
      exportBtn.textContent = '⬇ Export CSV';
      exportBtn.onclick = () => exportCSV(r.rows, code);
      tCard.append(exportBtn);
      wrap.append(tCard);
    }
    $('resultsContent').replaceChildren(wrap);
  } catch (err) { $('resultsContent').textContent = 'Error: ' + err.message; console.error(err); }
};

function renderResultsTable(wrap, rows, total) {
  const tbl = document.createElement('table');
  tbl.className = 'results-table';
  tbl.innerHTML = `<thead><tr>
    <th>Name</th><th>Score</th><th>Status</th><th>Time (min)</th><th>Notes</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (row.flagged) tr.classList.add('flag-row');
    const statusIcon = row.status === 'done'
      ? (row.flagged ? '🚩' : '✅')
      : row.status === 'in-progress' ? '🔄' : '—';

    tr.innerHTML = `
      <td>${esc(row.name || '—')}</td>
      <td>${row.score != null ? row.score + ' / ' + total : '—'}</td>
      <td>${statusIcon}</td>
      <td>${row.minutes ?? '—'}</td>
      <td style="font-size:.8125rem;max-width:260px;">${row.notes ? esc(row.notes) : ''}</td>`;

    // Expand flag detail if notes contain timestamps
    if (row.flagged && row.notes) {
      const detail = document.createElement('div');
      detail.className = 'flag-detail';
      detail.textContent = row.notes.replace(/; /g, '\n');
      const td = tr.cells[4];
      td.textContent = '';
      td.append(detail);
    }
    tbody.append(tr);
  });
  tbl.append(tbody);
  wrap.append(tbl);
}

function exportCSV(rows, code) {
  const headers = 'Name,Score,Status,Minutes,Notes';
  const lines = rows.map(r => [
    '"' + (r.name || '').replace(/"/g, '""') + '"',
    r.score ?? '',
    r.status,
    r.minutes ?? '',
    '"' + (r.notes || '').replace(/"/g, '""') + '"'
  ].join(','));
  const csv = [headers, ...lines].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = code + '-results.csv';
  a.click();
}

/* ================================================================
   Utilities
   ================================================================ */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
