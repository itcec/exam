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
import { NeatGradient } from 'https://esm.sh/@firecms/neat';

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
  const lbl = activeTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  if ($('menuTheme')) $('menuTheme').setAttribute('aria-label', lbl);
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('exam_theme_v1', t); } catch {}
  labelTheme();
}

if ($('btnTeacherMenu')) {
  $('btnTeacherMenu').onclick = (e) => {
    e.stopPropagation();
    const drop = $('teacherMenuDropdown');
    const on = drop.hidden;
    drop.hidden = !on;
    $('btnTeacherMenu').setAttribute('aria-expanded', on ? 'true' : 'false');
  };
}
document.addEventListener('click', (e) => {
  if ($('teacherMenuDropdown') && !$('teacherMenuDropdown').hidden) {
    if (!e.target.closest('#menuContainer')) {
      $('teacherMenuDropdown').hidden = true;
      if ($('btnTeacherMenu')) $('btnTeacherMenu').setAttribute('aria-expanded', 'false');
    }
  }
});
if ($('menuSyncAll')) {
  $('menuSyncAll').onclick = () => {
    $('teacherMenuDropdown').hidden = true;
    syncAllData();
  };
}
if ($('menuManageAccess')) {
  $('menuManageAccess').onclick = () => {
    $('teacherMenuDropdown').hidden = true;
    openManageAccessModal();
  };
}
if ($('menuTheme')) {
  $('menuTheme').onclick = () => {
    $('teacherMenuDropdown').hidden = true;
    feedback('tap', 8);
    setTheme(activeTheme() === 'dark' ? 'light' : 'dark');
  };
}
if ($('menuSignOut')) {
  $('menuSignOut').onclick = () => {
    $('teacherMenuDropdown').hidden = true;
    signOut(auth).then(() => location.reload());
  };
}
labelTheme();

/* The same interaction layer the student portal runs. */
initFx();

/* ================================================================
   Neat WebGL Fluid Animated Background
   ================================================================ */

let neatGradientInstance = null;

function initNeatGradient() {
  const canvas = $('neat-gradient');
  if (!canvas) return;

  try {
    const config = {
      colors: [
        { color: '#FFFFFF', enabled: true },
        { color: '#EFE2CE', enabled: true },
        { color: '#D5ECEB', enabled: true },
        { color: '#E4E4E4', enabled: true },
        { color: '#F6FFFF', enabled: true },
      ],
      speed: 2,
      horizontalPressure: 4,
      verticalPressure: 5,
      waveFrequencyX: 4,
      waveFrequencyY: 3,
      waveAmplitude: 2,
      secondaryWaveEnabled: false,
      secondaryWaveFrequencyX: 3,
      secondaryWaveFrequencyY: 3,
      secondaryWaveAmplitude: 5,
      secondaryWaveSpeed: 0.6,
      secondaryWaveAngle: 1,
      shadows: 5,
      highlights: 7,
      colorBrightness: 1,
      colorSaturation: -3,
      wireframe: false,
      antialias: false,
      colorBlending: 7,
      backgroundColor: '#00A2FF',
      backgroundAlpha: 1,
      grainScale: 100,
      grainSparsity: 0,
      grainIntensity: 0.05,
      grainSpeed: 0.3,
      resolution: 0.35,
      yOffset: -0.0714111328125,
      yOffsetWaveMultiplier: 5,
      yOffsetColorMultiplier: 4.5,
      yOffsetFlowMultiplier: 5.5,
      flowDistortionA: 0.4,
      flowDistortionB: 3,
      flowScale: 3.3,
      flowEase: 0.53,
      flowEnabled: true,
      enableProceduralTexture: false,
      transparentTextureVoid: false,
      textureMode: 'bitmap',
      bakeEdgeSoftness: 1,
      textureVoidLikelihood: 0.06,
      textureVoidWidthMin: 10,
      textureVoidWidthMax: 500,
      textureBandDensity: 0.8,
      textureColorBlending: 0.06,
      textureSeed: 333,
      textureEase: 0.48,
      proceduralBackgroundColor: '#003FFF',
      textureShapeTriangles: 20,
      textureShapeCircles: 15,
      textureShapeBars: 15,
      textureShapeSquiggles: 10,
      domainWarpEnabled: true,
      domainWarpIntensity: 0.05,
      domainWarpScale: 0.5,
      vignetteIntensity: 0,
      vignetteRadius: 0.8,
      fresnelEnabled: false,
      fresnelPower: 2,
      fresnelIntensity: 0.5,
      fresnelColor: '#FFFFFF',
      iridescenceEnabled: false,
      iridescenceIntensity: 0.5,
      iridescenceSpeed: 1,
      prismEdgeEnabled: false,
      prismEdgeIntensity: 0.5,
      prismEdgeThinness: 3,
      prismEdgeSpread: 1,
      prismEdgeSpeed: 0.5,
      prismEdgeRipple: 1,
      bloomIntensity: 0,
      bloomThreshold: 0.7,
      chromaticAberration: 0,
      shapeType: 'plane',
      shapeRotationX: 0,
      shapeRotationY: 0,
      shapeRotationZ: 0,
      shapeAutoRotateSpeedX: 0,
      shapeAutoRotateSpeedY: 0,
      sphereRadius: 15,
      torusRadius: 15,
      torusTube: 5,
      cylinderRadius: 10,
      cylinderHeight: 40,
      planeBend: 0,
      planeTwist: 0,
      silhouetteFade: 0.25,
      cylinderFade: 0.08,
      ribbonFade: 0.05,
      flatShading: true,
      cameraLock: true,
      cameraX: 0,
      cameraY: 0,
      cameraZ: 0,
      cameraRotationX: 0,
      cameraRotationY: 0,
      cameraRotationZ: 0,
      cameraZoom: 1,
    };

    neatGradientInstance = new NeatGradient({
      ref: canvas,
      ...config
    });

    window.addEventListener('scroll', () => {
      if (neatGradientInstance) {
        neatGradientInstance.yOffset = window.scrollY * 0.0005;
      }
    }, { passive: true });
  } catch (err) {
    console.warn('[NeatGradient] WebGL initialization failed or not supported:', err);
  }
}

initNeatGradient();

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
    const rolePrefix = r.isAdmin ? '👑 Admin' : 'Teacher';
    $('topRole').textContent = `${rolePrefix} (${r.email || user.email})`;
    $('topRole').title = r.isAdmin ? 'Administrator (Full Access)' : 'Teacher (My Exams & Students)';
    if ($('menuContainer')) $('menuContainer').hidden = false;
    if ($('menuManageAccess')) $('menuManageAccess').hidden = !r.isAdmin;

    // Cache the whole workbook snapshot in memory and sessionStorage
    CACHE.isAdmin   = r.isAdmin || false;
    CACHE.email     = r.email || user.email || '';
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
if ($('menuSignOut')) $('menuSignOut').onclick = doSignOut;

