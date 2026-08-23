/* ==================================================================
   fx.js — the shared interaction layer for both portals.

   Sound, haptics, pointer, motion, modals and announcements live here
   so the student site and the teacher site behave identically. A
   student who learns what the confirm chime means on one page should
   not meet a different vocabulary on the other.

   Three rules run through the whole file:

   1. Every effect is decoration. Nothing here is load-bearing — if the
      AudioContext is blocked, the canvas is missing or the observer is
      unsupported, the app still works exactly as it did.

   2. The user's stated preferences outrank the design.
      prefers-reduced-motion turns the motion off, not down. Sound is
      off until it is asked for and stays off once refused.

   3. Cheap phones are the target device. Continuous effects are
      confined to fine pointers, which keeps the particle field and the
      cursor off the exact hardware the CSS already dials blur back for.
   ================================================================== */

/* ---------------- user preferences ---------------- */

const mqMotion = matchMedia('(prefers-reduced-motion: reduce)');
const mqCoarse = matchMedia('(pointer: coarse)');
const mqNarrow = matchMedia('(width < 480px)');

export const reducedMotion = () => mqMotion.matches;

/** Continuous background work is for machines that can spare it. */
const ambientAllowed = () => !reducedMotion() && !(mqCoarse.matches && mqNarrow.matches);

const SOUND_KEY = 'exam_sound_v1';

/* Off unless the user has turned it on. An exam site that makes noise at
   a student who never asked for it is a site they will mute at the OS
   level, losing the timer cues too. */
let soundOn = false;
try { soundOn = localStorage.getItem(SOUND_KEY) === 'on'; } catch {}

export const soundEnabled = () => soundOn;

export function setSound(on) {
  soundOn = !!on;
  try { localStorage.setItem(SOUND_KEY, soundOn ? 'on' : 'off'); } catch {}
  document.documentElement.dataset.sound = soundOn ? 'on' : 'off';
  for (const b of document.querySelectorAll('[data-sound-toggle]')) paintSoundBtn(b);
  if (soundOn) { unlockAudio(); play('pop'); }
  return soundOn;
}

/* ---------------- audio ----------------

   Tones are synthesised rather than loaded. Six sound files would be six
   more requests on school wifi for a few hundred milliseconds of audio,
   and they would need hosting, caching and a licence. */

let ctx = null, master = null;

function audio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.5;
    // Several voices overlap on the finish chime; without this they clip.
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);
  } catch { ctx = null; }
  return ctx;
}

/** Browsers only allow an AudioContext to start inside a real gesture. */
function unlockAudio() {
  const c = audio();
  if (c && c.state === 'suspended') c.resume().catch(() => {});
}
for (const evt of ['pointerdown', 'keydown', 'touchstart']) {
  addEventListener(evt, unlockAudio, { once: true, passive: true });
}

/**
 * One voice.
 * @param {{freq:number,to?:number,type?:string,at?:number,dur:number,vol:number}} v
 */
function voice(v) {
  const c = audio();
  if (!c || !master) return;
  const t0 = c.currentTime + (v.at || 0);
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = v.type || 'sine';
  osc.frequency.setValueAtTime(v.freq, t0);
  if (v.to) osc.frequency.exponentialRampToValueAtTime(v.to, t0 + v.dur);
  // A hard start is an audible click; ramp in over a couple of milliseconds.
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(v.vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + v.dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + v.dur + 0.02);
}

