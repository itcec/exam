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
let NeatGradient = null;

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
  if ($('btnTTheme')) {
    $('btnTTheme').setAttribute('aria-label', lbl);
    $('btnTTheme').textContent = activeTheme() === 'dark' ? '☀️' : '🌙';
  }
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('exam_theme_v1', t); } catch {}
  labelTheme();
}

if ($('btnTTheme')) {
  $('btnTTheme').onclick = () => {
    feedback('tap', 8);
    setTheme(activeTheme() === 'dark' ? 'light' : 'dark');
  };
}

if ($('btnTeacherMenu')) {
  $('btnTeacherMenu').onclick = (e) => {
    e.stopPropagation();
    const drop = $('teacherMenuDropdown');
    const on = drop.hidden;
    drop.hidden = !on;
    $('btnTeacherMenu').setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) {
      const firstItem = drop.querySelector('[role="menuitem"], button');
      if (firstItem) firstItem.focus();
    }
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
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('teacherMenuDropdown') && !$('teacherMenuDropdown').hidden) {
    $('teacherMenuDropdown').hidden = true;
    if ($('btnTeacherMenu')) {
      $('btnTeacherMenu').setAttribute('aria-expanded', 'false');
      $('btnTeacherMenu').focus();
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
  // doSignOut is declared further down; a function declaration is hoisted, so
  // this closure has it by the time anything can click. Assigned once, here —
  // a second assignment further down used to silently drop the line above it,
  // leaving the menu hanging open over the page.
  $('menuSignOut').onclick = () => {
    $('teacherMenuDropdown').hidden = true;
    doSignOut();
  };
}
labelTheme();

/* The same interaction layer the student portal runs. */
initFx();

/* ================================================================
   Neat WebGL Fluid Animated Background
   ================================================================ */

let neatGradientInstance = null;

async function initNeatGradient() {
  const canvas = $('neat-gradient');
  if (!canvas) return;

  try {
    if (!NeatGradient) {
      try {
        const mod = await import('../neat.js');
        NeatGradient = mod.NeatGradient;
      } catch (localErr) {
        console.warn('[NeatGradient] Local neat.js load failed, attempting CDN fallback:', localErr);
        try {
          const mod = await import('https://esm.sh/@firecms/neat');
          NeatGradient = mod.NeatGradient;
        } catch (cdnErr) {
          console.warn('[NeatGradient] Failed to load Neat gradient library:', cdnErr);
          return;
        }
      }
    }
    if (!NeatGradient) return;

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
      // requireTeacher_ says which of the two it is — no list configured at
      // all, or this address not on it — and the fix differs. Show its words.
      deny('Access denied', r.message ||
        'Your account is not authorised to manage this exam system.');
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
    if (CACHE.exams) { renderExamCards(CACHE.exams); populateResultsPicker(CACHE.exams); populateAddStudentEdpOptions(CACHE.exams); }
    if (CACHE.students) { populateStudentFilters(CACHE.students); renderStudentTable(CACHE.students); }

    showTab('dashboard');
  } catch (err) {
    // A dropped connection is not a refusal. Saying "Access denied" to a
    // teacher whose wifi blinked has them emailing their administrator
    // about a permission they already have. Same screen — it carries the
    // only escape hatch there is — but the truth on it.
    console.error('[teacher] bootstrap error', err);
    deny('Cannot reach the exam server',
      (err && err.message) ||
      'The portal could not load your workbook. Check your connection and reload.');
  }
});

/** The refusal screen, with a reason on it rather than one fixed sentence. */
function deny(title, text) {
  if ($('tDeniedTitle')) $('tDeniedTitle').textContent = title;
  if ($('tDeniedText'))  $('tDeniedText').textContent  = text;
  show('scTDenied');
}

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
      $('tSignInErr').innerHTML = 'Your browser blocked the sign-in popup. <button type="button" class="btn-tbl-action" id="btnErrUseRedirect" style="margin-top:6px;">Switch to Redirect Sign-In</button>';
      $('tSignInErr').hidden = false;
      if ($('btnErrUseRedirect')) $('btnErrUseRedirect').onclick = () => signInWithRedirect(auth, provider);
    } else if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      $('tSignInErr').innerHTML = 'Sign-in window closed. If popup fails on your browser, try: <button type="button" class="btn-tbl-action" id="btnErrUseRedirect" style="margin-top:6px;">Sign in with redirect</button>';
      $('tSignInErr').hidden = false;
      if ($('btnErrUseRedirect')) $('btnErrUseRedirect').onclick = () => signInWithRedirect(auth, provider);
    } else if (code === 'auth/unauthorized-domain') {
      $('tSignInErr').textContent = 'This domain is not authorised in Firebase Authentication settings (add it under Authorized Domains in Firebase console).';
      $('tSignInErr').hidden = false;
    } else {
      $('tSignInErr').innerHTML = `Sign-in note: ${esc(err?.message || code)} <br><button type="button" class="btn-tbl-action" id="btnErrUseRedirect" style="margin-top:6px;">Try Redirect Sign-In</button>`;
      $('tSignInErr').hidden = false;
      if ($('btnErrUseRedirect')) $('btnErrUseRedirect').onclick = () => signInWithRedirect(auth, provider);
    }
  } finally {
    _signingIn = false;
    b.disabled = false;
  }
};

if ($('btnTSignInRedirect')) {
  $('btnTSignInRedirect').onclick = async () => {
    $('tSignInErr').hidden = true;
    try {
      await signInWithRedirect(auth, provider);
    } catch (err) {
      $('tSignInErr').textContent = 'Redirect sign-in error: ' + (err?.message || err);
      $('tSignInErr').hidden = false;
    }
  };
}

/* Sign out. The cache holds a whole class list, so it goes with the session. */
function doSignOut() {
  try { sessionStorage.removeItem('teacher_cache_v2'); } catch {}
  signOut(auth).then(() => location.reload());
}
$('btnTDeniedOut').onclick = doSignOut;

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
      if (CACHE.exams) { renderExamCards(CACHE.exams); populateResultsPicker(CACHE.exams); populateAddStudentEdpOptions(CACHE.exams); }
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
    populateAddStudentEdpOptions(CACHE.exams);
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
    // A <div> container, avoiding invalid nested <button> elements.
    // The title itself is a reachable <button> for keyboard navigation, and the entire card
    // remains clickable for mouse users without interfering with action buttons.
    const card = document.createElement('div');
    card.className = 'card exam-card liftable';
    card.innerHTML = `
      <div class="exam-card-top">
        <span class="exam-card-code">${esc(ex.code)}</span>
        ${statusChip(ex.status)}
      </div>
      <div class="exam-card-title">
        <button type="button" class="exam-title-btn" aria-label="Open ${esc(ex.title || ex.code)} results">${esc(ex.title || ex.code)}</button>
      </div>
      <div class="exam-card-meta">
        ${ex.questions ?? '—'} question${ex.questions === 1 ? '' : 's'}
        ${ex.subject ? ' · ' + esc(ex.subject) : ''}
        ${ex.edpCode ? ' · EDP ' + esc(ex.edpCode) : (ex.sections && ex.sections.length ? ' · Sec: ' + esc(ex.sections.join(',')) : '')}
        ${ex.createdBy ? ' · By ' + esc(ex.createdBy) : ''}
        ${ex.opensAt ? ' · Opens ' + esc(ex.opensAt) : ''}
        ${ex.closesAt ? ' · Closes ' + esc(ex.closesAt) : ''}
      </div>
      <div class="exam-card-actions"></div>`;

    // Held by reference.
    const actionRow = card.querySelector('.exam-card-actions');
    const isOpen = ex.status === 'open';

    // Quick Active / Offline toggle
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'btn-sm btn-outline';
    toggleBtn.type = 'button';
    toggleBtn.textContent = isOpen ? '⏸ Set Offline' : '▶ Set Active';
    toggleBtn.setAttribute('aria-label', (isOpen ? 'Set offline' : 'Set active') + ' ' + ex.code);
    toggleBtn.onclick = async (e) => {
      e.stopPropagation();
      feedback('tap', 8);
      await setExamStatus(ex.code, isOpen ? 'closed' : 'open', card, toggleBtn);
    };
    actionRow.append(toggleBtn);

    // Draft option
    if (ex.status !== 'draft') {
      const draftBtn = document.createElement('button');
      draftBtn.className = 'btn-sm btn-outline';
      draftBtn.type = 'button';
      draftBtn.textContent = '✏ Draft';
      draftBtn.setAttribute('aria-label', 'Move ' + ex.code + ' to draft');
      draftBtn.onclick = async (e) => {
        e.stopPropagation();
        feedback('tap', 8);
        await setExamStatus(ex.code, 'draft', card, draftBtn);
      };
      actionRow.append(draftBtn);
    }

    // Quick EDP Code Manage
    const edpBtn = document.createElement('button');
    edpBtn.className = 'btn-sm btn-outline';
    edpBtn.type = 'button';
    edpBtn.textContent = '🏷️ EDP';
    edpBtn.setAttribute('aria-label', 'Manage EDP codes for ' + ex.code);
    edpBtn.onclick = (e) => {
      e.stopPropagation();
      feedback('tap', 8);
      openEdpModal(ex);
    };
    actionRow.append(edpBtn);

    // Quick Duplicate
    const dupBtn = document.createElement('button');
    dupBtn.className = 'btn-sm btn-outline';
    dupBtn.type = 'button';
    dupBtn.textContent = '📋 Copy';
    dupBtn.setAttribute('aria-label', 'Duplicate ' + ex.code);
    dupBtn.onclick = (e) => {
      e.stopPropagation();
      feedback('tap', 8);
      openDuplicateModal(ex);
    };
    actionRow.append(dupBtn);

    const detailBtn = document.createElement('button');
    detailBtn.className = 'btn-sm btn-outline';
    detailBtn.type = 'button';
    detailBtn.textContent = '📊 Results';
    detailBtn.setAttribute('aria-label', 'Results for ' + ex.code);
    detailBtn.onclick = (e) => { e.stopPropagation(); feedback('nav', 8); openExamDetail(ex); };
    actionRow.append(detailBtn);

    // Quick Delete
    const delBtn = document.createElement('button');
    delBtn.className = 'btn-sm btn-outline btn-danger';
    delBtn.type = 'button';
    delBtn.textContent = '🗑️';
    delBtn.title = 'Delete ' + ex.code;
    delBtn.setAttribute('aria-label', 'Delete ' + ex.code);
    delBtn.onclick = (e) => {
      e.stopPropagation();
      feedback('tap', 8);
      openDeleteModal(ex);
    };
    actionRow.append(delBtn);

    card.addEventListener('click', (e) => {
      if (e.target.closest('.exam-card-actions')) return;
      feedback('nav', 8);
      openExamDetail(ex);
    });
    wrap.append(card);
  });
  revealIn(wrap);
}
function statusChip(status) {
  const s = String(status || '').toLowerCase();
  const cls = (s === 'open' || s === 'active') ? 'chip-open' : s === 'draft' ? 'chip-draft' : 'chip-closed';
  const lbl = (s === 'open' || s === 'active') ? 'Active (Open)' : s === 'draft' ? 'Draft' : 'Offline (Closed)';
  return `<span class="chip ${cls}">${lbl}</span>`;
}