/* Global Full Sync */
async function syncAllData() {
  toast('Syncing workbook data…', 'ok');
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
      toast('All workbook data synchronized!', 'ok');
      play('pop');
    } else {
      toast(r.message || 'Sync failed', 'bad');
    }
  } catch (e) {
    console.error('[teacher] sync all error', e);
    toast(e.message, 'bad');
  }
}
if ($('menuSyncAll')) $('menuSyncAll').onclick = syncAllData;

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
        ${ex.edpCode ? ' · EDP ' + esc(ex.edpCode) : (ex.sections && ex.sections.length ? ' · Sec: ' + esc(ex.sections.join(',')) : '')}
        ${ex.createdBy ? ' · By ' + esc(ex.createdBy) : ''}
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
  if ($('newExamEdp')) $('newExamEdp').value = '';
  $('newExamCourse').value = '';
  $('newExamYear').value = '';
  $('newExamTimerMode').value = 'per-question';
  $('newExamDuration').value = '45';
  $('newExamTries').value = '1';
  $('newExamStatus').value = 'draft';
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
  const edpCode = $('newExamEdp')?.value.trim() || '';
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
      code, title, subject, edpCode, course, year, timerMode,
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
   2-Step Exam Builder Logic (Blueprint + Questions Verification)
   ================================================================ */

const BUILDER_TYPES = [
  { key: 'MC', name: 'Multiple choice' },
  { key: 'TF', name: 'True or false' },
  { key: 'ID', name: 'Identification' },
  { key: 'EN', name: 'Enumeration' },
  { key: 'MA', name: 'Matching' },
  { key: 'WB', name: 'Word bank' }
];

const BUILDER_FORMATS = {
  MC: ['Put choices inside question starting at "a.": a. b. c. d.',
       'The ANSWER is only the letter.',
       'Example: What is an apple? a. red b. circle c. food d. magic | c'],
  TF: ['Statement that is clearly true or clearly false.',
       'The ANSWER is TRUE or FALSE.',
       'Example: Water boils at 100C at sea level. | TRUE'],
  ID: ['Plain question and plain answer.',
       'Separate alternative acceptable answers with a semicolon.',
       'Example: Name the capital of Japan. | Tokyo; Tokyo, Japan'],
  EN: ['Question asking for a list. Put items in the ANSWER separated by semicolons.',
       'Example: Name the four OOP principles. | encapsulation; inheritance; polymorphism; abstraction'],
  MA: ['Give ONLY the pairs, one per line: item = match',
       'Example: Encapsulation = Data hiding'],
  WB: ['First the word bank under heading WORD BANK (one per line).',
       'Then questions using ____ for blank, format: QUESTION | ANSWER',
       'Example: Hiding internal data is called ____. | encapsulation']
};

const BUILDER_LEVELS = {
  easy: ['Direct recall, close to source material. Student answers without complex deduction.'],
  average: ['Concepts phrased in original words. Understanding required, 1 concept per question.'],
  hard: ['Applied scenario, multi-step reasoning, plausible distractors for MC options.']
};

const BUILDER_INPUT_HINT = {
  MC: 'One question per line, answer after a <b>Tab</b> or <code>|</code>.',
  TF: 'One statement per line, answer <b>TRUE</b> or <b>FALSE</b>.',
  ID: 'One question per line. Several acceptable answers? Separate with <code>;</code>',
  EN: 'One question per line. Items in the answer separated by <code>;</code>',
  MA: 'One pair per line, written <code>item = match</code>. Becomes one question.',
  WB: 'Fill in the bank above, then one question per line using <code>____</code> for the blank.'
};

const builderPlan = {};
BUILDER_TYPES.forEach(t => {
  if (t.key === 'MA') {
    builderPlan[t.key] = { on: false, count: 5, mins: 1, secs: 30, level: 'average', order: 'shuffled' };
  } else {
    builderPlan[t.key] = { on: false, count: 10, mins: 0, secs: 45, level: 'average', order: 'shuffled' };
  }
});

function activeBuilderTypes() {
  return BUILDER_TYPES.filter(t => builderPlan[t.key].on);
}

function currentBuilderTimerMode() {
  const sel = $('tExamTimerModeSelect');
  return sel ? sel.value : 'whole-exam';
}

function builderSecondsOf(k) {
  const p = builderPlan[k];
  const t = (parseInt(p.mins, 10) || 0) * 60 + (parseInt(p.secs, 10) || 0);
  return t > 0 ? t : '';
}

function builderClock(k) {
  const t = builderSecondsOf(k);
  if (!t) return 'exam default';
  const m = Math.floor(t / 60), s = t % 60;
  return m ? m + 'm ' + (s ? s + 's' : '') : s + 's';
}

function updateBuilderOrderOptions(mode) {
  const sel = $('tExamOrderSelect');
  const row = $('tExamOrderRow');
  const timerRow = $('tWholeExamTimerRow');
  if (!sel || !row || !timerRow) return;

  const cur = sel.value;
  if (mode === 'whole-exam') {
    timerRow.hidden = false;
    row.hidden = false;
    sel.innerHTML = `
      <option value="shuffled">Shuffled all</option>
      <option value="shuffle-within-type">Shuffled within each type</option>
      <option value="logical">Logical — same order</option>
    `;
    if (cur) sel.value = cur;
  } else if (mode === 'per-section') {
    timerRow.hidden = true;
    row.hidden = true;
  } else if (mode === 'per-question') {
    timerRow.hidden = true;
    row.hidden = false;
    sel.innerHTML = `
      <option value="shuffle-within-type">Shuffled inside section but cinematic to transition after each section</option>
      <option value="shuffled">Shuffled all</option>
      <option value="logical">Order (same order as below)</option>
    `;
    if (cur && ['shuffle-within-type', 'shuffled', 'logical'].includes(cur)) sel.value = cur;
  }
}

