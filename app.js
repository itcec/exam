/* ==================================================================
   Proctor v2 — student client.

   Holds no answer key and computes no score. It collects answers and
   posts them once; the server grades.
   ================================================================== */

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut,
  onAuthStateChanged, setPersistence, browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';

import { FIREBASE_CONFIG, API_URL, SCHOOL_NAME, HOSTED_DOMAIN, validateConfig } from './config.js';

/* ---- config guard (runs before Firebase) ---- */
(function () {
  const err = validateConfig();
  if (!err) return;
  // Students see a generic message — no technical hint about what's missing.
  document.getElementById('fatalTitle').textContent = 'The exam site is unavailable';
  document.getElementById('fatalText').textContent =
    'The exam site is missing an important setting. ' +
    'Please ask your teacher about this matter.';
  document.querySelectorAll('section').forEach(s => { s.hidden = true; });
  document.getElementById('scFatal').hidden = false;
  // The specific code only appears in DevTools so a teacher can self-diagnose.
  console.error('[Proctor] config error: ' + err + ' — fill in docs/config.js');
  throw new Error(err);
}());

const $ = id => document.getElementById(id);

/* ---------------- theme ---------------- */

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

$('btnTheme').onclick = () => {
  const next = activeTheme() === 'dark' ? 'light' : 'dark';
  crossFade(() => setTheme(next));
};
labelTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) labelTheme();
});

/* ---------------- sound fx & haptics (Web Audio API) ---------------- */

let _audioCtx = null;
function getAudioCtx() {
  if (!_audioCtx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (AudioCtx) _audioCtx = new AudioCtx();
  }
  if (_audioCtx && _audioCtx.state === 'suspended') _audioCtx.resume();
  return _audioCtx;
}

function playPop() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(460, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.07);
    gain.gain.setValueAtTime(0.14, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.07);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.07);
    hapticPulse(12);
  } catch (e) {}
}

function playChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 chord
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.08);
      gain.gain.setValueAtTime(0.12, ctx.currentTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.08 + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime + idx * 0.08);
      osc.stop(ctx.currentTime + idx * 0.08 + 0.45);
    });
    hapticPulse(40);
  } catch (e) {}
}

function hapticPulse(ms = 12) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch (e) {}
}

/* ---------------- celebratory confetti particle engine ---------------- */

function launchConfetti() {
  const canvas = $('fxCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#14B8A6'];
  const particles = [];
  for (let i = 0; i < 75; i++) {
    particles.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 160,
      y: canvas.height / 2 + 30,
      vx: (Math.random() - 0.5) * 16,
      vy: -Math.random() * 16 - 7,
      size: Math.random() * 8 + 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rSpeed: (Math.random() - 0.5) * 14,
      gravity: 0.45,
      opacity: 1
    });
  }

  let frameId = null;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      p.rotation += p.rSpeed;
      p.opacity -= 0.009;

      if (p.opacity > 0 && p.y < canvas.height + 60) {
        alive = true;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = Math.max(0, p.opacity);
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.65);
        ctx.restore();
      }
    });

    if (alive) {
      frameId = requestAnimationFrame(animate);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      cancelAnimationFrame(frameId);
    }
  }
  animate();
}

/* ---------------- screens ---------------- */

const SCREENS = ['scLoading', 'scSignIn', 'scFatal', 'scRegister', 'scPick',
                 'scNotListed', 'scStart', 'scHistory', 'scAccount',
                 'scBrief', 'scResume', 'scExam', 'scSending', 'scDone'];

function show(id) {
  SCREENS.forEach(s => { $(s).hidden = (s !== id); });
  const inExam = id === 'scExam';
  $('brand').hidden = inExam;
  $('pillProgress').hidden = !inExam;
  $('timerBar').hidden = !inExam;
  if (!inExam) { $('pillSkipped').hidden = true; $('pillTimer').hidden = true; }
  syncBar(id);          // declared below; function declarations hoist
  scrollTo(0, 0);
}

