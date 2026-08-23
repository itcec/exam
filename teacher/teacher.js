/* ================================================================
   teacher.js — Teacher Portal client
   Proctor v2 — teacher management interface.
   All API calls go through the same Apps Script /exec endpoint as
   the student portal. Teacher actions require a valid ID token AND
   an email in the TEACHER_EMAILS Script Property.
   ================================================================ */

import { initializeApp }           from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
         onAuthStateChanged, setPersistence, browserLocalPersistence }
  from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

import { FIREBASE_CONFIG, API_URL, validateConfig } from '../config.js';
import {
  initFx, play, feedback, announce, toast, revealIn, countTo,
  openModal, closeModal, mountSoundToggle
} from '../fx.js';

/* ---- config guard ---- */
(function () {
  const err = validateConfig();
  if (!err) return;
  document.getElementById('scTLoading').hidden = true;
  document.getElementById('scTDenied').hidden = false;
  console.error('[Proctor-teacher] config: ' + err);
  throw new Error(err);
}());

const $ = id => document.getElementById(id);

/* ================================================================
   Theme toggle
   ================================================================ */

const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const activeTheme = () => document.documentElement.dataset.theme || (prefersDark() ? 'dark' : 'light');

function labelTheme() {
  $('btnTheme').setAttribute('aria-label',
    activeTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('exam_theme_v1', t); } catch {}
  labelTheme();
}

$('btnTheme').onclick = () => { feedback('tap', 8); setTheme(activeTheme() === 'dark' ? 'light' : 'dark'); };
labelTheme();

/* The same interaction layer the student portal runs. */
initFx();
mountSoundToggle($('btnTheme'));

/* ================================================================
   Firebase auth
   ================================================================ */

const app  = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
try {
  await setPersistence(auth, browserLocalPersistence);
} catch (e) {
  console.warn('[teacher] persistence error:', e);
}

// Check if user just returned from a redirect sign-in
try {
  await getRedirectResult(auth);
} catch (e) {
  console.warn('[teacher] redirect result note:', e);
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account'
});

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

/**
 * Mirrors app.js: a simple cross-origin POST, retried on a flaky connection
 * but never on a refusal. res.json() was throwing a parse error on the login
 * HTML that comes back when the deployment is not public, which reads to the
 * teacher as a broken portal rather than a deployment setting.
 */
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(action, body = {}, tries = 3) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...body })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        throw Object.assign(
          new Error('The exam server returned a sign-in page instead of data. ' +
                    'Check the Apps Script deployment is set to "Anyone".'),
          { permanent: true });
      }
    } catch (err) {
      lastErr = err;
      if (err.permanent || attempt === tries) break;
      await sleep(Math.min(900 * 2 ** (attempt - 1), 5000));
    }
  }
  throw lastErr;
}

/* ================================================================
   Screen / tab routing
   ================================================================ */

/* ================================================================
   Client Cache & State Management
   ================================================================ */

const CACHE = {
  dashboard: null,
  exams: null,
  students: null,
  options: null,
  results: {},
  timestamp: 0
};

// Try to restore from sessionStorage on load
try {
  const saved = sessionStorage.getItem('teacher_cache_v2');
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed && typeof parsed === 'object') Object.assign(CACHE, parsed);
  }
} catch (e) {}

function saveCache() {
  try {
    sessionStorage.setItem('teacher_cache_v2', JSON.stringify({
      dashboard: CACHE.dashboard,
      exams: CACHE.exams,
      students: CACHE.students,
      options: CACHE.options,
      timestamp: CACHE.timestamp
    }));
  } catch (e) {}
}

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

const SCREEN_NAME = {
  scTSignIn: 'Teacher sign-in', scTDenied: 'Access denied', scTDashboard: 'Dashboard',
  scTExams: 'Exams', scTExamDetail: 'Exam details', scTStudents: 'Students',
  scTResults: 'Results'
};

