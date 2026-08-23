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
import {
  initFx, play, haptic, feedback, announce, confetti, revealIn,
  openModal, closeModal, mountSoundToggle, reducedMotion
} from './fx.js';

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

/* ---------------- interaction layer ----------------

   Sound, haptics, the cursor, the mote field and the ripple all come from
   fx.js, which the teacher portal loads too. The speaker button sits next
   to the theme button and is off until a student asks for it. */

initFx();
mountSoundToggle($('btnTheme'));

/* ---------------- screens ---------------- */

const SCREENS = ['scLoading', 'scSignIn', 'scFatal', 'scRegister', 'scPick',
                 'scNotListed', 'scStart', 'scHistory', 'scAccount',
                 'scBrief', 'scResume', 'scExam', 'scSending', 'scDone'];

/** What a screen is called, for the live region. */
const SCREEN_NAME = {
  scSignIn: 'Sign in', scStart: 'Choose your exam', scHistory: 'Exams you have taken',
  scAccount: 'Account', scRegister: 'Find your name', scPick: 'Which one is you',
  scNotListed: 'We could not find you', scBrief: 'Exam details', scResume: 'Exam in progress',
  scExam: 'Exam', scSending: 'Submitting', scDone: 'Exam submitted', scFatal: 'Something went wrong'
};

