/* ==================================================================
   Proctor v2 — student client.

   Holds no answer key and computes no score. It collects answers and
   posts them once; the server grades.
   ================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, setPersistence, browserSessionPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

import {
  FIREBASE_CONFIG, API_URL, SCHOOL_NAME, HOSTED_DOMAIN, validateConfig,
  FEATURE_FLAGS, isDeltaAutosaveEnabled, EMERGENCY_SERVER_HALT, EMERGENCY_HALT_MESSAGE
} from './config.js';
import {
  initFx, play, haptic, feedback, announce, toast, confetti, revealIn,
  openModal, closeModal, mountSoundToggle, reducedMotion
} from './fx.js';

const $ = id => document.getElementById(id);

export function triggerEmergencyHalt() {
  console.warn('[EMERGENCY CIRCUIT BREAKER] Halting all student processes.');
  if (typeof S !== 'undefined' && S) {
    if (S.globalTick) { clearInterval(S.globalTick); S.globalTick = null; }
    if (S.tick) { clearInterval(S.tick); S.tick = null; }
    S.emergencyHalted = true;
  }
  if (typeof saveTimer !== 'undefined' && saveTimer) {
    clearInterval(saveTimer);
    saveTimer = null;
  }
  if (typeof warningCountdownInterval !== 'undefined' && warningCountdownInterval) {
    clearInterval(warningCountdownInterval);
    warningCountdownInterval = null;
  }

  try {
    if (typeof S !== 'undefined' && S && (S.token || S.answers)) {
      const backupKey = 'EMERGENCY_EXAM_BACKUP_' + (S.token || 'current');
      localStorage.setItem(backupKey, JSON.stringify({
        token: S.token,
        attemptId: S.attemptId,
        code: S.code,
        answers: S.answers,
        perQ: S.perQ,
        idx: S.idx,
        time: Date.now()
      }));
    }
  } catch (e) {
    console.warn('[EMERGENCY CIRCUIT BREAKER] backup failed:', e);
  }

  const title = $('fatalTitle');
  const text = $('fatalText');
  const btn = $('btnReload');
  if (title) title.textContent = '⚠️ Exam Paused by Instructor';
  if (text) {
    text.innerHTML = `
      <div style="background:rgba(239, 68, 68, 0.08); border:1px solid var(--bad,#ef4444); border-radius:10px; padding:18px; margin:16px 0; color:var(--fg,#111827); text-align:left;">
        <p style="font-weight:700; margin-top:0; color:var(--bad,#ef4444); font-size:1.1rem;">
          The server is temporarily unavailable and all exam processes have been safely paused.
        </p>
        <ul style="margin:10px 0 14px 20px; padding:0; font-size:0.95rem; line-height:1.6;">
          <li><b>Your exam timer is STOPPED.</b> You will NOT lose exam time.</li>
          <li><b>All your answers are SAFELY SAVED</b> locally on this computer.</li>
          <li><b>DO NOT close or reload this browser tab.</b></li>
        </ul>
        <p style="margin-bottom:0; font-size:0.88rem; color:var(--ink2,#4b5563);">
          Please wait quietly. When your instructor announces the server is restored, your exam will resume right where you left off.
        </p>
      </div>
    `;
  }
  if (btn) btn.hidden = true;

  document.querySelectorAll('[id^="sc"]').forEach(el => {
    el.hidden = (el.id !== 'scFatal');
  });
}

function reportStartupFailure(err) {
  if (EMERGENCY_SERVER_HALT) {
    triggerEmergencyHalt();
    return;
  }
  const detail = String(err?.message || err || 'unknown startup error');
  console.error('[student] startup failure:', err);
  const title = $('fatalTitle');
  const text = $('fatalText');
  if (!title || !text) return;
  title.textContent = 'The exam page could not start';
  text.textContent = new URLSearchParams(location.search).has('diagnose')
    ? detail
    : 'Reload the page. If the problem continues, tell your instructor.';
  document.querySelectorAll('[id^="sc"]').forEach(el => { el.hidden = el.id !== 'scFatal'; });
}
addEventListener('error', event => reportStartupFailure(event.error || event.message));
addEventListener('unhandledrejection', event => reportStartupFailure(event.reason));

/* ---------------- theme ---------------- */

const prefersDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
const activeTheme = () => document.documentElement.dataset.theme || (prefersDark() ? 'dark' : 'light');

function labelTheme() {
  const btn = $('btnTheme');
  if (btn) {
    btn.setAttribute('aria-label',
      activeTheme() === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
  }
}

function setTheme(t) {
  document.documentElement.dataset.theme = t;
  try { localStorage.setItem('exam_theme_v1', t); } catch {}
  labelTheme();
}

/**
 * Runs a DOM change as a cross-fade where the browser supports one.
 *
 * A view transition is skipped whenever the page is not being painted — a
 * backgrounded tab, or a second tap arriving before the first has finished.
 * The update still runs; it is only the transition's promises that reject.
 * They are caught here, because a skipped animation is not an error and has
 * no business showing up in a student's console.
 */
function crossFade(update) {
  if (!document.startViewTransition ||
      matchMedia('(prefers-reduced-motion: reduce)').matches) {
    update();
    return;
  }
  const t = document.startViewTransition(update);
  t.ready?.catch(() => {});
  t.finished?.catch(() => {});
  t.updateCallbackDone?.catch(() => {});
}

if ($('btnTheme')) {
  $('btnTheme').onclick = () => {
    const next = activeTheme() === 'dark' ? 'light' : 'dark';
    crossFade(() => setTheme(next));
  };
  labelTheme();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) labelTheme();
});

/* ---------------- interaction layer ----------------

   Sound, haptics, the cursor, the mote field and the ripple all come from
   fx.js, which the teacher portal loads too. The speaker button sits next
   to the theme button and is off until a student asks for it. */

initFx();
if ($('btnTheme')) mountSoundToggle($('btnTheme'));

/* ---------------- screens ---------------- */

const SCREENS = ['scLoading', 'scInAppBrowser', 'scSignIn', 'scFatal', 'scRegister', 'scPick',
                 'scNotListed', 'scStart', 'scHistory', 'scAccount',
                 'scQueue', 'scBrief', 'scResume', 'scReviewerLoading', 'scExam', 'scSending', 'scDone'];

/** What a screen is called, for the live region. */
const SCREEN_NAME = {
  scInAppBrowser: 'Open in your browser', scSignIn: 'Sign in',
  scStart: 'Choose your exam', scHistory: 'Exams you have taken',
  scAccount: 'Account', scRegister: 'Find your name', scPick: 'Which one is you',
  scNotListed: 'We could not find you', scQueue: 'Exam room admissions',
  scBrief: 'Exam details', scResume: 'Exam in progress', scReviewerLoading: 'Loading reviewer',
  scExam: 'Exam', scSending: 'Submitting', scDone: 'Exam submitted', scFatal: 'Something went wrong'
};

let awayAt = null;
let behaviorWarnings = 0;
let warningCountdownInterval = null;
let blurCheck = null;

function show(id) {
  const target = $(id);
  const changed = !target || target.hidden;
  SCREENS.forEach(s => {
    const el = $(s);
    if (el) el.hidden = (s !== id);
  });
  const inExam = id === 'scExam';
  if ($('brand')) $('brand').hidden = inExam;
  if ($('pillProgress')) $('pillProgress').hidden = !inExam;
  if ($('timerBar')) $('timerBar').hidden = !inExam;
  if ($('btnExit')) $('btnExit').hidden = !inExam;
  if (!inExam) {
    if ($('pillSkipped')) $('pillSkipped').hidden = true;
    if ($('pillTimer')) $('pillTimer').hidden = true;
    awayAt = null;
    if (blurCheck) {
      clearTimeout(blurCheck);
      blurCheck = null;
    }
    dismissWarning();
  }
  syncBar(id);          // declared below; function declarations hoist
  scrollTo(0, 0);

  if (!changed) return;
  // Toggling [hidden] moves nobody's focus and says nothing, so a screen
  // reader user would otherwise have no idea the page had changed at all.
  if (SCREEN_NAME[id]) announce(SCREEN_NAME[id]);
  if (id !== 'scExam' && target) revealIn(target);
}

/* ---------------- in-app browser gate ---------------- */

const IAB_DISMISSED_KEY = 'iab_dismissed';
let iabCopyResetTimer = null;

/**
 * Identifies embedded browsers that cannot reliably complete Google OAuth.
 * Optional arguments keep the detector deterministic in unit tests while the
 * defaults read the real browser environment in production.
 */
export function detectInAppBrowser(
  userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '',
  environment = {}
) {
  const ua = String(userAgent || '');
  const nav = typeof navigator !== 'undefined' ? navigator : {};
  const platformName = String(environment.platform ?? nav.platform ?? '');
  const maxTouchPoints = Number(environment.maxTouchPoints ?? nav.maxTouchPoints ?? 0);
  const standalone = environment.standalone ?? (nav.standalone === true);
  const isIOS = /\b(?:iPhone|iPad|iPod)\b/i.test(ua) ||
    (platformName === 'MacIntel' && maxTouchPoints > 1);
  const isAndroid = /\bAndroid\b/i.test(ua);
  const platform = isIOS ? 'ios' : (isAndroid ? 'android' : 'other');

  // An installed PWA is a full browser context even when its iOS user-agent
  // happens to resemble a WKWebView.
  if (standalone === true) {
    return { isInApp: false, platform, app: '', reason: 'standalone' };
  }

  const appSignatures = [
    ['Messenger', /\b(?:FBAN\/MessengerForiOS|MessengerForiOS|FB_IAB\/(?:MESSENGER|ORCA)|FBAN\/(?:MESSENGER|EMA|MESSENGERLITE))\b/i],
    ['Facebook', /\b(?:FBAN|FBAV|FB_IAB)\//i],
    ['Instagram', /\bInstagram\b/i],
    ['TikTok', /\b(?:TikTok|musical_ly|ByteDanceWebview)\b/i],
    ['LINE', /\bLine\//i],
    ['X / Twitter', /\b(?:Twitter for iPhone|TwitterAndroid|Twitter)\b/i],
    ['Snapchat', /\bSnapchat\b/i],
    ['WeChat', /\b(?:MicroMessenger|WeChat)\b/i],
    ['LinkedIn', /\bLinkedInApp\b/i],
    ['Pinterest', /\bPinterest\b/i]
  ];

  for (const [app, signature] of appSignatures) {
    if (signature.test(ua)) {
      return { isInApp: true, platform, app, reason: 'app-signature' };
    }
  }

  if (isIOS && /AppleWebKit/i.test(ua) && /Mobile\//i.test(ua)) {
    const isSafari = /Version\/[\d.]+[\s\S]*Safari\/[\d.]+/i.test(ua);
    const isKnownIOSBrowser = /\b(?:CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|Brave|YaBrowser)\//i.test(ua);
    if (!isSafari && !isKnownIOSBrowser) {
      return { isInApp: true, platform, app: 'iOS app', reason: 'ios-webview' };
    }
  }

  const isAndroidWebView = isAndroid && /\bwv\b/i.test(ua) && /\bVersion\/[\d.]+/i.test(ua);
  if (isAndroidWebView) {
    return { isInApp: true, platform, app: 'Android app', reason: 'android-webview' };
  }

  return { isInApp: false, platform, app: '', reason: '' };
}

function iabWasDismissed() {
  try { return sessionStorage.getItem(IAB_DISMISSED_KEY) === '1'; }
  catch { return false; }
}

function chromeIntentFor(href) {
  try {
    const original = new URL(href);
    if (original.protocol !== 'https:' && original.protocol !== 'http:') return '';
    const fallback = original.href;
    original.hash = '';
    const target = original.host + original.pathname + original.search;
    return 'intent://' + target + '#Intent;scheme=' + original.protocol.slice(0, -1) +
      ';package=com.android.chrome;S.browser_fallback_url=' + encodeURIComponent(fallback) + ';end';
  } catch {
    return '';
  }
}

function configureIabScreen(info) {
  const appName = info.app || 'In-app';
  const isAndroid = info.platform === 'android';
  const browserName = isAndroid ? 'Chrome or your default browser' :
    (info.platform === 'ios' ? 'Safari' : 'your regular browser');

  $('iabAppBadge').textContent = appName + ' browser detected';
  $('iabHeading').textContent = 'Please open this page in ' + browserName;
  $('iabExplanation').textContent = appName +
    ' can block Google Sign-In and can mistake app notifications or gestures for leaving an exam.';
  $('iabStepOne').innerHTML = 'In ' + appName +
    ', tap <b>…</b> (three dots) or the Share/menu icon in the top or bottom corner.';
  $('iabOpenLabel').textContent = isAndroid ? 'Open in Chrome or Open in browser' :
    (info.platform === 'ios' ? 'Open in Safari' : 'Open in browser');

  const chromeLink = $('btnOpenChrome');
  const intent = isAndroid ? chromeIntentFor(location.href) : '';
  chromeLink.hidden = !intent;
  if (intent) chromeLink.href = intent;
}

function showSignedOutEntry() {
  const info = detectInAppBrowser();
  if (info.isInApp && !iabWasDismissed()) {
    configureIabScreen(info);
    show('scInAppBrowser');
    return;
  }
  show('scSignIn');
}

function fallbackCopyText(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.readOnly = true;
  area.setAttribute('aria-hidden', 'true');
  area.style.position = 'absolute';
  area.style.left = '-9999px';
  document.body.append(area);
  area.select();
  let copied = false;
  try { copied = document.execCommand('copy'); } catch {}
  area.remove();
  return copied;
}

async function copyIabLink() {
  const button = $('btnCopyIabLink');
  const status = $('iabCopyStatus');
  const link = location.href;
  let copied = false;

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(link);
      copied = true;
    } else {
      copied = fallbackCopyText(link);
    }
  } catch {
    copied = fallbackCopyText(link);
  }

  clearTimeout(iabCopyResetTimer);
  button.textContent = copied ? '✓ Exam Link Copied' : 'Copy was blocked';
  status.textContent = copied
    ? 'Paste the copied link into your regular browser.'
    : 'Press and hold the address bar, copy this page address, then paste it into your regular browser.';
  iabCopyResetTimer = setTimeout(() => {
    button.textContent = '📋 Copy Exam Link';
  }, 3500);
}

if ($('btnCopyIabLink')) $('btnCopyIabLink').onclick = copyIabLink;
if ($('btnDismissIab')) {
  $('btnDismissIab').onclick = () => {
    try { sessionStorage.setItem(IAB_DISMISSED_KEY, '1'); } catch {}
    show('scSignIn');
  };
}

function fatal(title, msg) {
  $('fatalTitle').textContent = title;
  $('fatalText').textContent = msg;
  show('scFatal');
}
$('btnReload').onclick = () => location.reload();
if ($('btnFatalBack')) {
  $('btnFatalBack').onclick = () => {
    S.active = null;
    if ($('activeExamCard')) $('activeExamCard').hidden = true;
    boot('scStart');
  };
}

/* ---------------- configuration gate ---------------- */

const configError = validateConfig();
if (configError) {
  fatal('The exam site is unavailable',
    'The exam site is missing an important setting. ' +
    'Please ask your teacher about this matter.');
  throw new Error(configError);
}

if (EMERGENCY_SERVER_HALT) {
  triggerEmergencyHalt();
}

/* ---------------- api ---------------- */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(action, payload = {}, { tries = 4, onRetry } = {}) {
  if (EMERGENCY_SERVER_HALT && action !== 'ping') {
    triggerEmergencyHalt();
    throw new Error('Server is currently paused by instructor.');
  }
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          action,
          ...payload
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const text = await res.text();
      try {
        return JSON.parse(text);
      } catch {
        // Almost always an HTML login page, which means the deployment is
        // not public. Permanent — do not burn retries on it.
        throw Object.assign(new Error('bad-response'), { permanent: true });
      }
    } catch (err) {
      lastErr = err;
      if (err.permanent || attempt === tries) break;
      const wait = Math.min(1200 * 2 ** (attempt - 1), 8000);
      onRetry?.(attempt, tries);
      await sleep(wait);
    }
  }
  throw lastErr;
}

let _cachedIdToken = '';

/** Firebase refreshes the token automatically; ask for a current one. */
async function idToken() {
  const u = auth?.currentUser;
  if (!u) throw new Error('signed-out');
  const tok = await u.getIdToken();
  _cachedIdToken = tok;
  return tok;
}

/* ---------------- auth ---------------- */

$('schoolName').textContent = SCHOOL_NAME || 'Online Exam';

let auth;
let db = null;
try {
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  try { db = getFirestore(app); } catch (e) { console.warn('[student] Firestore init:', e); }
  // Session persistence is preferred for shared school lab devices so accounts do not linger.
  // Fall back to local persistence if browser session storage is restricted.
  setPersistence(auth, browserSessionPersistence)
    .catch(() => setPersistence(auth, browserLocalPersistence))
    .catch(err => console.warn('[student] persistence error:', err));
} catch (err) {
  fatal('Sign-in is not set up', 'The exam site is missing its Firebase settings. Tell your instructor. (' + err.message + ')');
}

const provider = new GoogleAuthProvider();
provider.setCustomParameters({
  prompt: 'select_account',
  // Narrows the account picker to one Workspace domain. Client-side only
  // and trivially bypassed — the enforcing check is ALLOWED_EMAIL_DOMAINS
  // on the server.
  ...(HOSTED_DOMAIN ? { hd: HOSTED_DOMAIN } : {})
});