function show(id) {
  const changed = !$(id) || $(id).hidden;
  SCREENS.forEach(s => { $(s).hidden = s !== id; });

  if (changed) {
    if (SCREEN_NAME[id]) announce(SCREEN_NAME[id]);
    revealIn($(id));
    scrollTo(0, 0);
  }

  const bar = $('tAppBar');
  if (!bar) return;

  if (BAR_HIDDEN.has(id)) { bar.hidden = true; return; }
  bar.hidden = false;

  const tab = SCREEN_TAB[id] || null;
  document.querySelectorAll('.appbar-tab').forEach(btn => {
    if (btn.dataset.tab === tab) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
}

// App bar tab click — renders instantly from CACHE
document.querySelectorAll('#tAppBar .appbar-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    feedback('nav', 8);
    const target = TAB_SCREENS[btn.dataset.tab];
    if (target) showTab(btn.dataset.tab);
  });
});

function showTab(tab) {
  show(TAB_SCREENS[tab]);
  if (tab === 'dashboard') {
    if (CACHE.dashboard) renderDashboard(CACHE.dashboard);
    else loadDashboard();
  } else if (tab === 'exams') {
    if (CACHE.exams) renderExamCards(CACHE.exams);
    else loadExams();
  } else if (tab === 'students') {
    if (CACHE.students) renderStudentTable(CACHE.students);
    else loadStudents();
  } else if (tab === 'results') {
    if (CACHE.exams) populateResultsPicker(CACHE.exams);
    else resetResults();
  }
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
   Auth state & Whole Workbook Snapshot Bootstrap
   ================================================================ */

onAuthStateChanged(auth, async user => {
  if (!user) { show('scTSignIn'); return; }
  $('tLoadingText').textContent = 'Loading workbook data…';
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
    $('topRole').textContent = r.email || user.email;
    if ($('btnSyncAll')) $('btnSyncAll').hidden = false;
    if ($('btnSignOut')) $('btnSignOut').hidden = false;

    // Cache the whole workbook snapshot in memory and sessionStorage
    CACHE.dashboard = r.dashboard;
    CACHE.exams     = r.exams || [];
    CACHE.students  = r.students || [];
    CACHE.options   = r.options || {};
    CACHE.timestamp = r.serverTimestamp || Date.now();
    saveCache();

    // Paint initial screens from cache
    if (CACHE.dashboard) renderDashboard(CACHE.dashboard);
    if (CACHE.exams) { renderExamCards(CACHE.exams); populateResultsPicker(CACHE.exams); }
    if (CACHE.students) { populateStudentFilters(CACHE.students); renderStudentTable(CACHE.students); }

    showTab('dashboard');
  } catch (err) {
    console.error('[teacher] bootstrap error', err);
    show('scTDenied');
  }
});

/* Sign in */
let _signingIn = false;

$('btnTSignIn').onclick = async () => {
  if (_signingIn) return;
  _signingIn = true;
  const b = $('btnTSignIn');
  b.disabled = true;
  $('tSignInErr').hidden = true;

  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.warn('[teacher] sign-in note:', err);
    const code = err?.code || '';
    if (code === 'auth/popup-blocked') {
      $('tSignInErr').textContent = 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.';
      $('tSignInErr').hidden = false;
    } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      $('tSignInErr').textContent = 'Sign-in was cancelled. Tap the button to try again.';
      $('tSignInErr').hidden = false;
    } else if (code === 'auth/unauthorized-domain') {
      $('tSignInErr').textContent = 'This site is not authorised in Firebase. Add this domain in Firebase Authentication Settings.';
      $('tSignInErr').hidden = false;
    } else if (err.message && err.message.includes('INTERNAL ASSERTION FAILED')) {
      try {
        await signInWithRedirect(auth, provider);
        return;
      } catch (redirErr) {
        $('tSignInErr').textContent = 'Sign-in error: ' + redirErr.message;
        $('tSignInErr').hidden = false;
      }
    } else {
      $('tSignInErr').textContent = 'Sign-in failed: ' + (err?.message || code);
      $('tSignInErr').hidden = false;
    }
  } finally {
    _signingIn = false;
    b.disabled = false;
  }
};

/* Sign out. The cache holds a whole class list, so it goes with the session. */
function doSignOut() {
  try { sessionStorage.removeItem('teacher_cache_v2'); } catch {}
  signOut(auth).then(() => location.reload());
}
$('btnTDeniedOut').onclick = doSignOut;
if ($('btnSignOut')) $('btnSignOut').onclick = doSignOut;