/* The vocabulary. Rising means yes or forward, falling means no or back. */
const SOUNDS = {
  tap:    [{ freq: 420, to: 560, type: 'sine', dur: 0.05, vol: 0.05 }],
  pop:    [{ freq: 460, to: 780, type: 'sine', dur: 0.07, vol: 0.10 }],
  nav:    [{ freq: 300, to: 520, type: 'triangle', dur: 0.10, vol: 0.07 }],
  back:   [{ freq: 520, to: 300, type: 'triangle', dur: 0.10, vol: 0.07 }],
  select: [{ freq: 620, to: 880, type: 'sine', dur: 0.07, vol: 0.09 }],
  error:  [{ freq: 260, to: 170, type: 'sawtooth', dur: 0.20, vol: 0.07 },
           { freq: 200, to: 130, type: 'sine', dur: 0.22, vol: 0.05, at: 0.06 }],
  alert:  [{ freq: 700, type: 'square', dur: 0.10, vol: 0.05 },
           { freq: 700, type: 'square', dur: 0.10, vol: 0.05, at: 0.18 }],
  timeup: [{ freq: 880, to: 440, type: 'triangle', dur: 0.32, vol: 0.10 }],
  submit: [{ freq: 392, to: 523, type: 'sine', dur: 0.18, vol: 0.09 }],
  // C5, E5, G5, C6 — an unambiguous "finished".
  chime:  [{ freq: 523.25, type: 'triangle', dur: 0.45, vol: 0.09 },
           { freq: 659.25, type: 'triangle', dur: 0.45, vol: 0.09, at: 0.08 },
           { freq: 783.99, type: 'triangle', dur: 0.45, vol: 0.09, at: 0.16 },
           { freq: 1046.50, type: 'triangle', dur: 0.55, vol: 0.09, at: 0.24 }]
};

export function play(name) {
  if (!soundOn) return;
  const spec = SOUNDS[name];
  if (!spec) return;
  try { unlockAudio(); spec.forEach(voice); } catch {}
}

/* Haptics are a separate channel: they work with the phone on silent, so
   they follow the motion preference rather than the sound switch. */
export function haptic(ms = 10) {
  if (reducedMotion()) return;
  try { navigator.vibrate?.(ms); } catch {}
}

/** The usual pairing — a sound and a matching tap. */
export function feedback(name, ms = 10) { play(name); haptic(ms); }

/* ---------------- the sound switch ---------------- */

function paintSoundBtn(btn) {
  btn.setAttribute('aria-pressed', soundOn ? 'true' : 'false');
  btn.setAttribute('aria-label', soundOn ? 'Turn sound off' : 'Turn sound on');
  btn.title = soundOn ? 'Sound on' : 'Sound off';
}

const SOUND_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M11 5 6.5 9H3v6h3.5L11 19z"/>' +
  '<path class="fx-wave-1" d="M15.5 8.5a5 5 0 0 1 0 7"/>' +
  '<path class="fx-wave-2" d="M18.5 5.5a9 9 0 0 1 0 13"/>' +
  '<path class="fx-mute" d="m16.5 9.5 5 5m0-5-5 5"/></svg>';

/**
 * Puts the speaker button into a toolbar, immediately before `before`.
 * Returns the button, or null if there was nowhere to put it.
 */
export function mountSoundToggle(before) {
  if (!before || !before.parentNode) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = before.className || 'icon-btn';
  btn.dataset.soundToggle = '';
  btn.innerHTML = SOUND_SVG;
  paintSoundBtn(btn);
  btn.addEventListener('click', () => {
    const on = setSound(!soundOn);
    announce(on ? 'Sound on' : 'Sound off');
  });
  before.parentNode.insertBefore(btn, before);
  return btn;
}

/* ---------------- announcements ----------------

   One polite live region per page. Screens change here by toggling
   [hidden] on sections, which a screen reader does not narrate, so
   arriving somewhere new has to be said out loud. */

let liveEl = null;

export function announce(msg, assertive) {
  if (!msg) return;
  if (!liveEl) {
    liveEl = document.createElement('div');
    liveEl.className = 'sr-only';
    liveEl.setAttribute('aria-atomic', 'true');
    document.body.append(liveEl);
  }
  liveEl.setAttribute('aria-live', assertive ? 'assertive' : 'polite');
  // The same string twice running is not re-read unless the node is cleared.
  liveEl.textContent = '';
  setTimeout(() => { liveEl.textContent = msg; }, 40);
}