$('btnSignIn').onclick = async () => {
  $('signInErr').hidden = true;
  const b = $('btnSignIn');
  b.disabled = true;
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    b.disabled = false;
    const code = err?.code || '';
    $('signInErr').textContent =
      code === 'auth/popup-blocked'
        ? 'Your browser blocked the sign-in window. Allow pop-ups for this site and try again.'
      : code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request'
        ? 'Sign-in was cancelled. Tap the button to try again.'
      : code === 'auth/unauthorized-domain'
        ? 'This site is not authorised for sign-in yet. Tell your instructor to add it in the Firebase console.'
        : 'Sign-in failed: ' + (err?.message || code);
    $('signInErr').hidden = false;
    announce($('signInErr').textContent, true);
    play('error');
  }
};

async function doSignOut() {
  try {
    sessionStorage.clear();
    if (S.token) await clearJournalAnswers(S.token).catch(() => {});
  } catch {}
  if (auth) {
    await signOut(auth).catch(() => {});
  }
  location.reload();
}

$('btnSignOut').onclick = doSignOut;

if (auth) {
  onAuthStateChanged(auth, user => {
    if (!user) { _cachedIdToken = ''; showSignedOutEntry(); return; }
    user.getIdToken().then(t => { _cachedIdToken = t; }).catch(() => {});
    $('loadingText').textContent = 'Loading your exams…';
    show('scLoading');
    boot();
  });
}

/** Must stay in step with TYPE_LABEL in Config.gs. */
const TYPE_NAME = {
  MC: 'Multiple choice',
  TF: 'True or false',
  ID: 'Identification',
  EN: 'Enumeration',
  MA: 'Matching',
  WB: 'Word bank'
};

/* ---------------- session backup & indexeddb journal ---------------- */

const IDB_NAME = 'proctor_journal_v1';
const IDB_STORE = 'answers';
let _idbPromise = null;

function getJournalDb() {
  if (_idbPromise) return _idbPromise;
  _idbPromise = new Promise(resolve => {
    if (typeof window === 'undefined' || !window.indexedDB) { resolve(null); return; }
    try {
      const req = window.indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE, { keyPath: ['token', 'qNo'] });
        }
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return _idbPromise;
}

async function recordJournalAnswer(token, qNo, val) {
  if (!token || qNo == null) return;
  const db = await getJournalDb();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put({
      token,
      qNo: String(qNo),
      val: (typeof val === 'object' && val !== null) ? JSON.parse(JSON.stringify(val)) : val,
      updatedAt: Date.now()
    });
  } catch {}
}

async function loadJournalAnswers(token) {
  if (!token) return {};
  const db = await getJournalDb();
  if (!db) return {};
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = req.result || [];
        const out = {};
        for (const row of rows) {
          if (row.token === token) {
            out[row.qNo] = row.val;
          }
        }
        resolve(out);
      };
      req.onerror = () => resolve({});
    } catch {
      resolve({});
    }
  });
}

async function clearJournalAnswers(token) {
  if (!token) return;
  const db = await getJournalDb();
  if (!db) return;
  try {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    const store = tx.objectStore(IDB_STORE);
    const req = store.getAll();
    req.onsuccess = () => {
      const rows = req.result || [];
      const delTx = db.transaction(IDB_STORE, 'readwrite');
      const delStore = delTx.objectStore(IDB_STORE);
      for (const row of rows) {
        if (row.token === token) {
          delStore.delete([row.token, row.qNo]);
        }
      }
    };
  } catch {}
}