async function setExamStatus(code, status, card, triggeredBtn) {
  const buttonsToDisable = card ? Array.from(card.querySelectorAll('button')) : [];
  if (triggeredBtn && !buttonsToDisable.includes(triggeredBtn)) buttonsToDisable.push(triggeredBtn);
  
  const originalText = triggeredBtn ? triggeredBtn.textContent : '';
  const actionLabel = status === 'open' ? 'Setting Active…' : status === 'draft' ? 'Moving to Draft…' : 'Setting Offline…';

  buttonsToDisable.forEach(b => { b.disabled = true; });
  if (triggeredBtn) triggeredBtn.textContent = '⏳ ' + actionLabel;

  try {
    toast(`Updating ${code} to ${status === 'open' ? 'Active' : status}…`, 'info', 2500);
    const r = await api('teacherSetStatus', { idToken: await idToken(), code, status });
    if (r.ok) {
      await loadExams();
      toast(code + ' is now ' + (status === 'open' ? 'Active (Open)' : status) + '.', 'ok');
      return;
    }
    // Opening runs the same preflight the Sheet menu runs, so a refusal
    // arrives with the actual list of what is wrong. Show it.
    toast([r.message || 'Could not update status.']
      .concat(r.errors?.length ? [''].concat(r.errors.map(e => '• ' + e)) : [])
      .join('\r\n'), 'bad', 9000);
  } catch (err) {
    console.error(err);
    toast(err.message || 'Could not reach the exam server.', 'bad');
  } finally {
    buttonsToDisable.forEach(b => { b.disabled = false; });
    if (triggeredBtn) triggeredBtn.textContent = originalText;
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
  $('newExamTries').value = '1';
  $('newExamStatus').value = 'draft';
  // Through the handler, or the duration label keeps whatever the last open
  // left behind — "Minutes for whole exam" above a box holding 45 seconds.
  $('newExamTimerMode').onchange();
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
      // Per-section still falls back to a per-question clock for any
      // question whose own Seconds cell is blank, so the box is not ignored.
      defaultTimer: timerMode === 'whole-exam' ? 45 : duration,
      wholeExamMinutes: timerMode === 'whole-exam' ? duration : 30,
      tries, status
    };

    const r = await api('teacherCreateExam', payload);
    if (r.ok) {
      closeModal($('newExamModal'));
      await loadExams();
      const created = (CACHE.exams || []).find(ex => ex.code === code);
      if (created) {
        await openExamDetail(created);
        openQuestionBuilder();
        toast(`Exam "${code}" created. Add its questions here in the teacher portal.`, 'ok', 6000);
      } else {
        // The server made the exam but the refreshed list did not include it
        // yet. Do not misdirect the teacher to the Sheet; the portal remains
        // the place to complete it after one refresh.
        toast(`Exam "${code}" created. Refresh Exams, open it, then add questions here in the teacher portal.`, 'ok', 6000);
      }
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
   Exam Detail, Multi-EDP, Duplicate & Delete Logic
   ================================================================ */

let _currentDetailExamCode = '';
let _currentDetailExam = null;
let _currentEditingEdpCodes = [];
let _allResultRows = [];
let _currentResultsTotal = 0;
let _currentResultsFilter = 'all';
let _currentResultsSearch = '';
let _autoRefreshTimer = null;

async function openExamDetail(ex) {
  _currentDetailExamCode = ex.code;
  _currentDetailExam = ex;
  $('detailCode').textContent = ex.code + (ex.title ? ' — ' + ex.title : '');
  updateDetailStatsAndControls(ex);
  show('scTExamDetail');
  await loadExamResults(ex.code);
}

function updateDetailStatsAndControls(ex) {
  $('detailStats').innerHTML = `
    <div><p class="eyebrow">Status</p>${statusChip(ex.status)}</div>
    <div><p class="eyebrow">Questions</p><p class="stat-num-sm" id="detailQCount">${ex.questions ?? '—'}</p></div>
    <div><p class="eyebrow">Finished</p><p class="stat-num-sm" id="detailFinished">…</p></div>
    <div><p class="eyebrow">Average</p><p class="stat-num-sm" id="detailAvg">…</p></div>`;

  if ($('btnToggleActiveDetail')) {
    const isOpen = ex.status === 'open';
    $('btnToggleActiveDetail').textContent = isOpen ? '⏸ Set Offline' : '▶ Set Active';
    $('btnToggleActiveDetail').onclick = async () => {
      const newStatus = isOpen ? 'closed' : 'open';
      await setExamStatus(ex.code, newStatus, null, $('btnToggleActiveDetail'));
      ex.status = newStatus;
      updateDetailStatsAndControls(ex);
    };
  }

  updateDetailEdpBadges(ex);

  if ($('btnManageEdpDetail')) $('btnManageEdpDetail').onclick = () => openEdpModal(ex);
  if ($('btnManageEdpInline')) $('btnManageEdpInline').onclick = () => openEdpModal(ex);
  if ($('btnDuplicateExamDetail')) $('btnDuplicateExamDetail').onclick = () => openDuplicateModal(ex);
  if ($('btnDeleteExamDetail')) $('btnDeleteExamDetail').onclick = () => openDeleteModal(ex);
}

function updateDetailEdpBadges(ex) {
  const container = $('detailEdpBadges');
  if (!container) return;
  container.replaceChildren();

  let codes = [];
  if (Array.isArray(ex.edpCodes) && ex.edpCodes.length) {
    codes = ex.edpCodes;
  } else if (ex.edpCode) {
    codes = String(ex.edpCode).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  }

  if (!codes.length) {
    container.innerHTML = '<span class="muted small">No EDP code set (open to all configured sections).</span>';
    return;
  }

  codes.forEach(c => {
    const b = document.createElement('span');
    b.className = 'chip-edp';
    b.textContent = 'EDP ' + c;
    container.append(b);
  });
}

/* Manage EDP Codes Modal */
function openEdpModal(ex) {
  _currentDetailExamCode = ex.code;
  _currentDetailExam = ex;
  if ($('edpModalTitle')) $('edpModalTitle').textContent = 'Manage EDP Codes — ' + ex.code;

  let list = [];
  if (Array.isArray(ex.edpCodes) && ex.edpCodes.length) {
    list = [...ex.edpCodes];
  } else if (ex.edpCode) {
    list = String(ex.edpCode).split(/[,;/]+/).map(s => s.trim()).filter(Boolean);
  }
  _currentEditingEdpCodes = list;
  renderEdpChips();
  if ($('inputNewEdp')) $('inputNewEdp').value = '';
  if ($('edpModalMsg')) $('edpModalMsg').replaceChildren();
  openModal($('edpCodesModal'), $('inputNewEdp'));
}

function renderEdpChips() {
  const wrap = $('edpChipsList');
  if (!wrap) return;
  wrap.replaceChildren();
  if (!_currentEditingEdpCodes.length) {
    const empty = document.createElement('span');
    empty.className = 'muted small';
    empty.id = 'edpChipsEmpty';
    empty.textContent = 'No EDP codes assigned yet (using sections).';
    wrap.append(empty);
    return;
  }
  _currentEditingEdpCodes.forEach((edp, idx) => {
    const chip = document.createElement('span');
    chip.className = 'chip-edp';
    chip.innerHTML = `<span>${esc(edp)}</span>`;
    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'chip-remove';
    rmBtn.setAttribute('aria-label', 'Remove EDP code ' + edp);
    rmBtn.innerHTML = '×';
    rmBtn.onclick = () => {
      _currentEditingEdpCodes.splice(idx, 1);
      renderEdpChips();
    };
    chip.append(rmBtn);
    wrap.append(chip);
  });
}

function addEdpFromInput() {
  const input = $('inputNewEdp');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;
  const parts = val.split(/[,;\s]+/).map(s => s.trim()).filter(Boolean);
  parts.forEach(p => {
    if (!_currentEditingEdpCodes.includes(p)) {
      _currentEditingEdpCodes.push(p);
    }
  });
  input.value = '';
  renderEdpChips();
}

if ($('btnAddEdpCode')) $('btnAddEdpCode').onclick = addEdpFromInput;
if ($('inputNewEdp')) {
  $('inputNewEdp').onkeydown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addEdpFromInput(); }
  };
}

if ($('btnCloseEdpModal')) $('btnCloseEdpModal').onclick = () => closeModal($('edpCodesModal'));
if ($('btnCancelEdpModal')) $('btnCancelEdpModal').onclick = () => closeModal($('edpCodesModal'));