/* ---------------- toast ----------------

   Replaces window.alert, which blocks the whole thread, cannot be styled,
   cannot be read by a screen reader as anything but a system prompt, and
   on a phone lands as a browser chrome dialog naming the origin. */

let toastHost = null;

/**
 * @param {string} msg
 * @param {'info'|'ok'|'bad'} [kind]
 * @param {number} [ms]  0 keeps it until it is tapped
 */
export function toast(msg, kind = 'info', ms = 4200) {
  if (!msg) return;
  if (!toastHost) {
    toastHost = document.createElement('div');
    toastHost.className = 'fx-toasts';
    // Status, not alert: these report what happened, they do not interrupt.
    toastHost.setAttribute('role', 'status');
    toastHost.setAttribute('aria-live', 'polite');
    document.body.append(toastHost);
  }

  const el = document.createElement('div');
  el.className = 'fx-toast ' + kind;
  el.tabIndex = 0;

  const text = document.createElement('span');
  text.textContent = msg;

  const x = document.createElement('button');
  x.type = 'button';
  x.className = 'fx-toast-x';
  x.setAttribute('aria-label', 'Dismiss');
  x.textContent = '✕';

  const go = () => {
    el.classList.add('out');
    el.addEventListener('animationend', () => el.remove(), { once: true });
  };
  x.onclick = go;
  el.addEventListener('keydown', e => { if (e.key === 'Escape') go(); });

  el.append(text, x);
  toastHost.append(el);
  play(kind === 'bad' ? 'error' : 'pop');
  if (ms) setTimeout(go, ms);
  return el;
}

/* ---------------- modals ----------------

   The two portals had four hand-rolled dialogs between them, none of
   which trapped focus, closed on Escape or handed focus back. Tab walked
   straight out of the dialog into the page behind it, which for the
   tab-switch warning meant landing on the exam it was covering. */

const modalStack = [];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),' +
  'textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function focusables(root) {
  return [...root.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
}

/**
 * @param {HTMLElement} el       the .modal-backdrop
 * @param {HTMLElement} [focus]  what to focus; defaults to the first control
 * @param {{dismissible?:boolean,onDismiss?:Function}} [opts]
 */
export function openModal(el, focus, opts = {}) {
  if (!el || modalStack.some(m => m.el === el)) return null;

  const card = el.querySelector('.modal-card') || el;
  el.setAttribute('role', 'presentation');
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  if (!card.hasAttribute('tabindex')) card.tabIndex = -1;
  // Name the dialog from its own heading rather than asking every caller.
  const h = card.querySelector('h1,h2,h3');
  if (h && !card.getAttribute('aria-label') && !card.getAttribute('aria-labelledby')) {
    if (!h.id) h.id = 'md_' + Math.random().toString(36).slice(2, 8);
    card.setAttribute('aria-labelledby', h.id);
  }

  const entry = { el, card, restore: document.activeElement, opts };
  modalStack.push(entry);

  el.hidden = false;
  document.documentElement.dataset.modal = 'open';
  hideBehind(el);

  (focus || focusables(card)[0] || card).focus({ preventScroll: true });
  play('nav');
  return entry;
}

export function closeModal(el) {
  const i = modalStack.findIndex(m => m.el === el);
  if (i === -1) return;
  const entry = modalStack.splice(i, 1)[0];

  el.hidden = true;
  if (!modalStack.length) delete document.documentElement.dataset.modal;
  showBehind();
  // A dialog left open behind this one has to re-assert its own shielding.
  const below = modalStack[modalStack.length - 1];
  if (below) hideBehind(below.el);

  restoreFocus(entry.restore);
}

/**
 * Shields everything behind a dialog, from the reader and from the keyboard.
 *
 * Walking the ancestor chain rather than just body's children matters: the
 * teacher portal's dialogs are nested inside their <section>, so hiding only
 * body's children skipped the very <main> the dialog was sitting in and left
 * the whole page behind it still reachable by Tab.
 */