function saveSessionBackup(token, answers) {
  if (!token) return;
  try { sessionStorage.setItem('exam_answers_' + token, JSON.stringify(answers)); } catch {}
}
function loadSessionBackup(token) {
  if (!token) return null;
  try {
    const raw = sessionStorage.getItem('exam_answers_' + token);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function clearSessionBackup(token) {
  if (!token) return;
  try { sessionStorage.removeItem('exam_answers_' + token); } catch {}
}

const _dirtyKeys = new Set();
let _deltaFlushTimer = null;
let _isFlushingDelta = false;
let _isFlushingFirestore = false;

function setDirtyAnswer(qNo, val) {
  if (qNo == null) return;
  S.answers[qNo] = val;
  saveSessionBackup(S.token, S.answers);
  recordJournalAnswer(S.token, qNo, val);
  _dirtyKeys.add(String(qNo));

  // If delta HTTP autosave is explicitly enabled (legacy fallback)
  if (isDeltaAutosaveEnabled(S.code) && S.token && !S.finished && !db) {
    if (_deltaFlushTimer) clearTimeout(_deltaFlushTimer);
    _deltaFlushTimer = setTimeout(() => {
      flushDeltaAnswers().catch(() => {});
    }, 2500);
  }
}

async function flushFirestoreCheckpoint(force = false) {
  const attId = S.attemptId || S.token;
  if (!db || !attId || !S.code || (S.finished && !force) || _dirtyKeys.size === 0) return false;

  if (_isFlushingFirestore) {
    if (!force) return false;
    let waitMs = 0;
    while (_isFlushingFirestore && waitMs < 2000) {
      await sleep(100);
      waitMs += 100;
    }
    if (_dirtyKeys.size === 0) return true;
    if (_isFlushingFirestore) return false;
  }

  _isFlushingFirestore = true;
  try {
    const ref = doc(db, 'exams', S.code, 'attempts', attId);
    await updateDoc(ref, {
      answers: S.answers,
      lastActiveAt: new Date().toISOString()
    });
    _dirtyKeys.clear();
    return true;
  } catch (err) {
    if (err?.code !== 'permission-denied') {
      console.warn('[student] Firestore checkpoint buffered locally:', err);
    }
    return false;
  } finally {
    _isFlushingFirestore = false;
  }
}

async function flushDeltaAnswers(force = false) {
  if (!S.token || (S.finished && !force) || _dirtyKeys.size === 0) return false;
  if (!force && !isDeltaAutosaveEnabled(S.code)) return false;

  if (_isFlushingDelta) {
    if (!force) return false;
    let waitMs = 0;
    while (_isFlushingDelta && waitMs < 2000) {
      await sleep(100);
      waitMs += 100;
    }
    if (_dirtyKeys.size === 0) return true;
    if (_isFlushingDelta) return false;
  }

  _isFlushingDelta = true;
  const toSendKeys = Array.from(_dirtyKeys);
  const delta = {};
  for (const k of toSendKeys) {
    delta[k] = S.answers[k] != null ? S.answers[k] : '';
  }
  try {
    const userToken = await idToken().catch(() => '');
    const r = await api('saveDelta', {
      token: S.token,
      delta,
      perQ: S.perQ,
      idToken: userToken
    }, { tries: 2 });

    if (r && r.ok) {
      for (const k of toSendKeys) {
        _dirtyKeys.delete(k);
      }
      return true;
    }
    return false;
  } catch (e) {
    return false;
  } finally {
    _isFlushingDelta = false;
  }
}

/* ---------------- state ---------------- */

const S = {
  email: '',
  edpCode: '',
  code: '', token: '', timerMode: 'per-question', defaultTimer: 45,
  questions: [], answers: {}, perQ: {},
  queue: [], pos: 0, deferred: [], secondPass: false,
  tick: null, globalTick: null, remaining: 0, span: 0, qStarted: 0,
  deadline: null, flags: [], finished: false, picked: ''
};

/* ---------------- boot ---------------- */

async function boot(destination = 'scStart') {
  let r;
  try {
    r = await api('bootstrap', { idToken: await idToken() });
  } catch (err) {
    fatal('Cannot reach the exam server',
      err.permanent
        ? 'The exam server rejected the request. Tell your instructor the deployment may not be set to "Anyone".'
        : 'Check your internet connection and reload.');
    return;
  }

  if (!r.ok) {
    if (r.authFailed) { await signOut(auth); show('scSignIn'); $('signInErr').textContent = r.message; $('signInErr').hidden = false; return; }
    fatal('Cannot start', r.message || 'Unknown error.');
    return;
  }

  S.email = r.email || '';
  S.edpCode = r.edpCode || '';
  $('whoEmail').textContent = r.email;
  if (r.lastName || r.firstName) {
    $('whoName').textContent = [r.lastName, r.firstName].filter(Boolean).join(', ');
    $('whoName').hidden = false;
    const bits = [
      r.studentId ? 'ID: ' + r.studentId : '',
      r.course,
      r.section ? 'Section ' + r.section : '',
      r.year,
      r.edpCode ? 'EDP: ' + r.edpCode : ''
    ].filter(Boolean).join('  ·  ');
    if (bits) $('whoEmail').textContent = bits + '\n' + r.email;
  }

  // Populate account tab
  if ($('accStudentId')) $('accStudentId').value = r.studentId || '';
  if (r.options) {
    fillSelect('accYear', r.options.years || [], r.year);
    fillSelect('accSection', r.options.sections || [], r.section);
  }

  const badgesWrap = $('whoMetaBadges');
  if (badgesWrap) {
    badgesWrap.replaceChildren();
    const addBadge = (txt, color) => {
      const span = document.createElement('span');
      span.className = 'pick-tag';
      if (color) { span.style.borderColor = color; span.style.color = color; }
      span.textContent = txt;
      badgesWrap.append(span);
    };
    if (r.studentId) addBadge('ID ' + r.studentId);
    if (r.course) addBadge(r.course);
    if (r.section) addBadge('Section ' + r.section);
    if (r.year) addBadge(r.year);
    if (r.edpCode) {
      String(r.edpCode).split(/[,;/]+/).map(s => s.trim()).filter(Boolean).forEach(edp => {
        addBadge('EDP ' + edp, 'var(--accent)');
      });
    }
  }

  // Not on the class list yet — sign them up rather than turning them away.
  if (!r.known) { showRegister(r); return; }

  if (r.emergencyStopActive) {
    S.emergencyStopActive = true;
    const banner = $('startErr');
    if (banner) {
      banner.textContent = 'Notice: New exam starts are temporarily paused by administration.';
      banner.hidden = false;
    }
  }

  if (r.blocked) {
    fatal('Your account is blocked',
      'Your instructor has blocked this account from taking exams. Please speak to them.');
    return;
  }

  if (r.active) {
    S.active = r.active;
    if ($('activeExamCard')) {
      $('activeExamCard').hidden = false;
      if ($('activeExamTitle')) {
        $('activeExamTitle').textContent = r.active.title || r.active.code;
      }
      if ($('activeExamProgress')) {
        const answered = r.active.answered || 0;
        const total = r.active.total || '—';
        $('activeExamProgress').textContent = `Answered ${answered} of ${total} questions`;
      }
      if ($('btnActiveResume')) {
        $('btnActiveResume').onclick = () => doResume(r.active.token);
      }
      if ($('btnActiveDiscard')) {
        $('btnActiveDiscard').onclick = async () => {
          const tok = r.active?.token;
          S.active = null;
          if ($('activeExamCard')) $('activeExamCard').hidden = true;
          if (tok) {
            clearSessionBackup(tok);
            clearJournalAnswers(tok).catch(() => {});
          }
          renderExams(S.availableExams || r.exams || []);
          try {
            const userToken = await idToken().catch(() => '');
            if (tok) await api('discardAttempt', { token: tok, idToken: userToken });
          } catch (e) {}
        };
      }
    }
  } else {
    S.active = null;
    if ($('activeExamCard')) $('activeExamCard').hidden = true;
  }

  renderExams(r.exams);
  renderHistory(r.history);
  show(destination === 'scHistory' ? 'scHistory' : 'scStart');
}

/**
 * Exams already sat, read from the student's Roster row. The server decides
 * whether a score may be shown, respecting the exam's "Show students"
 * setting while showing completed attempts immediately.
 *
 * The badge is the best score. Where there was more than one attempt, the
 * row opens to show the average and each try, so a student who improved can
 * see it rather than only their best number.
 */
function renderHistory(list) {
  const wrap = $('historyWrap');
  const empty = $('historyEmpty');
  wrap.replaceChildren();
  if (!list?.length) { wrap.hidden = true; empty.hidden = false; return; }
  wrap.hidden = false;
  empty.hidden = true;

  // No heading of its own any more — the History screen carries one.
  const box = document.createElement('div');
  box.className = 'stack';

  for (const h of list) {
    const many = h.showScore && h.tries?.length > 1;

    const row = document.createElement(many ? 'details' : 'div');
    row.className = 'past';

    const line = document.createElement(many ? 'summary' : 'div');
    line.className = 'past-line';

    const left = document.createElement('div');
    const t = document.createElement('div');
    t.className = 'past-t';
    t.textContent = h.title || h.code;

    const d = document.createElement('div');
    d.className = 'past-d';
    d.textContent = [h.date, h.attempts > 1 ? h.attempts + ' tries' : '']
      .filter(Boolean).join('  ·  ');
    left.append(t, d);

    const badge = document.createElement('span');
    if (h.showScore) {
      badge.className = 'past-s';
      badge.textContent = h.score + ' / ' + h.total;
      if (many) badge.title = 'Best of ' + h.attempts + ' tries';
    } else {
      badge.className = 'past-s pending';
      badge.textContent = h.pending ? 'Not released' : 'Submitted';
    }

    line.append(left, badge);
    row.append(line);

    if (many) {
      const detail = document.createElement('div');
      detail.className = 'past-tries';

      const avg = document.createElement('div');
      avg.className = 'past-d';
      avg.textContent = 'Average  ' + h.average + ' / ' + h.total;
      detail.append(avg);

      for (const tr of h.tries) {
        const li = document.createElement('div');
        li.className = 'past-d';
        li.textContent = 'Try ' + tr.no + '  ·  ' + tr.score + ' / ' + h.total;
        if (tr.score === h.score) li.classList.add('best');
        detail.append(li);
      }
      row.append(detail);
    }

    box.append(row);
  }
  wrap.append(box);
}

/* ---------------- one-time sign-up ---------------- */

function fillSelect(id, values, chosen) {
  const sel = $(id);
  sel.replaceChildren();
  const blank = document.createElement('option');
  blank.value = '';
  blank.textContent = 'Choose…';
  sel.append(blank);
  for (const v of values) {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    if (v === chosen) o.selected = true;
    sel.append(o);
  }
}

/* What the student typed, kept between the form and the pick list — the
   claim is checked against it again on the server. */
let signUp = null;

function showRegister(r) {
  // The lists come from the server so they can never drift from the ones
  // the exam settings filter against.
  const o = r.options || { years: [], courses: [], sections: [] };
  fillSelect('regYear', o.years, r.year);
  fillSelect('regCourse', o.courses, r.course);
  fillSelect('regSection', o.sections, r.section);

  if ($('regStudentId')) $('regStudentId').value = r.studentId || '';
  if ($('regEdp')) $('regEdp').value = r.edpCode || '';
  $('regLast').value = r.lastName || '';
  $('regFirst').value = r.firstName || '';
  $('regEmail').textContent = 'Signed in as ' + r.email;
  $('regErr').hidden = true;
  show('scRegister');
}

if ($('btnRegOut')) $('btnRegOut').onclick = doSignOut;

if ($('btnRegister')) {
  $('btnRegister').onclick = async () => {
    let lastName = $('regLast')?.value?.trim() || '';
    let firstName = $('regFirst')?.value?.trim() || '';
    // Auto-split if student pasted "Lastname, Firstname" into the Last Name field
    if (lastName.includes(',') && !firstName) {
      const parts = lastName.split(',');
      lastName = parts[0].trim();
      firstName = parts.slice(1).join(' ').trim();
      if ($('regLast')) $('regLast').value = lastName;
      if ($('regFirst')) $('regFirst').value = firstName;
    }

    const edpRaw = ($('regEdp')?.value || '').trim();
    const edpCode = edpRaw.replace(/^EDP\s*[-:#]?\s*/i, '').trim();

    const profile = {
      lastName,
      firstName,
      studentId: $('regStudentId')?.value?.trim() || '',
      edpCode,
      year:      $('regYear')?.value || '',
      course:    $('regCourse')?.value || '',
      section:   $('regSection')?.value || ''
    };

    const err = $('regErr');
    const isEdp = Boolean(profile.edpCode);
    const missingEdp = !profile.lastName || !profile.firstName;
    const missingSec = missingEdp || !profile.year || !profile.course || !profile.section;
    if (isEdp ? missingEdp : missingSec) {
      if (err) {
        err.textContent = isEdp
          ? 'Please enter your Last Name and First Name before continuing.'
          : 'Please fill in Name, Year, Course, and either Class EDP Code or Section before continuing.';
        err.hidden = false;
      }
      return;
    }
    if (err) err.hidden = true;

    const b = $('btnRegister');
    b.disabled = true; b.textContent = 'Looking…';
    try {
      const res = await api('search', { idToken: await idToken(), profile });
      if (!res.ok) {
        if (err) {
          err.textContent = res.message || 'Could not check the class list.';
          err.hidden = false;
          if (res.requiresEdp && $('regEdp')) {
            $('regEdp').focus();
          }
        }
        return;
      }
      signUp = profile;
      if (!res.candidates.length) { showNotListed(profile); return; }
      showPick(res.candidates);
    } catch {
      if (err) {
        err.textContent = 'Could not reach the server. Check your connection and try again.';
        err.hidden = false;
      }
    } finally {
      b.disabled = false; b.textContent = 'Find my name';
    }
  };
}

/* ---------------- picking your name ---------------- */

function pickErr(msg) { flagError($('pickErr'), msg); }

/**
 * The near-matches, as buttons. Course and section are shown on each one so
 * a student in the wrong section can see it before claiming anything.
 */
function showPick(candidates) {
  const wrap = $('pickList');
  if (wrap) wrap.replaceChildren();
  pickErr('');

  for (const c of candidates) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';

    const n = document.createElement('span');
    n.className = 'c';
    n.textContent = `${c.lastName}, ${c.firstName}`;

    const m = document.createElement('span');
    m.className = 'n';
    m.textContent = [
      c.studentId ? 'ID ' + c.studentId : '',
      c.course,
      c.section ? 'Section ' + c.section : '',
      c.edpCode ? 'EDP ' + c.edpCode : ''
    ].filter(Boolean).join('  ·  ');

    b.append(n, m);
    b.onclick = () => claim(c);
    if (wrap) wrap.append(b);
  }
  show('scPick');
}

async function claim(candidate) {
  const wrap = $('pickList');
  const buttons = wrap ? [...wrap.children] : [];
  const release = () => buttons.forEach(b => { b.disabled = false; });

  buttons.forEach(b => { b.disabled = true; });
  pickErr('');

  try {
    const res = await api('claim', {
      idToken: await idToken(),
      row: candidate.row,
      profile: signUp
    });
    if (!res.ok) {
      pickErr(res.message || 'Could not claim that name.');
      release();
      return;
    }
    if ($('loadingText')) $('loadingText').textContent = 'Loading your exams…';
    show('scLoading');
    boot();                       // straight through to the dashboard
  } catch {
    pickErr('Could not reach the server. Check your connection and try again.');
    release();
  }
}

if ($('btnPickBack')) $('btnPickBack').onclick = () => { pickErr(''); show('scRegister'); };

/* ---------------- Student EDP Self-Enrollment & Profile Update ---------------- */

if ($('btnAddEdp')) {
  $('btnAddEdp').onclick = async () => {
    const edpCode = ($('edpInput')?.value || '').trim();
    const okEl = $('edpOk');
    const errEl = $('edpErr');
    if (okEl) okEl.hidden = true;
    if (errEl) errEl.hidden = true;

    if (!edpCode) {
      if (errEl) { errEl.textContent = 'No EDP code was found in the input. Please enter a valid EDP code.'; errEl.hidden = false; }
      return;
    }

    const b = $('btnAddEdp');
    b.disabled = true; b.textContent = 'Adding…';
    try {
      const res = await api('enrollEdp', { idToken: await idToken(), edpCode });
      if (!res.ok) {
        if (errEl) { errEl.textContent = res.message || 'No EDP code was found in the input. Please check your code or ask your instructor.'; errEl.hidden = false; }
        return;
      }
      if (okEl) { okEl.textContent = res.message || 'Class added successfully!'; okEl.hidden = false; }
      feedback('ok', 10);
      play('chime');
      if (res.exams) renderExams(res.exams);
      if ($('edpInput')) $('edpInput').value = '';
      boot();
    } catch {
      if (errEl) { errEl.textContent = 'Could not reach server. Check connection.'; errEl.hidden = false; }
    } finally {
      b.disabled = false; b.textContent = 'Add Class';
    }
  };
}

if ($('btnSaveAccount')) {
  $('btnSaveAccount').onclick = async () => {
    const studentId = $('accStudentId')?.value?.trim() || '';
    const year = $('accYear')?.value || '';
    const section = $('accSection')?.value || '';
    const okEl = $('accOk');
    const errEl = $('accErr');
    if (okEl) okEl.hidden = true;
    if (errEl) errEl.hidden = true;

    const b = $('btnSaveAccount');
    b.disabled = true; b.textContent = 'Saving…';
    try {
      const res = await api('studentUpdateProfile', {
        idToken: await idToken(),
        studentId, year, section
      });
      if (!res.ok) {
        if (errEl) { errEl.textContent = res.message || 'Could not update profile.'; errEl.hidden = false; }
        return;
      }
      if (okEl) { okEl.textContent = 'Profile saved successfully!'; okEl.hidden = false; }
      feedback('ok', 10);
      play('chime');
      if (res.exams) renderExams(res.exams);
      boot();
    } catch {
      if (errEl) { errEl.textContent = 'Could not reach server. Check connection.'; errEl.hidden = false; }
    } finally {
      b.disabled = false; b.textContent = 'Save Profile';
    }
  };
}

/**
 * Nothing matched. There is no self-add — an unlisted student is the
 * instructor's to add, which is what keeps a stranger with a Google account
 * from putting themselves on the class list.
 */
function showNotListed(profile) {
  if ($('notListedWhy')) {
    $('notListedWhy').textContent =
      `No one close to "${profile.lastName}, ${profile.firstName}" is on the ` +
      `${profile.course} class list for ${profile.edpCode ? 'EDP ' + profile.edpCode : 'section ' + profile.section}. ` +
      `Check your spelling and class code first — a typo in either one hides your name.`;
  }
  if ($('notListedName')) $('notListedName').textContent = `${profile.lastName}, ${profile.firstName}`;
  if ($('notListedEmail')) $('notListedEmail').textContent = S.email || '';
  show('scNotListed');
}

if ($('btnNotListedBack')) $('btnNotListedBack').onclick = () => show('scRegister');
if ($('btnNotListedOut')) $('btnNotListedOut').onclick = doSignOut;

function splitEdpCodes(value) {
  return String(value || '')
    .replace(/^EDP\s+/i, '')
    .split(/[,;/]+/)
    .map(code => code.trim())
    .filter(Boolean);
}

/**
 * The server already narrows multi-EDP exams to the caller's own classes.
 * Keep this client-side guard as well: a stale Apps Script deployment must
 * never make a student portal disclose every other EDP assigned to an exam.
 */
function examAudienceLabel(exam) {
  const isEdp = exam.category === 'edp' || Boolean(exam.edpCode);
  if (isEdp) {
    const studentEdps = new Set(splitEdpCodes(S.edpCode));
    const advertised = [
      ...splitEdpCodes(exam.edpCode),
      ...splitEdpCodes(exam.categoryLabel)
    ];
    const matching = [...new Set(advertised.filter(code => studentEdps.has(code)))];
    return matching.length ? `EDP ${matching.join(', ')}` : 'EDP exam';
  }
  return exam.categoryLabel ||
    (exam.sections?.length ? `Section ${exam.sections.join(',')}` : 'General');
}

function renderExams(exams) {
  S.availableExams = exams || [];
  const wrap = $('examList');
  wrap.replaceChildren();
  if (!exams?.length) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = 'No exams are open right now. If your instructor just opened one, reload this page.';
    wrap.append(p);
    return;
  }

  const edpExams = exams.filter(e => e.category === 'edp' || (e.edpCode && !e.sections?.length));
  const secExams = exams.filter(e => !edpExams.includes(e));

  const buildCard = (e) => {
    const exhausted = e.triesLeft != null && Number(e.triesLeft) <= 0;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick' + (exhausted ? ' exhausted' : '');
    b.setAttribute('aria-pressed', 'false');

    const header = document.createElement('div');
    header.className = 'pick-header';
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = e.code;
    const badge = document.createElement('span');
    badge.className = 'pick-tag';
    if (S.active && S.active.code === e.code) {
      badge.style.color = 'var(--warn, #FBBF24)';
      badge.style.borderColor = 'var(--warn, #FBBF24)';
      badge.textContent = '🔄 In Progress';
    } else if (exhausted) {
      badge.style.color = 'var(--status-completed, #4E4338)';
      badge.style.borderColor = 'var(--status-completed, #4E4338)';
      badge.textContent = '● Completed';
    } else {
      badge.style.color = 'var(--ok)';
      badge.textContent = '● Open';
    }
    header.append(c, badge);

    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = e.title || e.code;

    const meta = document.createElement('div');
    meta.className = 'pick-meta';

    const catBadge = document.createElement('span');
    catBadge.className = 'pick-tag';
    catBadge.style.borderColor = 'var(--accent)';
    catBadge.style.color = 'var(--accent)';
    catBadge.textContent = examAudienceLabel(e);
    meta.append(catBadge);

    if (e.questions) {
      const qTag = document.createElement('span');
      qTag.className = 'pick-tag';
      qTag.textContent = `${e.questions} question${e.questions === 1 ? '' : 's'}`;
      meta.append(qTag);
    }
    if (e.triesLeft != null) {
      const tTag = document.createElement('span');
      const triesNum = Number(e.triesLeft);
      tTag.className = 'pick-tag pick-attempts-tag' + (exhausted ? ' exhausted' : (triesNum === 1 ? ' last-try' : ''));
      if (exhausted) {
        tTag.textContent = '⛔ 0 attempts left';
      } else if (triesNum === 1) {
        tTag.textContent = '⚠️ 1 attempt left';
      } else {
        tTag.textContent = `🎯 ${e.triesLeft} attempts left`;
      }
      meta.append(tTag);
    }
    if (e.closesAt) {
      const cTag = document.createElement('span');
      cTag.className = 'pick-tag pick-deadline-tag';
      cTag.textContent = `⏰ Deadline: ${e.closesAt}`;
      meta.append(cTag);
    }

    b.append(header, n, meta);
    b.onclick = () => {
      feedback('select', 10);
      if (exhausted) {
        err(`You have already used all attempts for this exam (${e.title || e.code}).`);
        return;
      }
      err('');
      S.picked = e.code;
      $('codeInput').value = '';
      for (const k of wrap.querySelectorAll('.pick')) k.setAttribute?.('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
    };
    return b;
  };

  if (edpExams.length && secExams.length) {
    const edpHead = document.createElement('div');
    edpHead.className = 'cat-group-header';
    edpHead.style.cssText = 'font-size:0.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-top:6px;';
    edpHead.textContent = '📋 EDP Code Exams';
    wrap.append(edpHead);
    edpExams.forEach(e => wrap.append(buildCard(e)));

    const secHead = document.createElement('div');
    secHead.className = 'cat-group-header';
    secHead.style.cssText = 'font-size:0.75rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:var(--accent);margin-top:14px;';
    secHead.textContent = '👥 Section Exams';
    wrap.append(secHead);
    secExams.forEach(e => wrap.append(buildCard(e)));
  } else {
    exams.forEach(e => wrap.append(buildCard(e)));
  }
}

$('codeInput').addEventListener('input', () => {
  S.picked = '';
  for (const k of $('examList').children) k.setAttribute?.('aria-pressed', 'false');
});

/* ---------------- start ---------------- */

/**
 * Error text is announced and the card twitches. Red alone is missed by
 * anyone who cannot see it and by anyone who was not looking at that
 * corner of the screen when it appeared.
 */
function flagError(el, msg) {
  el.textContent = msg || '';
  el.hidden = !msg;
  if (!msg) return;
  announce(msg, true);
  play('error');
  haptic(24);
  const card = el.closest('.card');
  if (card && !reducedMotion()) {
    card.classList.remove('fx-shake');
    void card.offsetWidth;
    card.classList.add('fx-shake');
    card.addEventListener('animationend', () => card.classList.remove('fx-shake'), { once: true });
  }
}

function err(msg) { flagError($('startErr'), msg); }

const ADMISSION_INITIAL_SPREAD_MS = 400;
// A large class can take several minutes to pass through the small server
// admission window. Keep one idempotent request alive instead of asking a
// student to restart it manually.
const ADMISSION_MAX_RETRIES = 36;

let _admissionCurrentPct = 0;
let _admissionTargetPct = 0;
let _admissionAnimTimer = null;

function updateAdmissionGauge_(pct) {
  const rounded = Math.round(pct);
  if ($('admissionPercent')) $('admissionPercent').textContent = `${rounded}%`;
  if ($('admissionProgressBar')) $('admissionProgressBar').style.width = `${Math.min(100, Math.max(0, pct))}%`;
  const gaugeBar = $('admissionGaugeBar');
  if (gaugeBar) {
    const circumference = 314.16;
    const offset = circumference - (pct / 100) * circumference;
    gaugeBar.style.strokeDashoffset = offset;
  }
}

function setAdmissionProgress(targetPct, { title, text, sub, label } = {}) {
  _admissionTargetPct = Math.min(100, Math.max(0, targetPct));
  if (title && $('queueTitle')) $('queueTitle').textContent = title;
  if (text && $('queueText')) $('queueText').textContent = text;
  if (sub && $('queueSub')) $('queueSub').textContent = sub;
  if (label && $('admissionPercentLabel')) $('admissionPercentLabel').textContent = label;

  if (_admissionAnimTimer) clearInterval(_admissionAnimTimer);
  _admissionAnimTimer = setInterval(() => {
    if (Math.abs(_admissionCurrentPct - _admissionTargetPct) < 0.5) {
      _admissionCurrentPct = _admissionTargetPct;
      updateAdmissionGauge_(_admissionCurrentPct);
      clearInterval(_admissionAnimTimer);
      _admissionAnimTimer = null;
    } else {
      _admissionCurrentPct += (_admissionTargetPct - _admissionCurrentPct) * 0.22;
      updateAdmissionGauge_(_admissionCurrentPct);
    }
  }, 25);
}

function resetAdmissionProgress() {
  if (_admissionAnimTimer) clearInterval(_admissionAnimTimer);
  _admissionAnimTimer = null;
  _admissionCurrentPct = 0;
  _admissionTargetPct = 0;
  updateAdmissionGauge_(0);
}

function admissionKeyFor_(code) {
  const storageKey = 'exam_admission_key_v1_' + String(code || '').toUpperCase();
  try {
    let key = sessionStorage.getItem(storageKey);
    if (!key) {
      const nonce = globalThis.crypto?.randomUUID?.() ||
        (Date.now().toString(36) + '_' + Math.random().toString(36).slice(2));
      key = String(code || '').toUpperCase() + '_' + nonce;
      sessionStorage.setItem(storageKey, key);
    }
    return key;
  } catch {
    return String(code || '').toUpperCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  }
}

function clearAdmissionKey_(code) {
  try { sessionStorage.removeItem('exam_admission_key_v1_' + String(code || '').toUpperCase()); } catch {}
}

function setAdmissionStatus_(title, text, sub) {
  if ($('queueTitle')) $('queueTitle').textContent = title;
  if ($('queueText')) $('queueText').textContent = text;
  if ($('queueSub')) $('queueSub').textContent = sub;
}

async function requestExamAdmission_(code, idempotencyKey, privacyAck) {
  const initialDelay = Math.floor(Math.random() * ADMISSION_INITIAL_SPREAD_MS);
  if (initialDelay) await sleep(initialDelay);

  setAdmissionProgress(25, {
    title: 'Checking admission…',
    text: 'Connecting to exam server and checking admission slots. Keep this page open.',
    sub: 'Verifying your admission with the server…',
    label: 'Connecting'
  });

  let lastResponse = null;
  for (let attempt = 1; attempt <= ADMISSION_MAX_RETRIES; attempt++) {
    if (attempt > 1) {
      setAdmissionProgress(Math.min(65, 25 + attempt * 4), {
        title: 'Checking admission…',
        text: 'The exam room is processing admissions. Please keep this page open.',
        sub: `Admission check ${attempt} of ${ADMISSION_MAX_RETRIES}.`,
        label: 'Retrying'
      });
    }
    let r;
    try {
      r = await api('start', {
        idToken: await idToken(),
        code,
        idempotencyKey,
        privacyAckVersion: privacyAck,
        engine: isDeltaAutosaveEnabled(code) ? 'delta+ledger' : 'legacy'
      }, {
        tries: 2,
        onRetry: () => setAdmissionProgress(35, {
          title: 'Reconnecting…',
          text: 'The exam room did not answer yet. Retrying your admission request.',
          sub: 'Trying the same admission request again.',
          label: 'Reconnecting'
        })
      });
    } catch (error) {
      if (attempt === ADMISSION_MAX_RETRIES) throw error;
      const waitMs = Math.min(12000, 1400 * 2 ** (attempt - 1)) + Math.floor(Math.random() * 700);
      setAdmissionProgress(20, {
        title: 'Reconnecting…',
        text: 'The exam room did not answer yet. Retrying your admission request.',
        sub: `Retrying automatically in about ${Math.ceil(waitMs / 1000)} seconds.`,
        label: 'Waiting'
      });
      await sleep(waitMs);
      continue;
    }
    lastResponse = r;
    if (!r?.busy) {
      if (r?.ok) {
        setAdmissionProgress(85, {
          title: 'Admission granted!',
          text: 'Setting up randomized questions and security tokens…',
          sub: 'Almost ready to begin…',
          label: 'Preparing'
        });
      }
      return r;
    }

    const fallback = Math.min(12000, 1400 * 2 ** (attempt - 1));
    const waitMs = Math.max(800, Number(r.retryAfterMs) || 0, fallback) + Math.floor(Math.random() * 700);
    setAdmissionProgress(30, {
      title: 'The exam room is busy…',
      text: 'Do not reload or click Continue again. Retrying automatically when an opening is available.',
      sub: `Retrying automatically in about ${Math.ceil(waitMs / 1000)} seconds.`,
      label: 'In Queue'
    });
    await sleep(waitMs);
  }
  return lastResponse || { ok: false, message: 'The exam room is still busy. Please ask your instructor to admit the next group.' };
}

$('btnContinue').onclick = async () => {
  const code = (S.picked || $('codeInput').value || '').trim().toUpperCase();
  if (!code) { err('Choose an exam, or type its code.'); return; }
  const pickedExam = (S.availableExams || []).find(x => String(x.code || '').toUpperCase() === code);
  if (pickedExam && pickedExam.triesLeft != null && Number(pickedExam.triesLeft) <= 0) {
    err(`You have already used all attempts for this exam (${pickedExam.title || pickedExam.code}).`);
    return;
  }
  err('');

  const b = $('btnContinue');
  resetAdmissionProgress();
  show('scQueue');
  setAdmissionProgress(15, {
    title: 'Waiting for an opening…',
    text: 'The exam server is admitting students in small groups. Keep this page open.',
    sub: 'Your exam has not started yet.',
    label: 'Admitting'
  });
  b.disabled = true; b.textContent = 'Checking…';
  try {
    // Generate stable idempotency key for this start click
    const idempotencyKey = admissionKeyFor_(code);

    const privAck = FEATURE_FLAGS?.privacyAckVersion || 'privacy_ack_2026_1';
    let r = await requestExamAdmission_(code, idempotencyKey, privAck);

    if ((!r || (!r.ok && !r.busy)) && /^\d{3,8}$/.test(code)) {
      try {
        const enr = await api('enrollEdp', { idToken: await idToken(), edpCode: code });
        if (enr.ok && enr.exams?.length) {
          renderExams(enr.exams);
          const found = enr.exams.find(e => String(e.edpCode) === code || e.category === 'edp') || enr.exams[0];
          if (found) {
            r = await requestExamAdmission_(found.code, admissionKeyFor_(found.code), privAck);
          }
        } else if (!enr.ok && enr.notFound) {
          show('scStart');
          err(enr.message || 'No EDP code was found in the input. Please check your code or ask your instructor.');
          return;
        }
      } catch {}
    }
    if (!r || !r.ok) {
      clearAdmissionKey_(code);
      if (r?.code) clearAdmissionKey_(r.code);
      show('scStart');
      err((r && r.message) || 'Could not start this exam.');
      return;
    }
    setAdmissionProgress(100, {
      title: 'Exam ready!',
      text: 'Opening exam briefing…',
      sub: 'Ready.',
      label: 'Ready'
    });
    await sleep(350);
    clearAdmissionKey_(code);
    clearAdmissionKey_(r.code || code);
    await prepare(r); brief(r);
  } catch {
    show('scStart');
    err('Could not reach the server. Check your connection and try again.');
  } finally {
    b.disabled = false; b.textContent = 'Continue';
  }
};

$('codeInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('btnContinue').click(); }
});
$('edpInput')?.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); $('btnAddEdp')?.click(); }
});