function fatal(title, msg) {
  $('fatalTitle').textContent = title;
  $('fatalText').textContent = msg;
  show('scFatal');
}
$('btnReload').onclick = () => location.reload();

/* ---------------- configuration gate ----------------

   A half-filled config.js is a teacher's mistake, not a student's, so the
   student is told only that the site is not ready and who to ask. The code
   naming the missing value goes to the developer console, where the teacher
   can find it and nobody else will look. */

const configError = validateConfig();
if (configError) {
  fatal('The exam site is unavailable',
    'The exam site is missing an important setting. ' +
    'Please ask your teacher about this matter.');
  throw new Error(configError);   // console only — never shown on screen
}

/* ---------------- api ----------------

   Every call is a "simple" cross-origin POST: no custom headers and a
   text/plain content type. Apps Script does not answer CORS preflight,
   so an Authorization header or application/json would fail outright.
   The ID token therefore rides in the body.                            */

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(action, payload = {}, { tries = 4, onRetry } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, ...payload })
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

/** Firebase refreshes the token automatically; ask for a current one. */
async function idToken() {
  const u = auth.currentUser;
  if (!u) throw new Error('signed-out');
  return u.getIdToken();
}

/* ---------------- auth ---------------- */

$('schoolName').textContent = SCHOOL_NAME || 'Online Exam';

let auth;
try {
  const app = initializeApp(FIREBASE_CONFIG);
  auth = getAuth(app);
  await setPersistence(auth, browserLocalPersistence);
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
  }
};

$('btnSignOut').onclick = () => signOut(auth).then(() => location.reload());