function hideBehind(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    for (const sib of node.parentElement?.children || []) {
      if (sib === node || sib.hasAttribute('aria-hidden') || sib.hasAttribute('data-fx-hid')) continue;
      sib.setAttribute('data-fx-hid', '');
      sib.setAttribute('aria-hidden', 'true');
      // inert also takes them out of the tab order, which makes the manual
      // Tab trap a second line of defence rather than the only one.
      sib.inert = true;
    }
  }
}

function showBehind() {
  for (const sib of document.querySelectorAll('[data-fx-hid]')) {
    sib.removeAttribute('aria-hidden');
    sib.removeAttribute('data-fx-hid');
    sib.inert = false;
  }
}

/** Puts focus back where it was, or somewhere sensible if that is gone. */
function restoreFocus(el) {
  try {
    if (el && el.isConnected && el !== document.body && typeof el.focus === 'function') {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) return;
    }
  } catch {}
  // Nothing to go back to: park on the main region so the reader is not
  // dropped at the top of the document.
  const main = document.querySelector('main');
  if (main) { main.tabIndex = -1; try { main.focus({ preventScroll: true }); } catch {} }
}

function dismissTop(top) {
  if (top.opts.onDismiss) top.opts.onDismiss();
  else closeModal(top.el);
}

addEventListener('keydown', e => {
  const top = modalStack[modalStack.length - 1];
  if (!top) return;

  if (e.key === 'Escape' && top.opts.dismissible !== false) {
    e.preventDefault();
    dismissTop(top);
    return;
  }
  if (e.key !== 'Tab') return;

  const list = focusables(top.card);
  if (!list.length) { e.preventDefault(); top.card.focus(); return; }
  const first = list[0], last = list[list.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}, true);

document.addEventListener('pointerdown', e => {
  const top = modalStack[modalStack.length - 1];
  if (!top || top.opts.dismissible === false) return;
  if (e.target === top.el) dismissTop(top);
});

/* ---------------- ripple ----------------

   Delegated, so it covers controls that do not exist yet — every option,
   chip and exam card is built at run time. */

export function initRipple() {
  document.addEventListener('pointerdown', e => {
    if (reducedMotion()) return;
    const btn = e.target.closest?.(
      '.btn,.icon-btn,.opt,.chip,.pick,.appbar-tab,.filter-tab,.btn-sm,.close-btn');
    if (!btn || btn.disabled) return;

    const r = btn.getBoundingClientRect();
    const ink = document.createElement('span');
    ink.className = 'fx-ink';
    const size = Math.max(r.width, r.height) * 2;
    ink.style.width = ink.style.height = size + 'px';
    ink.style.left = (e.clientX - r.left - size / 2) + 'px';
    ink.style.top = (e.clientY - r.top - size / 2) + 'px';

    // The ripple is clipped by the control, which must therefore be a
    // containing block. Cards already are; plain buttons are not.
    if (getComputedStyle(btn).position === 'static') btn.style.position = 'relative';
    btn.append(ink);
    ink.addEventListener('animationend', () => ink.remove(), { once: true });
  }, { passive: true });
}

/* ---------------- the pointer ----------------

   A soft light that follows the cursor and swells over anything
   clickable. Fine pointers only: there is no cursor to decorate on a
   touch screen, and the listener would cost battery for nothing. */

export function initCursor() {
  if (mqCoarse.matches || reducedMotion() || !matchMedia('(hover: hover)').matches) return;

  const glow = document.createElement('div');
  glow.className = 'fx-cursor';
  glow.setAttribute('aria-hidden', 'true');
  const ring = document.createElement('div');
  ring.className = 'fx-cursor-ring';
  ring.setAttribute('aria-hidden', 'true');
  document.body.append(glow, ring);

  let tx = innerWidth / 2, ty = innerHeight / 2;   // where the pointer is
  let rx = tx, ry = ty;                            // where the ring has got to
  let seen = false, raf = null;

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    tx = e.clientX; ty = e.clientY;
    if (!seen) { seen = true; rx = tx; ry = ty; document.body.classList.add('fx-cursor-on'); }
    glow.style.transform = 'translate3d(' + tx + 'px,' + ty + 'px,0)';

    const hot = e.target.closest?.(
      'a,button,select,input,textarea,summary,[role="button"],.opt,.chip,.pick,.card.liftable');
    ring.classList.toggle('hot', !!hot && !hot.disabled);
  }, { passive: true });

  addEventListener('pointerdown', () => ring.classList.add('down'), { passive: true });
  addEventListener('pointerup', () => ring.classList.remove('down'), { passive: true });
  document.addEventListener('pointerleave', () => document.body.classList.remove('fx-cursor-on'));
  document.addEventListener('pointerenter', () => { if (seen) document.body.classList.add('fx-cursor-on'); });

  // The ring lags the glow, which is what reads as weight.
  (function follow() {
    rx += (tx - rx) * 0.18;
    ry += (ty - ry) * 0.18;
    ring.style.transform = 'translate3d(' + rx + 'px,' + ry + 'px,0)';
    raf = requestAnimationFrame(follow);
  })();

  addEventListener('pagehide', () => cancelAnimationFrame(raf));
}