/* ---------------- brief ---------------- */

let _firstFlagReported = false;

async function initFirestoreAttempt(r) {
  // Attempt document is server-created during startAttempt.
  // We only flush dirty answers if any were restored from local storage.
  if (_dirtyKeys && _dirtyKeys.size > 0) {
    flushFirestoreCheckpoint().catch(() => {});
  }
}

async function prepare(r) {
  S.code = r.code;
  S.token = r.token;
  S.attemptId = r.attemptId || r.token;
  S.examType = r.examType || 'test';
  S.isReviewer = !!r.isReviewer || (r.examType === 'reviewer');
  S.timerMode = S.isReviewer ? 'untimed' : r.timerMode;
  S.defaultTimer = S.isReviewer ? null : r.defaultTimer;
  S.proctoringStrikes = S.isReviewer ? 0 : (r.proctoringStrikes != null ? Number(r.proctoringStrikes) : (STRICT_AUTO_SUBMIT ? 3 : 0));
  S.proctoringWarningNotes = S.isReviewer ? '' : (r.proctoringWarningNotes || '');
  S.questions = r.questions || [];
  const localBackup = loadSessionBackup(r.token);
  const journalBackup = await loadJournalAnswers(r.token);
  S.answers = Object.assign({}, r.answers || {}, localBackup || {}, journalBackup || {});
  S.deadline = (S.isReviewer || r.msRemaining == null) ? null : Date.now() + r.msRemaining;
  S.queue = S.questions.slice();
  S.pos = 0; S.deferred = []; S.secondPass = false; S.finished = false;
  _dirtyKeys.clear();
  _firstFlagReported = false;
  behaviorWarnings = 0;
  awayAt = null;
  if (blurCheck) { clearTimeout(blurCheck); blurCheck = null; }
  S.sections = null;
  S.isReviewMode = false;
  S.currentSecIndex = 0;
  _lastDoneResult = null;
  if ($('singleExamView')) $('singleExamView').hidden = true;
  if ($('wholeExamView')) $('wholeExamView').hidden = true;
  if ($('sectionExamView')) $('sectionExamView').hidden = true;
  if ($('sectionReviewView')) $('sectionReviewView').hidden = true;
  if ($('sectionReviewCardsList')) $('sectionReviewCardsList').replaceChildren();
  if ($('sectionQuestionList')) $('sectionQuestionList').replaceChildren();
  if ($('wholeExamList')) $('wholeExamList').replaceChildren();
  if ($('reviewCard')) $('reviewCard').hidden = true;
  if ($('reviewWrap')) $('reviewWrap').replaceChildren();
  initFirestoreAttempt(r).catch(() => {});
}

function brief(r) {
  $('briefTitle').textContent = r.title || S.code;
  const f = $('briefFacts');
  f.replaceChildren();
  const fact = (k, v) => {
    const dt = document.createElement('dt'); dt.textContent = k;
    const dd = document.createElement('dd'); dd.textContent = v;
    f.append(dt, dd);
  };
  fact('Questions', String(S.questions.length));
  if (S.isReviewer) {
    fact('Mode', 'Practice Reviewer');
    fact('Time', 'Untimed — self-paced');
    fact('Attempt', 'Unlimited practice');
  } else {
    // Three delivery modes, three different promises about the clock. Saying
    // "each question is timed" ahead of a section-timed exam is a promise the
    // next screen breaks.
    fact('Time', S.timerMode === 'whole-exam'
      ? Math.round((r.msRemaining || 0) / 60000) + ' minutes total'
      : S.timerMode === 'per-section'
        ? 'Each section is timed'
        : 'Each question is timed');
    fact('Attempt', r.attemptNo + (r.maxAttempts > 1 ? ' of ' + r.maxAttempts : ''));
  }
  const matchedExam = S.availableExams?.find(e => e.code === (r.code || S.code));
  const deadlineStr = r.closesAt || matchedExam?.closesAt;
  if (deadlineStr) {
    fact('Deadline', deadlineStr);
  }
  if (r.student?.lastName || r.student?.firstName) {
    fact('Name', [r.student.lastName, r.student.firstName].filter(Boolean).join(', '));
  }
  if (r.student?.section) fact('Section', r.student.section);

  const attemptsStatusEl = $('briefAttemptsStatus');
  const attemptsSummaryEl = $('briefAttemptsSummary');
  if (attemptsStatusEl) {
    if (r.maxAttempts > 1) {
      const remainingAfter = Math.max(0, r.maxAttempts - r.attemptNo);
      attemptsStatusEl.innerHTML = `<strong>Current Attempt:</strong> Attempt ${r.attemptNo} of ${r.maxAttempts} &bull; <strong>${remainingAfter} retake${remainingAfter === 1 ? '' : 's'} remaining</strong> after this.`;
      if (attemptsSummaryEl) {
        attemptsSummaryEl.textContent = 'This exam allows multiple attempts. Retakes let you improve your score or recover if you experienced technical issues. Your highest score is typically credited by your instructor.';
      }
    } else {
      attemptsStatusEl.innerHTML = '<strong>Single Attempt Only:</strong> You only have 1 attempt for this exam. No retakes are permitted.';
      if (attemptsSummaryEl) {
        attemptsSummaryEl.textContent = 'Take your time and ensure a reliable internet connection. Once submitted or timed out, this exam cannot be retaken.';
      }
    }
  }

  const strikes = S.proctoringStrikes != null ? S.proctoringStrikes : 3;
  const procRuleEl = $('briefProctoringRule');
  if (procRuleEl) {
    if (strikes === 0) {
      procRuleEl.innerHTML = '<b>Proctoring Active:</b> Tab switching and leaving the exam page are monitored and recorded for your instructor. No automatic cutoff is enforced.';
    } else if (strikes === 1) {
      procRuleEl.innerHTML = '<b>Strict Proctoring Active (1 Strike):</b> Leaving or switching away from the exam tab is strictly prohibited. Leaving the page even once will automatically submit your exam immediately.';
    } else {
      const warnCount = strikes - 1;
      procRuleEl.innerHTML = `<b>Strict Proctoring Active (${strikes} Strikes):</b> Leaving or switching away from the exam tab is strictly prohibited. You are allowed ${warnCount === 1 ? 'only 1 warning' : warnCount + ' warnings'} — leaving ${strikes === 2 ? 'a 2nd time' : 'on strike ' + strikes} will automatically submit your exam immediately.`;
    }
  }
  const customNotesEl = $('briefCustomNotes');
  if (customNotesEl) {
    if (S.proctoringWarningNotes) {
      customNotesEl.textContent = 'Instructor Warning: ' + S.proctoringWarningNotes;
      customNotesEl.hidden = false;
    } else {
      customNotesEl.hidden = true;
    }
  }

  $('btnBegin').onclick = () => ensurePrivacyConsent(begin);
  $('btnBriefBack').onclick = () => {
    S.token = '';
    behaviorWarnings = 0;
    awayAt = null;
    if (blurCheck) { clearTimeout(blurCheck); blurCheck = null; }
    show('scStart');
  };
  show('scBrief');
}

function ensurePrivacyConsent(onProceed) {
  if (!FEATURE_FLAGS?.requirePrivacyAck) {
    onProceed();
    return;
  }
  const ackKey = FEATURE_FLAGS?.privacyAckVersion || 'privacy_ack_2026_1';
  let acked = false;
  try {
    acked = !!localStorage.getItem(ackKey);
  } catch (e) {}

  if (acked) {
    onProceed();
    return;
  }

  const modal = $('privacyAckModal');
  const chk = $('chkPrivacyAck');
  const btnProceed = $('btnConfirmPrivacyAck');
  const btnCancel = $('btnCancelPrivacyAck');

  if (!modal || !chk || !btnProceed) {
    onProceed();
    return;
  }

  chk.checked = false;
  btnProceed.disabled = true;

  chk.onchange = () => {
    btnProceed.disabled = !chk.checked;
  };

  if (btnCancel) {
    btnCancel.onclick = () => {
      closeModal(modal);
    };
  }

  btnProceed.onclick = () => {
    try {
      localStorage.setItem(ackKey, new Date().toISOString());
    } catch (e) {}
    closeModal(modal);
    onProceed();
  };

  openModal(modal);
}

async function doResume(token) {
  const b = $('btnResume');
  if (b) { b.disabled = true; b.textContent = 'Loading…'; }
  const activeBtn = $('btnActiveResume');
  if (activeBtn) { activeBtn.disabled = true; activeBtn.textContent = 'Loading…'; }
  try {
    const userToken = await idToken().catch(() => '');
    const r = await api('resume', { token, idToken: userToken });
    if (!r.ok) {
      S.active = null;
      if ($('activeExamCard')) $('activeExamCard').hidden = true;
      clearSessionBackup(token);
      clearJournalAnswers(token).catch(() => {});
      err(r.message || 'This exam is no longer available or was removed by your instructor.');
      show('scStart');
      return;
    }
    await prepare(r);
    S.queue = S.questions.filter(q => S.answers[q.no] == null);
    if (!S.queue.length) { finish(); return; }
    ensurePrivacyConsent(begin);
  } catch {
    S.active = null;
    if ($('activeExamCard')) $('activeExamCard').hidden = true;
    clearSessionBackup(token);
    err('Could not resume this exam. It may have been closed or removed by your instructor.');
    show('scStart');
  } finally {
    if (b) { b.disabled = false; b.textContent = 'Continue where I left off'; }
    if (activeBtn) { activeBtn.disabled = false; activeBtn.textContent = '▶ Continue Exam'; }
  }
}
if ($('btnResumeBack')) {
  $('btnResumeBack').onclick = () => {
    show('scStart');
  };
}

/* ---------------- exam ---------------- */

function showReviewerLoadingTransition(onComplete) {
  if (typeof window === 'undefined' || !$('scReviewerLoading')) {
    onComplete();
    return;
  }
  show('scReviewerLoading');
  const bar = $('dinoProgressFill');
  const pct = $('dinoPercent');
  const status = $('dinoStatusText');

  const messages = [
    '🦖 Dinosaur hatching your study session…',
    '🦕 Loading questions and answer keys…',
    '✨ Priming AI tutor study guides…',
    '🎯 Ready! Launching Question 1…'
  ];

  let p = 0;
  let msgIdx = 0;
  if (status) status.textContent = messages[0];
  if (bar) bar.style.width = '0%';
  if (pct) pct.textContent = '0%';

  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) {
    setTimeout(onComplete, 50);
    return;
  }

  const timer = setInterval(() => {
    p += 20;
    if (bar) bar.style.width = Math.min(p, 100) + '%';
    if (pct) pct.textContent = Math.min(p, 100) + '%';
    if (msgIdx < messages.length - 1 && p >= (msgIdx + 1) * 25) {
      msgIdx++;
      if (status) status.textContent = messages[msgIdx];
    }
    if (p >= 100) {
      clearInterval(timer);
      setTimeout(onComplete, 120);
    }
  }, 180);
}

function begin() {
  behaviorWarnings = 0;
  awayAt = null;
  if (blurCheck) { clearTimeout(blurCheck); blurCheck = null; }

  // Explicitly hide all exam view containers before selecting the active mode
  if ($('singleExamView')) $('singleExamView').hidden = true;
  if ($('wholeExamView')) $('wholeExamView').hidden = true;
  if ($('sectionExamView')) $('sectionExamView').hidden = true;
  if ($('sectionReviewView')) $('sectionReviewView').hidden = true;

  if (S.isReviewer) {
    showReviewerLoadingTransition(() => {
      show('scExam');
      if ($('singleExamView')) $('singleExamView').hidden = false;
      if ($('reviewerWatermark')) $('reviewerWatermark').hidden = false;
      if ($('pillReviewer')) $('pillReviewer').hidden = false;
      if ($('pillTimer')) $('pillTimer').hidden = true;
      if ($('timerBar')) $('timerBar').hidden = true;
      step();
    });
  } else {
    show('scExam');
    if (S.timerMode === 'whole-exam') {
      if ($('reviewerWatermark')) $('reviewerWatermark').hidden = true;
      if ($('pillReviewer')) $('pillReviewer').hidden = true;
      if ($('wholeExamView')) $('wholeExamView').hidden = false;
      renderWholeExam();
      startGlobal();
    } else if (S.timerMode === 'per-section') {
      if ($('reviewerWatermark')) $('reviewerWatermark').hidden = true;
      if ($('pillReviewer')) $('pillReviewer').hidden = true;
      if ($('sectionExamView')) $('sectionExamView').hidden = false;
      S.sections = buildSections();
      S.currentSecIndex = 0;
      renderSection(0);
    } else {
      if ($('reviewerWatermark')) $('reviewerWatermark').hidden = true;
      if ($('pillReviewer')) $('pillReviewer').hidden = true;
      if ($('singleExamView')) $('singleExamView').hidden = false;
      step();
    }
  }
  autosave();
}

/* ---- Exit exam handling ---- */
if ($('btnExit')) {
  $('btnExit').onclick = () => {
    openModal($('exitConfirmModal'), $('btnCancelExit'), { onDismiss: () => closeModal($('exitConfirmModal')) });
  };
}
if ($('btnCancelExit')) {
  $('btnCancelExit').onclick = () => closeModal($('exitConfirmModal'));
}
if ($('btnPauseExit')) {
  $('btnPauseExit').onclick = () => {
    closeModal($('exitConfirmModal'));
    stopQuestion();
    if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
    saveSessionBackup(S.token, S.answers);
    S.token = '';
    behaviorWarnings = 0;
    awayAt = null;
    if (blurCheck) { clearTimeout(blurCheck); blurCheck = null; }
    show('scStart');
    boot();
  };
}
if ($('btnConfirmExit')) {
  $('btnConfirmExit').onclick = () => {
    closeModal($('exitConfirmModal'));
    finish();
  };
}

/**
 * The question on screen right now in per-question mode.
 */
function current() {
  return S.queue[S.pos];
}

function renderStepperDots() {
  const host = $('stepperDots');
  if (!host || !S.questions || !S.questions.length) return;
  host.replaceChildren();

  const cur = current();
  let done = 0, skipped = 0;

  S.questions.forEach(q => {
    const dot = document.createElement('span');
    dot.className = 'stepper-dot';
    dot.setAttribute('aria-hidden', 'true');
    if (cur && q.no === cur.no) dot.classList.add('active');
    else if (S.answers[q.no] != null && S.answers[q.no] !== '') { dot.classList.add('done'); done++; }
    else if (S.deferred.some(d => (d && d.no != null ? d.no : d) === q.no) ||
             (S.secondPass && S.queue.some(d => (d && d.no != null ? d.no : d) === q.no))) {
      dot.classList.add('skipped');
      skipped++;
    }
    host.append(dot);
  });

  host.setAttribute('role', 'img');
  host.setAttribute('aria-label',
    `${done} of ${S.questions.length} answered` + (skipped ? `, ${skipped} skipped` : ''));
}