function buildBuilderStep1() {
  const host = $('tTypeList');
  if (!host) return;
  host.replaceChildren();
  const mode = currentBuilderTimerMode();
  updateBuilderOrderOptions(mode);

  BUILDER_TYPES.forEach(t => {
    const p = builderPlan[t.key];
    const wrap = document.createElement('div');
    wrap.className = 'type' + (p.on ? ' on' : '');
    const timerSum = mode === 'whole-exam' ? '' : (mode === 'per-section' ? ' · Sec: ' + builderClock(t.key) : ' · ' + builderClock(t.key) + '/q');

    let bodyHtml = '';
    if (mode === 'whole-exam') {
      bodyHtml = `
        <div class="two">
          <div class="fld"><span class="lbl-s">How many questions</span>
            <input class="field" type="number" min="1" max="100" value="${p.count}" data-f="count" data-k="${t.key}"></div>
          <div class="fld"><span class="lbl-s">Difficulty</span>
            <select class="field" data-f="level" data-k="${t.key}">
              <option value="easy">Easy</option>
              <option value="average">Average</option>
              <option value="hard">Hard</option>
            </select></div>
        </div>
      `;
    } else if (mode === 'per-section') {
      bodyHtml = `
        <div class="two" style="margin-bottom:8px;">
          <div class="fld"><span class="lbl-s">Section Mins</span>
            <input class="field" type="number" min="0" max="60" value="${p.mins}" data-f="mins" data-k="${t.key}"></div>
          <div class="fld"><span class="lbl-s">Section Secs</span>
            <input class="field" type="number" min="0" max="59" value="${p.secs}" data-f="secs" data-k="${t.key}"></div>
        </div>
        <div class="two">
          <div class="fld"><span class="lbl-s">How many questions</span>
            <input class="field" type="number" min="1" max="100" value="${p.count}" data-f="count" data-k="${t.key}"></div>
          <div class="fld"><span class="lbl-s">Difficulty</span>
            <select class="field" data-f="level" data-k="${t.key}">
              <option value="easy">Easy</option>
              <option value="average">Average</option>
              <option value="hard">Hard</option>
            </select></div>
        </div>
      `;
    } else {
      bodyHtml = `
        <div class="two" style="margin-bottom:8px;">
          <div class="fld"><span class="lbl-s">Minutes/Q</span>
            <input class="field" type="number" min="0" max="60" value="${p.mins}" data-f="mins" data-k="${t.key}"></div>
          <div class="fld"><span class="lbl-s">Seconds/Q</span>
            <input class="field" type="number" min="0" max="59" value="${p.secs}" data-f="secs" data-k="${t.key}"></div>
        </div>
        <div class="two">
          <div class="fld"><span class="lbl-s">How many questions</span>
            <input class="field" type="number" min="1" max="100" value="${p.count}" data-f="count" data-k="${t.key}"></div>
          <div class="fld"><span class="lbl-s">Difficulty</span>
            <select class="field" data-f="level" data-k="${t.key}">
              <option value="easy">Easy</option>
              <option value="average">Average</option>
              <option value="hard">Hard</option>
            </select></div>
        </div>
      `;
    }

    wrap.innerHTML = `
      <label class="head">
        <input type="checkbox" ${p.on ? 'checked' : ''} data-k="${t.key}">
        <span class="nm">${t.name}</span>
        <span class="sum">${p.on ? p.count + timerSum : 'off'}</span>
      </label>
      <div class="body" ${p.on ? '' : 'hidden'}>
        ${bodyHtml}
      </div>
    `;
    host.appendChild(wrap);

    const selLvl = wrap.querySelector('select[data-f=level]');
    if (selLvl) selLvl.value = p.level;
  });

  refreshBuilderTally();
}

function onBuilderPlanChange(e) {
  const t = e.target;
  const k = t.getAttribute('data-k');
  if (!k) return;

  if (t.type === 'checkbox') {
    builderPlan[k].on = t.checked;
    const box = t.closest('.type');
    if (box) {
      box.classList.toggle('on', t.checked);
      const bdy = box.querySelector('.body');
      if (bdy) bdy.hidden = !t.checked;
    }
  } else {
    const field = t.getAttribute('data-f');
    if (field) builderPlan[k][field] = t.value;
  }

  const checkbox = document.querySelector(`.type input[data-k="${k}"]`);
  if (checkbox) {
    const row = checkbox.closest('.type');
    const mode = currentBuilderTimerMode();
    const timerSum = mode === 'whole-exam' ? '' : (mode === 'per-section' ? ' · Sec: ' + builderClock(k) : ' · ' + builderClock(k) + '/q');
    const sumEl = row ? row.querySelector('.sum') : null;
    if (sumEl) sumEl.textContent = builderPlan[k].on ? builderPlan[k].count + timerSum : 'off';
  }
  refreshBuilderTally();
}

function refreshBuilderTally() {
  const on = activeBuilderTypes();
  const total = on.reduce((n, t) => n + (parseInt(builderPlan[t.key].count, 10) || 0), 0);
  const tallyEl = $('tTally');
  if (tallyEl) {
    tallyEl.innerHTML = on.length
      ? `<b>${total}</b> questions across <b>${on.length}</b> kind${on.length === 1 ? '' : 's'} — ` +
        on.map(t => `${builderPlan[t.key].count} ${t.name.toLowerCase()}`).join(', ')
      : 'No question types switched on yet.';
  }
  if ($('btnTNextStep')) $('btnTNextStep').disabled = !on.length;
}

if ($('tTypeList')) {
  $('tTypeList').addEventListener('change', onBuilderPlanChange);
  $('tTypeList').addEventListener('input', onBuilderPlanChange);
}

if ($('tExamTimerModeSelect')) {
  $('tExamTimerModeSelect').addEventListener('change', () => {
    const mode = currentBuilderTimerMode();
    const hints = {
      'whole-exam': 'Questions will be delivered continuously on one page. Total exam duration is set above.',
      'per-section': 'Questions are delivered section by section. Each section gets its own timer and a dramatic transition screen.',
      'per-question': 'Questions are delivered 1 by 1 with an individual countdown timer per question.'
    };
    if ($('tTimerModeHint')) $('tTimerModeHint').textContent = hints[mode] || '';
    buildBuilderStep1();
  });
}

function buildMasterPrompt() {
  const on = activeBuilderTypes();
  if (!on.length) return '';
  const total = on.reduce((n, t) => n + (parseInt(builderPlan[t.key].count, 10) || 0), 0);

  const out = [
    `You are an expert exam creator. Please generate a complete ${total}-question exam based on the specifications below.`,
    '',
    '==================================================',
    'CONTENT INSTRUCTION:',
    '1. If lesson material / text is attached or pasted at the bottom under "THE CONTENTS ARE:", generate all questions strictly from that content.',
    '2. If NO content is attached and no prior context exists in our conversation, reply by asking:',
    '   "Where is your lesson content, or would you like me to generate the exam based on the material you shared earlier?"',
    '3. Base every question on the source material. Do not invent unverified facts.',
    '==================================================',
    '',
    'EXAM STRUCTURE & FORMAT SPECIFICATIONS:',
    'Produce each section under its labeled delimiter header, ready to be parsed into .txt files:',
    ''
  ];

  on.forEach((t, idx) => {
    const k = t.key;
    const p = builderPlan[k];
    const count = parseInt(p.count, 10) || 10;
    const lvlDesc = (BUILDER_LEVELS[p.level] || BUILDER_LEVELS.average).join(' ');

    out.push(`${idx + 1}. SECTION: ${t.name.toUpperCase()}`);
    out.push(`   - Delimiter Header: === ${t.name.toUpperCase()} ===`);
    out.push(`   - Target Count: exactly ${count} question(s)`);
    out.push(`   - Difficulty: ${p.level.toUpperCase()} (${lvlDesc})`);
    out.push('   - Format Rules:');
    BUILDER_FORMATS[k].forEach(f => { out.push('     * ' + f); });
    out.push('');
  });

  out.push(
    'RULES YOU MUST FOLLOW:',
    '1. Separate each section with its header: === SECTION NAME ===',
    '2. Keep each question on ONE single line. No line breaks inside a question.',
    '3. Do NOT add question numbers (like "1.") at the start of question lines.',
    '4. Separate Question from Answer using a pipe | or Tab.',
    '5. For Multiple Choice, options MUST start at "a." in sequence: a. b. c. d.',
    '6. Output ONLY the raw section headers and questions. No introductory or closing remarks.',
    '',
    '─────────────────────────────',
    'THE CONTENTS ARE:',
    '[PASTE YOUR LESSON OR REVIEW MATERIAL HERE]'
  );

  return out.join('\n');
}

