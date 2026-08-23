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

import { FIREBASE_CONFIG, API_URL, SCHOOL_NAME, HOSTED_DOMAIN } from './config.js';

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

$('btnTheme').onclick = () => {
  const next = activeTheme() === 'dark' ? 'light' : 'dark';
  // A cross-fade rather than a hard flip, where the browser supports it.
  if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(() => setTheme(next));
  } else {
    setTheme(next);
  }
};
labelTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (!document.documentElement.dataset.theme) labelTheme();
});

/* ---------------- screens ---------------- */

const SCREENS = ['scLoading', 'scSignIn', 'scFatal', 'scRegister', 'scPick',
                 'scNotListed', 'scStart', 'scBrief', 'scResume', 'scExam',
                 'scSending', 'scDone'];

function show(id) {
  SCREENS.forEach(s => { $(s).hidden = (s !== id); });
  const inExam = id === 'scExam';
  $('brand').hidden = inExam;
  $('pillProgress').hidden = !inExam;
  $('timerBar').hidden = !inExam;
  if (!inExam) { $('pillSkipped').hidden = true; $('pillTimer').hidden = true; }
  scrollTo(0, 0);
}

function fatal(title, msg) {
  $('fatalTitle').textContent = title;
  $('fatalText').textContent = msg;
  show('scFatal');
}
$('btnReload').onclick = () => location.reload();

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
  wrap.replaceChildren();
  if (!list?.length) { wrap.hidden = true; return; }
  wrap.hidden = false;

  const head = document.createElement('p');
  head.className = 'eyebrow';
  head.textContent = 'Already taken';
  wrap.append(head);

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
    const c = document.createElement('span'); c.className = 'c'; c.textContent = e.code;
    const n = document.createElement('span'); n.className = 'n'; n.textContent = e.title;
    b.append(c, n);

    const bits = [];
    if (e.questions) bits.push(e.questions + ' question' + (e.questions === 1 ? '' : 's'));
    if (e.triesLeft > 1) bits.push(e.triesLeft + ' tries left');
    if (e.closesAt) bits.push('closes ' + e.closesAt);
    if (bits.length) {
      const m = document.createElement('span');
      m.className = 'n';
      m.style.opacity = '.8';
      m.textContent = bits.join('  ·  ');
      b.append(m);
    }
    b.onclick = () => {
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

const current = () => S.queue[S.pos];

function render() {
  const q = current();
  if (!q) { step(); return; }

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
      ? `List ${q.expect} — one per line. Order does not matter.`
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

function answer() {
  const q = current();
  if (!q) return;
  S.answers[q.no] = readAnswer();
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

function done(r) {
  $('doneTitle').textContent = 'Exam submitted';
  const mode = r.revealMode || 'none';

  if (mode === 'none') {
    $('scoreBox').hidden = true;
    $('doneNote').textContent = 'Your answers have been recorded. Your instructor will release results.';
  } else {
    $('scoreBox').hidden = false;
    $('scoreNum').textContent = String(r.score);
    $('scoreDen').textContent = 'out of ' + r.total;
    const bits = [`${r.correctCount} correct`, `${r.mistakeCount} wrong`];
    if (r.blankCount) bits.push(`${r.blankCount} unanswered`);
    $('doneNote').textContent = bits.join('  ·  ');
  }

  const wrap = $('reviewWrap');
  wrap.replaceChildren();
  const revCard = $('reviewCard');
  if (revCard) revCard.hidden = !(r.detail && r.detail.length);
  if (r.detail?.length) {
    const head = document.createElement('p');
    head.className = 'eyebrow';
    head.textContent = mode === 'full' ? 'Every question' : 'What you missed';
    const list = document.createElement('div');
    list.className = 'review';

    for (const d of r.detail) {
      const part = !d.correct && d.credit > 0;
      const box = document.createElement('div');
      box.className = 'rev' + (d.correct ? ' ok' : part ? ' part' : '');

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
    wrap.append(head, list);
  }
  show('scDone');
}

/* ---------------- behaviour logging (recorded, never punished) ---------------- */

const flag = kind => {
  if (S.token && !S.finished) S.flags.push(kind + '@' + new Date().toISOString().slice(11, 19));
};
document.addEventListener('visibilitychange', () => { if (document.hidden) flag('left-page'); });
addEventListener('blur', () => flag('lost-focus'));

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

/* ---------------- leaving the page ---------------- */

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