/* ---- Multi-Question Card Builder (for Whole Exam & Per-Section Modes) ---- */
function createMultiQuestionCard(q, index) {
  const card = document.createElement('div');
  card.className = 'multi-q-card';
  card.id = 'mqCard_' + q.no;

  const head = document.createElement('div');
  head.className = 'multi-q-head';

  const noLabel = document.createElement('span');
  noLabel.className = 'multi-q-no';
  noLabel.id = 'mqNo_' + q.no;
  noLabel.textContent = `Question ${q.pos || (index + 1)} · ${TYPE_NAME[q.type] || q.type}`;

  const hasAns = S.answers[q.no] != null && S.answers[q.no] !== '' &&
    (typeof S.answers[q.no] !== 'object' || Object.keys(S.answers[q.no]).length > 0);

  const statusBadge = document.createElement('span');
  statusBadge.className = 'multi-q-status' + (hasAns ? ' answered' : '');
  statusBadge.id = 'mqStatus_' + q.no;
  statusBadge.textContent = hasAns ? 'Answered ✓' : 'Unanswered';

  head.append(noLabel, statusBadge);

  const qText = document.createElement('div');
  qText.className = 'qtext';
  qText.id = 'mqText_' + q.no;
  qText.style.marginBottom = '12px';
  qText.textContent = q.question;

  const inputHost = document.createElement('div');
  inputHost.id = 'mqInput_' + q.no;

  const updateAnswer = (val) => {
    setDirtyAnswer(q.no, val);
    const isAns = (val !== '' && val != null && (typeof val !== 'object' || Object.keys(val).length > 0));
    statusBadge.className = 'multi-q-status' + (isAns ? ' answered' : '');
    statusBadge.textContent = isAns ? 'Answered ✓' : 'Unanswered';
    const doneCount = Object.values(S.answers).filter(v => v !== '' && v != null && (typeof v !== 'object' || Object.keys(v).length > 0)).length;
    $('pillProgress').textContent = `${doneCount} of ${S.questions.length} answered`;
  };

  if (q.type === 'MC' || q.type === 'TF') {
    const opts = (q.type === 'TF' && (!q.choices || !q.choices.length)) ? ['True', 'False'] : q.choices;
    const letters = (q.type === 'TF' && (!q.choices || !q.choices.length)) ? ['A', 'B'] : (q.letters || ['A', 'B', 'C', 'D']);
    const box = document.createElement('div');
    box.className = 'opts';
    box.setAttribute('role', 'radiogroup');
    box.setAttribute('aria-labelledby', 'mqNo_' + q.no + ' mqText_' + q.no);

    const hasSelection = opts.some((t, idx) => S.answers[q.no] === (q.type === 'TF' ? String(t).toUpperCase() : (letters[idx] || t)));

    opts.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('role', 'radio');
      // True/false answers are graded as TRUE/FALSE on the server. MC uses
      // its letter, but sending A/B here would make every TF answer wrong.
      const val = q.type === 'TF' ? String(t).toUpperCase() : (letters[i] || t);
      b.dataset.value = val;
      const isSel = S.answers[q.no] === val;
      b.setAttribute('aria-checked', isSel ? 'true' : 'false');
      b.tabIndex = isSel ? 0 : (!hasSelection && i === 0 ? 0 : -1);

      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = q.type === 'TF' ? t.charAt(0) : (letters[i] || String.fromCharCode(65 + i));

      const tx = document.createElement('span');
      tx.className = 't';
      tx.textContent = t;

      const chk = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chk.setAttribute('class', 'chk');
      chk.setAttribute('viewBox', '0 0 20 20');
      chk.setAttribute('fill', 'none');
      chk.setAttribute('stroke', 'currentColor');
      chk.setAttribute('stroke-width', '2.6');
      chk.setAttribute('stroke-linecap', 'round');
      chk.setAttribute('stroke-linejoin', 'round');
      chk.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M3.5 10.5 8 15l8.5-10');
      chk.append(p);

      b.append(k, tx, chk);
      b.onclick = () => {
        for (const c of box.children) {
          const on = c === b;
          c.setAttribute('aria-checked', on ? 'true' : 'false');
          c.tabIndex = on ? 0 : -1;
        }
        feedback('select', 10);
        updateAnswer(val);
      };
      box.append(b);
    });

    box.addEventListener('keydown', e => {
      const list = [...box.children];
      const at = list.indexOf(document.activeElement);
      if (at === -1) return;
      let to = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (at + 1) % list.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = (at - 1 + list.length) % list.length;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = list.length - 1;
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); list[at].click(); return; }
      else return;
      e.preventDefault();
      list[to].click();
      list[to].focus();
    });

    inputHost.append(box);

  } else if (q.type === 'EN') {
    const ta = document.createElement('textarea');
    ta.className = 'field';
    ta.setAttribute('aria-labelledby', 'mqNo_' + q.no + ' mqText_' + q.no);
    ta.rows = Math.min(6, Math.max(3, q.expect || 4));
    ta.spellcheck = false;
    ta.placeholder = q.expect ? `List ${q.expect} items (one per line)` : 'One per line';
    ta.value = S.answers[q.no] || '';
    ta.addEventListener('input', () => updateAnswer(ta.value.trim()));
    inputHost.append(ta);

  } else if (q.type === 'MA') {
    const box = document.createElement('div');
    box.className = 'opts';
    const picks = (typeof S.answers[q.no] === 'object' && S.answers[q.no]) ? S.answers[q.no] : {};

    (q.choices || []).forEach((left) => {
      const row = document.createElement('div');
      row.className = 'pair';
      const lab = document.createElement('span');
      lab.className = 'pair-l';
      lab.textContent = left;

      const sel = document.createElement('select');
      sel.className = 'field pair-s';
      sel.setAttribute('aria-label', 'Match for ' + left);
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'Choose…';
      sel.append(none);

      (q.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (picks[left] === opt) o.selected = true;
        sel.append(o);
      });

      sel.addEventListener('change', () => {
        const currentPicks = {};
        box.querySelectorAll('select').forEach((s, idx) => {
          if (s.value && q.choices[idx]) currentPicks[q.choices[idx]] = s.value;
        });
        updateAnswer(Object.keys(currentPicks).length ? currentPicks : '');
      });

      row.append(lab, sel);
      box.append(row);
    });
    inputHost.append(box);

  } else if (q.type === 'WB') {
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.setAttribute('aria-labelledby', 'mqNo_' + q.no + ' mqText_' + q.no);
    inp.type = 'text';
    inp.placeholder = 'Tap a word or type here';
    inp.value = S.answers[q.no] || '';
    inp.addEventListener('input', () => updateAnswer(inp.value.trim()));

    const bank = document.createElement('div');
    bank.className = 'bank';
    (q.choices || []).forEach(word => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (inp.value === word ? ' on' : '');
      chip.textContent = word;
      chip.onclick = () => {
        inp.value = word;
        for (const c of bank.children) c.classList.remove('on');
        chip.classList.add('on');
        feedback('select', 10);
        updateAnswer(word);
      };
      bank.append(chip);
    });
    inputHost.append(inp, bank);

  } else {
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.setAttribute('aria-labelledby', 'mqNo_' + q.no + ' mqText_' + q.no);
    inp.type = 'text';
    inp.placeholder = 'Type your answer';
    inp.value = S.answers[q.no] || '';
    inp.addEventListener('input', () => updateAnswer(inp.value.trim()));
    inputHost.append(inp);
  }

  card.append(head, qText, inputHost);
  return card;
}

/* ---- Whole Exam Mode Rendering ---- */
function renderWholeExam() {
  const host = $('wholeExamList');
  if (!host) return;
  host.replaceChildren();

  const doneCount = Object.values(S.answers).filter(v => v !== '' && v != null).length;
  $('pillProgress').textContent = `${doneCount} of ${S.questions.length} answered`;

  S.questions.forEach((q, i) => {
    host.append(createMultiQuestionCard(q, i));
  });

  if ($('btnSubmitWholeExam')) {
    $('btnSubmitWholeExam').onclick = () => finish();
  }
}

/* ---- Per-Section Mode Grouping & Rendering ---- */
function buildSections() {
  const sections = [];
  const groupByType = {};

  S.questions.forEach(q => {
    const type = q.type || 'MC';
    if (!groupByType[type]) {
      const parsedSecs = parseInt(q.seconds, 10);
      const initialDuration = (parsedSecs > 0) ? parsedSecs : (parseInt(S.defaultTimer, 10) || 600);
      groupByType[type] = {
        type: type,
        title: TYPE_NAME[type] || type,
        questions: [],
        duration: initialDuration,
        remaining: initialDuration,
        expired: false,
        visited: false,
        _hasExplicitSecs: parsedSecs > 0
      };
      sections.push(groupByType[type]);
    }
    groupByType[type].questions.push(q);
    const qSec = parseInt(q.seconds, 10);
    if (qSec > 0 && !groupByType[type]._hasExplicitSecs) {
      groupByType[type].duration = qSec;
      groupByType[type].remaining = qSec;
      groupByType[type]._hasExplicitSecs = true;
    }
  });

  return sections;
}

function renderSection(idx, isReview = false) {
  const sec = S.sections && S.sections[idx];
  if (!sec) {
    if (S.isReviewMode) renderSectionReviewOverview();
    else finish();
    return;
  }

  S.currentSecIndex = idx;
  S.isReviewMode = !!isReview;
  sec.visited = true;

  if (sec.expired || sec.remaining <= 0) {
    toast(`Time for ${sec.title} has already expired.`, 'neutral');
    renderSectionReviewOverview();
    return;
  }

  if ($('sectionReviewView')) $('sectionReviewView').hidden = true;
  if ($('sectionExamView')) $('sectionExamView').hidden = false;

  $('sectionMeta').textContent = isReview
    ? `Reviewing Section ${idx + 1} of ${S.sections.length}`
    : `Section ${idx + 1} of ${S.sections.length}`;
  $('sectionTitle').textContent = sec.title;
  $('sectionDesc').textContent = `Answer or review the ${sec.questions.length} question(s) in this section.`;

  const host = $('sectionQuestionList');
  if (host) {
    host.replaceChildren();
    sec.questions.forEach((q, i) => {
      host.append(createMultiQuestionCard(q, i));
    });
  }

  startSectionTimer(sec);

  const isLast = idx + 1 >= S.sections.length;
  const btn = $('btnNextSection');
  if (btn) {
    if (isReview) {
      btn.textContent = '✓ Done Reviewing Section (Back to Review)';
      btn.onclick = () => {
        stopQuestion();
        if (_dirtyKeys.size > 0) flushFirestoreCheckpoint().catch(() => {});
        renderSectionReviewOverview();
      };
    } else {
      btn.textContent = isLast ? 'Complete Final Section & Review Exam ›' : 'Complete Section & Proceed ›';
      btn.onclick = () => {
        stopQuestion();
        if (_dirtyKeys.size > 0) flushFirestoreCheckpoint().catch(() => {});
        if (isLast) {
          renderSectionReviewOverview();
        } else {
          showSectionTransition(idx + 1, () => {
            S.currentSecIndex = idx + 1;
            renderSection(S.currentSecIndex);
          });
        }
      };
    }
  }
}

function renderSectionReviewOverview() {
  stopQuestion();
  S.isReviewMode = true;

  if ($('sectionExamView')) $('sectionExamView').hidden = true;
  if ($('sectionReviewView')) $('sectionReviewView').hidden = false;
  if ($('pillTimer')) $('pillTimer').hidden = true;
  if ($('timerBar')) $('timerBar').hidden = true;

  const host = $('sectionReviewCardsList');
  if (!host) return;
  host.replaceChildren();

  (S.sections || []).forEach((sec, idx) => {
    const totalQ = sec.questions.length;
    const answeredCount = sec.questions.filter(q => S.answers[q.no] != null && S.answers[q.no] !== '').length;
    const unansweredCount = totalQ - answeredCount;
    const isExpired = sec.expired || sec.remaining <= 0;

    const card = document.createElement('div');
    card.className = 'card solo' + (!isExpired ? ' liftable' : '');
    card.style.cssText = `display:flex; flex-direction:row; justify-content:space-between; align-items:center; gap:16px; padding:20px 24px; border-radius:var(--r-lg); border:1px solid ${isExpired ? 'var(--edge)' : 'var(--accent-line)'}; background:${isExpired ? 'var(--glass-2)' : 'var(--glass-hi)'}; ${isExpired ? 'opacity:0.8; cursor:not-allowed;' : 'cursor:pointer;'} transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;`;

    const m = Math.max(0, Math.floor(sec.remaining / 60));
    const s = Math.max(0, sec.remaining % 60);
    const timeFormatted = `${m}:${String(s).padStart(2, '0')}`;

    const infoLeft = document.createElement('div');
    infoLeft.style.cssText = 'display:flex; flex-direction:column; gap:6px; flex:1; min-width:0;';

    const topRow = document.createElement('div');
    topRow.style.cssText = 'display:flex; align-items:center; gap:8px; flex-wrap:wrap;';

    const secBadge = document.createElement('span');
    secBadge.className = 'eyebrow';
    secBadge.style.margin = '0';
    secBadge.textContent = `Section ${idx + 1} of ${S.sections.length}`;

    const titleEl = document.createElement('h3');
    titleEl.style.cssText = 'margin:0; font-size:1.125rem; font-weight:700; color:var(--fg-hero); line-height:1.3;';
    titleEl.textContent = sec.title;

    topRow.append(secBadge, titleEl);

    const statsRow = document.createElement('div');
    statsRow.style.cssText = 'display:flex; align-items:center; gap:10px; font-size:0.8125rem; margin-top:2px; flex-wrap:wrap;';

    const answeredBadge = document.createElement('span');
    answeredBadge.className = 'pill';
    answeredBadge.style.cssText = 'font-size:0.75rem; font-weight:600; padding:3px 10px; background:var(--glass-2); border:1px solid var(--edge); color:var(--fg);';
    answeredBadge.innerHTML = `<b style="color:var(--fg-hero);">${answeredCount}</b> of <b>${totalQ}</b> answered`;

    const statusBadge = document.createElement('span');
    statusBadge.className = 'pill';
    statusBadge.style.cssText = 'font-size:0.75rem; font-weight:700; padding:3px 10px;';
    if (unansweredCount > 0) {
      statusBadge.style.color = 'var(--bad)';
      statusBadge.style.background = 'var(--bad-soft)';
      statusBadge.style.borderColor = 'var(--bad-soft)';
      statusBadge.textContent = `⚠️ ${unansweredCount} unanswered`;
    } else {
      statusBadge.style.color = 'var(--ok)';
      statusBadge.style.background = 'var(--ok-soft)';
      statusBadge.style.borderColor = 'var(--ok-soft)';
      statusBadge.textContent = `✓ All answered`;
    }

    statsRow.append(answeredBadge, statusBadge);
    infoLeft.append(topRow, statsRow);

    const rightAction = document.createElement('div');
    rightAction.style.cssText = 'display:flex; align-items:center; gap:10px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end;';

    const timerBadge = document.createElement('span');
    timerBadge.className = 'pill';
    if (isExpired) {
      timerBadge.style.cssText = 'font-weight:700; background:var(--sunk); color:var(--fg-3); border-color:var(--edge); font-size:0.8125rem;';
      timerBadge.textContent = '⏱ 0:00 (Expired)';
    } else {
      timerBadge.style.cssText = 'font-weight:700; background:var(--accent-soft); color:var(--accent); border-color:var(--accent-line); font-size:0.8125rem;';
      timerBadge.textContent = `⏱ ${timeFormatted} left`;
    }

    const reviewBtn = document.createElement('button');
    reviewBtn.type = 'button';
    reviewBtn.className = isExpired ? 'btn-sm btn-ghost' : 'btn-sm btn-outline';
    reviewBtn.disabled = isExpired;
    reviewBtn.style.cssText = 'border-radius:var(--r-sm); font-weight:600; padding:6px 14px;';
    reviewBtn.textContent = isExpired ? 'Locked' : 'Review Section ›';

    rightAction.append(timerBadge, reviewBtn);
    card.append(infoLeft, rightAction);

    if (!isExpired) {
      const openReview = () => renderSection(idx, true);
      card.onclick = (e) => {
        if (e.target.tagName !== 'BUTTON') openReview();
      };
      reviewBtn.onclick = (e) => {
        e.stopPropagation();
        openReview();
      };
    } else {
      card.onclick = () => {
        toast(`Section ${idx + 1} (${sec.title}) timer has expired and can no longer be edited.`, 'neutral');
      };
    }

    host.append(card);
  });

  const submitBtn = $('btnSubmitFromReview');
  if (submitBtn) {
    submitBtn.onclick = () => {
      finish();
    };
  }
}

function showSectionTransition(idx, onComplete) {
  const sec = S.sections[idx];
  if (!sec) { onComplete(); return; }

  const overlay = $('sectionTransitionOverlay');
  if (!overlay) { onComplete(); return; }

  $('transitionEyebrow').textContent = `NEXT: SECTION ${idx + 1} OF ${S.sections.length}`;
  $('transitionTitle').textContent = `SECTION ${idx + 1}`;
  $('transitionType').textContent = sec.title;

  announce(`Entering Section ${idx + 1}: ${sec.title}`);

  overlay.hidden = false;
  void overlay.offsetWidth;
  overlay.classList.add('active');
  play('tap');
  haptic(30);

  setTimeout(() => {
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.hidden = true;
      onComplete();
    }, 450);
  }, 1600);
}

function stopQuestion() {
  if (S.tick) {
    clearInterval(S.tick);
    S.tick = null;
  }
}

function startGlobal() {
  if ($('pillTimer')) $('pillTimer').hidden = false;
  if ($('timerBar')) $('timerBar').hidden = false;
  S.span = Math.max(1, Math.round((S.deadline - Date.now()) / 1000));
  paint(S.span);
  S.globalTick = setInterval(() => {
    if (S.finished || !S.deadline) return;
    const left = Math.max(0, Math.round((S.deadline - Date.now()) / 1000));
    paint(left);
    if (left <= 0) {
      clearInterval(S.globalTick);
      S.globalTick = null;
      S.finished = true;
      finish();
    }
  }, 1000);
}