if (auth) {
  onAuthStateChanged(auth, user => {
    if (!user) { show('scSignIn'); return; }
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

/* ---------------- state ---------------- */

const S = {
  email: '',
  code: '', token: '', timerMode: 'per-question', defaultTimer: 45,
  questions: [], answers: {}, perQ: {},
  queue: [], pos: 0, deferred: [], secondPass: false,
  tick: null, globalTick: null, remaining: 0, span: 0, qStarted: 0,
  deadline: null, flags: [], finished: false, picked: ''
};

/* ---------------- boot ---------------- */

async function boot() {
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
  $('whoEmail').textContent = r.email;
  if (r.lastName || r.firstName) {
    $('whoName').textContent = [r.lastName, r.firstName].filter(Boolean).join(', ');
    $('whoName').hidden = false;
    const bits = [r.year, r.course, r.section ? 'Section ' + r.section : '']
      .filter(Boolean).join('  ·  ');
    if (bits) $('whoEmail').textContent = bits + '\n' + r.email;
  }

  // Not on the class list yet — sign them up rather than turning them away.
  if (!r.known) { showRegister(r); return; }

  if (r.blocked) {
    fatal('Your account is blocked',
      'Your instructor has blocked this account from taking exams. Please speak to them.');
    return;
  }

  if (r.active) {
    $('resumeText').textContent =
      `You started ${r.active.code} and answered ${r.active.answered} of ${r.active.total} questions.`;
    $('btnResume').onclick = () => doResume(r.active.token);
    show('scResume');
    return;
  }

  renderExams(r.exams);
  renderHistory(r.history);
  show('scStart');
}

/**
 * Exams already sat, read from the student's Roster row. The server decides
 * whether a score may be shown — it holds one back while the student could
 * still sit the exam again.
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

  $('regLast').value = r.lastName || '';
  $('regFirst').value = r.firstName || '';
  $('regEmail').textContent = 'Signed in as ' + r.email;
  $('regErr').hidden = true;
  show('scRegister');
}

$('btnRegOut').onclick = () => signOut(auth).then(() => location.reload());

$('btnRegister').onclick = async () => {
  const profile = {
    lastName:  $('regLast').value.trim(),
    firstName: $('regFirst').value.trim(),
    year:      $('regYear').value,
    course:    $('regCourse').value,
    section:   $('regSection').value
  };

  const err = $('regErr');
  if (Object.values(profile).some(v => !v)) {
    err.textContent = 'Please fill in every box before continuing.';
    err.hidden = false;
    return;
  }
  err.hidden = true;

  const b = $('btnRegister');
  b.disabled = true; b.textContent = 'Looking…';
  try {
    const res = await api('search', { idToken: await idToken(), profile });
    if (!res.ok) {
      err.textContent = res.message || 'Could not check the class list.';
      err.hidden = false;
      return;
    }
    signUp = profile;
    if (!res.candidates.length) { showNotListed(profile); return; }
    showPick(res.candidates);
  } catch {
    err.textContent = 'Could not reach the server. Check your connection and try again.';
    err.hidden = false;
  } finally {
    b.disabled = false; b.textContent = 'Find my name';
  }
};

/* ---------------- picking your name ---------------- */

function pickErr(msg) {
  const el = $('pickErr');
  el.textContent = msg || '';
  el.hidden = !msg;
}

/**
 * The near-matches, as buttons. Course and section are shown on each one so
 * a student in the wrong section can see it before claiming anything.
 */
function showPick(candidates) {
  const wrap = $('pickList');
  wrap.replaceChildren();
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
    m.textContent = [c.course, c.section ? 'Section ' + c.section : '']
      .filter(Boolean).join('  ·  ');

    b.append(n, m);
    b.onclick = () => claim(c);
    wrap.append(b);
  }
  show('scPick');
}

async function claim(candidate) {
  const buttons = [...$('pickList').children];
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
    $('loadingText').textContent = 'Loading your exams…';
    show('scLoading');
    boot();                       // straight through to the dashboard
  } catch {
    pickErr('Could not reach the server. Check your connection and try again.');
    release();
  }
}

$('btnPickBack').onclick = () => { pickErr(''); show('scRegister'); };

/**
 * Nothing matched. There is no self-add — an unlisted student is the
 * instructor's to add, which is what keeps a stranger with a Google account
 * from putting themselves on the class list.
 */
function showNotListed(profile) {
  $('notListedWhy').textContent =
    `No one close to "${profile.lastName}, ${profile.firstName}" is on the ` +
    `${profile.course} section ${profile.section} list. Check your spelling ` +
    `and your section first — a typo in either one hides your name.`;
  $('notListedName').textContent = `${profile.lastName}, ${profile.firstName}`;
  $('notListedEmail').textContent = S.email || '';
  show('scNotListed');
}

$('btnNotListedBack').onclick = () => show('scRegister');
$('btnNotListedOut').onclick = () => signOut(auth).then(() => location.reload());

function renderExams(exams) {
  const wrap = $('examList');
  wrap.replaceChildren();
  if (!exams?.length) {
    const p = document.createElement('p');
    p.className = 'muted small';
    p.textContent = 'No exams are open right now. If your instructor just opened one, reload this page.';
    wrap.append(p);
    return;
  }
  for (const e of exams) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pick';
    b.setAttribute('aria-pressed', 'false');

    const header = document.createElement('div');
    header.className = 'pick-header';
    const c = document.createElement('span');
    c.className = 'c';
    c.textContent = e.code;
    const badge = document.createElement('span');
    badge.className = 'pick-tag';
    badge.style.color = 'var(--ok)';
    badge.textContent = '● Open';
    header.append(c, badge);

    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = e.title || e.code;

    const meta = document.createElement('div');
    meta.className = 'pick-meta';

    if (e.questions) {
      const qTag = document.createElement('span');
      qTag.className = 'pick-tag';
      qTag.textContent = `${e.questions} question${e.questions === 1 ? '' : 's'}`;
      meta.append(qTag);
    }
    if (e.triesLeft != null) {
      const tTag = document.createElement('span');
      tTag.className = 'pick-tag';
      tTag.textContent = `${e.triesLeft} attempt${e.triesLeft === 1 ? '' : 's'} left`;
      meta.append(tTag);
    }
    if (e.closesAt) {
      const cTag = document.createElement('span');
      cTag.className = 'pick-tag';
      cTag.textContent = `Closes ${e.closesAt}`;
      meta.append(cTag);
    }

    b.append(header, n, meta);
    b.onclick = () => {
      playPop();
      S.picked = e.code;
      $('codeInput').value = '';
      for (const k of wrap.children) k.setAttribute?.('aria-pressed', 'false');
      b.setAttribute('aria-pressed', 'true');
    };
    wrap.append(b);
  }
}