if ($('btnSaveEdpCodes')) {
  $('btnSaveEdpCodes').onclick = async () => {
    addEdpFromInput();
    const btn = $('btnSaveEdpCodes');
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const r = await api('teacherUpdateEdp', {
        idToken: await idToken(),
        code: _currentDetailExamCode,
        edpCodes: _currentEditingEdpCodes
      });
      if (!r.ok) {
        if ($('edpModalMsg')) $('edpModalMsg').innerHTML = `<div class="msg bad" style="color:var(--bad);">${esc(r.message || 'Failed to update EDP codes')}</div>`;
        return;
      }
      closeModal($('edpCodesModal'));
      toast('EDP codes updated for ' + _currentDetailExamCode + '!', 'ok');
      play('pop');

      if (CACHE.exams) {
        const ex = CACHE.exams.find(e => e.code === _currentDetailExamCode);
        if (ex) {
          ex.edpCode = r.edpCode;
          ex.edpCodes = r.edpCodes;
          updateDetailEdpBadges(ex);
          renderExamCards(CACHE.exams);
          populateAddStudentEdpOptions(CACHE.exams);
        }
      }
      if (_currentDetailExam && _currentDetailExam.code === _currentDetailExamCode) {
        _currentDetailExam.edpCode = r.edpCode;
        _currentDetailExam.edpCodes = r.edpCodes;
        updateDetailEdpBadges(_currentDetailExam);
      }
    } catch (err) {
      if ($('edpModalMsg')) $('edpModalMsg').innerHTML = `<div class="msg bad" style="color:var(--bad);">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Save EDP Codes';
    }
  };
}

/* Duplicate Exam Modal */
function openDuplicateModal(ex) {
  _currentDetailExamCode = ex.code;
  _currentDetailExam = ex;
  if ($('dupModalTitle')) $('dupModalTitle').textContent = 'Duplicate Exam — ' + ex.code;
  if ($('dupNewCode')) $('dupNewCode').value = ex.code + '_COPY';
  if ($('dupNewTitle')) $('dupNewTitle').value = (ex.title || ex.code) + ' (Copy)';
  if ($('dupNewEdp')) $('dupNewEdp').value = ex.edpCode || '';
  if ($('dupModalMsg')) $('dupModalMsg').replaceChildren();
  openModal($('duplicateExamModal'), $('dupNewCode'));
}

if ($('btnCloseDupModal')) $('btnCloseDupModal').onclick = () => closeModal($('duplicateExamModal'));
if ($('btnCancelDupModal')) $('btnCancelDupModal').onclick = () => closeModal($('duplicateExamModal'));

if ($('btnSubmitDuplicate')) {
  $('btnSubmitDuplicate').onclick = async () => {
    const newCode = $('dupNewCode')?.value.trim().toUpperCase() || '';
    const newTitle = $('dupNewTitle')?.value.trim() || '';
    const newEdp = $('dupNewEdp')?.value.trim() || '';

    if (!newCode) {
      if ($('dupModalMsg')) $('dupModalMsg').innerHTML = '<div class="msg bad" style="color:var(--bad);">Exam code is required.</div>';
      return;
    }

    const btn = $('btnSubmitDuplicate');
    btn.disabled = true; btn.textContent = 'Duplicating…';
    try {
      const r = await api('teacherDuplicateExam', {
        idToken: await idToken(),
        sourceCode: _currentDetailExamCode,
        newCode,
        title: newTitle,
        edpCode: newEdp
      });
      if (!r.ok) {
        if ($('dupModalMsg')) $('dupModalMsg').innerHTML = `<div class="msg bad" style="color:var(--bad);">${esc(r.message || 'Duplication failed')}</div>`;
        return;
      }
      closeModal($('duplicateExamModal'));
      toast('Exam duplicated as ' + newCode + ' (Draft)!', 'ok');
      play('submit');
      await loadExams();
    } catch (err) {
      if ($('dupModalMsg')) $('dupModalMsg').innerHTML = `<div class="msg bad" style="color:var(--bad);">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Duplicate Exam';
    }
  };
}

/* Delete Exam Modal */
function openDeleteModal(ex) {
  _currentDetailExamCode = ex.code;
  _currentDetailExam = ex;
  if ($('deleteModalPrompt')) $('deleteModalPrompt').innerHTML = `Please type the exam code <b>${esc(ex.code)}</b> to confirm deletion:`;
  if ($('inputConfirmDeleteCode')) $('inputConfirmDeleteCode').value = '';
  if ($('btnConfirmDeleteExam')) $('btnConfirmDeleteExam').disabled = true;
  if ($('deleteModalMsg')) $('deleteModalMsg').replaceChildren();
  openModal($('deleteExamModal'), $('inputConfirmDeleteCode'));
}

if ($('inputConfirmDeleteCode')) {
  $('inputConfirmDeleteCode').oninput = (e) => {
    const val = e.target.value.trim().toUpperCase();
    if ($('btnConfirmDeleteExam')) {
      $('btnConfirmDeleteExam').disabled = (val !== _currentDetailExamCode);
    }
  };
}

if ($('btnCloseDeleteModal')) $('btnCloseDeleteModal').onclick = () => closeModal($('deleteExamModal'));
if ($('btnCancelDeleteModal')) $('btnCancelDeleteModal').onclick = () => closeModal($('deleteExamModal'));