function paint(sec) {
  if (S.isReviewer || S.timerMode === 'untimed') {
    if ($('pillTimer')) $('pillTimer').hidden = true;
    if ($('timerBar')) $('timerBar').hidden = true;
    return;
  }
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  const pill = $('pillTimer');
  if (pill) {
    pill.textContent = `${m}:${String(s).padStart(2, '0')}`;
    pill.hidden = false;
    const total = S.span || sec || 1;
    const frac = Math.max(0, Math.min(1, sec / total));
    const low = sec <= 10 || frac <= 0.15;
    const mid = !low && frac <= 0.35;
    pill.classList.toggle('low', low);
    pill.classList.toggle('mid', mid);
  }
  if ($('timerBar')) $('timerBar').hidden = false;
  if ($('timerFill')) {
    const total = S.span || 1;
    const pct = Math.max(0, Math.min(100, (sec / total) * 100));
    $('timerFill').style.width = pct + '%';
  }
}

function startSectionTimer(sec) {
  stopQuestion();
  if (!sec || sec.remaining <= 0 || sec.expired) {
    if (sec) { sec.remaining = 0; sec.expired = true; }
    return;
  }
  S.remaining = sec.remaining;
  S.span = sec.duration || sec.remaining || 60;
  if ($('pillTimer')) $('pillTimer').hidden = false;
  if ($('timerBar')) $('timerBar').hidden = false;
  paint(S.remaining);
  if ($('sectionTimerPill')) {
    const m = Math.floor(S.remaining / 60), s = S.remaining % 60;
    $('sectionTimerPill').textContent = `${m}:${String(s).padStart(2, '0')}`;
  }

  S.tick = setInterval(() => {
    sec.remaining--;
    S.remaining = sec.remaining;
    paint(S.remaining);
    if ($('sectionTimerPill')) {
      const m = Math.max(0, Math.floor(S.remaining / 60)), s = Math.max(0, S.remaining % 60);
      $('sectionTimerPill').textContent = `${m}:${String(s).padStart(2, '0')}`;
    }
    if (S.remaining === 300) announce('5 minutes remaining', true);
    else if (S.remaining === 60) announce('1 minute remaining', true);
    else if (S.remaining === 30) announce('30 seconds remaining', true);

    if (sec.remaining <= 0) {
      sec.remaining = 0;
      sec.expired = true;
      stopQuestion();
      play('timeup');
      announce(`Time is up for section: ${sec.title}`, true);

      if (S.isReviewMode) {
        toast(`Time is up for ${sec.title}.`, 'neutral');
        renderSectionReviewOverview();
      } else if (S.currentSecIndex + 1 < S.sections.length) {
        showSectionTransition(S.currentSecIndex + 1, () => {
          S.currentSecIndex++;
          renderSection(S.currentSecIndex);
        });
      } else {
        renderSectionReviewOverview();
      }
    }
  }, 1000);
}

/* ---- Per-Question Mode Rendering ---- */
function render() {
  const q = current();
  if (!q) { step(); return; }

  renderStepperDots();

  const done = Object.keys(S.answers).length;
  $('pillProgress').textContent = S.secondPass
    ? `Reviewing ${S.pos + 1} of ${S.queue.length}`
    : `Question ${Math.min(done + 1, S.questions.length)} of ${S.questions.length}`;

  const sk = $('pillSkipped');
  sk.hidden = !S.deferred.length && !S.secondPass;
  sk.textContent = S.secondPass ? 'Skipped questions' : `Skipped ${S.deferred.length}`;

  $('qMeta').textContent = (S.secondPass ? 'Skipped · ' : '') + (TYPE_NAME[q.type] || 'Question');
  $('qText').textContent = q.question;

  const host = $('qInput');
  host.replaceChildren();

  if (q.type === 'MC' || q.type === 'TF') {
    const opts = (q.type === 'TF' && !q.choices.length) ? ['True', 'False'] : q.choices;
    const letters = (q.type === 'TF' && !q.choices.length) ? ['A', 'B'] : q.letters;

    const box = document.createElement('div');
    box.className = 'opts';
    box.setAttribute('role', 'radiogroup');
    box.setAttribute('aria-labelledby', 'qMeta qText');

    const hasSelection = opts.some((t, idx) => S.answers[q.no] === (q.type === 'TF' ? String(t).toUpperCase() : letters[idx]));

    opts.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('role', 'radio');
      // The visible T/F key is only a label; the stored answer must be the
      // TRUE/FALSE value expected by gradeOne_.
      const val = q.type === 'TF' ? String(t).toUpperCase() : letters[i];
      b.dataset.value = val;
      const isSel = S.answers[q.no] === val;
      b.setAttribute('aria-checked', isSel ? 'true' : 'false');
      b.tabIndex = isSel ? 0 : (!hasSelection && i === 0 ? 0 : -1);

      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = q.type === 'TF' ? t.charAt(0) : letters[i];

      const tx = document.createElement('span');
      tx.className = 't';
      tx.textContent = t;

      const chk = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      chk.setAttribute('class', 'chk');
      chk.setAttribute('viewBox', '0 0 20 20');
      chk.setAttribute('fill', 'none');
      chk.setAttribute('stroke', 'currentColor');
      chk.setAttribute('stroke-width', '2.6');
      chk.setAttribute('stroke-linecap', 'round');
      chk.setAttribute('stroke-linejoin', 'round');
      chk.setAttribute('aria-hidden', 'true');
      const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('d', 'M3.5 10.5 8 15l8.5-10');
      chk.append(p);

      b.append(k, tx, chk);
      b.onclick = () => { choose(b); };
      box.append(b);
    });

    box.addEventListener('keydown', e => {
      const list = [...box.children];
      const at = list.indexOf(document.activeElement);
      if (at === -1) return;
      let to = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') to = (at + 1) % list.length;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') to = (at - 1 + list.length) % list.length;
      else if (e.key === 'Home') to = 0;
      else if (e.key === 'End') to = list.length - 1;
      else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); choose(list[at]); return; }
      else return;
      e.preventDefault();
      choose(list[to]);
      list[to].focus();
    });

    host.append(box);

  } else if (q.type === 'EN') {
    const hint = document.createElement('p');
    hint.className = 'muted small';
    hint.textContent = q.expect
      ? `List ${q.expect} (${q.expect} pt${q.expect === 1 ? '' : 's'}) — one per line. Order does not matter.`
      : 'One per line. Order does not matter.';

    const ta = document.createElement('textarea');
    ta.className = 'field';
    ta.id = 'ansField';
    ta.rows = Math.min(8, Math.max(3, q.expect || 4));
    ta.spellcheck = false;
    ta.placeholder = 'One answer per line';
    ta.value = S.answers[q.no] || '';
    host.append(hint, ta);

  } else if (q.type === 'MA') {
    const box = document.createElement('div');
    box.className = 'opts';

    const picks = S.answers[q.no] || {};
    q.choices.forEach((left, i) => {
      const row = document.createElement('div');
      row.className = 'pair';

      const lab = document.createElement('span');
      lab.className = 'pair-l';
      lab.textContent = left;

      const sel = document.createElement('select');
      sel.className = 'field pair-s';
      sel.setAttribute('aria-label', 'Match for ' + left);
      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'Choose…';
      sel.append(none);

      (q.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        if (picks[left] === opt) o.selected = true;
        sel.append(o);
      });

      row.append(lab, sel);
      box.append(row);
    });
    host.append(box);

  } else if (q.type === 'WB') {
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.id = 'ansField';
    inp.type = 'text';
    inp.placeholder = 'Tap a word or type here';
    inp.value = S.answers[q.no] || '';

    const bank = document.createElement('div');
    bank.className = 'bank';
    (q.choices || []).forEach(word => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (inp.value === word ? ' on' : '');
      chip.textContent = word;
      chip.onclick = () => {
        inp.value = word;
        for (const c of bank.children) c.classList.remove('on');
        chip.classList.add('on');
        feedback('select', 10);
      };
      bank.append(chip);
    });
    host.append(inp, bank);

  } else {
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.id = 'ansField';
    inp.type = 'text';
    inp.placeholder = 'Type your answer';
    inp.value = S.answers[q.no] || '';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); answer(); }
    });
    host.append(inp);
  }

  // Next/Skip button labels and click bindings
  const isLast = S.pos === S.queue.length - 1 && !S.deferred.length;
  if (S.isReviewer) {
    if ($('standardActions')) $('standardActions').hidden = true;
    if ($('reviewerActions')) $('reviewerActions').hidden = false;
    if ($('reviewerFeedbackArea')) $('reviewerFeedbackArea').hidden = true;
    if ($('rfExplanationCard')) {
      $('rfExplanationCard').hidden = true;
      $('rfExplanationCard').dataset.loadedFor = '';
    }
    if ($('rfAiFallback')) $('rfAiFallback').hidden = true;
    if ($('btnReviewerSubmit')) {
      $('btnReviewerSubmit').hidden = false;
      $('btnReviewerSubmit').onclick = () => submitReviewerAnswer();
    }
    if ($('btnNextQuestion')) {
      $('btnNextQuestion').hidden = true;
      $('btnNextQuestion').textContent = isLast ? 'Finish & Review All ✓' : 'Next Question ›';
      $('btnNextQuestion').onclick = () => {
        const qCur = current();
        if (qCur) {
          const val = readAnswer();
          setDirtyAnswer(qCur.no, val || '');
        }
        advance();
      };
    }
  } else {
    if ($('standardActions')) $('standardActions').hidden = false;
    if ($('reviewerActions')) $('reviewerActions').hidden = true;
    if ($('btnAnswer')) {
      $('btnAnswer').textContent = isLast ? 'Submit exam' : 'Next';
      $('btnAnswer').onclick = () => answer();
    }
    if ($('btnSkip')) {
      $('btnSkip').hidden = S.secondPass || isLast;
      $('btnSkip').onclick = () => skip();
    }
  }

  setTimeout(() => {
    const firstInteractive = host.querySelector('.opt[tabindex="0"], .opt, input, textarea, select');
    if (firstInteractive) firstInteractive.focus();
  }, 50);
}

function choose(btn) {
  const box = btn.closest('.opts');
  if (box) {
    box.querySelectorAll('.opt').forEach(b => {
      b.classList.toggle('selected', b === btn);
      b.setAttribute('aria-checked', b === btn ? 'true' : 'false');
      b.tabIndex = b === btn ? 0 : -1;
    });
  }
  setDirtyAnswer(current().no, btn.dataset.value);
  feedback('select', 12);
  play('click');
}

function readAnswer() {
  const q = current();
  if (!q) return null;
  if (q.type === 'MC' || q.type === 'TF') {
    return S.answers[q.no] || '';
  }
  if (q.type === 'EN') {
    const val = $('ansField')?.value || '';
    return val.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  }
  if (q.type === 'MA') {
    const picks = {};
    const selects = document.querySelectorAll('#qInput select');
    selects.forEach((sel, i) => {
      if (sel.value && q.choices[i]) picks[q.choices[i]] = sel.value;
    });
    return Object.keys(picks).length ? picks : '';
  }
  return $('ansField')?.value?.trim() || '';
}

let _unansweredConfirmed = false;

function answer(force) {
  const q = current();
  if (!q) return;

  const val = readAnswer();
  const blank = val == null || val === '' || (Array.isArray(val) && !val.length) || (typeof val === 'object' && !Object.keys(val).length);

  if (blank && !force && !_unansweredConfirmed) {
    openModal($('blankConfirmModal'), $('btnStayAndAnswer'), {
      onDismiss: () => {}
    });
    $('btnStayAndAnswer').onclick = () => closeModal($('blankConfirmModal'));
    $('btnSkipAnyway').onclick = () => {
      closeModal($('blankConfirmModal'));
      _unansweredConfirmed = true;
      answer(true);
    };
    return;
  }

  _unansweredConfirmed = false;
  setDirtyAnswer(q.no, val || '');

  advance();
}

function advance() {
  stopQuestion();
  S.pos++;
  if (S.pos < S.queue.length) {
    step();
    return;
  }
  if (S.deferred.length && !S.secondPass) {
    S.secondPass = true;
    S.queue = [...S.deferred];
    S.deferred = [];
    S.pos = 0;
    announce('Reviewing skipped questions');
    step();
    return;
  }
  finish();
}

function skip() {
  const q = current();
  if (!q) return;
  stopQuestion();
  if (!S.deferred.some(d => (d && d.no != null ? d.no : d) === q.no)) S.deferred.push(q);
  feedback('skip', 8);
  advance();
}

function step() {
  stopQuestion();
  const q = current();
  if (!q) { finish(); return; }
  startQuestion(q);
}

function startQuestion(q) {
  stopQuestion();
  S.qStarted = Date.now();
  render();

  if (S.isReviewer || S.timerMode === 'untimed') {
    paint(null);
    return;
  }

  const sec = q.seconds || S.defaultTimer || 45;
  S.remaining = sec;
  S.span = sec;
  paint(S.remaining);

  S.tick = setInterval(() => {
    S.remaining--;
    paint(S.remaining);
    if (S.remaining === 10) announce('10 seconds remaining', true);
    if (S.remaining <= 0) {
      stopQuestion();
      play('timeup');
      answer(true);
    }
  }, 1000);
}

const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replaceAll('"', '&quot;');
function normText(s, keepCase) {
  const out = String(s == null ? '' : s)
    .normalize('NFD')
    .replace(new RegExp('[\\u0300-\\u036f]', 'g'), '')
    .replace(new RegExp('[^\\w\\s]', 'g'), ' ')
    .replace(new RegExp('\\s+', 'g'), ' ')
    .trim();
  return keepCase ? out : out.toLowerCase();
}

function buildGoogleAiUrl(q, key) {
  let aiPrompt = 'Explain why';
  if (q && q.question) {
    aiPrompt += ', for the question: "' + q.question + '"';
  }
  if (key && key.expected) {
    aiPrompt += ', the correct answer is: "' + key.expected + '"';
  }
  if (q && Array.isArray(q.choices) && q.choices.length) {
    aiPrompt += '. The choices are: ' + q.choices.join(', ') + '. Please explain why the correct answer is right and why the other choices are not.';
  } else {
    aiPrompt += '. Please provide a detailed and clear explanation of why this answer is correct.';
  }
  return 'https://www.google.com/search?q=' + encodeURIComponent(aiPrompt);
}