$('codeInput').addEventListener('input', () => {
  S.picked = '';
  for (const k of $('examList').children) k.setAttribute?.('aria-pressed', 'false');
});

/* ---------------- start ---------------- */

function err(msg) {
  const el = $('startErr');
  el.textContent = msg || '';
  el.hidden = !msg;
}

$('btnContinue').onclick = async () => {
  const code = (S.picked || $('codeInput').value || '').trim().toUpperCase();
  if (!code) { err('Choose an exam, or type its code.'); return; }
  err('');

  const b = $('btnContinue');
  b.disabled = true; b.textContent = 'Checking…';
  try {
    const r = await api('start', { idToken: await idToken(), code });
    if (!r.ok) { err(r.message || 'Could not start this exam.'); return; }
    prepare(r); brief(r);
  } catch {
    err('Could not reach the server. Check your connection and try again.');
  } finally {
    b.disabled = false; b.textContent = 'Continue';
  }
};

/* ---------------- brief ---------------- */

function prepare(r) {
  S.code = r.code;
  S.token = r.token;
  S.timerMode = r.timerMode;
  S.defaultTimer = r.defaultTimer;
  S.questions = r.questions || [];
  S.answers = r.answers || {};
  S.deadline = r.msRemaining != null ? Date.now() + r.msRemaining : null;
  S.queue = S.questions.slice();
  S.pos = 0; S.deferred = []; S.secondPass = false; S.finished = false;
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
  fact('Time', S.timerMode === 'whole-exam'
    ? Math.round((r.msRemaining || 0) / 60000) + ' minutes total'
    : 'Each question is timed');
  fact('Attempt', r.attemptNo + (r.maxAttempts > 1 ? ' of ' + r.maxAttempts : ''));
  if (r.student?.lastName || r.student?.firstName) {
    fact('Name', [r.student.lastName, r.student.firstName].filter(Boolean).join(', '));
  }
  if (r.student?.section) fact('Section', r.student.section);

  $('btnBegin').onclick = begin;
  $('btnBriefBack').onclick = () => show('scStart');
  show('scBrief');
}

async function doResume(token) {
  const b = $('btnResume');
  b.disabled = true; b.textContent = 'Loading…';
  try {
    const r = await api('resume', { token });
    if (!r.ok) { fatal('Could not resume', r.message); return; }
    prepare(r);
    S.queue = S.questions.filter(q => S.answers[q.no] == null);
    if (!S.queue.length) { finish(); return; }
    begin();
  } catch {
    fatal('Could not resume', 'Check your connection and reload.');
  } finally {
    b.disabled = false; b.textContent = 'Continue where I left off';
  }
}

/* ---------------- exam ---------------- */

function begin() {
  show('scExam');
  if (S.timerMode === 'whole-exam') startGlobal();
  render();
  autosave();
}

function renderStepperDots() {
  const host = $('stepperDots');
  if (!host || !S.questions || !S.questions.length) return;
  host.replaceChildren();

  const cur = current();
  S.questions.forEach((q, idx) => {
    const dot = document.createElement('span');
    dot.className = 'stepper-dot';
    dot.title = `Question ${idx + 1}`;
    if (cur && q.no === cur.no) dot.classList.add('active');
    else if (S.answers[q.no] != null) dot.classList.add('done');
    else if (S.deferred.some(d => d.no === q.no)) dot.classList.add('skipped');
    host.append(dot);
  });
}