function show(id) {
  const changed = !$(id) || $(id).hidden;
  SCREENS.forEach(s => { $(s).hidden = (s !== id); });
  const inExam = id === 'scExam';
  $('brand').hidden = inExam;
  $('pillProgress').hidden = !inExam;
  $('timerBar').hidden = !inExam;
  if (!inExam) { $('pillSkipped').hidden = true; $('pillTimer').hidden = true; }
  syncBar(id);          // declared below; function declarations hoist
  scrollTo(0, 0);

  if (!changed) return;
  // Toggling [hidden] moves nobody's focus and says nothing, so a screen
  // reader user would otherwise have no idea the page had changed at all.
  if (SCREEN_NAME[id]) announce(SCREEN_NAME[id]);
  if (id !== 'scExam') revealIn($(id));
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
    announce($('signInErr').textContent, true);
    play('error');
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

function pickErr(msg) { flagError($('pickErr'), msg); }

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
      feedback('select', 10);
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

/**
 * The dot tracker. Sighted students read it at a glance; everyone else gets
 * the same fact as one sentence, because forty <span>s with title attributes
 * are forty pieces of noise and no summary.
 */
/**
 * The question on screen right now.
 *
 * The exam walks S.queue with S.pos. Skipping pushes the question onto
 * S.deferred and steps past it; when the queue runs out, step() swaps the
 * deferred list in as a second pass and resets pos. So "where am I" is
 * always this one lookup, and running off the end returns undefined, which
 * is render()'s signal to hand back to step().
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
    else if (S.answers[q.no] != null) { dot.classList.add('done'); done++; }
    else if (S.deferred.some(d => d.no === q.no)) { dot.classList.add('skipped'); skipped++; }
    host.append(dot);
  });

  host.setAttribute('role', 'img');
  host.setAttribute('aria-label',
    `${done} of ${S.questions.length} answered` + (skipped ? `, ${skipped} skipped` : ''));
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
    // A radiogroup with no name is announced as "group" and nothing else.
    box.setAttribute('aria-label', 'Answer choices');

    opts.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      // Roving tabindex: Tab reaches the group once, then the arrows move
      // within it. Tabbing through every option of a 6-choice question is
      // what the radio pattern exists to avoid.
      b.tabIndex = i === 0 ? 0 : -1;
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
      // Arrowing selects as it moves — that is what a radio group does.
      choose(list[to]);
      list[to].focus();
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
      chip.setAttribute('aria-pressed', 'false');
      chip.onclick = () => {
        inp.value = word;
        for (const c of bank.children) {
          c.classList.remove('on');
          c.setAttribute('aria-pressed', 'false');
        }
        chip.classList.add('on');
        chip.setAttribute('aria-pressed', 'true');
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

  // Said out loud on every advance: without it a screen reader user gets a
  // silently rewritten card and no idea the question moved on.
  announce(`${S.secondPass ? 'Skipped question. ' : ''}` +
           `Question ${Math.min(done + 1, S.questions.length)} of ${S.questions.length}. ` +
           `${TYPE_NAME[q.type] || ''}. ${q.question}`);

  const card = $('qCard');
  card.classList.remove('swap');
  void card.offsetWidth;
  card.classList.add('swap');

  if (S.timerMode === 'per-question') startQuestion(q);
  S.qStarted = Date.now();
}

/** Marks one option as the answer and moves the tab stop onto it. */
function choose(btn) {
  const box = btn.parentElement;
  for (const c of box.children) {
    const on = c === btn;
    c.setAttribute('aria-checked', on ? 'true' : 'false');
    c.tabIndex = on ? 0 : -1;
  }
  feedback('select', 10);
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

/**
 * @param {boolean} force  Skip the "you haven't answered" prompt and record
 *   the blank as-is. Set when the decision is no longer the student's: the
 *   question timer ran out, or the whole-exam clock did. Asking someone to
 *   go back and answer a question whose time has already gone is a trap.
 */
function answer(force) {
  const q = current();
  if (!q) return;
  const val = readAnswer();
  const isBlank = (val === '' || val == null || (typeof val === 'object' && Object.keys(val).length === 0));

  if (isBlank && !force && !_unansweredConfirmed) {
    const m = $('blankConfirmModal');
    const back = () => { closeModal(m); };
    $('btnStayAndAnswer').onclick = back;
    $('btnSkipAnyway').onclick = () => {
      closeModal(m);
      _unansweredConfirmed = true;
      answer();
    };
    // Escape means "go back and answer" — the cautious reading of a
    // dismissal, never the one that throws the answer away.
    openModal(m, $('btnStayAndAnswer'), { onDismiss: back });
    play('error');
    return;
  }

  _unansweredConfirmed = false;
  if (!isBlank) feedback('pop', 12);
  S.answers[q.no] = val;
  S.perQ[q.no] = Math.round((Date.now() - S.qStarted) / 1000);
  S.pos++;
  step();
}
$('btnAnswer').onclick = () => answer();

$('btnSkip').onclick = () => {
  const q = current();
  if (!q || S.secondPass) return;
  feedback('back', 12);
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
  _lastPainted = -1;
  S.remaining = q.seconds || S.defaultTimer;
  S.span = S.remaining;
  $('pillTimer').hidden = false;
  $('timerBar').hidden = false;
  paint(S.remaining);
  S.tick = setInterval(() => {
    S.remaining--;
    paint(S.remaining);
    if (S.remaining <= 0) { stopQuestion(); play('timeup'); answer(true); }
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

/** The last whole second paint() drew, so a cue fires once and not per tick. */
let _lastPainted = -1;

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

  // A cue at ten seconds and again at five. Once each — paint() runs every
  // second and a tick per second would be unbearable.
  if (sec !== _lastPainted) {
    if (sec === 10 || sec === 5) { play('tap'); haptic(18); }
    if (sec === 10) announce('Ten seconds left', true);
    _lastPainted = sec;
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
  show('scDone');
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

const STRICT_AUTO_SUBMIT = false;
const WARN_LIMIT = 3;            // warnings shown before the strict cutoff

let awayAt = null;
let behaviorWarnings = 0;
let warningCountdownInterval = null;
let blurCheck = null;

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

/**
 * The warning is shown on the way BACK, never on the way out.
 *
 * A modal raised while the tab is hidden counts down in a window nobody is
 * looking at, so the student returns to a dismissed dialog and never learns
 * they were flagged. Worse, background tabs throttle timers, so the count
 * is wrong as well as unseen.
 */
function showWarning() {
  const wModal = $('warningModal');
  const wText  = $('warningModalText');
  const wCount = $('warningModalCountdown');
  if (!wModal) return;

  const strictEnd = STRICT_AUTO_SUBMIT && behaviorWarnings >= WARN_LIMIT;

  if (strictEnd) {
    wText.textContent =
      'You have left this page ' + behaviorWarnings + ' times. Your exam is being submitted now.';
    wCount.textContent = 'Submitting…';
    openModal(wModal, null, { dismissible: false });
    play('alert');
    setTimeout(() => { closeModal(wModal); finish(); }, 2200);
    return;
  }

  wText.textContent = STRICT_AUTO_SUBMIT
    ? 'Warning ' + behaviorWarnings + ' of ' + WARN_LIMIT + ': you left the exam page. ' +
      'Your instructor can see when, and for how long. Leaving ' + WARN_LIMIT + ' times submits your exam.'
    : 'Warning ' + behaviorWarnings + ': you left the exam page. Your instructor can see ' +
      'when you left and for how long. Your exam has not been ended — carry on and finish it.';

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
  clearInterval(warningCountdownInterval);
  warningCountdownInterval = null;
  closeModal($('warningModal'));
}

/** The student is back. Close the event, count it, and tell them. */
function cameBack() {
  if (!awayAt) return;
  closeAway();
  if (!S.token || S.finished) return;
  behaviorWarnings++;
  showWarning();
}

document.addEventListener('visibilitychange', () => {
  if (!S.token || S.finished) return;
  if (document.hidden) leftPage();
  else cameBack();
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
  if (!S.token || S.finished || awayAt) return;
  clearTimeout(blurCheck);
  blurCheck = setTimeout(() => {
    if (document.hidden) return;              // visibilitychange owns this one
    if (document.hasFocus?.()) return;        // never actually left
    const el = document.activeElement;
    if (el && /^(SELECT|INPUT|TEXTAREA)$/.test(el.tagName)) return;   // native picker
    leftPage();
  }, 600);
});

addEventListener('focus', () => {
  clearTimeout(blurCheck);
  cameBack();
});

// Right-click is disabled mid-exam, but never over a field the student is
// typing in — cut, paste and the spelling menu all live on that menu.
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
    if (btn.dataset.tab === active) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
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
  // Exams is a flow, not a place: go back to the finished-exam screen if one
  // is still live, otherwise to the picker.
  if (S.finished && S.token) return 'scDone';
  return 'scStart';
}

for (const btn of document.querySelectorAll('.appbar-tab')) {
  btn.addEventListener('click', () => {
    feedback('nav', 8);
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