function renderSafeAiMarkdown(text, container) {
  const skipPrivacy = arguments[2] === true;
  container.replaceChildren();
  if (!text) return;
  const lines = String(text).split('\n');
  let currentUl = null;

  lines.forEach(rawLine => {
    const line = rawLine.trim();
    if (!line) {
      currentUl = null;
      return;
    }

    const formatInline = str => {
      const safe = esc(str);
      return safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    };

    if (/^###?\s+/.test(line)) {
      currentUl = null;
      const h = document.createElement('h4');
      h.innerHTML = formatInline(line.replace(/^###?\s+/, ''));
      container.appendChild(h);
    } else if (/^[-*•]\s+/.test(line)) {
      if (!currentUl) {
        currentUl = document.createElement('ul');
        container.appendChild(currentUl);
      }
      const li = document.createElement('li');
      li.innerHTML = formatInline(line.replace(/^[-*•]\s+/, ''));
      currentUl.appendChild(li);
    } else {
      currentUl = null;
      const p = document.createElement('p');
      p.innerHTML = formatInline(line);
      container.appendChild(p);
    }
  });

  if (!skipPrivacy) {
    const privacyNote = document.createElement('div');
    privacyNote.className = 'rf-ai-privacy';
    privacyNote.textContent = '🔒 AI explanation generated by Google Gemini using question text only.';
    container.appendChild(privacyNote);
  }
}

function parseExplanationSections(rawText) {
  const text = String(rawText || '').trim();
  const res = { whyCorrect: '', whyWrong: '', keyConcept: '' };

  const mCorrect = text.match(/(?:^|\n)(?:#{1,4}\s*|\*{0,2})(?:1\.\s*)?Why (?:the )?correct answer[^\n]*\*{0,2}([\s\S]*?)(?=(?:\n(?:#{1,4}\s*|\*{0,2})(?:2\.\s*)?Why (?:the )?other choices|\n(?:#{1,4}\s*|\*{0,2})(?:3\.\s*)?Key [Cc]oncept|$))/i);
  const mWrong = text.match(/(?:^|\n)(?:#{1,4}\s*|\*{0,2})(?:2\.\s*)?Why (?:the )?other choices[^\n]*\*{0,2}([\s\S]*?)(?=(?:\n(?:#{1,4}\s*|\*{0,2})(?:3\.\s*)?Key [Cc]oncept|$))/i);
  const mConcept = text.match(/(?:^|\n)(?:#{1,4}\s*|\*{0,2})(?:3\.\s*)?Key [Cc]oncept[^\n]*\*{0,2}([\s\S]*?)$/i);

  if (mCorrect) res.whyCorrect = mCorrect[1].trim();
  if (mWrong) res.whyWrong = mWrong[1].trim();
  if (mConcept) res.keyConcept = mConcept[1].trim();

  if (!res.whyCorrect && !res.whyWrong && !res.keyConcept) {
    res.whyCorrect = text;
  }
  return res;
}

function populateExplanationCards(explanation, modelName, qNo) {
  const expCard = $('rfExplanationCard');
  if (!expCard) return;
  expCard.hidden = false;
  expCard.dataset.loadedFor = String(qNo);

  const tag = $('rfModelTag');
  if (tag) tag.textContent = modelName || 'gemini-3.5-flash-lite';

  const sections = parseExplanationSections(explanation);

  const whyCorrect = $('rfWhyCorrect');
  if (whyCorrect) renderSafeAiMarkdown(sections.whyCorrect, whyCorrect, true);

  const wrongSec = $('rfWrongSection');
  const whyWrong = $('rfWhyWrong');
  if (wrongSec && whyWrong) {
    if (sections.whyWrong) {
      wrongSec.hidden = false;
      renderSafeAiMarkdown(sections.whyWrong, whyWrong, true);
    } else {
      wrongSec.hidden = true;
    }
  }

  const conceptSec = $('rfConceptSection');
  const keyConcept = $('rfKeyConcept');
  if (conceptSec && keyConcept) {
    if (sections.keyConcept) {
      conceptSec.hidden = false;
      renderSafeAiMarkdown(sections.keyConcept, keyConcept, true);
    } else {
      conceptSec.hidden = true;
    }
  }
}

async function handleReviewerAiExplain(q, key, btnAi) {
  if (!q || !btnAi) return;
  const expCard = $('rfExplanationCard');
  const fallbackBox = $('rfAiFallback');
  const errText = $('rfAiErrorText');

  if (expCard && !expCard.hidden && expCard.dataset.loadedFor === String(q.no)) {
    expCard.hidden = true;
    btnAi.textContent = '✨ Explain with AI';
    return;
  }

  const qSig = [
    q.no,
    q.question || '',
    (q.choices || []).join('|'),
    (key && key.expected) || ''
  ].join('::');
  let h = 0;
  for (let i = 0; i < qSig.length; i++) h = (Math.imul(31, h) + qSig.charCodeAt(i)) | 0;
  const sigHash = (h >>> 0).toString(36);
  const aiCacheKey = 'ai_exp_' + (S.code || '') + '_' + q.no + '_' + sigHash;

  let cached = null;
  try { cached = sessionStorage.getItem(aiCacheKey); } catch (e) {}

  if (cached && expCard) {
    let cachedObj = null;
    try { cachedObj = JSON.parse(cached); } catch (e) { cachedObj = { explanation: cached, model: 'gemini-3.5-flash-lite' }; }
    populateExplanationCards(cachedObj.explanation, cachedObj.model, q.no);
    btnAi.textContent = '✨ AI Explanation (Hide)';
    if (fallbackBox) fallbackBox.hidden = true;
    return;
  }

  btnAi.disabled = true;
  btnAi.textContent = '✨ AI Tutor is thinking…';
  if (fallbackBox) fallbackBox.hidden = true;

  try {
    const userToken = await idToken().catch(() => '');
    if (!userToken) {
      throw new Error('Please sign in to access AI explanations.');
    }

    const res = await api('reviewerExplain', {
      idToken: userToken,
      attemptToken: S.token,
      qNo: q.no
    });

    if (res && res.ok && res.explanation) {
      try {
        sessionStorage.setItem(aiCacheKey, JSON.stringify({ explanation: res.explanation, model: res.model || 'gemini-3.5-flash-lite' }));
      } catch (e) {}
      populateExplanationCards(res.explanation, res.model, q.no);
      btnAi.disabled = false;
      btnAi.textContent = '✨ AI Explanation (Hide)';
    } else {
      throw new Error(res && res.message ? res.message : 'Could not generate AI explanation.');
    }
  } catch (err) {
    if (expCard) expCard.hidden = true;
    if (fallbackBox) fallbackBox.hidden = false;
    if (errText) errText.textContent = (err && err.message) || 'AI explanation temporarily unavailable.';
    btnAi.disabled = false;
    btnAi.textContent = '✨ Retry AI Explanation';
  }
}

function renderReviewerFeedback(isCorrect, badgeText, expHtml, q, key) {
  const area = $('reviewerFeedbackArea');
  if (!area) return;
  area.hidden = false;

  const badge = $('rfStatusBadge');
  if (badge) {
    badge.className = 'rf-badge ' + (isCorrect ? 'ok' : 'bad');
    badge.textContent = badgeText;
  }

  const ans = $('rfAnswerText');
  if (ans) {
    ans.innerHTML = expHtml;
  }

  const fallbackUrl = buildGoogleAiUrl(q, key);
  const gLink = $('rfGoogleLink');
  if (gLink) gLink.href = fallbackUrl;

  const fallbackBox = $('rfAiFallback');
  if (fallbackBox) fallbackBox.hidden = true;

  const expCard = $('rfExplanationCard');
  if (expCard) {
    expCard.hidden = true;
    expCard.dataset.loadedFor = '';
  }

  const btnAi = $('btnReviewerAi');
  if (btnAi) {
    btnAi.disabled = false;
    btnAi.textContent = '✨ Explain with AI';
    btnAi.onclick = () => handleReviewerAiExplain(q, key, btnAi);
  }
}

function submitReviewerAnswer() {
  const q = current();
  if (!q || !q.answerKey) return;
  const key = q.answerKey;
  const given = readAnswer();

  // Persist student's answered state
  setDirtyAnswer(q.no, given || '');

  if (q.type === 'MC' || q.type === 'TF') {
    const opts = document.querySelectorAll('#qInput .opt');
    let isCorrect = false;
    opts.forEach(b => {
      b.classList.remove('correct-answer', 'wrong-answer');
      const val = b.dataset.value;
      const isTarget = (q.type === 'MC' && val === key.correctLetter) ||
                       (q.type === 'TF' && (val === key.correctValue || val === key.correctLetter));
      if (isTarget) {
        b.classList.add('correct-answer');
      }
      if (val === given) {
        if (isTarget) {
          isCorrect = true;
        } else {
          b.classList.add('wrong-answer');
        }
      }
    });

    renderReviewerFeedback(isCorrect, isCorrect ? '✓ Correct!' : '✗ Incorrect', `Correct Answer: <b>${esc(key.expected)}</b>`, q, key);

    if (isCorrect) {
      play('chime');
      haptic(30);
    } else {
      play('wrong');
      haptic(15);
    }
  } else if (q.type === 'ID' || q.type === 'WB') {
    const keepCase = !!key.caseSensitive;
    const g = normText(given, keepCase);
    let ok = false;
    const mode = key.match || '';

    const numMatch = mode.match(/^#\s*(?:±|\+\/-)?\s*([0-9.]+)$/);
    if (numMatch) {
      const tol = parseFloat(numMatch[1]) || 0;
      const gn = parseFloat(String(given || '').replace(/[^0-9.\-]/g, ''));
      ok = !isNaN(gn) && (key.alts || []).some(a => {
        const an = parseFloat(String(a).replace(/[^0-9.\-]/g, ''));
        return !isNaN(an) && Math.abs(gn - an) <= tol;
      });
    } else if (mode === '~') {
      ok = (key.alts || []).some(a => {
        const an = normText(a, keepCase);
        return an && (g.indexOf(an) !== -1 || an.indexOf(g) !== -1);
      });
    } else {
      ok = (key.alts || []).some(a => normText(a, keepCase) === g);
    }

    renderReviewerFeedback(ok, ok ? '✓ Correct!' : '✗ Incorrect', `Correct Answer: <b>${esc(key.expected)}</b>`, q, key);
    if (ok) { play('chime'); haptic(30); } else { play('wrong'); haptic(15); }
  } else if (q.type === 'EN') {
    const keepCase = !!key.caseSensitive;
    const wanted = (key.items || []).map(a =>
      String(a).split('/').map(x => normText(x, keepCase)).filter(Boolean));
    const got = String(given || '').split('\n').map(l => normText(l, keepCase)).filter(Boolean);
    const used = {};
    let hits = 0;
    wanted.forEach(alts => {
      for (let g = 0; g < got.length; g++) {
        if (used[g]) continue;
        if (alts.indexOf(got[g]) !== -1) { used[g] = true; hits++; return; }
      }
    });
    const isCorrect = wanted.length > 0 && hits === wanted.length;

    renderReviewerFeedback(isCorrect, isCorrect ? '✓ Correct!' : '✗ ' + hits + ' of ' + wanted.length + ' Items Correct', `Expected Items: <b>${esc(key.expected)}</b>`, q, key);
    if (isCorrect) { play('chime'); haptic(30); } else { play('wrong'); haptic(15); }
  } else if (q.type === 'MA') {
    let picks = {};
    try { picks = (typeof given === 'object' && given) ? given : JSON.parse(given); }
    catch (e) { picks = {}; }
    let hits = 0;
    const totalPairs = Object.keys(key.pairs || {}).length;
    Object.keys(key.pairs || {}).forEach(left => {
      const right = key.pairs[left];
      const chose = picks[left];
      if (chose != null && normText(chose) === normText(right)) hits++;
    });
    const isCorrect = totalPairs > 0 && hits === totalPairs;

    renderReviewerFeedback(isCorrect, isCorrect ? '✓ Correct!' : '✗ ' + hits + ' of ' + totalPairs + ' Pairs Correct', `Correct Matches: <b>${esc(key.expected)}</b>`, q, key);
    if (isCorrect) { play('chime'); haptic(30); } else { play('wrong'); haptic(15); }
  }

  // Switch action buttons: hide Submit, show Next Question
  if ($('btnReviewerSubmit')) $('btnReviewerSubmit').hidden = true;
  if ($('btnNextQuestion')) $('btnNextQuestion').hidden = false;
}

function showReviewerAnswer() {
  submitReviewerAnswer();
}

let saveTimer = null;

function autosave() {
  if (saveTimer) clearInterval(saveTimer);
  // Adaptive checkpointing: 10-minute fallback interval, zero writes if no dirty answers
  saveTimer = setInterval(async () => {
    if (!S.token || S.finished) return;
    if (db) {
      if (_dirtyKeys.size > 0) await flushFirestoreCheckpoint().catch(() => {});
      return;
    }
    if (isDeltaAutosaveEnabled(S.code)) {
      if (_dirtyKeys.size > 0) await flushDeltaAnswers().catch(() => {});
      return;
    }
    const userToken = await idToken().catch(() => '');
    api('save', { token: S.token, answers: S.answers, perQ: S.perQ, idToken: userToken }, { tries: 1 })
      .catch(() => {});
  }, 10 * 60 * 1000);
}

function finish() {
  closeAway();
  stopQuestion();
  if (S.globalTick) { clearInterval(S.globalTick); S.globalTick = null; }
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
  if (_deltaFlushTimer) { clearTimeout(_deltaFlushTimer); _deltaFlushTimer = null; }
  S.finished = true;
  show('scSending');
  send();
}

async function send(isAutoTimeout = false) {
  $('sendText').textContent = 'Submitting your answers…';
  $('sendSub').textContent = 'Keep this page open.';
  $('btnRetry').hidden = true;

  try {
    if (isAutoTimeout) {
      // Spread simultaneous automatic timer submissions smoothly
      await sleep(Math.floor(Math.random() * 1500));
    }
    if (_dirtyKeys.size > 0) {
      let flushed = false;
      if (db) {
        flushed = await flushFirestoreCheckpoint(true).catch(err => {
          if (err?.code !== 'permission-denied') {
            console.warn('[student] Final Firestore checkpoint failed, trying fallbacks:', err);
          }
          return false;
        });
      }
      // If Firestore failed, was busy, or unavailable, fall back to delta HTTP autosave via Apps Script
      if (!flushed && _dirtyKeys.size > 0) {
        const deltaOk = await flushDeltaAnswers(true).catch(err => {
          console.warn('[student] Final delta autosave fallback failed:', err);
          return false;
        });
        // If delta autosave also failed or was unable to flush, fall back to full state save
        if (!deltaOk && _dirtyKeys.size > 0) {
          try {
            const userToken = await idToken().catch(() => '');
            const saveRes = await api('save', {
              token: S.token,
              answers: S.answers,
              perQ: S.perQ,
              idToken: userToken
            }, { tries: 2 });
            if (saveRes && saveRes.ok) {
              _dirtyKeys.clear();
            }
          } catch (e) {
            console.warn('[student] Final full-save fallback failed:', e);
          }
        }
      }
    }
    const userToken = await idToken().catch(() => '');
    const privAck = FEATURE_FLAGS?.privacyAckVersion || 'privacy_ack_2026_1';
    const r = await api('submit',
      {
        token: S.token,
        answers: S.answers,
        flags: S.flags,
        idToken: userToken,
        privacyAckVersion: privAck,
        engine: db ? 'firestore+hybrid' : (isDeltaAutosaveEnabled(S.code) ? 'delta+ledger' : 'legacy')
      },
      { tries: 6, onRetry: (n, of) => { $('sendText').textContent = `Connection is slow — retrying (${n} of ${of})…`; } });

    if (!r.ok) {
      $('sendText').textContent = r.message || 'The server could not record your answers.';
      $('sendSub').textContent = 'Show this screen to your instructor.';
      $('btnRetry').hidden = false;
      if ($('btnSendBack')) $('btnSendBack').hidden = false;
      return;
    }
    done(r);
  } catch {
    $('sendText').textContent = 'We could not reach the server.';
    $('sendSub').textContent = 'Your answers are still here. Reconnect and tap Try again.';
    $('btnRetry').hidden = false;
    if ($('btnSendBack')) $('btnSendBack').hidden = false;
  }
}
$('btnRetry').onclick = send;
if ($('btnSendBack')) {
  $('btnSendBack').onclick = () => {
    S.active = null;
    if ($('activeExamCard')) $('activeExamCard').hidden = true;
    boot('scStart');
  };
}

let _lastDoneResult = null;
let _activeFilter = 'all';

function done(r) {
  _lastDoneResult = r;
  $('doneTitle').textContent = 'Exam submitted';
  clearSessionBackup(S.token);
  clearJournalAnswers(S.token).catch(() => {});
  _dirtyKeys.clear();
  const mode = r.revealMode || 'none';

  const radialWrap = $('scoreRadialWrap');
  const radialBar = $('scoreRadialBar');
  const pctNum = $('scorePercentNum');
  const fracNum = $('scoreFractionNum');

  if (mode === 'none' || !r.total) {
    $('scoreBox').hidden = true;
    if (radialWrap) radialWrap.hidden = true;
    $('doneNote').textContent = 'Your answers have been recorded. Your instructor will release results.';
  } else {
    // Show animated SVG radial score gauge
    if (radialWrap) radialWrap.hidden = false;
    $('scoreBox').hidden = true;

    const pct = Math.round(((r.score || 0) / r.total) * 100);
    const radius = 52;
    const circumference = 2 * Math.PI * radius; // ~326.72
    const offset = circumference - (pct / 100) * circumference;

    if (radialBar) {
      radialBar.style.strokeDasharray = `${circumference}`;
      radialBar.style.strokeDashoffset = `${circumference}`;
      setTimeout(() => {
        radialBar.style.strokeDashoffset = `${offset}`;
        radialBar.style.stroke = pct >= 75 ? 'var(--ok)' : pct >= 50 ? 'var(--accent)' : 'var(--bad)';
      }, 100);
    }

    if (reducedMotion()) {
      if (pctNum) pctNum.textContent = `${pct}%`;
    } else {
      let currentPct = 0;
      const countTimer = setInterval(() => {
        currentPct += Math.max(1, Math.ceil((pct - currentPct) / 6));
        if (currentPct >= pct) { currentPct = pct; clearInterval(countTimer); }
        if (pctNum) pctNum.textContent = `${currentPct}%`;
      }, 25);
    }
    // The gauge is a picture; the number behind it has to be readable.
    if (radialWrap) {
      radialWrap.setAttribute('role', 'img');
      radialWrap.setAttribute('aria-label',
        `You scored ${r.score} out of ${r.total}, ${pct} per cent.`);
    }

    if (fracNum) fracNum.textContent = `${r.score} / ${r.total}`;

    const bits = [`${r.correctCount} correct`, `${r.mistakeCount} wrong`];
    if (r.blankCount) bits.push(`${r.blankCount} unanswered`);
    $('doneNote').textContent = bits.join('  ·  ');

    // Confetti for a good result only. Firing it at someone who scored 3
    // out of 40 reads as mockery, and the same fanfare for every outcome
    // stops meaning anything at all.
    setTimeout(() => {
      if (pct >= 75) {
        confetti($('fxCanvas'), { origin: { x: 0.5, y: 0.35 } });
        play('chime');
        haptic(40);
      } else {
        play('submit');
        haptic(18);
      }
    }, 250);
  }

  const details = r.detail || [];
  const correctCount = details.filter(d => d.correct).length;
  const blankCount = details.filter(d => !d.given || d.given === '(blank)').length;
  const wrongCount = details.length - correctCount - blankCount;

  if ($('cntAll')) $('cntAll').textContent = details.length;
  if ($('cntCorrect')) $('cntCorrect').textContent = correctCount;
  if ($('cntWrong')) $('cntWrong').textContent = Math.max(0, wrongCount);
  if ($('cntBlank')) $('cntBlank').textContent = blankCount;

  renderReviewList('all');
  if (S.isReviewer) {
    if ($('standardDoneActions')) $('standardDoneActions').hidden = true;
    if ($('reviewerDoneActions')) $('reviewerDoneActions').hidden = false;
    if ($('btnRetryReviewer')) $('btnRetryReviewer').onclick = () => retryReviewer();
    if ($('btnEndReviewer')) $('btnEndReviewer').onclick = () => leaveFinishedExam('scStart');
  } else {
    if ($('standardDoneActions')) $('standardDoneActions').hidden = false;
    if ($('reviewerDoneActions')) $('reviewerDoneActions').hidden = true;
    $('btnDoneExams').onclick = () => leaveFinishedExam('scStart');
    $('btnDoneHistory').onclick = () => leaveFinishedExam('scHistory');
  }
  show('scDone');
}

async function retryReviewer() {
  const code = S.code;
  if (!code) { leaveFinishedExam('scStart'); return; }
  clearSessionBackup(S.token);
  clearJournalAnswers(S.token).catch(() => {});
  _dirtyKeys.clear();

  show('scSending');
  $('sendText').textContent = 'Starting fresh reviewer session…';
  $('sendSub').textContent = 'Please wait a moment.';

  try {
    const userToken = await idToken().catch(() => '');
    const r = await api('startAttempt', {
      code: code,
      idToken: userToken,
      forceNew: true
    });
    if (!r.ok) {
      toast(r.message || 'Could not restart reviewer.', 'bad');
      show('scDone');
      return;
    }
    await prepare(r);
    begin();
  } catch (err) {
    toast(err.message || 'Could not restart reviewer.', 'bad');
    show('scDone');
  }
}

function renderReviewList(filter) {
  _activeFilter = filter;
  document.querySelectorAll('#reviewFilterTabs .filter-tab').forEach(btn => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
    btn.tabIndex = active ? 0 : -1;
  });

  const r = _lastDoneResult;
  const wrap = $('reviewWrap');
  wrap.replaceChildren();
  const revCard = $('reviewCard');
  if (!r || !r.detail || !r.detail.length) {
    if (revCard) revCard.hidden = true;
    return;
  }
  if (revCard) revCard.hidden = false;

  let items = r.detail;
  if (filter === 'correct') items = items.filter(d => d.correct);
  else if (filter === 'wrong') items = items.filter(d => !d.correct && d.given && d.given !== '(blank)');
  else if (filter === 'blank') items = items.filter(d => !d.given || d.given === '(blank)');

  if (!items.length) {
    const WORD = { all: '', correct: 'correct', wrong: 'wrong', blank: 'unanswered' };
    const empty = document.createElement('p');
    empty.className = 'muted small';
    empty.style.padding = '12px 0';
    empty.textContent = filter === 'all'
      ? 'There is nothing to review.'
      : `You had no ${WORD[filter]} questions.`;
    wrap.append(empty);
    return;
  }

  const list = document.createElement('div');
  list.className = 'review';

  for (const d of items) {
    const isBlank = !d.given || d.given === '(blank)';
    const part = !d.correct && d.credit > 0;
    const box = document.createElement('div');
    box.className = 'rev' + (d.correct ? ' ok' : isBlank ? '' : part ? ' part' : '');

    const q = document.createElement('div');
    q.className = 'q';
    q.textContent = `${d.no}. ${d.question}`;
    if (d.detail) {
      const got = document.createElement('span');
      got.className = 'part-tag';
      got.textContent = d.detail;
      q.append(' ', got);
    }

    const a = document.createElement('div');
    a.className = 'a';
    a.append('Your answer: ');
    const ab = document.createElement('b');
    ab.textContent = d.given || '(blank)';
    a.append(ab);

    box.append(q, a);

    if (d.expected != null) {
      const e = document.createElement('div');
      e.className = 'a';
      e.append('Correct answer: ');
      const eb = document.createElement('b');
      eb.textContent = d.expected;
      e.append(eb);
      box.append(e);
    }
    list.append(box);
  }
  wrap.append(list);
}

const reviewTabs = [...document.querySelectorAll('#reviewFilterTabs .filter-tab')];
reviewTabs.forEach((btn, i) => {
  btn.tabIndex = i === 0 ? 0 : -1;
  btn.onclick = () => { feedback('tap', 8); renderReviewList(btn.dataset.filter); };
});
$('reviewFilterTabs')?.addEventListener('keydown', e => {
  const at = reviewTabs.indexOf(document.activeElement);
  if (at === -1) return;
  let to = -1;
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') to = (at + 1) % reviewTabs.length;
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') to = (at - 1 + reviewTabs.length) % reviewTabs.length;
  else if (e.key === 'Home') to = 0;
  else if (e.key === 'End') to = reviewTabs.length - 1;
  else return;
  e.preventDefault();
  reviewTabs[to].focus();
  reviewTabs[to].click();
});

/* ---------------- leaving the page ----------------

   Every focus loss is timestamped into the Notes column for the teacher to
   read, and the student is warned. What it does NOT do is end the exam.

   That is a deliberate choice, not an oversight. This runs on student
   phones: an incoming call, a notification pulled down, a low-battery
   sheet and a banking OTP all raise the same events a cheating tab-switch
   does, and none of them are distinguishable from the page. Failing an
   honest student outright is a worse error than logging a dishonest one
   for you to judge, and the Notes column gives you the evidence either way.
   `scBrief` promises the student exactly this, so the two must agree.

   Set STRICT_AUTO_SUBMIT to true if your exam room rules call for it — the
   whole behaviour hangs off this one constant. Change the Begin-exam rules
   list in index.html to match if you do.                                  */

const STRICT_AUTO_SUBMIT = true;
const WARN_LIMIT = 2;            // warnings shown before the strict cutoff

function isExamActive() {
  if (S.isReviewer) return false;
  const el = $('scExam');
  return !!(el && !el.hidden && S.token && !S.finished);
}

/** Format a timestamp as a short local time string, e.g. "10:14:32 AM" */
function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function leftPage() {
  if (awayAt || !isExamActive()) return;
  awayAt = Date.now();
}

/** Closes the open focus-loss event, if there is one. */
function closeAway() {
  if (!awayAt) return;
  const back = Date.now();
  const gapSec = Math.round((back - awayAt) / 1000);
  const gapLabel = gapSec >= 60
    ? Math.floor(gapSec / 60) + 'm ' + (gapSec % 60) + 's'
    : gapSec + 's';
  if (!Array.isArray(S.flags)) S.flags = [];
  S.flags.push({
    type: 'focus-loss',
    leftAt:      new Date(awayAt).toISOString(),
    returnedAt:  new Date(back).toISOString(),
    gapSeconds:  gapSec,
    label: 'Left ' + fmtTime(awayAt) + ' · Returned ' + fmtTime(back) + ' · Away ' + gapLabel
  });
  awayAt = null;
}

/**
 * The warning is shown on the way BACK, never on the way out.
 *
 * A modal raised while the tab is hidden counts down in a window nobody is
 * looking at, so the student returns to a dismissed dialog and never learns
 * they were flagged. Worse, background tabs throttle timers, so the count
 * is wrong as well as unseen.
 */
function showWarning() {
  if (S.isReviewer) return;
  const wModal = $('warningModal');
  const wText  = $('warningModalText');
  const wNotes = $('warningModalNotes');
  const wCount = $('warningModalCountdown');
  if (!wModal) return;

  const strikes = S.proctoringStrikes != null ? Number(S.proctoringStrikes) : (STRICT_AUTO_SUBMIT ? WARN_LIMIT + 1 : 0);

  if (strikes <= 0) {
    wText.textContent = 'Warning ' + behaviorWarnings + ': you left the exam page. Your instructor can see when you left and for how long. Your exam has not been ended — carry on and finish it.';
    if (wNotes) {
      if (S.proctoringWarningNotes) {
        wNotes.textContent = S.proctoringWarningNotes;
        wNotes.hidden = false;
      } else {
        wNotes.hidden = true;
      }
    }
    let left = 10;
    wCount.textContent = 'Resuming in ' + left + 's…';
    openModal(wModal, $('btnResumeExam'), { onDismiss: dismissWarning });
    play('alert');
    clearInterval(warningCountdownInterval);
    warningCountdownInterval = setInterval(() => {
      left--;
      wCount.textContent = 'Resuming in ' + left + 's…';
      if (left <= 0) dismissWarning();
    }, 1000);
    $('btnResumeExam').onclick = dismissWarning;
    return;
  }

  const strictEnd = STRICT_AUTO_SUBMIT && behaviorWarnings >= strikes;

  if (strictEnd) {
    wText.textContent =
      '🚨 FINAL NOTICE: You have left the exam page ' + behaviorWarnings + ' times. As warned, your exam has been terminated and is being submitted now.';
    if (wNotes) wNotes.hidden = true;
    wCount.textContent = 'Submitting…';
    openModal(wModal, null, { dismissible: false });
    play('alert');
    setTimeout(() => { closeModal(wModal); finish(); }, 2200);
    return;
  }

  const remaining = strikes - behaviorWarnings;
  wText.textContent = STRICT_AUTO_SUBMIT
    ? '⚠️ Strike ' + behaviorWarnings + ' of ' + strikes + ': You left or switched away from the exam page! ' +
      'Switching tabs, minimizing, or navigating away is strictly prohibited. Your instructor has been notified. ' +
      (remaining === 1
        ? 'CONSEQUENCE: If you leave this page 1 more time, your exam will be AUTOMATICALLY SUBMITTED IMMEDIATELY.'
        : 'CONSEQUENCE: ' + remaining + ' strikes remaining before your exam is automatically submitted.')
    : 'Warning ' + behaviorWarnings + ': you left the exam page. Your instructor can see ' +
      'when you left and for how long. Your exam has not been ended — carry on and finish it.';

  if (wNotes) {
    if (S.proctoringWarningNotes) {
      wNotes.textContent = S.proctoringWarningNotes;
      wNotes.hidden = false;
    } else {
      wNotes.hidden = true;
    }
  }

  let left = 15;
  wCount.textContent = 'Resuming in ' + left + 's…';
  openModal(wModal, $('btnResumeExam'), { onDismiss: dismissWarning });
  play('alert');

  clearInterval(warningCountdownInterval);
  warningCountdownInterval = setInterval(() => {
    left--;
    wCount.textContent = 'Resuming in ' + left + 's…';
    if (left <= 0) dismissWarning();
  }, 1000);

  $('btnResumeExam').onclick = dismissWarning;
}

function dismissWarning() {
  if (warningCountdownInterval) {
    clearInterval(warningCountdownInterval);
    warningCountdownInterval = null;
  }
  const modal = $('warningModal');
  if (modal) closeModal(modal);
}

async function checkAndReportSeriousFlag(gapSec) {
  if (_firstFlagReported || !isExamActive()) return;
  // Serious threshold: 3 warnings OR single departure >= 15 seconds
  if (behaviorWarnings >= 3 || gapSec >= 15) {
    _firstFlagReported = true;
    const lastFlag = S.flags[S.flags.length - 1];
    const reason = lastFlag ? lastFlag.label : `Left page for ${gapSec}s`;
    try {
      const userToken = await idToken().catch(() => '');
      api('reportFirstFlag', {
        token: S.token,
        attemptId: S.attemptId || S.token,
        code: S.code,
        reason: reason,
        flagCount: behaviorWarnings,
        idToken: userToken
      }, { tries: 3 }).catch(() => {});
    } catch {}
  }
}

/** The student is back. Close the event, count it, and tell them. */
function cameBack() {
  if (!awayAt || !isExamActive()) {
    awayAt = null;
    return;
  }
  const back = Date.now();
  const gapSec = Math.round((back - awayAt) / 1000);
  closeAway();
  if (!isExamActive()) return;
  behaviorWarnings++;
  showWarning();
  checkAndReportSeriousFlag(gapSec);
}

document.addEventListener('visibilitychange', () => {
  if (!isExamActive()) {
    awayAt = null;
    if (blurCheck) {
      clearTimeout(blurCheck);
      blurCheck = null;
    }
    return;
  }
  if (document.hidden) {
    if (_dirtyKeys.size > 0) flushFirestoreCheckpoint().catch(() => {});
    leftPage();
  } else {
    cameBack();
  }
});

/*
   window blur is a much noisier signal than visibilitychange: on Android
   Chrome it fires when a <select> opens its native picker, and on iOS when
   the keyboard animates in. Both are things a student does WHILE answering.
   So a blur is only believed if the document still does not have focus a
   moment later and the page has not merely handed focus to one of its own
   controls.
*/
addEventListener('blur', () => {
  if (!isExamActive() || awayAt) return;
  clearTimeout(blurCheck);
  blurCheck = setTimeout(() => {
    if (!isExamActive()) return;
    if (document.hidden) return;              // visibilitychange owns this one
    if (document.hasFocus?.()) return;        // never actually left
    const el = document.activeElement;
    if (el && /^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName)) return;   // native picker
    leftPage();
  }, 600);
});

addEventListener('focus', () => {
  clearTimeout(blurCheck);
  if (!isExamActive()) {
    awayAt = null;
    return;
  }
  cameBack();
});

// Right-click is disabled mid-exam, but never over a field the student is
// typing in — cut, paste and the spelling menu all live on that menu.
document.addEventListener('contextmenu', e => {
  if (isExamActive()) {
    const t = e.target;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
    e.preventDefault();
  }
});

/* ---------------- mobile keyboard ----------------
   Nothing is position:fixed, so the keyboard cannot cover a control. This
   only nudges the focused field back into view once the keyboard has
   animated in, which iOS does not do reliably on its own. */

const nudge = el => setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);

document.addEventListener('focusin', e => {
  if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName || '')) setTimeout(() => nudge(e.target), 180);
});

/* ---- app bar navigation ----

   Which tab lights up for which screen, and which screens have no bar at
   all. The bar is hidden wherever leaving the screen would lose something:
   mid-exam, mid-submit, and through the one-time sign-up, where there is no
   roster identity yet and Home would have nothing on it. */

const TAB_SCREENS = {
  exams:   ['scStart', 'scBrief', 'scResume', 'scDone'],
  history: ['scHistory'],
  account: ['scAccount']
};

/** screenId → tab name. */
const SCREEN_TAB = {};
for (const [tab, screens] of Object.entries(TAB_SCREENS)) {
  for (const sc of screens) SCREEN_TAB[sc] = tab;
}

const BAR_HIDDEN_SCREENS = new Set([
  'scLoading', 'scInAppBrowser', 'scSignIn', 'scFatal', // machine and error states
  'scExam', 'scSending',                   // walking away costs the attempt
  'scRegister', 'scPick', 'scNotListed'    // finish signing up first
]);

/** Lights the tab that owns this screen, and hides the bar where it belongs. */
function syncBar(id) {
  const bar = $('appBar');
  if (!bar) return;

  if (BAR_HIDDEN_SCREENS.has(id)) { bar.hidden = true; return; }

  bar.hidden = false;
  const active = SCREEN_TAB[id] || null;
  for (const btn of bar.querySelectorAll('.appbar-tab')) {
    if (btn.dataset.tab === active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  }
}

/**
 * Where a tab goes when it is tapped.
 *
 * Exams returns to the picker. A completed attempt is no longer treated as
 * live, so students always have a route back to the list.
 */
function tabTarget(tab) {
  if (tab !== 'exams') return TAB_SCREENS[tab]?.[0] || 'scStart';
  return 'scStart';
}

/** Reload the dashboard after a submission so the new attempt appears in
    history before the student changes screens. */
function leaveFinishedExam(destination) {
  S.token = '';
  S.finished = false;
  behaviorWarnings = 0;
  S.isReviewer = false;
  S.sections = null;
  S.isReviewMode = false;
  S.currentSecIndex = 0;
  _lastDoneResult = null;
  if ($('singleExamView')) $('singleExamView').hidden = true;
  if ($('wholeExamView')) $('wholeExamView').hidden = true;
  if ($('sectionExamView')) $('sectionExamView').hidden = true;
  if ($('sectionReviewView')) $('sectionReviewView').hidden = true;
  if ($('sectionReviewCardsList')) $('sectionReviewCardsList').replaceChildren();
  if ($('reviewCard')) $('reviewCard').hidden = true;
  if ($('reviewWrap')) $('reviewWrap').replaceChildren();
  if ($('reviewerWatermark')) $('reviewerWatermark').hidden = true;
  if ($('pillReviewer')) $('pillReviewer').hidden = true;
  awayAt = null;
  if (blurCheck) { clearTimeout(blurCheck); blurCheck = null; }
  boot(destination);
}

for (const btn of document.querySelectorAll('.appbar-tab')) {
  btn.addEventListener('click', () => {
    feedback('nav', 8);
    const dest = tabTarget(btn.dataset.tab);
    if (S.finished) { leaveFinishedExam(dest); return; }
    crossFade(() => show(dest));   // same treatment the theme toggle gets
  });
}

/* ---- iOS keyboard detection ----

   When the software keyboard opens, visualViewport shrinks vertically.
   We detect this and set data-keyboard on <html> which the CSS uses to
   slide the app bar off-screen so it can't overlap the focused input. */

if (window.visualViewport) {
  let keyboardTimer = null;
  visualViewport.addEventListener('resize', () => {
    // The keyboard is "open" when viewport height drops more than 25%
    const keyboardOpen = visualViewport.height < window.innerHeight * 0.75;
    if (keyboardOpen) {
      document.documentElement.dataset.keyboard = 'open';
      if (keyboardTimer) clearTimeout(keyboardTimer);
    } else {
      // Small delay avoids a flash when the keyboard is still animating out
      keyboardTimer = setTimeout(() => {
        delete document.documentElement.dataset.keyboard;
      }, 80);
    }
    // Also nudge the focused element into view (pre-existing behaviour,
    // moved here to share the single resize listener)
    const active = document.activeElement;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
      setTimeout(() => active.scrollIntoView({ block: 'center', behavior: 'smooth' }), 60);
    }
  });
}


addEventListener('beforeunload', e => {
  if (!S.token || S.finished) return;
  // Fire-and-forget; the browser will not wait. This is exactly why answers
  // are also checkpointed every 20 seconds.
  try {
    navigator.sendBeacon?.(API_URL, new Blob(
      [JSON.stringify({ action: 'save', token: S.token, answers: S.answers, perQ: S.perQ, idToken: _cachedIdToken })],
      { type: 'text/plain;charset=utf-8' }
    ));
  } catch {}
  e.preventDefault();
  e.returnValue = '';
});

if ($('btnAnswer')) $('btnAnswer').onclick = () => answer();
if ($('btnSkip')) $('btnSkip').onclick = () => skip();