function render() {
  const q = current();
  if (!q) { step(); return; }

  renderStepperDots();

  const done = Object.keys(S.answers).length;
  $('pillProgress').textContent = `Question ${Math.min(done + 1, S.questions.length)} of ${S.questions.length}`;

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

    opts.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.dataset.value = q.type === 'TF' ? t : letters[i];

      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = q.type === 'TF' ? t.charAt(0) : letters[i];

      const tx = document.createElement('span');
      tx.className = 't';
      tx.textContent = t;                       // the option text is VISIBLE

      // A tick as well as colour, so selection is not carried by hue alone.
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
        playPop();
        for (const c of box.children) c.setAttribute('aria-checked', 'false');
        b.setAttribute('aria-checked', 'true');
      };
      box.append(b);
    });
    host.append(box);

  } else if (q.type === 'EN') {
    // One item per line. The count is shown so nobody has to guess how many
    // the question wants.
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
    host.append(hint, ta);

  } else if (q.type === 'MA') {
    // Each left item gets a dropdown of every option. A plain select is the
    // right control on a phone — it opens the native picker.
    const box = document.createElement('div');
    box.className = 'opts';

    q.choices.forEach((left, i) => {
      const row = document.createElement('div');
      row.className = 'pair';

      const lab = document.createElement('span');
      lab.className = 'pair-l';
      lab.textContent = left;

      const sel = document.createElement('select');
      sel.className = 'field pair-s';
      sel.dataset.left = left;
      sel.id = 'match_' + i;

      const none = document.createElement('option');
      none.value = '';
      none.textContent = 'Choose…';
      sel.append(none);

      (q.options || []).forEach(opt => {
        const o = document.createElement('option');
        o.value = opt;
        o.textContent = opt;
        sel.append(o);
      });

      row.append(lab, sel);
      box.append(row);
    });
    host.append(box);

  } else if (q.type === 'WB') {
    // The pool as tappable chips, plus a field — tapping fills it in, but
    // typing still works for anyone who prefers the keyboard.
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.id = 'ansField';
    inp.type = 'text';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.placeholder = 'Tap a word below, or type it';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); answer(); }
    });

    const bank = document.createElement('div');
    bank.className = 'bank';
    q.choices.forEach(word => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.textContent = word;
      chip.onclick = () => {
        inp.value = word;
        for (const c of bank.children) c.classList.remove('on');
        chip.classList.add('on');
      };
      bank.append(chip);
    });
    host.append(inp, bank);

  } else {
    const inp = document.createElement('input');
    inp.className = 'field';
    inp.id = 'ansField';
    inp.type = 'text';
    inp.autocomplete = 'off';
    inp.spellcheck = false;
    inp.placeholder = 'Type your answer';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); answer(); }
    });
    host.append(inp);
    // Not autofocused: on mobile that throws the keyboard up before the
    // student has read the question.
  }

  $('btnSkip').hidden = S.secondPass;

  const card = $('qCard');
  card.classList.remove('swap');
  void card.offsetWidth;
  card.classList.add('swap');

  if (S.timerMode === 'per-question') startQuestion(q);
  S.qStarted = Date.now();
}

function readAnswer() {
  const q = current();

  // Matching submits an object keyed by the left-hand item, which is what
  // the server grades against.
  if (q && q.type === 'MA') {
    const picks = {};
    $('qInput').querySelectorAll('select[data-left]').forEach(s => {
      if (s.value) picks[s.dataset.left] = s.value;
    });
    return Object.keys(picks).length ? picks : '';
  }

  const sel = $('qInput').querySelector('.opt[aria-checked="true"]');
  if (sel) return sel.dataset.value;

  const f = $('ansField');
  return f ? f.value.trim() : '';
}

let _unansweredConfirmed = false;