function buildSingleTypePrompt(k) {
  const p = builderPlan[k];
  const tObj = BUILDER_TYPES.find(t => t.key === k);
  const name = tObj ? tObj.name : k;
  const n = parseInt(p.count, 10) || 10;

  const out = [
    'Make an exam from the material at the end of this message.',
    '',
    `QUESTION TYPE:  ${name}`,
    `HOW MANY:       ${n}`,
    `DIFFICULTY:     ${p.level.toUpperCase()}`,
    '',
    'FORMAT:'
  ];
  BUILDER_FORMATS[k].forEach(f => { out.push('  ' + f); });
  out.push(
    '',
    'RULES:',
    '1. Keep each question on ONE line. Do not number rows.',
    '2. Separate question and answer with a TAB or |.',
    '3. If no content is attached, ask: "Where is your lesson content, or would you like me to generate questions based on material provided earlier?"',
    '',
    '─────────────────────────────',
    'THE CONTENTS ARE:'
  );
  return out.join('\n');
}

function copyPromptText(text, btn, okLabel = '✓ Copied!') {
  const done = () => {
    const was = btn.textContent;
    btn.textContent = okLabel;
    setTimeout(() => { btn.textContent = was; }, 2400);
  };
  try {
    navigator.clipboard.writeText(text).then(done, () => {
      const t = document.createElement('textarea');
      t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); done(); } catch {}
      document.body.removeChild(t);
    });
  } catch {
    btn.textContent = 'Select & copy';
  }
}

function extractWordBankFromText(content) {
  if (!content) return { pool: '', questions: '' };
  const text = content.replace(/\r\n/g, '\n').trim();
  const poolWords = [];
  let qLines = [];

  const qHeaderIdx = text.search(/(?:===\s*QUESTIONS\s*===|\[QUESTIONS\]|\bQUESTIONS:?)/i);

  if (qHeaderIdx !== -1) {
    const bankPart = text.slice(0, qHeaderIdx).replace(/(?:===\s*WORD\s*BANK\s*===|\[WORD\s*BANK\]|\bWORD\s*BANK:?|\bBANK:?)/gi, '').trim();
    const qPart = text.slice(qHeaderIdx).replace(/(?:===\s*QUESTIONS\s*===|\[QUESTIONS\]|\bQUESTIONS:?)/gi, '').trim();

    bankPart.split('\n').forEach(line => {
      line = line.replace(/^[-*•\d.)]\s*/, '').trim();
      if (!line) return;
      if (line.includes(',')) line.split(',').forEach(w => { if (w.trim()) poolWords.push(w.trim()); });
      else if (line.includes(';')) line.split(';').forEach(w => { if (w.trim()) poolWords.push(w.trim()); });
      else poolWords.push(line);
    });
    qLines = qPart.split('\n').map(l => l.trim()).filter(Boolean);
  } else {
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    let inBank = false;
    lines.forEach(line => {
      if (/^(?:===\s*WORD\s*BANK\s*===|\[WORD\s*BANK\]|\bWORD\s*BANK:?|\bBANK:?)/i.test(line)) {
        inBank = true;
        const rest = line.replace(/^(?:===\s*WORD\s*BANK\s*===|\[WORD\s*BANK\]|\bWORD\s*BANK:?|\bBANK:?)/i, '').trim();
        if (rest) {
          rest.split(/[,;\n]/).forEach(w => {
            const clean = w.replace(/^[-*•\d.)]\s*/, '').trim();
            if (clean) poolWords.push(clean);
          });
        }
        return;
      }
      if (line.includes('____') || line.includes('|') || line.includes('\t')) {
        inBank = false;
        qLines.push(line);
        const sep = line.includes('\t') ? '\t' : '|';
        const parts = line.split(sep);
        if (parts.length > 1) {
          const ans = parts.slice(1).join(sep).trim();
          if (ans) poolWords.push(ans);
        }
      } else if (inBank) {
        line.split(/[,;]/).forEach(w => {
          const clean = w.replace(/^[-*•\d.)]\s*/, '').trim();
          if (clean) poolWords.push(clean);
        });
      } else {
        if (line.length < 60 && !line.includes('|')) {
          poolWords.push(line.replace(/^[-*•\d.)]\s*/, '').trim());
        }
      }
    });
  }

  const uniquePool = [];
  const seen = {};
  poolWords.forEach(w => {
    const k = w.toLowerCase();
    if (!seen[k] && w) {
      seen[k] = true;
      uniquePool.push(w);
    }
  });

  return {
    pool: uniquePool.join('\n'),
    questions: qLines.join('\n')
  };
}

function autoSplitMasterPaste(raw) {
  if (!raw || !raw.trim()) return 0;
  const text = raw.replace(/\r\n/g, '\n');

  const sectionPatterns = [
    { key: 'MC', pattern: /(?:===\s*(?:MULTIPLE\s*CHOICE|MC)\s*===|\[\s*(?:MULTIPLE\s*CHOICE|MC)\s*\])/i },
    { key: 'TF', pattern: /(?:===\s*(?:TRUE\s*(?:OR|\/)\s*FALSE|TF)\s*===|\[\s*(?:TRUE\s*(?:OR|\/)\s*FALSE|TF)\s*\])/i },
    { key: 'ID', pattern: /(?:===\s*(?:IDENTIFICATION|ID)\s*===|\[\s*(?:IDENTIFICATION|ID)\s*\])/i },
    { key: 'EN', pattern: /(?:===\s*(?:ENUMERATION|EN)\s*===|\[\s*(?:ENUMERATION|EN)\s*\])/i },
    { key: 'MA', pattern: /(?:===\s*(?:MATCHING|MA)\s*===|\[\s*(?:MATCHING|MA)\s*\])/i },
    { key: 'WB', pattern: /(?:===\s*(?:WORD\s*BANK|WB)\s*===|\[\s*(?:WORD\s*BANK|WB)\s*\])/i }
  ];

  const matches = [];
  sectionPatterns.forEach(sp => {
    const regex = new RegExp(sp.pattern.source, 'gi');
    let m;
    while ((m = regex.exec(text)) !== null) {
      matches.push({ key: sp.key, index: m.index, length: m[0].length });
    }
  });

  matches.sort((a, b) => a.index - b.index);

  if (!matches.length) {
    const on = activeBuilderTypes();
    if (on.length === 1) {
      const singleKey = on[0].key;
      const clean = text.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
      if (singleKey === 'WB') {
        const wb = extractWordBankFromText(clean);
        const poolEl = $('tPool_' + singleKey);
        const srcEl = $('tSrc_' + singleKey);
        if (poolEl) poolEl.value = wb.pool;
        if (srcEl) srcEl.value = wb.questions || clean;
      } else {
        if ($('tSrc_' + singleKey)) $('tSrc_' + singleKey).value = clean;
      }
      return 1;
    }
    return 0;
  }

  matches.forEach((m, i) => {
    const start = m.index + m.length;
    const end = (i + 1 < matches.length) ? matches[i + 1].index : text.length;
    let content = text.slice(start, end).trim();
    content = content.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();

    if (m.key === 'WB') {
      const wb = extractWordBankFromText(content);
      const poolEl = $('tPool_' + m.key);
      const srcEl = $('tSrc_' + m.key);
      if (poolEl) poolEl.value = wb.pool;
      if (srcEl) srcEl.value = wb.questions || content;
    } else {
      const field = $('tSrc_' + m.key);
      if (field) field.value = content;
    }
  });

  return matches.length;
}