/* Global Full Sync Button */
if ($('btnSyncAll')) {
  $('btnSyncAll').onclick = async () => {
    const btn = $('btnSyncAll');
    btn.classList.add('spin-anim');
    try {
      const r = await api('teacherBootstrap', { idToken: await idToken() });
      if (r.ok) {
        CACHE.dashboard = r.dashboard;
        CACHE.exams     = r.exams || [];
        CACHE.students  = r.students || [];
        CACHE.options   = r.options || {};
        CACHE.timestamp = r.serverTimestamp || Date.now();
        saveCache();

        if (CACHE.dashboard) renderDashboard(CACHE.dashboard);
        if (CACHE.exams) { renderExamCards(CACHE.exams); populateResultsPicker(CACHE.exams); }
        if (CACHE.students) { populateStudentFilters(CACHE.students); renderStudentTable(CACHE.students); }
      }
    } catch (e) {
      console.error('[teacher] sync all error', e);
    } finally {
      btn.classList.remove('spin-anim');
    }
  };
}

/* ================================================================
   Dashboard
   ================================================================ */

function renderDashboard(data) {
  if (!data) return;
  // Counting up is the only sign these three numbers were refreshed at all;
  // a re-render to the same value is otherwise completely silent.
  countTo($('dashOpenNum'),    data.openExams);
  countTo($('dashStudentNum'), data.students);
  countTo($('dashTodayNum'),   data.today);

  const list = $('dashRecentList');
  if (!data.recent?.length) { list.textContent = 'No submissions yet today.'; return; }
  list.replaceChildren();
  data.recent.slice(0, 8).forEach(sub => {
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
}

async function loadDashboard() {
  const btn = $('btnRefreshDash');
  if (btn) btn.textContent = '🔄 Loading…';
  try {
    const r = await api('teacherDashboard', { idToken: await idToken() });
    if (!r.ok) return;
    CACHE.dashboard = r;
    saveCache();
    renderDashboard(r);
  } catch (err) {
    console.error('[teacher] dashboard', err);
  } finally {
    if (btn) btn.textContent = '🔄 Refresh';
  }
}
if ($('btnRefreshDash')) $('btnRefreshDash').onclick = loadDashboard;

/* ================================================================
   Exams
   ================================================================ */

async function loadExams() {
  const btn = $('btnRefreshExams');
  if (btn) btn.textContent = '🔄 Loading…';
  try {
    const r = await api('teacherListExams', { idToken: await idToken() });
    if (!r.ok) { return; }
    CACHE.exams = r.exams || [];
    saveCache();
    renderExamCards(CACHE.exams);
    populateResultsPicker(CACHE.exams);
  } catch (err) {
    console.error('[teacher] loadExams', err);
  } finally {
    if (btn) btn.textContent = '🔄 Refresh';
  }
}
if ($('btnRefreshExams')) $('btnRefreshExams').onclick = loadExams;

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
    // A <button>, not a <div>: the whole card opens the exam, so it has to be
    // reachable by Tab and operable by Enter and Space like anything else.
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'card exam-card liftable';
    card.setAttribute('aria-label', 'Open ' + (ex.title || ex.code) + ' results');
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
      <div class="exam-card-actions"></div>`;

    // Held by reference. The old id was built with esc() but read back with
    // CSS.escape(), which disagree, and two exams would collide on it anyway.
    const actionRow = card.querySelector('.exam-card-actions');
    const statuses = ['open', 'draft', 'closed'];
    statuses.forEach(st => {
      if (st === ex.status) return;
      const btn = document.createElement('button');
      btn.className = 'btn-sm btn-outline';
      btn.type = 'button';
      btn.textContent = st === 'open' ? '▶ Open' : st === 'draft' ? '✏ Draft' : '■ Close';
      btn.setAttribute('aria-label',
        (st === 'open' ? 'Open' : st === 'draft' ? 'Move to draft' : 'Close') + ' ' + ex.code);
      btn.onclick = async (e) => {
        e.stopPropagation();
        feedback('tap', 8);
        await setExamStatus(ex.code, st, card);
      };
      actionRow.append(btn);
    });

    const detailBtn = document.createElement('button');
    detailBtn.className = 'btn-sm btn-outline';
    detailBtn.type = 'button';
    detailBtn.textContent = '📊 Results';
    detailBtn.setAttribute('aria-label', 'Results for ' + ex.code);
    detailBtn.onclick = (e) => { e.stopPropagation(); feedback('nav', 8); openExamDetail(ex); };
    actionRow.append(detailBtn);

    card.addEventListener('click', () => { feedback('nav', 8); openExamDetail(ex); });
    wrap.append(card);
  });
  revealIn(wrap);
}

function statusChip(status) {
  const cls = status === 'open' ? 'chip-open' : status === 'draft' ? 'chip-draft' : 'chip-closed';
  const lbl = status === 'open' ? 'Open' : status === 'draft' ? 'Draft' : 'Closed';
  return `<span class="chip ${cls}">${lbl}</span>`;
}

async function setExamStatus(code, status, card) {
  try {
    const r = await api('teacherSetStatus', { idToken: await idToken(), code, status });
    if (r.ok) { await loadExams(); toast(code + ' is now ' + status + '.', 'ok'); return; }
    // Opening runs the same preflight the Sheet menu runs, so a refusal
    // arrives with the actual list of what is wrong. Show it.
    toast([r.message || 'Could not update status.']
      .concat(r.errors?.length ? [''].concat(r.errors.map(e => '• ' + e)) : [])
      .join('\n'), 'bad', 9000);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not reach the exam server.', 'bad');
  }
}

/* Create new exam modal */
$('btnNewExam').onclick = () => {
  $('newExamOut').replaceChildren();
  $('newExamCode').value = '';
  $('newExamTitle').value = '';
  $('newExamSubject').value = '';
  openModal($('newExamModal'), $('newExamCode'));
};

$('btnCloseNewExam').onclick = $('btnCancelNewExam').onclick =
  () => closeModal($('newExamModal'));

$('newExamTimerMode').onchange = () => {
  const isWhole = $('newExamTimerMode').value === 'whole-exam';
  $('lblTimerDuration').textContent = isWhole ? 'Minutes for whole exam' : 'Seconds per question';
  $('newExamDuration').value = isWhole ? '30' : '45';
};

$('btnSubmitNewExam').onclick = async () => {
  const code = $('newExamCode').value.trim().toUpperCase();
  if (!code) { toast('Please enter an exam code.', 'bad'); $('newExamCode').focus(); return; }

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
      closeModal($('newExamModal'));
      await loadExams();
      toast(`Exam "${code}" created. Add its questions from the Sheet menu.`, 'ok', 6000);
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

let _currentDetailExamCode = '';

async function openExamDetail(ex) {
  _currentDetailExamCode = ex.code;
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

if ($('btnRefreshDetail')) {
  $('btnRefreshDetail').onclick = () => {
    if (_currentDetailExamCode) loadExamResults(_currentDetailExamCode);
  };
}

async function loadExamResults(code) {
  const btn = $('btnRefreshDetail');
  if (btn) btn.textContent = '🔄 Loading…';
  try {
    const r = await api('teacherGetResults', { idToken: await idToken(), code });
    if (!r.ok) { $('detailResultsList').textContent = r.message || 'Could not load results.'; return; }

    if ($('detailFinished')) $('detailFinished').textContent = r.finished ?? '—';
    if ($('detailAvg'))      $('detailAvg').textContent      = r.average  != null ? r.average + '/' + r.total : '—';

    const list = $('detailResultsList');
    if (!r.rows?.length) { list.textContent = 'No submissions yet.'; return; }
    renderResultsTable(list, r.rows, r.total);
  } catch (err) {
    console.error('[teacher] results', err);
  } finally {
    if (btn) btn.textContent = '🔄 Refresh';
  }
}

/* ================================================================
   Students
   ================================================================ */

async function loadStudents() {
  const btn = $('btnRefreshStudents');
  if (btn) btn.textContent = '🔄 Loading…';
  try {
    const r = await api('teacherListStudents', { idToken: await idToken() });
    if (!r.ok) { return; }
    CACHE.students = r.students || [];
    saveCache();
    populateStudentFilters(CACHE.students);
    renderStudentTable(CACHE.students);
  } catch (err) {
    console.error('[teacher] loadStudents', err);
  } finally {
    if (btn) btn.textContent = '🔄 Refresh';
  }
}
if ($('btnRefreshStudents')) $('btnRefreshStudents').onclick = loadStudents;

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
  const filtered = (students || []).filter(s =>
    (!course  || s.course  === course) &&
    (!section || String(s.section) === section)
  );
  const wrap = $('studentTable');
  wrap.replaceChildren();
  announce(filtered.length + (filtered.length === 1 ? ' student' : ' students') + ' shown');
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
  revealIn(wrap, '.student-row');
}

// Instant local filtering without network round-trips
$('filterCourse').onchange = $('filterSection').onchange = () => {
  play('tap');
  renderStudentTable(CACHE.students || []);
};

/* Add students modal */
$('btnAddStudents').onclick = () => {
  populateAddModal();
  openModal($('addStudentsModal'), $('addCourse'));
};
$('btnCloseAdd').onclick = () => {
  closeModal($('addStudentsModal'));
  $('addOut').replaceChildren();
};

$('btnCheckStudents').onclick = async () => {
  const course  = $('addCourse').value;
  const section = $('addSection').value;
  const paste   = $('addPaste').value.trim();
  if (!course || !section || !paste) {
    toast('Fill in Course and Section, and paste the class list.', 'bad');
    return;
  }
  try {
    const r = await api('teacherCheckStudents', { idToken: await idToken(), course, section, paste });
    if (!r.ok) { $('addOut').textContent = r.message || 'Error'; return; }

    // The same plan the Sheets dialog shows: what is new, what is already
    // there, and which lines could not be read at all.
    const lines = [r.count + ' new student' + (r.count === 1 ? '' : 's') + ' would be added.'];
    if (r.preview) lines.push('', r.preview);
    if (r.already?.length)  lines.push('', r.already.length + ' already on the list — skipped.');
    if (r.claimed?.length)  lines.push(r.claimed.length + ' already signed in — skipped.');
    if (r.repeated?.length) lines.push(r.repeated.length + ' repeated in your paste — counted once.');
    if (r.problems?.length) {
      lines.push('', r.problems.length + ' line(s) could not be read:');
      r.problems.slice(0, 5).forEach(p => lines.push('  line ' + p.line + ': ' + p.why));
    }

    $('addOut').textContent = lines.join('\n');
    $('addOut').style.whiteSpace = 'pre-line';
    $('btnDoAdd').disabled = !r.count;
  } catch (err) { $('addOut').textContent = 'Error: ' + err.message; }
};

$('btnDoAdd').onclick = async () => {
  const course  = $('addCourse').value;
  const section = $('addSection').value;
  const paste   = $('addPaste').value.trim();
  try {
    const r = await api('teacherAddStudents', { idToken: await idToken(), course, section, paste });
    if (r.ok) {
      closeModal($('addStudentsModal'));
      $('addOut').replaceChildren();
      $('btnDoAdd').disabled = true;
      await loadStudents();
      const n = r.added || 0;
      toast(n + (n === 1 ? ' student' : ' students') + ' added to the Roster.', 'ok');
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

    if (r.rows?.length && r.total > 0) {
      const valid = r.rows.filter(row => row.score != null);
      if (valid.length) {
        const hiCount = valid.filter(row => (row.score / r.total) >= 0.80).length;
        const midCount = valid.filter(row => (row.score / r.total) >= 0.50 && (row.score / r.total) < 0.80).length;
        const lowCount = valid.filter(row => (row.score / r.total) < 0.50).length;
        const totalValid = valid.length;

        const hiPct = Math.round((hiCount / totalValid) * 100);
        const midPct = Math.round((midCount / totalValid) * 100);
        const lowPct = Math.max(0, 100 - hiPct - midPct);

        const spectrum = document.createElement('div');
        spectrum.className = 'spectrum-wrap';
        spectrum.innerHTML = `
          <p class="eyebrow" style="margin-bottom:0;margin-top:12px;">Score Distribution</p>
          <div class="spectrum-bar">
            <div class="spectrum-seg hi" style="width:${hiPct}%;" title="High (>=80%): ${hiCount}"></div>
            <div class="spectrum-seg mid" style="width:${midPct}%;" title="Pass (50-79%): ${midCount}"></div>
            <div class="spectrum-seg low" style="width:${lowPct}%;" title="Review (<50%): ${lowCount}"></div>
          </div>
          <div class="spectrum-legend">
            <span><b style="background:var(--ok);"></b> High (≥80%): ${hiCount}</span>
            <span><b style="background:var(--accent);"></b> Pass (50-79%): ${midCount}</span>
            <span><b style="background:var(--bad);"></b> Review (&lt;50%): ${lowCount}</span>
          </div>
        `;
        summary.append(spectrum);
      }
    }

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

if ($('btnRefreshResults')) {
  $('btnRefreshResults').onclick = () => {
    const code = $('resultsExamPicker').value;
    if (code) $('resultsExamPicker').onchange();
  };
}

function renderResultsTable(wrap, rows, total) {
  const tbl = document.createElement('table');
  tbl.className = 'results-table';
  // scope= is what lets a screen reader read "Score" before each score cell
  // instead of announcing a wall of unlabelled numbers.
  tbl.innerHTML = `<caption>${rows.length} submission${rows.length === 1 ? '' : 's'}</caption>
  <thead><tr>
    <th scope="col">Name</th><th scope="col">Score</th><th scope="col">Status</th>
    <th scope="col">Time (min)</th><th scope="col">Notes</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (row.flagged) tr.classList.add('flag-row');
    // Statuses on the sheet are ok · late · flagged · in-progress · abandoned.
    const statusIcon = row.flagged ? '🚩'
      : row.status === 'in-progress' ? '🔄'
      : row.status === 'late' ? '⏰'
      : row.done ? '✅' : '—';

    const statusWord = row.flagged ? 'Flagged'
      : row.status === 'in-progress' ? 'In progress'
      : row.status === 'late' ? 'Late'
      : row.done ? 'Done' : 'Not started';

    tr.innerHTML = `
      <th scope="row">${esc(row.name || '—')}</th>
      <td>${row.score != null ? row.score + ' / ' + total : '—'}</td>
      <td><span aria-hidden="true">${statusIcon}</span><span class="sr-only">${statusWord}</span></td>
      <td>${row.minutes ?? '—'}</td>
      <td class="notes-cell">${row.notes ? esc(row.notes) : ''}</td>`;

    // The server writes one focus-loss event per line, so keep the breaks.
    if (row.notes) {
      const detail = document.createElement('div');
      detail.className = row.flagged ? 'flag-detail' : '';
      detail.style.whiteSpace = 'pre-line';
      detail.textContent = row.notes;
      const td = tr.cells[4];
      td.textContent = '';
      td.append(detail);
    }
    tbody.append(tr);
  });
  tbl.append(tbody);
  wrap.append(tbl);
}

/**
 * A cell opening with = + - or @ is run as a formula by Excel and Sheets, so
 * a student recorded as "-Ann" or a Notes line starting with = would execute
 * when the file is opened. Prefixing an apostrophe is the standard defusing:
 * spreadsheets treat the rest as text and do not show the quote.
 */
function csvCell(v) {
  let t = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(t)) t = "'" + t;
  return "\"" + t.replace(/"/g, '""') + "\"";
}

function exportCSV(rows, code) {
  const headers = 'Name,Score,Status,Minutes,Notes';
  const lines = rows.map(r =>
    [r.name, r.score, r.status, r.minutes, r.notes].map(csvCell).join(','));
  // A BOM, or Excel reads the accented names in a Filipino roster as mojibake.
  const csv = '\ufeff' + [headers, ...lines].join('\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = code + '-results.csv';
  a.click();
  // Without this the whole file stays in memory until the tab is closed.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Downloaded ' + code + '-results.csv', 'ok');
}

/* ================================================================
   Utilities
   ================================================================ */

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