function answer() {
  const q = current();
  if (!q) return;
  const val = readAnswer();
  const isBlank = (val === '' || val == null || (typeof val === 'object' && Object.keys(val).length === 0));

  if (isBlank && !_unansweredConfirmed) {
    // Show unanswered alert modal
    $('blankConfirmModal').hidden = false;
    $('btnStayAndAnswer').onclick = () => {
      $('blankConfirmModal').hidden = true;
    };
    $('btnSkipAnyway').onclick = () => {
      $('blankConfirmModal').hidden = true;
      _unansweredConfirmed = true;
      answer();
    };
    return;
  }

  _unansweredConfirmed = false;
  S.answers[q.no] = val;
  S.perQ[q.no] = Math.round((Date.now() - S.qStarted) / 1000);
  S.pos++;
  step();
}
$('btnAnswer').onclick = answer;

$('btnSkip').onclick = () => {
  const q = current();
  if (!q || S.secondPass) return;
  S.deferred.push(q);
  S.pos++;
  step();
};

function step() {
  stopQuestion();
  if (S.pos < S.queue.length) { render(); return; }
  if (S.deferred.length) {
    S.queue = S.deferred.slice();
    S.deferred = [];
    S.pos = 0;
    S.secondPass = true;
    render();
    return;
  }
  finish();
}

/* ---------------- timers ---------------- */

function startQuestion(q) {
  stopQuestion();
  S.remaining = q.seconds || S.defaultTimer;
  S.span = S.remaining;
  $('pillTimer').hidden = false;
  $('timerBar').hidden = false;
  paint(S.remaining);
  S.tick = setInterval(() => {
    S.remaining--;
    paint(S.remaining);
    if (S.remaining <= 0) { stopQuestion(); answer(); }
  }, 1000);
}

function stopQuestion() {
  if (S.tick) { clearInterval(S.tick); S.tick = null; }
}

function startGlobal() {
  $('pillTimer').hidden = false;
  $('timerBar').hidden = false;
  S.span = Math.max(1, Math.round((S.deadline - Date.now()) / 1000));
  paint(S.span);
  S.globalTick = setInterval(() => {
    if (S.finished || !S.deadline) return;
    const left = Math.max(0, Math.round((S.deadline - Date.now()) / 1000));
    paint(left);
    if (left <= 0) { clearInterval(S.globalTick); S.globalTick = null; S.finished = true; finish(); }
  }, 1000);
}

function paint(sec) {
  sec = Math.max(0, sec);
  const m = Math.floor(sec / 60), s = sec % 60;
  $('pillTimer').textContent = `${m}:${String(s).padStart(2, '0')}`;

  // Proportional, so a 45-second question and a 30-minute paper warn at the
  // same point in their own run. The last ten seconds is urgent at any length.
  const frac = Math.max(0, Math.min(1, sec / (S.span || sec || 1)));
  const low = sec <= 10 || frac <= 0.10;
  const mid = !low && frac <= 0.30;

  $('pillTimer').classList.toggle('low', low);
  $('pillTimer').classList.toggle('mid', mid);
  $('timerBar').classList.toggle('low', low);
  $('timerBar').classList.toggle('mid', mid);
  $('timerFill').style.transform = `scaleX(${frac.toFixed(4)})`;

  // Tactile low-time pulse aura around the question card
  const card = $('qCard');
  if (card) {
    if (sec <= 10 && sec > 0) card.classList.add('urgent-time');
    else card.classList.remove('urgent-time');
  }
}

/* ---------------- autosave ---------------- */

let saveTimer = null;
function autosave() {
  saveTimer ??= setInterval(() => {
    if (S.finished || !S.token) return;
    api('save', { token: S.token, answers: S.answers, perQ: S.perQ }, { tries: 1 })
      .catch(() => { /* best effort — the next tick will retry */ });
  }, 20000);
}

/* ---------------- submit ---------------- */

function finish() {
  // A timer can run out while the student is on another tab. Close that
  // event now, or the last focus loss is submitted with no end time.
  closeAway();
  stopQuestion();
  if (saveTimer) { clearInterval(saveTimer); saveTimer = null; }
  if (S.globalTick) { clearInterval(S.globalTick); S.globalTick = null; }
  S.finished = true;
  show('scSending');
  send();
}