function buildBuilderStep2() {
  const mode = currentBuilderTimerMode();
  if ($('tWholeExamTimerCard')) {
    $('tWholeExamTimerCard').hidden = (mode !== 'whole-exam');
  }

  const mp = buildMasterPrompt();
  if ($('tMasterPromptPreview')) $('tMasterPromptPreview').textContent = mp;
  if ($('btnTCopyMaster')) {
    $('btnTCopyMaster').onclick = () => copyPromptText(mp, $('btnTCopyMaster'), '✓ Copied Master Prompt!');
  }

  if ($('btnTAutoSplit')) {
    $('btnTAutoSplit').onclick = () => {
      const raw = $('tMasterPasteInput') ? $('tMasterPasteInput').value : '';
      const count = autoSplitMasterPaste(raw);
      const msg = $('tAutoSplitMsg');
      if (msg) {
        if (count > 0) {
          msg.innerHTML = `<div class="msg ok" style="padding:6px 10px; border-radius:6px; background:var(--ok-soft); color:var(--ok); font-size:0.75rem;">✓ Distributed into ${count} question section(s). Check sections below.</div>`;
          activeBuilderTypes().forEach(t => {
            const btn = document.querySelector(`[data-check="${t.key}"]`);
            if (btn && $('tSrc_' + t.key) && $('tSrc_' + t.key).value.trim()) {
              checkBuilderSection(t.key, btn);
            }
          });
        } else {
          msg.innerHTML = `<div class="msg warn" style="padding:6px 10px; border-radius:6px; background:var(--warn-soft); color:var(--warn); font-size:0.75rem;">No section headers (=== SECTION ===) found. You can paste directly into each box below.</div>`;
        }
      }
    };
  }

  const host = $('tPanels');
  if (!host) return;
  host.replaceChildren();

  activeBuilderTypes().forEach(t => {
    const k = t.key, p = builderPlan[k];
    const pan = document.createElement('div');
    pan.className = 'panel';
    pan.id = 'tPan_' + k;

    const timerInfo = mode === 'per-section' ? ` (${builderClock(k)} section timer)` : '';
    const wbFieldHtml = (k === 'WB')
      ? `<div class="fld" style="margin-bottom:8px;">
          <span class="lbl-s">Word bank pool (one per line, or comma-separated)</span>
          <textarea class="field mono" id="tPool_WB" rows="3" placeholder="word1&#10;word2&#10;word3"></textarea>
        </div>`
      : '';

    pan.innerHTML = `
      <div class="head">
        <span class="nm">${t.name}${timerInfo}</span>
        <span class="badge" id="tBadge_${k}" style="background:var(--glass-hi); border:1px solid var(--edge); padding:2px 8px; border-radius:999px; font-size:0.6875rem;">0 of ${p.count}</span>
        <button class="btn btn-ghost btn-sm mini" type="button" data-prompt="${k}">📋 Prompt</button>
      </div>
      <div class="body">
        <p class="muted small" style="margin-bottom:6px;">${BUILDER_INPUT_HINT[k] || ''}</p>
        ${wbFieldHtml}
        <textarea class="field mono" id="tSrc_${k}" rows="5" placeholder="Paste questions here..."></textarea>
        <div class="actions" style="margin-top:8px;">
          <button class="btn btn-outline btn-sm" type="button" data-check="${k}">🔍 Check syntax</button>
        </div>
        <div id="tOut_${k}" style="margin-top:6px;"></div>
      </div>
    `;

    host.appendChild(pan);

    const btnPrompt = pan.querySelector(`[data-prompt="${k}"]`);
    if (btnPrompt) {
      btnPrompt.onclick = () => copyPromptText(buildSingleTypePrompt(k), btnPrompt, '✓ Copied!');
    }

    const btnCheck = pan.querySelector(`[data-check="${k}"]`);
    if (btnCheck) {
      btnCheck.onclick = () => checkBuilderSection(k, btnCheck);
    }
  });

  updateTotalAddButton();
}

function checkBuilderSection(k, btn) {
  const field = $('tSrc_' + k);
  if (!field) return;
  const raw = field.value.trim();
  const out = $('tOut_' + k);
  const badge = $('tBadge_' + k);
  const pan = $('tPan_' + k);
  const target = parseInt(builderPlan[k].count, 10) || 10;

  if (!raw) {
    if (out) out.replaceChildren();
    if (badge) badge.textContent = `0 of ${target}`;
    if (pan) pan.classList.remove('done');
    updateTotalAddButton();
    return;
  }

  // Count lines / pairs
  const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
  let count = lines.length;
  if (k === 'MA') count = 1; // 1 matching set

  if (badge) badge.textContent = `${count} of ${target}`;
  if (pan) pan.classList.toggle('done', count >= 1);
  if (out) {
    out.innerHTML = `<div class="msg ok" style="padding:6px 10px; border-radius:6px; background:var(--ok-soft); color:var(--ok); font-size:0.75rem;">✓ ${count} question(s) parsed and ready.</div>`;
  }
  updateTotalAddButton();
}

function collectAllBuilderQuestions() {
  const parts = [];
  const mode = currentBuilderTimerMode();

  activeBuilderTypes().forEach(t => {
    const k = t.key;
    const field = $('tSrc_' + k);
    if (!field) return;
    const text = field.value.trim();
    if (!text) return;

    if (k === 'WB') {
      const pool = $('tPool_WB') ? $('tPool_WB').value.trim() : '';
      if (pool) parts.push(`=== WORD BANK ===\n${pool}`);
      parts.push(`=== QUESTIONS ===\n${text}`);
    } else {
      parts.push(`=== ${t.name.toUpperCase()} ===\n${text}`);
    }
  });

  return parts.join('\n\n');
}

function updateTotalAddButton() {
  const on = activeBuilderTypes();
  const hasAny = on.some(t => {
    const f = $('tSrc_' + t.key);
    return f && f.value.trim().length > 0;
  });
  if ($('btnTAddAll')) $('btnTAddAll').disabled = !hasAny;
}