/* ---------------- ambient background ----------------

   A slow drift of motes behind the glass. The CSS mesh does the colour;
   this adds the parallax that makes it read as depth rather than as a
   gradient. It parks itself whenever the tab is hidden. */

export function initAmbient() {
  if (!ambientAllowed()) return;

  const cv = document.createElement('canvas');
  cv.className = 'fx-ambient';
  cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const c = cv.getContext('2d');
  if (!c) { cv.remove(); return; }

  let w = 0, h = 0, motes = [], raf = null, drift = 0;

  function size() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    w = innerWidth; h = innerHeight;
    cv.width = Math.floor(w * dpr);
    cv.height = Math.floor(h * dpr);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Density by area, capped — a 4K monitor should not get 600 of them.
    const n = Math.min(64, Math.round((w * h) / 26000));
    motes = Array.from({ length: n }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.9 + 0.6,
      sx: (Math.random() - 0.5) * 0.12,
      sy: -Math.random() * 0.16 - 0.03,
      a: Math.random() * 0.30 + 0.06,
      ph: Math.random() * Math.PI * 2
    }));
  }

  /** Warm motes on the oat ground, cool ones on the night sky. */
  function tint() {
    const cs = getComputedStyle(document.documentElement).colorScheme || '';
    const dark = cs.includes('dark') && !cs.includes('light');
    return dark ? '186,205,240' : '120,86,48';
  }

  let rgb = tint();

  function frame() {
    drift += 0.006;
    c.clearRect(0, 0, w, h);
    for (const m of motes) {
      m.x += m.sx + Math.sin(drift + m.ph) * 0.08;
      m.y += m.sy;
      if (m.y < -12) { m.y = h + 12; m.x = Math.random() * w; }
      if (m.x < -12) m.x = w + 12;
      if (m.x > w + 12) m.x = -12;
      const pulse = 0.72 + Math.sin(drift * 2 + m.ph) * 0.28;
      c.beginPath();
      c.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      c.fillStyle = 'rgba(' + rgb + ',' + (m.a * pulse).toFixed(3) + ')';
      c.fill();
    }
    raf = requestAnimationFrame(frame);
  }

  function start() { if (!raf) { rgb = tint(); frame(); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = null; } }

  size();
  start();

  let rs = null;
  addEventListener('resize', () => { clearTimeout(rs); rs = setTimeout(size, 200); }, { passive: true });
  document.addEventListener('visibilitychange', () => { document.hidden ? stop() : start(); });
  // The theme toggle repaints them without a reload.
  new MutationObserver(() => { rgb = tint(); })
    .observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mqMotion.addEventListener('change', () => { reducedMotion() ? stop() : start(); });
  addEventListener('pagehide', stop);
}

/* ---------------- confetti ---------------- */

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{count?:number,origin?:{x:number,y:number}}} [opts] origin in 0..1
 */