async function send() {
  $('sendText').textContent = 'Submitting your answers…';
  $('sendSub').textContent = 'Keep this page open.';
  $('btnRetry').hidden = true;

  try {
    const r = await api('submit',
      { token: S.token, answers: S.answers, flags: S.flags },
      { tries: 6, onRetry: (n, of) => { $('sendText').textContent = `Connection is slow — retrying (${n} of ${of})…`; } });

    if (!r.ok) {
      $('sendText').textContent = r.message || 'The server could not record your answers.';
      $('sendSub').textContent = 'Show this screen to your instructor.';
      $('btnRetry').hidden = false;
      return;
    }
    done(r);
  } catch {
    $('sendText').textContent = 'We could not reach the server.';
    $('sendSub').textContent = 'Your answers are still here. Reconnect and tap Try again.';
    $('btnRetry').hidden = false;
  }
}
$('btnRetry').onclick = send;

let _lastDoneResult = null;
let _activeFilter = 'all';

function done(r) {
  _lastDoneResult = r;
  $('doneTitle').textContent = 'Exam submitted';
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

    let currentPct = 0;
    const countTimer = setInterval(() => {
      currentPct += Math.ceil((pct - currentPct) / 6);
      if (currentPct >= pct) {
        currentPct = pct;
        clearInterval(countTimer);
      }
      if (pctNum) pctNum.textContent = `${currentPct}%`;
    }, 25);

    if (fracNum) fracNum.textContent = `${r.score} / ${r.total}`;

    const bits = [`${r.correctCount} correct`, `${r.mistakeCount} wrong`];
    if (r.blankCount) bits.push(`${r.blankCount} unanswered`);
    $('doneNote').textContent = bits.join('  ·  ');

    // Launch celebratory confetti and chord chime!
    setTimeout(() => {
      launchConfetti();
      playChime();
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
  show('scDone');
}

function renderReviewList(filter) {
  _activeFilter = filter;
  document.querySelectorAll('#reviewFilterTabs .filter-tab').forEach(btn => {
    const active = btn.dataset.filter === filter;
    btn.classList.toggle('on', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
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
    const empty = document.createElement('p');
    empty.className = 'muted small';
    empty.style.padding = '12px 0';
    empty.textContent = `No ${filter} questions in this review.`;
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

document.querySelectorAll('#reviewFilterTabs .filter-tab').forEach(btn => {
  btn.onclick = () => renderReviewList(btn.dataset.filter);
});

/* ---------------- strict behaviour monitoring & warning modal ----------------

   Strict tab-switch policy ported from v1:
   - Warning 1 & 2: Shows behavior warning modal with 20s auto-resume countdown.
   - Warning 3: Submits the exam automatically and ends the session.
   - Every event records exact timestamp evidence for teacher review. */

let awayAt = null;
let behaviorWarnings = 0;
let warningCountdownRemaining = 20;
let warningCountdownInterval = null;
let violationLock = false;

/** Format a timestamp as a short local time string, e.g. "10:14:32 AM" */
function fmtTime(ms) {
  return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function leftPage() {
  if (awayAt || !S.token || S.finished) return;
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
  S.flags.push({
    type: 'focus-loss',
    leftAt:      new Date(awayAt).toISOString(),
    returnedAt:  new Date(back).toISOString(),
    gapSeconds:  gapSec,
    label: 'Left ' + fmtTime(awayAt) + ' · Returned ' + fmtTime(back) + ' · Away ' + gapLabel
  });
  awayAt = null;
}

function handleViolation(msg) {
  if (!S.token || S.finished || violationLock) return;
  violationLock = true;
  leftPage();

  behaviorWarnings++;

  const wModal = $('warningModal');
  const wText = $('warningModalText');
  const wCountdown = $('warningModalCountdown');

  if (behaviorWarnings <= 2) {
    warningCountdownRemaining = 20;
    if (wText) {
      wText.textContent = msg || `Behavior warning ${behaviorWarnings}/2: You switched away or minimized the exam tab. Further violations will automatically submit your exam.`;
    }
    if (wCountdown) wCountdown.textContent = `Auto-resuming in ${warningCountdownRemaining}s…`;
    if (wModal) wModal.hidden = false;

    if (warningCountdownInterval) clearInterval(warningCountdownInterval);
    warningCountdownInterval = setInterval(() => {
      warningCountdownRemaining--;
      if (wCountdown) wCountdown.textContent = `Auto-resuming in ${warningCountdownRemaining}s…`;
      if (warningCountdownRemaining <= 0) {
        clearInterval(warningCountdownInterval);
        warningCountdownInterval = null;
        if (wModal) wModal.hidden = true;
        closeAway();
        violationLock = false;
      }
    }, 1000);

    $('btnResumeExam').onclick = () => {
      if (warningCountdownInterval) { clearInterval(warningCountdownInterval); warningCountdownInterval = null; }
      if (wModal) wModal.hidden = true;
      closeAway();
      violationLock = false;
    };
  } else {
    // 3rd violation -> auto submit
    if (wText) wText.textContent = 'Third violation detected: You have repeatedly switched away from the exam. Your exam is now being submitted.';
    if (wCountdown) wCountdown.textContent = 'Submitting…';
    if (wModal) wModal.hidden = false;
    setTimeout(() => {
      if (wModal) wModal.hidden = true;
      closeAway();
      violationLock = false;
      finish();
    }, 2200);
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) handleViolation();
  else closeAway();
});
addEventListener('blur', () => {
  if (document.hasFocus && !document.hasFocus()) handleViolation();
});
addEventListener('focus', closeAway);

// Disable right click context menu during active exam
document.addEventListener('contextmenu', e => {
  if (S.token && !S.finished) {
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

visualViewport?.addEventListener('resize', () => {
  const el = document.activeElement;
  if (el?.tagName === 'INPUT') nudge(el);
});
document.addEventListener('focusin', e => {
  if (e.target?.tagName === 'INPUT') setTimeout(() => nudge(e.target), 180);
});

/* ---- app bar navigation ----

   Which tab lights up for which screen, and which screens have no bar at
   all. The bar is hidden wherever leaving the screen would lose something:
   mid-exam, mid-submit, and through the one-time sign-up, where there is no
   roster identity yet and Home would have nothing on it. */

const TAB_SCREENS = {
  home:    ['scStart'],
  exams:   ['scBrief', 'scResume', 'scDone'],
  history: ['scHistory'],
  account: ['scAccount']
};

/** screenId → tab name. */
const SCREEN_TAB = {};
for (const [tab, screens] of Object.entries(TAB_SCREENS)) {
  for (const sc of screens) SCREEN_TAB[sc] = tab;
}

const BAR_HIDDEN_SCREENS = new Set([
  'scLoading', 'scSignIn', 'scFatal',      // machine and error states
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
    btn.setAttribute('aria-selected', btn.dataset.tab === active ? 'true' : 'false');
  }
}

/**
 * Where a tab goes when it is tapped.
 *
 * Exams has no home of its own — it is a flow, not a place. Tapping it
 * returns to the last exam screen if one is still live, and otherwise falls
 * back to the picker rather than showing an empty shell.
 */
function tabTarget(tab) {
  if (tab !== 'exams') return TAB_SCREENS[tab]?.[0] || 'scStart';
  if (S.finished && S.token) return 'scDone';
  return 'scStart';
}

for (const btn of document.querySelectorAll('.appbar-tab')) {
  btn.addEventListener('click', () => {
    const dest = tabTarget(btn.dataset.tab);
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
      [JSON.stringify({ action: 'save', token: S.token, answers: S.answers, perQ: S.perQ })],
      { type: 'text/plain;charset=utf-8' }
    ));
  } catch {}
  e.preventDefault();
  e.returnValue = '';
});