/* Step 1 -> Step 2 Navigation */
if ($('btnTNextStep')) {
  $('btnTNextStep').onclick = () => {
    $('tStep1').hidden = true;
    $('tStep2').hidden = false;
    if ($('tCr1')) { $('tCr1').classList.remove('on'); $('tCr1').classList.add('done'); }
    if ($('tCr2')) $('tCr2').classList.add('on');
    buildBuilderStep2();
  };
}

if ($('btnTBackStep')) {
  $('btnTBackStep').onclick = () => {
    $('tStep2').hidden = true;
    $('tStep1').hidden = false;
    if ($('tCr2')) $('tCr2').classList.remove('on');
    if ($('tCr1')) { $('tCr1').classList.remove('done'); $('tCr1').classList.add('on'); }
  };
}

if ($('tCr1')) {
  $('tCr1').onclick = () => {
    if (!$('tStep2').hidden) {
      $('tStep2').hidden = true;
      $('tStep1').hidden = false;
      if ($('tCr2')) $('tCr2').classList.remove('on');
      if ($('tCr1')) { $('tCr1').classList.remove('done'); $('tCr1').classList.add('on'); }
    }
  };
}

/* Open/Close Add Questions Modal */
if ($('btnOpenAddQuestions')) {
  $('btnOpenAddQuestions').onclick = () => {
    if (!_currentDetailExamCode) return;
    $('addQModalTitle').textContent = `Exam builder (${_currentDetailExamCode})`;
    $('tStep1').hidden = false;
    $('tStep2').hidden = true;
    if ($('tCr1')) { $('tCr1').classList.remove('done'); $('tCr1').classList.add('on'); }
    if ($('tCr2')) $('tCr2').classList.remove('on');
    buildBuilderStep1();
    openModal($('addQuestionsModal'), $('tExamTimerModeSelect'));
  };
}

if ($('btnCloseAddQuestions')) {
  $('btnCloseAddQuestions').onclick = () => closeModal($('addQuestionsModal'));
}

/* Submit Questions */
if ($('tWholeExamMins')) {
  $('tWholeExamMins').addEventListener('input', () => {
    if ($('tWholeExamMinsInput')) $('tWholeExamMinsInput').value = $('tWholeExamMins').value;
  });
}
if ($('tWholeExamMinsInput')) {
  $('tWholeExamMinsInput').addEventListener('input', () => {
    if ($('tWholeExamMins')) $('tWholeExamMins').value = $('tWholeExamMinsInput').value;
  });
}

if ($('btnTAddAll')) {
  $('btnTAddAll').onclick = async () => {
    const paste = collectAllBuilderQuestions();
    const mode = $('tAddQMode') ? $('tAddQMode').value : 'append';
    const timerMode = currentBuilderTimerMode();
    const wholeMins = ($('tWholeExamMins') && parseInt($('tWholeExamMins').value, 10)) ||
                      ($('tWholeExamMinsInput') && parseInt($('tWholeExamMinsInput').value, 10)) || 30;
    const orderVal = $('tExamOrderSelect') ? $('tExamOrderSelect').value : 'shuffled';

    const btn = $('btnTAddAll');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const r = await api('teacherAddQuestions', {
        idToken: await idToken(),
        code: _currentDetailExamCode,
        paste,
        mode,
        timerMode,
        wholeExamMins: wholeMins,
        order: orderVal
      });
      if (!r.ok) { toast(r.message || 'Import failed', 'bad'); return; }
      closeModal($('addQuestionsModal'));
      toast(`Successfully imported ${r.added} question(s) into ${_currentDetailExamCode}!`, 'ok');
      play('submit');
      if ($('detailQCount')) $('detailQCount').textContent = r.total;
      if (CACHE.exams) {
        const ex = CACHE.exams.find(e => e.code === _currentDetailExamCode);
        if (ex) ex.questions = r.total;
        saveCache();
      }
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      btn.disabled = false; btn.textContent = 'Add to exam';
    }
  };
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
  const customEdps     = (students || []).flatMap(s => String(s.edpCode || '').split(/[,;/]+/).map(x => x.trim()).filter(Boolean));
  const courses  = [...new Set([...DEFAULT_COURSES, ...customCourses])].sort();
  const sections = [...new Set([...DEFAULT_SECTIONS, ...customSections])].sort((a,b)=>+a-+b);
  const edps     = [...new Set(customEdps)].sort();
  const fill = (sel, items) => {
    if (!sel) return;
    while (sel.options.length > 1) sel.remove(1);
    items.forEach(v => { const o = new Option(v, v); sel.add(o); });
  };
  fill($('filterCourse'),  courses);
  fill($('filterSection'), sections);
  fill($('filterEdp'),     edps);
}

function renderStudentTable(students) {
  const course   = $('filterCourse')?.value || '';
  const section  = $('filterSection')?.value || '';
  const edp      = $('filterEdp')?.value || '';
  const filtered = (students || []).filter(s =>
    (!course  || s.course  === course) &&
    (!section || String(s.section) === section) &&
    (!edp     || String(s.edpCode || '').split(/[,;/]+/).map(x => x.trim()).includes(edp))
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
    row.className = 'student-card';

    const info = document.createElement('div');
    info.className = 'student-info';
    info.innerHTML = `
      <div class="student-name">${esc(s.lastName)}, ${esc(s.firstName)}</div>
      <div class="student-meta">${esc(s.course || '')} ${s.section ? '· Section ' + s.section : ''} ${s.edpCode ? '· EDP ' + esc(s.edpCode) : ''} ${s.year ? '· ' + s.year : ''}</div>
      <div class="student-email ${s.email ? 'linked' : ''}">${s.email ? '📧 ' + esc(s.email) : '⚪ Unclaimed (No Google account linked)'}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'student-actions';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-tbl-action';
    btnEdit.innerHTML = '✏️ Edit';
    btnEdit.onclick = () => openEditStudent(s);
    actions.append(btnEdit);

    if (s.email) {
      const btnUnlink = document.createElement('button');
      btnUnlink.type = 'button';
      btnUnlink.className = 'btn-tbl-action unlink';
      btnUnlink.innerHTML = '🔓 Unlink';
      btnUnlink.onclick = () => openUnlinkStudent(s);
      actions.append(btnUnlink);
    }

    row.append(info, actions);
    wrap.append(row);
  });
  revealIn(wrap, '.student-card');
}

/* Edit & Unlink Student Handlers */
function openEditStudent(s) {
  $('editStudentRow').value = s.row;
  $('editStudentLast').value = s.lastName || '';
  $('editStudentFirst').value = s.firstName || '';
  $('editStudentCourse').value = s.course || '';
  $('editStudentSection').value = s.section || '';
  if ($('editStudentEdp')) $('editStudentEdp').value = s.edpCode || '';
  $('editStudentYear').value = s.year || '';
  $('editStudentEmail').value = s.email || '';
  $('editStudentOut').replaceChildren();
  openModal($('editStudentModal'), $('editStudentLast'));
}

if ($('btnCloseEditStudent')) $('btnCloseEditStudent').onclick = () => closeModal($('editStudentModal'));
if ($('btnCancelEditStudent')) $('btnCancelEditStudent').onclick = () => closeModal($('editStudentModal'));

if ($('btnSaveEditStudent')) {
  $('btnSaveEditStudent').onclick = async () => {
    const row = $('editStudentRow').value;
    const details = {
      lastName: $('editStudentLast').value.trim(),
      firstName: $('editStudentFirst').value.trim(),
      course: $('editStudentCourse').value.trim(),
      section: $('editStudentSection').value.trim(),
      edpCode: $('editStudentEdp')?.value.trim() || '',
      year: $('editStudentYear').value.trim(),
      email: $('editStudentEmail').value.trim()
    };
    if (!details.lastName || !details.firstName || !details.course || !details.section) {
      $('editStudentOut').innerHTML = '<p class="err small">Last name, first name, course, and section are required.</p>';
      return;
    }
    const btn = $('btnSaveEditStudent');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await api('teacherEditStudent', { idToken: await idToken(), row, details });
      if (!r.ok) { $('editStudentOut').innerHTML = `<p class="err small">${esc(r.message || 'Save failed')}</p>`; return; }
      closeModal($('editStudentModal'));
      toast('Student details updated successfully!', 'ok');
      play('pop');
      if (CACHE.students) {
        const target = CACHE.students.find(st => String(st.row) === String(row));
        if (target) Object.assign(target, details);
        saveCache();
        renderStudentTable(CACHE.students);
      }
    } catch (err) {
      $('editStudentOut').innerHTML = `<p class="err small">${esc(err.message)}</p>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Save Changes';
    }
  };
}