export function confetti(canvas, opts = {}) {
  if (!canvas || reducedMotion()) return;
  const c = canvas.getContext('2d');
  if (!c) return;

  // Without this the pieces are soft on every phone made since 2014.
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = innerWidth, h = innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const colors = ['#6366F1', '#8B5CF6', '#10B981', '#F59E0B', '#EC4899', '#3B82F6', '#14B8A6'];
  const ox = w * (opts.origin?.x ?? 0.5);
  const oy = h * (opts.origin?.y ?? 0.42);
  const n = opts.count ?? (mqCoarse.matches ? 48 : 84);

  const bits = Array.from({ length: n }, () => {
    const ang = (-90 + (Math.random() - 0.5) * 110) * Math.PI / 180;
    const sp = Math.random() * 11 + 7;
    return {
      x: ox + (Math.random() - 0.5) * 150, y: oy,
      vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
      size: Math.random() * 7 + 5,
      color: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 360, rs: (Math.random() - 0.5) * 16,
      life: 1
    };
  });

  let raf = null;
  (function frame() {
    c.clearRect(0, 0, w, h);
    let alive = false;
    for (const p of bits) {
      p.vy += 0.42;
      p.vx *= 0.992;
      p.x += p.vx; p.y += p.vy;
      p.rot += p.rs;
      p.life -= 0.0085;
      if (p.life <= 0 || p.y > h + 60) continue;
      alive = true;
      c.save();
      c.translate(p.x, p.y);
      c.rotate(p.rot * Math.PI / 180);
      c.globalAlpha = Math.max(0, Math.min(1, p.life));
      c.fillStyle = p.color;
      c.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.62);
      c.restore();
    }
    if (alive) raf = requestAnimationFrame(frame);
    else { c.clearRect(0, 0, w, h); cancelAnimationFrame(raf); }
  })();
}

/* ---------------- entrances ----------------

   Cards arrive rather than appear. Staggered by position, so a bento grid
   resolves in reading order instead of all at once. */

export function revealIn(root, sel = '.card,.past,.rev,.pick,.student-row,.exam-card') {
  if (!root || reducedMotion()) return;
  const items = [...root.querySelectorAll(sel)].filter(el => !el.dataset.fxIn);
  items.forEach((el, i) => {
    el.dataset.fxIn = '1';
    el.style.setProperty('--fx-delay', Math.min(i * 45, 340) + 'ms');
    el.classList.add('fx-in');
    el.addEventListener('animationend', () => {
      el.classList.remove('fx-in');
      el.style.removeProperty('--fx-delay');
    }, { once: true });
  });
}

/**
 * Counts a number up to its value. Used on the teacher dashboard tiles,
 * where three static numbers otherwise give no sign they refreshed.
 */
export function countTo(el, value, ms = 900) {
  if (!el) return;
  const target = Number(value);
  if (!isFinite(target)) { el.textContent = value == null ? '—' : String(value); return; }

  // The number is information, not decoration, so it has to be right even
  // when the animation never runs: reduced motion, or a hidden tab, where
  // rAF is throttled to nothing and the count would stick at its first frame.
  if (reducedMotion() || document.hidden) { el.textContent = String(target); return; }

  const from = Number(String(el.textContent).replace(/[^\d.-]/g, '')) || 0;
  const t0 = performance.now();
  // Belt and braces: if rAF stops firing part-way, this still lands.
  const settle = setTimeout(() => { el.textContent = String(target); }, ms + 200);

  (function step(now) {
    const k = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - k, 3);
    el.textContent = String(Math.round(from + (target - from) * eased));
    if (k < 1) requestAnimationFrame(step);
    else clearTimeout(settle);
  })(t0);
}

/* ---------------- boot ---------------- */

/** Everything a page wants, in one call. */
export function initFx({ cursor = true, ambient = true, ripple = true } = {}) {
  document.documentElement.dataset.sound = soundOn ? 'on' : 'off';
  if (ripple) initRipple();
  if (cursor) initCursor();
  if (ambient) initAmbient();
}