if ($('btnConfirmDeleteExam')) {
  $('btnConfirmDeleteExam').onclick = async () => {
    const btn = $('btnConfirmDeleteExam');
    btn.disabled = true; btn.textContent = 'Deleting…';
    try {
      const r = await api('teacherDeleteExam', {
        idToken: await idToken(),
        code: _currentDetailExamCode
      });
      if (!r.ok) {
        if ($('deleteModalMsg')) $('deleteModalMsg').innerHTML = `<div class="msg bad" style="color:var(--bad);">${esc(r.message || 'Delete failed')}</div>`;
        return;
      }
      closeModal($('deleteExamModal'));
      toast('Exam ' + _currentDetailExamCode + ' deleted.', 'ok');
      play('pop');
      if (CACHE.exams) {
        CACHE.exams = CACHE.exams.filter(e => e.code !== _currentDetailExamCode);
        saveCache();
        renderExamCards(CACHE.exams);
      }
      show('scTExams');
    } catch (err) {
      if ($('deleteModalMsg')) $('deleteModalMsg').innerHTML = `<div class="msg bad" style="color:var(--bad);">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false; btn.textContent = 'Permanently Delete Exam';
    }
  };
}

$('btnExamBack').onclick = () => {
  if (_autoRefreshTimer) { clearInterval(_autoRefreshTimer); _autoRefreshTimer = null; }
  show('scTExams');
};

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

    _allResultRows = r.rows || [];
    _currentResultsTotal = r.total || 0;

    updateResultsFilterCounts();
    applyResultsFilterAndRender();
  } catch (err) {
    console.error('[teacher] results', err);
  } finally {
    if (btn) btn.textContent = '🔄 Refresh';
  }
}

function updateResultsFilterCounts() {
  const allCount = _allResultRows.length;
  const flaggedCount = _allResultRows.filter(r => r.flagged || r.status === 'flagged').length;
  const doneCount = _allResultRows.filter(r => r.done).length;
  const busyCount = _allResultRows.filter(r => r.status === 'in-progress').length;

  if ($('countResAll')) $('countResAll').textContent = allCount;
  if ($('countResFlagged')) $('countResFlagged').textContent = flaggedCount;
  if ($('countResDone')) $('countResDone').textContent = doneCount;
  if ($('countResBusy')) $('countResBusy').textContent = busyCount;
}

function applyResultsFilterAndRender() {
  const list = $('detailResultsList');
  if (!list) return;

  let filtered = _allResultRows;

  if (_currentResultsFilter === 'flagged') {
    filtered = filtered.filter(r => r.flagged || r.status === 'flagged');
  } else if (_currentResultsFilter === 'done') {
    filtered = filtered.filter(r => r.done);
  } else if (_currentResultsFilter === 'in-progress') {
    filtered = filtered.filter(r => r.status === 'in-progress');
  }

  if (_currentResultsSearch) {
    const q = _currentResultsSearch.toLowerCase();
    filtered = filtered.filter(r =>
      String(r.name || '').toLowerCase().includes(q) ||
      String(r.email || '').toLowerCase().includes(q) ||
      String(r.course || '').toLowerCase().includes(q) ||
      String(r.section || '').toLowerCase().includes(q) ||
      String(r.notes || '').toLowerCase().includes(q)
    );
  }

  if (!filtered.length) {
    list.innerHTML = `<div class="muted small" style="padding:16px; text-align:center;">No submissions matching current filter or search.</div>`;
    return;
  }

  renderResultsTable(list, filtered, _currentResultsTotal);
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
    // Section delivery groups the questions by type, so there is no order
    // left to choose. The select is still filled: hidden is not empty, and
    // it is read on submit whether the teacher can see it or not.
    timerRow.hidden = true;
    row.hidden = true;
    sel.innerHTML = `<option value="shuffle-within-type">Shuffled within each section</option>`;
    sel.value = 'shuffle-within-type';
  } else if (mode === 'per-question') {
    timerRow.hidden = true;
    row.hidden = false;
    sel.innerHTML = `
      <option value="shuffled">Shuffled all</option>
      <option value="shuffle-within-type">Shuffled within each type</option>
      <option value="logical">Logical — same order as below</option>
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

  return out.join('\r\n');
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
  return out.join('\r\n');
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
  const text = content.replace(/\r\r\n/g, '\r\n').trim();
  const poolWords = [];
  let qLines = [];

  const qHeaderIdx = text.search(/(?:===\s*QUESTIONS\s*===|\[QUESTIONS\]|\bQUESTIONS:?)/i);

  if (qHeaderIdx !== -1) {
    const bankPart = text.slice(0, qHeaderIdx).replace(/(?:===\s*WORD\s*BANK\s*===|\[WORD\s*BANK\]|\bWORD\s*BANK:?|\bBANK:?)/gi, '').trim();
    const qPart = text.slice(qHeaderIdx).replace(/(?:===\s*QUESTIONS\s*===|\[QUESTIONS\]|\bQUESTIONS:?)/gi, '').trim();

    bankPart.split('\r\n').forEach(line => {
      line = line.replace(/^[-*•\d.)]\s*/, '').trim();
      if (!line) return;
      if (line.includes(',')) line.split(',').forEach(w => { if (w.trim()) poolWords.push(w.trim()); });
      else if (line.includes(';')) line.split(';').forEach(w => { if (w.trim()) poolWords.push(w.trim()); });
      else poolWords.push(line);
    });
    qLines = qPart.split('\r\n').map(l => l.trim()).filter(Boolean);
  } else {
    const lines = text.split('\r\n').map(l => l.trim()).filter(Boolean);
    let inBank = false;
    lines.forEach(line => {
      if (/^(?:===\s*WORD\s*BANK\s*===|\[WORD\s*BANK\]|\bWORD\s*BANK:?|\bBANK:?)/i.test(line)) {
        inBank = true;
        const rest = line.replace(/^(?:===\s*WORD\s*BANK\s*===|\[WORD\s*BANK\]|\bWORD\s*BANK:?|\bBANK:?)/i, '').trim();
        if (rest) {
          rest.split(/[,;\r\n]/).forEach(w => {
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
    pool: uniquePool.join('\r\n'),
    questions: qLines.join('\r\n')
  };
}

function autoSplitMasterPaste(raw) {
  if (!raw || !raw.trim()) return 0;
  const text = raw.replace(/\r\r\n/g, '\r\n');

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
      const clean = text.replace(/^```[a-z]*\r\n?/i, '').replace(/\r\n?```$/i, '').trim();
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
    content = content.replace(/^```[a-z]*\r\n?/i, '').replace(/\r\n?```$/i, '').trim();

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

  // Read once, here. This used to be a bare `mode` with nothing bound to it
  // in this function, which threw a ReferenceError on the first panel and
  // left step 2 of the builder permanently blank.
  const mode = currentBuilderTimerMode();

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
    const maFieldHtml = (k === 'MA')
      ? `<div class="fld" style="margin-bottom:8px;">
          <span class="lbl-s">Instruction shown to the student</span>
          <input class="field" id="tInstr_MA" placeholder="Match the term to its meaning.">
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
        ${maFieldHtml}
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

/**
 * One batch, in the shape Compile.gs parses — the same object the Sheets
 * sidebar sends. `mode` names the type, which is what stops the parser
 * guessing: a batch declared Identification is never split on a stray "a.",
 * and a True-or-false batch does not need a marker on every line.
 */
function builderSpec(k) {
  return {
    mode: k,
    text: ($('tSrc_' + k) || {}).value || '',
    pool: ($('tPool_' + k) || {}).value || '',
    instruction: ($('tInstr_' + k) || {}).value || '',
    seconds: builderSecondsOf(k)
  };
}

/** Every switched-on type that has something pasted into it. */
function collectBuilderSpecs() {
  return activeBuilderTypes()
    .map(t => builderSpec(t.key))
    .filter(s => s.text.trim());
}

/** How many items the server said it read out of one section, or 0. */
const builderChecked = {};

/**
 * Asks the server what it makes of this section.
 *
 * This used to count lines in the browser and always report success, which
 * told a teacher "12 questions parsed and ready" about twelve lines the
 * importer would go on to reject. The count and the problems both have to
 * come from the parser that will actually do the writing.
 */
async function checkBuilderSection(k, btn) {
  const field = $('tSrc_' + k);
  if (!field) return;
  const raw = field.value.trim();
  const out = $('tOut_' + k);
  const badge = $('tBadge_' + k);
  const pan = $('tPan_' + k);
  const target = parseInt(builderPlan[k].count, 10) || 10;

  if (!raw) {
    builderChecked[k] = 0;
    if (out) out.replaceChildren();
    if (badge) badge.textContent = `0 of ${target}`;
    if (pan) pan.classList.remove('done');
    updateTotalAddButton();
    return;
  }

  const was = btn ? btn.textContent : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Checking…'; }

  try {
    const r = await api('teacherCheckQuestions', {
      idToken: await idToken(),
      code: _currentDetailExamCode,
      specs: [builderSpec(k)]
    });

    if (!r.ok) {
      builderChecked[k] = 0;
      if (pan) pan.classList.remove('done');
      if (out) out.innerHTML = `<div class="msg bad" style="padding:6px 10px;border-radius:6px;color:var(--bad);font-size:0.75rem;">${esc(r.message || 'Could not check this section.')}</div>`;
      return;
    }

    const count = r.count || 0;
    builderChecked[k] = count;
    if (badge) badge.textContent = `${count} of ${target}`;
    if (pan) pan.classList.toggle('done', count > 0 && !(r.problems || []).length);

    if (out) {
      const bits = [];
      // Short of what was asked for is worth saying — it is the usual sign
      // the AI stopped early or a line came back in the wrong shape.
      const tone = (r.problems || []).length ? 'warn' : (count < target ? 'warn' : 'ok');
      const colour = tone === 'ok' ? 'var(--ok)' : 'var(--warn)';
      bits.push(`<div class="msg ${tone}" style="padding:6px 10px;border-radius:6px;color:${colour};font-size:0.75rem;">` +
        (count ? `✓ ${count} question(s) read` : 'Nothing usable was found here') +
        (count && count !== target ? ` — you asked for ${target}` : '') + '.</div>');

      (r.problems || []).slice(0, 5).forEach(p => {
        bits.push(`<div class="muted small" style="margin-top:4px;">line ${esc(p.line)}: ${esc(p.msg || p.why || '')}</div>`);
      });
      if ((r.problems || []).length > 5) {
        bits.push(`<div class="muted small">…and ${r.problems.length - 5} more.</div>`);
      }
      out.innerHTML = bits.join('');
    }
  } catch (err) {
    builderChecked[k] = 0;
    if (out) out.innerHTML = `<div class="msg bad" style="padding:6px 10px;border-radius:6px;color:var(--bad);font-size:0.75rem;">${esc(err.message || 'Could not reach the exam server.')}</div>`;
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = was; }
    updateTotalAddButton();
  }
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
function openQuestionBuilder(context = 'add') {
  if (!_currentDetailExamCode) return;
  const managing = context === 'manage';
  $('addQModalTitle').textContent = `${managing ? 'Manage questions' : 'Exam builder'} (${_currentDetailExamCode})`;
  const hint = $('tManageQuestionsHint');
  if (hint) hint.hidden = !managing;
  $('tStep1').hidden = false;
  $('tStep2').hidden = true;
  if ($('tCr1')) { $('tCr1').classList.remove('done'); $('tCr1').classList.add('on'); }
  if ($('tCr2')) $('tCr2').classList.remove('on');
  buildBuilderStep1();
  openModal($('addQuestionsModal'), $('tExamTimerModeSelect'));
}
if ($('btnOpenAddQuestions')) $('btnOpenAddQuestions').onclick = openQuestionBuilder;
if ($('btnManageQuestions')) $('btnManageQuestions').onclick = openQuestionManager;

if ($('btnCloseAddQuestions')) {
  $('btnCloseAddQuestions').onclick = () => closeModal($('addQuestionsModal'));
}

/* Submit Questions */
if ($('btnTAddAll')) {
  $('btnTAddAll').onclick = async () => {
    const specs = collectBuilderSpecs();
    if (!specs.length) { toast('Paste some questions first.', 'bad'); return; }

    const mode = $('tAddQMode') ? $('tAddQMode').value : 'append';
    const timerMode = currentBuilderTimerMode();
    const wholeMins = ($('tWholeExamMins') && parseInt($('tWholeExamMins').value, 10)) || 30;
    const orderVal = $('tExamOrderSelect') ? $('tExamOrderSelect').value : 'shuffled';

    const btn = $('btnTAddAll');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const r = await api('teacherAddQuestions', {
        idToken: await idToken(),
        code: _currentDetailExamCode,
        // One batch per type, each naming its own type — not one blob for
        // the parser to guess its way through.
        specs,
        mode,
        timerMode,
        wholeExamMins: wholeMins,
        order: orderVal
      });
      if (!r.ok) { toast(r.message || 'Import failed', 'bad'); return; }

      // A row the importer could not read is written to the sheet's Mistakes
      // column, but nobody reopens the tab to find that out.
      if (r.problems?.length) {
        toast([`Imported ${r.added} question(s), with ${r.problems.length} to look at:`]
          .concat(r.problems.slice(0, 5).map(p => '• line ' + p.line + ': ' + (p.msg || p.why || '')))
          .join('\r\n'), 'warn', 9000);
      } else {
        toast(`Successfully imported ${r.added} question(s) into ${_currentDetailExamCode}!`, 'ok');
      }
      closeModal($('addQuestionsModal'));
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
   Per-question manager with interactive dropdowns
   ================================================================ */
let _managedQuestions = [];
let _managedExpandedRow = null;
let _managedEditingRow = null;
let _managedSearchQuery = '';
let _managedTypeFilter = 'ALL';

const MANAGED_TYPE_LABELS = {
  MC: 'Multiple choice', TF: 'True or false', ID: 'Identification',
  EN: 'Enumeration', MA: 'Matching', WB: 'Word bank'
};

function managedLines(value) {
  return String(value || '').replace(/\r\r\n/g, '\r\n').split('\r\n').map(s => s.trim()).filter(Boolean);
}

function managedSpec(q) {
  let text = q.question;
  let pool = '';
  let instruction = '';
  if (q.type === 'MC') {
    text += ' ' + q.choices.map((choice, i) => String.fromCharCode(97 + i) + '. ' + choice).join(' ');
  } else if (q.type === 'MA') {
    text = q.answers.join('\r\n');
    instruction = q.question;
  } else if (q.type === 'WB') {
    pool = q.choices.join('\r\n');
  }
  return { mode: q.type, text: text + ' | ' + q.answers.join(';'), pool, instruction, seconds: q.timer };
}

function renderManagedQuestionList() {
  const host = $('manageQuestionsList');
  if (!host) return;
  host.replaceChildren();

  // Filter list
  const qQuery = _managedSearchQuery.toLowerCase().trim();
  const filtered = _managedQuestions.filter(q => {
    if (_managedTypeFilter !== 'ALL' && q.type !== _managedTypeFilter) return false;
    if (qQuery) {
      const qNoMatch = ('q' + q.no).includes(qQuery);
      const textMatch = String(q.question || '').toLowerCase().includes(qQuery);
      const ansMatch = (q.answers || []).some(a => String(a).toLowerCase().includes(qQuery));
      return qNoMatch || textMatch || ansMatch;
    }
    return true;
  });

  // Calculate tally
  const totalPts = _managedQuestions.reduce((acc, q) => acc + (parseFloat(q.points) || 1), 0);
  if ($('manageQTally')) {
    $('manageQTally').textContent = `${filtered.length} of ${_managedQuestions.length} question${_managedQuestions.length === 1 ? '' : 's'} · ${totalPts.toFixed(totalPts % 1 === 0 ? 0 : 1)} pts total`;
  }

  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'muted small';
    empty.style.cssText = 'padding:28px 12px; text-align:center; background:var(--glass); border-radius:var(--r-md); border:1px dashed var(--edge);';
    empty.textContent = _managedQuestions.length
      ? 'No questions match the search keyword or type filter.'
      : 'No questions yet in this exam. Click "+ New Question" above to create one.';
    host.append(empty);
    return;
  }

  filtered.forEach(q => {
    const card = document.createElement('div');
    const isExpanded = String(q.row) === String(_managedExpandedRow);
    card.className = 'q-manage-card' + (isExpanded ? ' is-expanded' : '');
    card.id = `qCardRow_${q.row}`;
    card.style.flexShrink = '0';
    card.style.minHeight = '52px';
    card.style.boxSizing = 'border-box';

    // Card Header Trigger
    const header = document.createElement('div');
    header.className = 'q-card-header';
    header.setAttribute('role', 'button');
    header.setAttribute('tabindex', '0');
    header.setAttribute('aria-expanded', isExpanded ? 'true' : 'false');
    header.setAttribute('aria-controls', `qDropdown_${q.row}`);

    const typeChipClass = 'q-chip q-chip-' + String(q.type || 'mc').toLowerCase();
    header.innerHTML = `
      <div class="q-header-left">
        <span class="q-card-num">Q${esc(q.no)}</span>
        <span class="${typeChipClass}">${esc(q.type)}</span>
        <span class="q-card-prompt-preview">${esc(q.question || 'Untitled question')}</span>
      </div>
      <div class="q-header-right">
        <span class="q-card-meta">${esc(q.points || 1)} pt${q.points == 1 ? '' : 's'}${q.timer ? ' · ⏱ ' + esc(q.timer) + 's' : ''}</span>
        <span class="btn-sm btn-outline q-dropdown-btn">
          Manage
          <svg class="q-chevron" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9"></polyline></svg>
        </span>
      </div>
    `;

    const toggle = () => {
      if (_managedExpandedRow === q.row) {
        _managedExpandedRow = null;
        _managedEditingRow = null;
      } else {
        _managedExpandedRow = q.row;
        _managedEditingRow = null;
      }
      renderManagedQuestionList();
    };

    header.onclick = toggle;
    header.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    };

    card.append(header);

    // If expanded, render the management dropdown body
    if (isExpanded) {
      const dropdown = document.createElement('div');
      dropdown.className = 'q-manage-dropdown';
      dropdown.id = `qDropdown_${q.row}`;

      if (_managedEditingRow === q.row) {
        // INLINE EDIT MODE
        dropdown.innerHTML = `
          <div class="q-inline-editor">
            <div class="two" style="margin-bottom:10px;">
              <div>
                <label class="lbl">Question Type</label>
                <select class="field edit-q-type">
                  <option value="MC" ${q.type === 'MC' ? 'selected' : ''}>Multiple choice</option>
                  <option value="TF" ${q.type === 'TF' ? 'selected' : ''}>True or false</option>
                  <option value="ID" ${q.type === 'ID' ? 'selected' : ''}>Identification</option>
                  <option value="EN" ${q.type === 'EN' ? 'selected' : ''}>Enumeration</option>
                  <option value="MA" ${q.type === 'MA' ? 'selected' : ''}>Matching</option>
                  <option value="WB" ${q.type === 'WB' ? 'selected' : ''}>Word bank</option>
                </select>
              </div>
              <div class="two">
                <div>
                  <label class="lbl">Timer (seconds)</label>
                  <input class="field edit-q-timer" type="number" min="5" max="3600" placeholder="Default" value="${esc(q.timer || '')}">
                </div>
                <div>
                  <label class="lbl">Points</label>
                  <input class="field edit-q-points" type="number" min="0.01" step="0.01" value="${esc(q.points || 1)}">
                </div>
              </div>
            </div>

            <div style="margin-bottom:10px;">
              <label class="lbl">Question Prompt</label>
              <textarea class="field edit-q-text" rows="3" placeholder="Enter question prompt…">${esc(q.question || '')}</textarea>
            </div>

            <div class="edit-wrap-choices" style="margin-bottom:10px; display:${(q.type === 'MC' || q.type === 'MA' || q.type === 'WB') ? 'block' : 'none'};">
              <label class="lbl edit-lbl-choices">${q.type === 'MA' ? 'Premises / Left Items (one per line)' : (q.type === 'WB' ? 'Word Bank Pool (one per line)' : 'Choices / Options (one per line)')}</label>
              <textarea class="field mono edit-q-choices" rows="4">${esc((q.choices || []).join('\r\n'))}</textarea>
            </div>

            <div class="edit-wrap-answers" style="margin-bottom:10px;">
              <label class="lbl edit-lbl-answers">${q.type === 'MA' ? 'Matching Right Items (line-by-line match)' : (q.type === 'EN' ? 'Required Items (one per line)' : 'Answer Key (one per line)')}</label>
              <div class="edit-tf-toggle" style="display:${q.type === 'TF' ? 'flex' : 'none'}; gap:8px; margin-bottom:6px;">
                <button type="button" class="btn btn-sm btn-outline edit-tf-btn ${String((q.answers || [])[0] || '').toLowerCase().startsWith('t') ? 'selected' : ''}" data-val="True" style="flex:1;">✓ True</button>
                <button type="button" class="btn btn-sm btn-outline edit-tf-btn ${String((q.answers || [])[0] || '').toLowerCase().startsWith('f') ? 'selected' : ''}" data-val="False" style="flex:1;">✕ False</button>
              </div>
              <textarea class="field mono edit-q-answers" rows="3">${esc((q.answers || []).join('\r\n'))}</textarea>
            </div>

            <div class="actions" style="display:flex; justify-content:space-between; align-items:center; margin-top:14px;">
              <button type="button" class="btn-sm btn-danger btn-edit-delete">🗑️ Delete</button>
              <div style="display:flex; gap:8px;">
                <button type="button" class="btn-sm btn-ghost btn-edit-cancel">Cancel</button>
                <button type="button" class="btn-sm btn-primary btn-edit-save">Save Changes</button>
              </div>
            </div>
            <div class="edit-q-msg" role="status" aria-live="polite" style="margin-top:6px;"></div>
          </div>
        `;

        // Attach listeners for inline edit mode
        const selType = dropdown.querySelector('.edit-q-type');
        const wrapChoices = dropdown.querySelector('.edit-wrap-choices');
        const lblChoices = dropdown.querySelector('.edit-lbl-choices');
        const tfToggle = dropdown.querySelector('.edit-tf-toggle');
        const txtAnswers = dropdown.querySelector('.edit-q-answers');

        selType.onchange = () => {
          const t = selType.value;
          wrapChoices.style.display = (t === 'MC' || t === 'MA' || t === 'WB') ? 'block' : 'none';
          tfToggle.style.display = (t === 'TF') ? 'flex' : 'none';
          if (t === 'MA') {
            lblChoices.textContent = 'Premises / Left Items (one per line)';
          } else if (t === 'WB') {
            lblChoices.textContent = 'Word Bank Pool (one per line)';
          } else {
            lblChoices.textContent = 'Choices / Options (one per line)';
          }
        };

        dropdown.querySelectorAll('.edit-tf-btn').forEach(btn => {
          btn.onclick = () => {
            dropdown.querySelectorAll('.edit-tf-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            txtAnswers.value = btn.getAttribute('data-val');
          };
        });

        dropdown.querySelector('.btn-edit-cancel').onclick = () => {
          _managedEditingRow = null;
          renderManagedQuestionList();
        };

        dropdown.querySelector('.btn-edit-delete').onclick = () => deleteManagedQuestion(q);

        dropdown.querySelector('.btn-edit-save').onclick = async () => {
          const prompt = dropdown.querySelector('.edit-q-text').value.trim();
          const out = dropdown.querySelector('.edit-q-msg');
          if (!prompt) {
            out.innerHTML = '<div class="msg bad">Question prompt is required.</div>';
            return;
          }
          const updatedQ = {
            question: prompt,
            type: selType.value,
            choices: managedLines(dropdown.querySelector('.edit-q-choices').value),
            answers: managedLines(txtAnswers.value),
            timer: dropdown.querySelector('.edit-q-timer').value.trim(),
            points: dropdown.querySelector('.edit-q-points').value.trim() || '1'
          };

          const btnSave = dropdown.querySelector('.btn-edit-save');
          btnSave.disabled = true;
          btnSave.textContent = 'Saving…';
          try {
            const r = await api('teacherUpdateQuestion', {
              idToken: await idToken(),
              code: _currentDetailExamCode,
              row: q.row,
              question: updatedQ
            });
            if (!r.ok) throw new Error(r.message || 'Question could not be updated.');
            toast(`Question Q${q.no} updated.`, 'ok');
            play('pop');
            _managedEditingRow = null;
            await refreshManagedQuestions(q.row);
          } catch (err) {
            out.innerHTML = `<div class="msg bad">${esc(err.message)}</div>`;
            btnSave.disabled = false;
            btnSave.textContent = 'Save Changes';
          }
        };
      } else {
        // VIEW & QUICK ACTIONS MODE
        let detailsHtml = '';
        if (q.type === 'MC') {
          detailsHtml = `
            <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
              ${(q.choices || []).map((c, i) => {
                const letter = String.fromCharCode(65 + i);
                const isKey = (q.answers || []).map(a => a.toLowerCase()).includes(letter.toLowerCase()) ||
                              (q.answers || []).map(a => a.toLowerCase()).includes(c.toLowerCase());
                return `
                  <div style="display:flex; align-items:center; gap:6px; font-size:0.8rem; color:${isKey ? 'var(--ok)' : 'var(--fg)'}; font-weight:${isKey ? '600' : 'normal'};">
                    <span style="inline-size:20px; font-weight:700;">${letter}.</span>
                    <span>${esc(c)}</span>
                    ${isKey ? '<span class="q-answer-badge">✓ Key</span>' : ''}
                  </div>`;
              }).join('')}
            </div>
          `;
        } else if (q.type === 'TF') {
          detailsHtml = `
            <div style="margin-bottom:8px;">
              Answer Key: <span class="q-answer-badge">✓ ${(q.answers || [])[0] || '—'}</span>
            </div>`;
        } else if (q.type === 'ID') {
          detailsHtml = `
            <div style="margin-bottom:8px;">
              Accepted Answer(s): <span class="q-answer-badge">✓ ${(q.answers || []).join(' | ') || '—'}</span>
            </div>`;
        } else if (q.type === 'EN') {
          detailsHtml = `
            <div style="margin-bottom:8px;">
              <div class="muted small" style="margin-bottom:4px;">Required Items (${(q.answers || []).length}):</div>
              <ol style="margin:0; padding-left:18px; font-size:0.8rem;">
                ${(q.answers || []).map(a => `<li>${esc(a)}</li>`).join('')}
              </ol>
            </div>`;
        } else if (q.type === 'MA') {
          detailsHtml = `
            <div style="margin-bottom:8px;">
              <div class="muted small" style="margin-bottom:4px;">Matching Pairs:</div>
              <table style="inline-size:100%; font-size:0.8rem; border-collapse:collapse;">
                ${(q.choices || []).map((c, i) => `
                  <tr style="border-bottom:1px dashed var(--edge);">
                    <td style="padding:2px 6px;">${esc(c)}</td>
                    <td style="padding:2px 6px; font-weight:600; color:var(--accent);">➔ ${esc((q.answers || [])[i] || '—')}</td>
                  </tr>`).join('')}
              </table>
            </div>`;
        } else if (q.type === 'WB') {
          detailsHtml = `
            <div style="margin-bottom:8px;">
              <div class="muted small" style="margin-bottom:4px;">Word Pool:</div>
              <div style="display:flex; flex-wrap:wrap; gap:4px; margin-bottom:6px;">
                ${(q.choices || []).map(c => `<span class="pill" style="font-size:0.75rem;">${esc(c)}</span>`).join('')}
              </div>
              <div class="muted small">Key: <span class="q-answer-badge">✓ ${(q.answers || []).join(', ')}</span></div>
            </div>`;
        }

        dropdown.innerHTML = `
          <div class="q-full-prompt">${esc(q.question || 'Untitled question')}</div>
          <div class="q-details-box">
            ${detailsHtml}
          </div>
          <div class="q-dropdown-actions">
            <button type="button" class="btn-sm btn-outline btn-q-edit">✏️ Edit Question</button>
            <button type="button" class="btn-sm btn-outline btn-q-duplicate">📋 Duplicate</button>
            <button type="button" class="btn-sm btn-danger btn-q-delete">🗑️ Delete</button>
          </div>
        `;

        dropdown.querySelector('.btn-q-edit').onclick = () => {
          _managedEditingRow = q.row;
          renderManagedQuestionList();
        };

        dropdown.querySelector('.btn-q-duplicate').onclick = () => duplicateManagedQuestion(q);
        dropdown.querySelector('.btn-q-delete').onclick = () => deleteManagedQuestion(q);
      }

      card.append(dropdown);
    }

    host.append(card);
  });
}

async function duplicateManagedQuestion(q) {
  if (!window.confirm(`Duplicate Question Q${q.no} in this exam?`)) return;
  try {
    toast(`Duplicating Q${q.no}…`, 'ok');
    const cloneSpec = managedSpec({
      ...q,
      question: q.question + ' (Copy)'
    });
    const r = await api('teacherAddQuestions', {
      idToken: await idToken(),
      code: _currentDetailExamCode,
      specs: [cloneSpec],
      mode: 'append'
    });
    if (!r.ok) throw new Error(r.message || 'Could not duplicate question.');
    toast(`Question Q${q.no} duplicated!`, 'ok');
    play('pop');
    await refreshManagedQuestions();
    // Expand the newly added question at the end
    if (_managedQuestions.length) {
      _managedExpandedRow = _managedQuestions[_managedQuestions.length - 1].row;
      renderManagedQuestionList();
    }
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function deleteManagedQuestion(q) {
  if (!window.confirm(`Delete Question Q${q.no} from this exam? This cannot be undone.`)) return;
  try {
    toast(`Deleting Q${q.no}…`, 'warn');
    const r = await api('teacherDeleteQuestion', {
      idToken: await idToken(),
      code: _currentDetailExamCode,
      row: q.row
    });
    if (!r.ok) throw new Error(r.message || 'Could not delete question.');
    toast(`Question Q${q.no} deleted.`, 'ok');
    play('pop');
    _managedExpandedRow = null;
    _managedEditingRow = null;
    await refreshManagedQuestions();
  } catch (err) {
    toast(err.message, 'bad');
  }
}

async function refreshManagedQuestions(expandRow) {
  const r = await api('teacherListQuestions', { idToken: await idToken(), code: _currentDetailExamCode });
  if (!r.ok) throw new Error(r.message || 'Could not load questions.');
  _managedQuestions = r.questions || [];
  if (expandRow) {
    _managedExpandedRow = expandRow;
  }
  renderManagedQuestionList();
  if ($('detailQCount')) $('detailQCount').textContent = _managedQuestions.length;
}

async function openQuestionManager() {
  if (!_currentDetailExamCode) return;
  $('manageQModalTitle').textContent = `Manage Questions (${_currentDetailExamCode})`;
  $('manageQuestionsList').innerHTML = '<p class="muted small" style="padding:20px;text-align:center;">Loading questions…</p>';
  if ($('manageNewQuestionBox')) $('manageNewQuestionBox').hidden = true;
  _managedExpandedRow = null;
  _managedEditingRow = null;
  _managedSearchQuery = '';
  _managedTypeFilter = 'ALL';
  if ($('manageQSearch')) $('manageQSearch').value = '';
  document.querySelectorAll('#manageQTypeFilter .q-filter-btn').forEach(b => {
    b.classList.toggle('on', b.getAttribute('data-type') === 'ALL');
  });

  openModal($('manageQuestionsModal'), $('manageQSearch'));
  try { await refreshManagedQuestions(); }
  catch (err) { $('manageQuestionsList').innerHTML = `<p class="msg bad" style="padding:12px;">${esc(err.message)}</p>`; }
}

if ($('btnCloseManageQuestions')) $('btnCloseManageQuestions').onclick = () => closeModal($('manageQuestionsModal'));
if ($('btnManageQuestions')) $('btnManageQuestions').onclick = openQuestionManager;

// Toolbar Search and Filter Listeners
if ($('manageQSearch')) {
  $('manageQSearch').oninput = (e) => {
    _managedSearchQuery = e.target.value;
    renderManagedQuestionList();
  };
}

document.querySelectorAll('#manageQTypeFilter .q-filter-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#manageQTypeFilter .q-filter-btn').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    _managedTypeFilter = btn.getAttribute('data-type');
    renderManagedQuestionList();
  };
});

// "+ New Question" Composer Toggle & Handlers
if ($('btnNewManagedQuestion')) {
  $('btnNewManagedQuestion').onclick = () => {
    const box = $('manageNewQuestionBox');
    if (!box) return;
    box.hidden = !box.hidden;
    if (!box.hidden) {
      if ($('newQText')) $('newQText').focus();
      if ($('newQMsg')) $('newQMsg').replaceChildren();
    }
  };
}

['btnCancelNewManagedQuestion', 'btnCancelNewManagedQuestion2'].forEach(id => {
  if ($(id)) {
    $(id).onclick = () => {
      if ($('manageNewQuestionBox')) $('manageNewQuestionBox').hidden = true;
    };
  }
});

if ($('newQType')) {
  $('newQType').onchange = (e) => {
    const t = e.target.value;
    if ($('wrapNewQChoices')) $('wrapNewQChoices').style.display = (t === 'MC' || t === 'MA' || t === 'WB') ? 'block' : 'none';
    if ($('newQTFToggle')) $('newQTFToggle').style.display = (t === 'TF') ? 'flex' : 'none';
    if ($('lblNewQChoices')) {
      $('lblNewQChoices').textContent = t === 'MA' ? 'Premises (one per line)' : (t === 'WB' ? 'Word Pool (one per line)' : 'Choices (one per line)');
    }
  };
}

document.querySelectorAll('#newQTFToggle .new-tf-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#newQTFToggle .new-tf-btn').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    if ($('newQAnswers')) $('newQAnswers').value = btn.getAttribute('data-val');
  };
});

if ($('btnSaveNewManagedQuestion')) {
  $('btnSaveNewManagedQuestion').onclick = async () => {
    const prompt = ($('newQText')?.value || '').trim();
    const out = $('newQMsg');
    if (!prompt) {
      if (out) out.innerHTML = '<div class="msg bad">Question prompt is required.</div>';
      return;
    }

    const newQ = {
      question: prompt,
      type: $('newQType')?.value || 'ID',
      choices: managedLines($('newQChoices')?.value),
      answers: managedLines($('newQAnswers')?.value),
      timer: ($('newQTimer')?.value || '').trim(),
      points: ($('newQPoints')?.value || '1').trim() || '1'
    };

    const btn = $('btnSaveNewManagedQuestion');
    btn.disabled = true;
    btn.textContent = 'Adding…';
    try {
      const r = await api('teacherAddQuestions', {
        idToken: await idToken(),
        code: _currentDetailExamCode,
        specs: [managedSpec(newQ)],
        mode: 'append'
      });
      if (!r.ok) throw new Error(r.message || 'Could not add question.');
      toast('New question added to exam!', 'ok');
      play('submit');
      if ($('manageNewQuestionBox')) $('manageNewQuestionBox').hidden = true;
      if ($('newQText')) $('newQText').value = '';
      if ($('newQChoices')) $('newQChoices').value = '';
      if ($('newQAnswers')) $('newQAnswers').value = '';
      await refreshManagedQuestions();
      // Expand newly added question at the end
      if (_managedQuestions.length) {
        _managedExpandedRow = _managedQuestions[_managedQuestions.length - 1].row;
        renderManagedQuestionList();
      }
    } catch (err) {
      if (out) out.innerHTML = `<div class="msg bad">${esc(err.message)}</div>`;
    } finally {
      btn.disabled = false;
      btn.textContent = 'Add Question';
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
    const edpBadge = s.edpCode
      ? `<span class="pill-edp" title="EDP Code">🏷️ EDP: <b>${esc(s.edpCode)}</b></span>`
      : `<span class="pill-edp unassigned" title="No EDP Code assigned">🏷️ EDP: <i>Unassigned</i></span>`;

    info.innerHTML = `
      <div class="student-name">${esc(s.lastName)}, ${esc(s.firstName)}</div>
      <div class="student-meta">
        ${s.studentId ? '<span class="pill-id">ID: ' + esc(s.studentId) + '</span>' : ''}
        ${edpBadge}
        ${s.course ? '<span class="chip-subtle">' + esc(s.course) + '</span>' : ''}
        ${s.section ? '<span class="chip-subtle">Sec: ' + esc(s.section) + '</span>' : ''}
        ${s.year ? '<span class="chip-subtle">' + esc(s.year) + '</span>' : ''}
      </div>
      <div class="student-email ${s.email ? 'linked' : ''}">${s.email ? '📧 ' + esc(s.email) : '⚪ Unclaimed (No Google account linked)'}</div>
    `;

    const actions = document.createElement('div');
    actions.className = 'student-actions';
    const studentName = `${s.firstName || ''} ${s.lastName || ''}`.trim() || 'student';

    const btnEdit = document.createElement('button');
    btnEdit.type = 'button';
    btnEdit.className = 'btn-tbl-action';
    btnEdit.innerHTML = '✏️ Edit';
    btnEdit.setAttribute('aria-label', `Edit student ${studentName}`);
    btnEdit.onclick = () => openEditStudent(s);
    actions.append(btnEdit);

    if (s.email) {
      const btnUnlink = document.createElement('button');
      btnUnlink.type = 'button';
      btnUnlink.className = 'btn-tbl-action unlink';
      btnUnlink.innerHTML = '🔓 Unlink';
      btnUnlink.setAttribute('aria-label', `Unlink account for ${studentName}`);
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
  if ($('editStudentId')) $('editStudentId').value = s.studentId || '';
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
      studentId: $('editStudentId')?.value.trim() || '',
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
  populateAddStudentEdpOptions(CACHE.exams || []);
  if ($('addEdp')) $('addEdp').value = '';
  if ($('addPaste')) $('addPaste').value = '';
  $('addOut').replaceChildren();
  $('btnDoAdd').disabled = true;
  openModal($('addStudentsModal'), $('addEdp'));
};
$('btnCloseAdd').onclick = () => {
  closeModal($('addStudentsModal'));
  $('addOut').replaceChildren();
};

$('btnCheckStudents').onclick = async () => {
  const edpCode = $('addEdp')?.value.trim() || '';
  const paste   = $('addPaste')?.value.trim() || '';
  const course  = '';
  const section = '';

  if (!edpCode) {
    toast('Choose an EDP code from a created exam.', 'bad');
    $('addEdp')?.focus();
    return;
  }
  if (!paste) {
    toast('Please paste the class list (one student per line).', 'bad');
    $('addPaste')?.focus();
    return;
  }

  const btn = $('btnCheckStudents');
  btn.disabled = true;
  btn.textContent = 'Checking…';
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

    $('addOut').textContent = lines.join('\r\n');
    $('addOut').style.whiteSpace = 'pre-line';
    $('btnDoAdd').disabled = !r.count;
  } catch (err) { $('addOut').textContent = 'Error: ' + err.message; }
  finally { btn.disabled = false; btn.textContent = 'Check the list'; }
};

$('btnDoAdd').onclick = async () => {
  const edpCode = $('addEdp')?.value.trim() || '';
  const paste   = $('addPaste')?.value.trim() || '';
  const course  = '';
  const section = '';

  if (!edpCode || !paste) return;

  const btn = $('btnDoAdd');
  btn.disabled = true;
  btn.textContent = 'Adding…';
  try {
    const r = await api('teacherAddStudents', { idToken: await idToken(), course, section, edpCode, paste });
    if (r.ok) {
      closeModal($('addStudentsModal'));
      $('addOut').replaceChildren();
      await loadStudents();
      const n = r.added || 0;
      toast(n + (n === 1 ? ' student' : ' students') + ' added to the Roster.', 'ok');
    } else { $('addOut').textContent = r.message || 'Error adding students.'; }
  } catch (err) { $('addOut').textContent = 'Error: ' + err.message; }
  finally { btn.disabled = false; btn.textContent = 'Add to Roster'; }
};

/* ================================================================
   Results
   ================================================================ */

function populateResultsPicker(exams) {
  const sel = $('resultsExamPicker');
  while (sel.options.length > 1) sel.remove(1);
  exams.forEach(ex => sel.add(new Option(ex.code + (ex.title ? ' — ' + ex.title : ''), ex.code)));
}

/** All EDP codes attached to exams the signed-in teacher can manage. */
function examEdpCodes(exams) {
  const codes = (exams || []).flatMap(ex => {
    if (Array.isArray(ex.edpCodes) && ex.edpCodes.length) return ex.edpCodes;
    return String(ex.edpCode || '').split(/[,;/]+/);
  }).map(code => String(code || '').trim()).filter(Boolean);
  return [...new Set(codes)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

/** Student enrolment is deliberately limited to EDP codes that belong to an exam. */
function populateAddStudentEdpOptions(exams) {
  const sel = $('addEdp');
  if (!sel) return;
  const previous = sel.value;
  const codes = examEdpCodes(exams);
  sel.replaceChildren(new Option(codes.length ? 'Select an EDP code…' : 'No exam EDP codes are available', ''));
  codes.forEach(code => sel.add(new Option(code, code)));
  sel.disabled = !codes.length;
  if (codes.includes(previous)) sel.value = previous;
}

function populateResultsEdpPicker(rows) {
  const sel = $('resultsEdpPicker');
  if (!sel) return;
  const previous = sel.value;
  const codes = [...new Set((rows || []).map(r => String(r.edpCode || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  sel.replaceChildren(new Option('All EDP codes', ''));
  codes.forEach(code => sel.add(new Option('EDP ' + code, code)));
  sel.disabled = !codes.length;
  if (codes.includes(previous)) sel.value = previous;
}

/**
 * Current Apps Script deployments may not return EDPCode with each attempt.
 * The teacher bootstrap already carries the authorised roster, so enrich the
 * result rows locally and keep EDP filtering usable while older deployments
 * are still in service.
 */
function resultRowsWithEdp(rows) {
  const edpByEmail = new Map((CACHE.students || []).map(student => [
    String(student.email || '').trim().toLowerCase(), String(student.edpCode || '')
  ]));
  return (rows || []).map(row => ({
    ...row,
    edpCode: row.edpCode || edpByEmail.get(String(row.email || '').trim().toLowerCase()) || ''
  }));
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
    r.rows = resultRowsWithEdp(r.rows);
    const wrap = document.createElement('div');
    wrap.className = 'stack';
    populateResultsEdpPicker(r.rows || []);
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
      const shownRows = () => {
        const edp = $('resultsEdpPicker')?.value || '';
        return edp ? r.rows.filter(row => String(row.edpCode || '') === edp) : r.rows;
      };
      renderResultsTable(tableWrap, shownRows(), r.total);
      tCard.append(tableWrap);
      // Export CSV button
      const exportBtn = document.createElement('button');
      exportBtn.className = 'btn-sm btn-outline';
      exportBtn.type = 'button';
      exportBtn.textContent = '⬇ Export CSV';
      exportBtn.onclick = () => exportCSV(shownRows(), code);

      let copyControls = buildResultCopyControls(shownRows, code);
      tCard.append(copyControls, exportBtn);
      wrap.append(tCard);
      $('resultsEdpPicker').onchange = () => {
        renderResultsTable(tableWrap, shownRows(), r.total);
        const replacement = buildResultCopyControls(shownRows, code);
        copyControls.replaceWith(replacement);
        copyControls = replacement;
      };
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
  wrap.replaceChildren();
  const tbl = document.createElement('table');
  tbl.className = 'results-table';
  tbl.innerHTML = `<caption>${rows.length} submission${rows.length === 1 ? '' : 's'}</caption>
  <thead><tr>
    <th scope="col">Student</th>
    <th scope="col">Score</th>
    <th scope="col">Attempt</th>
    <th scope="col">Status</th>
    <th scope="col">Time</th>
    <th scope="col">Anti-Cheat / Proctor Notes</th>
  </tr></thead>`;
  const tbody = document.createElement('tbody');
  rows.forEach(row => {
    const tr = document.createElement('tr');
    if (row.flagged || row.status === 'flagged') tr.classList.add('flag-row');

    const statusIcon = (row.flagged || row.status === 'flagged') ? '🚩'
      : row.status === 'in-progress' ? '🔄'
      : row.status === 'late' ? '⏰'
      : row.done ? '✅' : '—';

    const statusWord = (row.flagged || row.status === 'flagged') ? 'Flagged'
      : row.status === 'in-progress' ? 'In progress'
      : row.status === 'late' ? 'Late'
      : row.done ? 'Done' : 'Not started';

    const metaParts = [];
    if (row.course) metaParts.push(row.course);
    if (row.section) metaParts.push('Sec ' + row.section);
    if (row.email) metaParts.push(row.email);
    const metaStr = metaParts.join(' · ');

    tr.innerHTML = `
      <th scope="row">
        <div style="font-weight:600;">${esc(row.name || '—')}</div>
        ${metaStr ? `<div class="muted small" style="font-weight:normal; margin-top:2px;">${esc(metaStr)}</div>` : ''}
      </th>
      <td><b>${row.score != null ? row.score + ' / ' + total : '—'}</b></td>
      <td><span class="pill-try">Try #${row.attempt || 1}</span></td>
      <td><span aria-hidden="true">${statusIcon}</span> <span style="font-size:0.8125rem;">${statusWord}</span></td>
      <td>${row.minutes != null ? row.minutes + 'm' : '—'}</td>
      <td class="notes-cell"></td>`;

    const tdNotes = tr.cells[5];
    if (row.flagged || row.status === 'flagged' || (row.notes && row.notes.trim())) {
      const flagBox = document.createElement('div');
      if (row.flagged || row.status === 'flagged') {
        const badge = document.createElement('div');
        badge.className = 'cheat-badge';
        badge.textContent = '🚩 Suspected Tab Switching / Focus Loss';
        flagBox.append(badge);
      }
      if (row.notes) {
        const timeline = document.createElement('div');
        timeline.className = 'cheat-timeline';
        timeline.style.whiteSpace = 'pre-line';
        timeline.textContent = row.notes;
        flagBox.append(timeline);
      }
      tdNotes.append(flagBox);
    } else if (row.done) {
      tdNotes.innerHTML = `<span class="clean-session">✓ Clean session (No tab switch)</span>`;
    } else {
      tdNotes.innerHTML = `<span class="muted small">—</span>`;
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
  const headers = 'Name,StudentID,Email,Course,Section,EDPCode,Attempt,Score,Total,Status,Minutes,Notes';
  const lines = rows.map(r =>
    [
      r.name,
      r.studentId || r.id || '',
      r.email,
      r.course,
      r.section,
      r.edpCode || r.edp || '',
      r.attempt || 1,
      r.score,
      r.total,
      r.status,
      r.minutes,
      r.notes
    ].map(csvCell).join(','));
  // A BOM, or Excel reads the accented names in a Filipino roster as mojibake.
  const csv = '\ufeff' + [headers, ...lines].join('\r\r\n');

  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = code + '-results.csv';
  a.click();
  // Without this the whole file stays in memory until the tab is closed.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  toast('Downloaded ' + code + '-results.csv', 'ok');
}

/**
 * Build the spreadsheet-friendly copy area. It uses tabs, so pasting into
 * Sheets or Excel lands each selected value in its own column.
 */
function buildResultCopyControls(getRows, code) {
  const bar = document.createElement('div');
  bar.className = 'copy-results-controls';
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;';
  bar.innerHTML = `
    <span class="muted small" style="font-weight:600;">Copy columns:</span>
    <label class="small"><input type="checkbox" data-copy-column="name" checked> Student name</label>
    <label class="small"><input type="checkbox" data-copy-column="score" checked> ${esc(code)} score</label>
    <label class="small"><input type="checkbox" data-copy-headers> Include headers</label>`;
  const button = document.createElement('button');
  button.className = 'btn-sm btn-outline';
  button.type = 'button';
  button.textContent = '📋 Copy selected';
  button.onclick = () => {
    const columns = [...bar.querySelectorAll('[data-copy-column]:checked')].map(input => input.dataset.copyColumn);
    if (!columns.length) { toast('Select at least one column to copy.', 'bad'); return; }
    const rows = getRows();
    if (!rows.length) { toast('No result rows match this EDP filter.', 'bad'); return; }
    const includeHeaders = bar.querySelector('[data-copy-headers]').checked;
    copyResultColumns(rows, columns, code, includeHeaders, button);
  };
  bar.append(button);
  return bar;
}

function copyResultColumns(rows, columns, code, includeHeaders, button) {
  const labels = { name: 'Student Name', score: code };
  const textRows = rows.map(row => columns.map(column => {
    if (column === 'name') return row.name || '';
    if (column === 'score') return row.score == null ? '' : row.score;
    return '';
  }).join('\t'));
  const text = (includeHeaders ? [columns.map(column => labels[column]).join('\t')] : []).concat(textRows).join('\r\n');
  const done = () => {
    const old = button.textContent;
    button.textContent = '✓ Copied';
    setTimeout(() => { button.textContent = old; }, 1600);
    toast('Copied ' + rows.length + ' result row' + (rows.length === 1 ? '' : 's') + '.', 'ok');
  };
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done, () => fallbackCopyResultText(text, done));
  } else {
    fallbackCopyResultText(text, done);
  }
}

function fallbackCopyResultText(text, done) {
  const area = document.createElement('textarea');
  area.value = text;
  area.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
  document.body.append(area);
  area.select();
  try { if (document.execCommand('copy')) done(); else toast('Copy was blocked by this browser.', 'bad'); }
  catch { toast('Copy was blocked by this browser.', 'bad'); }
  area.remove();
}

/* Results Toolbar Listeners */
['all', 'flagged', 'done', 'in-progress'].forEach(mode => {
  const btnId = mode === 'all' ? 'filterResAll'
    : mode === 'flagged' ? 'filterResFlagged'
    : mode === 'done' ? 'filterResDone' : 'filterResBusy';
  const el = $(btnId);
  if (el) {
    el.onclick = () => {
      _currentResultsFilter = mode;
      document.querySelectorAll('#resultsFilterTabs .btn-filter').forEach(b => {
        b.classList.remove('on');
        b.setAttribute('aria-pressed', 'false');
      });
      el.classList.add('on');
      el.setAttribute('aria-pressed', 'true');
      applyResultsFilterAndRender();
    };
  }
});

if ($('searchResultQuery')) {
  $('searchResultQuery').oninput = (e) => {
    _currentResultsSearch = e.target.value.trim();
    applyResultsFilterAndRender();
  };
}

if ($('chkAutoRefreshResults')) {
  $('chkAutoRefreshResults').onchange = (e) => {
    if (e.target.checked) {
      toast('Live monitoring active (refreshing every 15s)', 'ok');
      if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
      _autoRefreshTimer = setInterval(() => {
        if (_currentDetailExamCode && !$('scTExamDetail').hidden) {
          loadExamResults(_currentDetailExamCode);
        }
      }, 15000);
    } else {
      if (_autoRefreshTimer) clearInterval(_autoRefreshTimer);
      _autoRefreshTimer = null;
    }
  };
}

if ($('btnExportCSV')) {
  $('btnExportCSV').onclick = () => {
    if (_allResultRows.length && _currentDetailExamCode) {
      exportCSV(_allResultRows, _currentDetailExamCode);
    } else {
      toast('No results to export.', 'bad');
    }
  };
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
    const emailDesc = email ? email : `account #${index + 1}`;
    if (!isAdmin) {
      actionsHtml += `<button type="button" class="btn-make-admin" data-action="make-admin" data-index="${index}" title="Promote to Administrator" aria-label="Promote ${esc(emailDesc)} to Administrator">👑 Make Admin</button>`;
    }
    if (index > 1) {
      actionsHtml += `<button type="button" class="btn-sm btn-ghost" data-action="move-up" data-index="${index}" title="Move Up" aria-label="Move ${esc(emailDesc)} up" style="padding:2px 6px;font-size:10px;">▲</button>`;
    }
    actionsHtml += `<button type="button" class="btn-sm btn-ghost" data-action="delete" data-index="${index}" title="Remove account" aria-label="Remove ${esc(emailDesc)}" style="color:var(--bad);padding:2px 6px;font-size:11px;">✕</button>`;

    row.innerHTML = `
      <div class="role-indicator">${roleTagHtml}</div>
      <div class="email-input-wrapper">
        <input type="email" class="field mono ${email && !isValidEmail(email) ? 'invalid' : ''}" value="${esc(email)}" placeholder="e.g. ${isAdmin ? 'admin@school.edu' : 'teacher@school.edu'}" aria-label="Teacher email at position ${index + 1}" data-index="${index}" style="font-size:12px;padding:5px 8px;inline-size:100%;" spellcheck="false">
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

    const parsed = raw.split(/[\r\n,;]+/)
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
    if (confirm('Are you sure you want to clear all accounts?\r\n\r\nThis will lock the Teacher Portal for everyone.')) {
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