function openUnlinkStudent(s) {
  $('unlinkStudentRow').value = s.row;
  $('unlinkModalText').innerHTML = `Are you sure you want to unlink <b>${esc(s.firstName)} ${esc(s.lastName)}</b>'s Google account (<code>${esc(s.email)}</code>)?<br><br>The student will be able to claim their name again using another account.`;
  openModal($('unlinkStudentModal'), $('btnCancelUnlinkStudent'));
}

if ($('btnCloseUnlinkStudent')) $('btnCloseUnlinkStudent').onclick = () => closeModal($('unlinkStudentModal'));
if ($('btnCancelUnlinkStudent')) $('btnCancelUnlinkStudent').onclick = () => closeModal($('unlinkStudentModal'));

if ($('btnConfirmUnlinkStudent')) {
  $('btnConfirmUnlinkStudent').onclick = async () => {
    const row = $('unlinkStudentRow').value;
    const btn = $('btnConfirmUnlinkStudent');
    btn.disabled = true; btn.textContent = 'Unlinking…';
    try {
      const r = await api('teacherUnlinkStudent', { idToken: await idToken(), row });
      if (!r.ok) { toast(r.message || 'Unlink failed', 'bad'); return; }
      closeModal($('unlinkStudentModal'));
      toast('Student account unlinked successfully.', 'ok');
      play('pop');
      if (CACHE.students) {
        const target = CACHE.students.find(st => String(st.row) === String(row));
        if (target) target.email = '';
        saveCache();
        renderStudentTable(CACHE.students);
      }
    } catch (err) {
      toast(err.message, 'bad');
    } finally {
      btn.disabled = false; btn.textContent = 'Unlink Email';
    }
  };
}

// Instant local filtering without network round-trips
$('filterCourse').onchange = $('filterSection').onchange = () => {
  play('tap');
  renderStudentTable(CACHE.students || []);
};
if ($('filterEdp')) {
  $('filterEdp').onchange = () => {
    play('tap');
    renderStudentTable(CACHE.students || []);
  };
}

/* Add students modal */
$('btnAddStudents').onclick = () => {
  populateAddModal();
  if ($('addEdp')) $('addEdp').value = '';
  openModal($('addStudentsModal'), $('addCourse'));
};
$('btnCloseAdd').onclick = () => {
  closeModal($('addStudentsModal'));
  $('addOut').replaceChildren();
};

$('btnCheckStudents').onclick = async () => {
  const course  = $('addCourse').value;
  const section = $('addSection').value;
  const edpCode = $('addEdp')?.value.trim() || '';
  const paste   = $('addPaste').value.trim();
  if (!course || !section || !paste) {
    toast('Fill in Course and Section, and paste the class list.', 'bad');
    return;
  }
  try {
    const r = await api('teacherCheckStudents', { idToken: await idToken(), course, section, edpCode, paste });
    if (!r.ok) { $('addOut').textContent = r.message || 'Error'; return; }

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
  const edpCode = $('addEdp')?.value.trim() || '';
  const paste   = $('addPaste').value.trim();
  try {
    const r = await api('teacherAddStudents', { idToken: await idToken(), course, section, edpCode, paste });
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
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

/* ================================================================
   Teacher Portal Access & Roles Modal (Admin Only)
   ================================================================ */

let _accessEmails = [];

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(e || '').trim());
}

async function openManageAccessModal() {
  if (!CACHE.isAdmin) {
    toast('Only administrators can manage portal access.', 'bad');
    return;
  }
  _accessEmails = [];
  openModal($('manageAccessModal'), $('btnAddAccessEmail'));
  if ($('tAccessMsg')) $('tAccessMsg').innerHTML = '';
  if ($('tAccessList')) $('tAccessList').innerHTML = '<p class="muted small center" style="padding:12px;">Loading access list…</p>';

  try {
    const r = await api('teacherListAccounts', { idToken: await idToken() });
    if (!r.ok) {
      if ($('tAccessMsg')) $('tAccessMsg').innerHTML = `<div class="msg bad">${esc(r.message)}</div>`;
      return;
    }
    _accessEmails = Array.isArray(r.accounts) ? r.accounts.slice() : [];
    renderAccessList();
  } catch (err) {
    if ($('tAccessMsg')) $('tAccessMsg').innerHTML = `<div class="msg bad">${esc(err.message || err)}</div>`;
  }
}

function updateAccessTally() {
  const valid = _accessEmails.filter(e => e.trim().length > 0);
  if ($('tAccessTotalChip')) {
    $('tAccessTotalChip').innerHTML = `Configured: <b>${valid.length}</b>`;
  }
  if ($('tAccessAdminChip') && $('tAccessAdminEmail')) {
    if (valid.length > 0) {
      $('tAccessAdminChip').hidden = false;
      $('tAccessAdminEmail').textContent = valid[0];
    } else {
      $('tAccessAdminChip').hidden = true;
    }
  }
}

function renderAccessList() {
  const container = $('tAccessList');
  if (!container) return;
  container.innerHTML = '';

  if (_accessEmails.length === 0) {
    container.innerHTML = `
      <div style="padding:16px;text-align:center;border:1px dashed var(--edge);border-radius:6px;background:var(--glass);">
        <p class="muted small" style="margin:0 0 4px;"><b>No accounts configured yet</b></p>
        <p class="muted small" style="margin:0;font-size:0.75rem;">Click <b>+ Add Teacher Email</b> or use <b>Bulk Add</b> to grant access.</p>
      </div>`;
    updateAccessTally();
    return;
  }

  _accessEmails.forEach((email, index) => {
    const isAdmin = (index === 0);
    const row = document.createElement('div');
    row.className = 'account-row' + (isAdmin ? ' is-admin' : '');

    const roleTagHtml = isAdmin
      ? '<span class="role-tag admin" title="System Administrator">👑 Admin</span>'
      : '<span class="role-tag teacher" title="Teacher (Own exams & students)">👨‍🏫 Teacher</span>';

    let actionsHtml = '';
    if (!isAdmin) {
      actionsHtml += `<button type="button" class="btn-make-admin" data-action="make-admin" data-index="${index}" title="Promote to Administrator">👑 Make Admin</button>`;
    }
    if (index > 1) {
      actionsHtml += `<button type="button" class="btn-sm btn-ghost" data-action="move-up" data-index="${index}" title="Move Up" style="padding:2px 6px;font-size:10px;">▲</button>`;
    }
    actionsHtml += `<button type="button" class="btn-sm btn-ghost" data-action="delete" data-index="${index}" title="Remove account" style="color:var(--bad);padding:2px 6px;font-size:11px;">✕</button>`;

    row.innerHTML = `
      <div class="role-indicator">${roleTagHtml}</div>
      <div class="email-input-wrapper">
        <input type="email" class="field mono ${email && !isValidEmail(email) ? 'invalid' : ''}" value="${esc(email)}" placeholder="e.g. ${isAdmin ? 'admin@school.edu' : 'teacher@school.edu'}" data-index="${index}" style="font-size:12px;padding:5px 8px;inline-size:100%;" spellcheck="false">
      </div>
      <div style="display:flex;align-items:center;gap:4px;flex-shrink:0;">${actionsHtml}</div>`;

    container.appendChild(row);
  });

  updateAccessTally();
}

if ($('tAccessList')) {
  $('tAccessList').addEventListener('input', (e) => {
    if (e.target && e.target.tagName === 'INPUT') {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().toLowerCase();
      _accessEmails[idx] = val;
      if (val && !isValidEmail(val)) {
        e.target.classList.add('invalid');
      } else {
        e.target.classList.remove('invalid');
      }
      updateAccessTally();
    }
  });

  $('tAccessList').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const index = parseInt(btn.getAttribute('data-index'), 10);

    if (action === 'make-admin') {
      const target = _accessEmails.splice(index, 1)[0];
      _accessEmails.unshift(target);
      renderAccessList();
      toast(`👑 ${target || 'Account'} is now designated as Administrator.`, 'ok');
    } else if (action === 'delete') {
      _accessEmails.splice(index, 1);
      renderAccessList();
    } else if (action === 'move-up') {
      if (index > 1) {
        const tmp = _accessEmails[index - 1];
        _accessEmails[index - 1] = _accessEmails[index];
        _accessEmails[index] = tmp;
        renderAccessList();
      }
    }
  });
}

if ($('btnAddAccessEmail')) {
  $('btnAddAccessEmail').onclick = () => {
    _accessEmails.push('');
    renderAccessList();
    const inputs = $('tAccessList').querySelectorAll('input[type="email"]');
    if (inputs.length > 0) inputs[inputs.length - 1].focus();
  };
}

if ($('btnApplyAccessBulk')) {
  $('btnApplyAccessBulk').onclick = () => {
    const raw = $('tAccessBulkInput').value;
    if (!raw.trim()) return;

    const parsed = raw.split(/[\n,;]+/)
      .map(s => s.trim().toLowerCase())
      .filter(s => s.length > 0);

    if (!parsed.length) return;

    let addedCount = 0;
    parsed.forEach(e => {
      if (_accessEmails.indexOf(e) === -1) {
        _accessEmails.push(e);
        addedCount++;
      }
    });

    $('tAccessBulkInput').value = '';
    if ($('tAccessBulkBox')) $('tAccessBulkBox').open = false;
    renderAccessList();
    toast(`Added ${addedCount} new email(s).`, 'ok');
  };
}

if ($('btnClearAllAccess')) {
  $('btnClearAllAccess').onclick = () => {
    if (_accessEmails.length === 0) return;
    if (confirm('Are you sure you want to clear all accounts?\n\nThis will lock the Teacher Portal for everyone.')) {
      _accessEmails = [];
      renderAccessList();
      toast('Cleared all accounts. Click Save to apply.', 'warn');
    }
  };
}

if ($('btnCloseManageAccess')) $('btnCloseManageAccess').onclick = () => closeModal($('manageAccessModal'));
if ($('btnCancelManageAccess')) $('btnCancelManageAccess').onclick = () => closeModal($('manageAccessModal'));

if ($('btnSaveManageAccess')) {
  $('btnSaveManageAccess').onclick = async () => {
    const cleanList = [];
    const seen = {};

    for (let i = 0; i < _accessEmails.length; i++) {
      const em = _accessEmails[i].trim().toLowerCase();
      if (!em) continue;

      if (!isValidEmail(em)) {
        if ($('tAccessMsg')) $('tAccessMsg').innerHTML = `<div class="msg bad">Invalid email format: "<b>${esc(em)}</b>".</div>`;
        return;
      }
      if (seen[em]) {
        if ($('tAccessMsg')) $('tAccessMsg').innerHTML = `<div class="msg bad">Duplicate email found: "<b>${esc(em)}</b>".</div>`;
        return;
      }
      seen[em] = true;
      cleanList.push(em);
    }

    $('btnSaveManageAccess').disabled = true;
    $('btnSaveManageAccess').textContent = 'Saving…';
    if ($('tAccessMsg')) $('tAccessMsg').innerHTML = '<p class="muted small">Saving settings…</p>';

    try {
      const r = await api('teacherSaveAccounts', {
        idToken: await idToken(),
        accounts: cleanList
      });

      $('btnSaveManageAccess').disabled = false;
      $('btnSaveManageAccess').textContent = 'Save Access Settings';

      if (!r.ok) {
        if ($('tAccessMsg')) $('tAccessMsg').innerHTML = `<div class="msg bad">${esc(r.message)}</div>`;
        return;
      }

      _accessEmails = Array.isArray(r.accounts) ? r.accounts.slice() : cleanList;
      renderAccessList();
      toast('✓ Teacher access settings saved!', 'ok');
      closeModal($('manageAccessModal'));
    } catch (err) {
      $('btnSaveManageAccess').disabled = false;
      $('btnSaveManageAccess').textContent = 'Save Access Settings';
      if ($('tAccessMsg')) $('tAccessMsg').innerHTML = `<div class="msg bad">${esc(err.message || err)}</div>`;
    }
  };
}
