/**
 * Chapter 02 — Easing & curves demos: linear vs eased (velocity plots), the
 * easing gallery, curve direction, the curve editor, a linear() builder,
 * stepped timing and easing tokens.
 */
import { qs, qsa, copyText, escapeHTML } from '../core/dom.js';
import { motion, createLoop, clamp } from '../core/motion.js';
import { easings, cubicBezier, linearFromFunction, formatBezier } from '../core/easing.js';
import { toLinearEasing, springPosition } from '../core/spring.js';
import { initBezier } from '../modules/bezier.js';
import { runDemos, onFirstView, curvePath, replayClass, togglePressed, watchDemoActivity } from './shared.js';

const demos = {
  'linear-vs-eased': linearVsEased,
  'easing-gallery': easingGallery,
  direction,
  'linear-builder': linearBuilder,
  steps,
  'token-playground': tokenPlayground,
};

export function init() {
  const editor = qs('[data-bezier]');
  if (editor && editor.dataset.primaryReady !== 'true') {
    try {
      initBezier();
      editor.dataset.primaryReady = 'true';
    } catch (error) {
      console.error('[kinetic] curve editor failed', error);
    }
  }
  runDemos(demos);
}

/* 2.1 Linear vs eased ------------------------------------------------------ */
function linearVsEased(root) {
  const FUNCTIONS = { linear: easings.linear, out: easings.easeOutCubic };
  const DURATION = 1300;
  const HOLD = 700;
  const W = 300;
  const H = 56;
  const V_MAX = 3.2;

  const rows = qsa('[data-ease-row]', root).map((row) => {
    const fn = FUNCTIONS[row.dataset.easeRow];
    const svg = qs('.vel', row);
    // Velocity is the slope of progress: a central difference is plenty here.
    const velocity = (t) => {
      const a = Math.max(0, t - 0.001);
      const b = Math.min(1, t + 0.001);
      return (fn(b) - fn(a)) / (b - a);
    };
    let d = `M0 ${H}`;
    for (let i = 0; i <= 120; i++) {
      const t = i / 120;
      d += ` L${(t * W).toFixed(1)} ${(H - (velocity(t) / V_MAX) * (H - 4)).toFixed(1)}`;
    }
    d += ` L${W} ${H} Z`;
    qs('.vel__path', svg).setAttribute('d', d);
    return { fn, track: qs('.ease-track', row), card: qs('.ease-card', row), cursor: qs('.vel__cursor', svg) };
  });

  const toggle = qs('[data-toggle]', root);
  let playing = true;
  let active = false;
  let start = performance.now();
  const draw = (t, forward = true) => {
    for (const row of rows) {
      const travel = Math.max(0, row.track.clientWidth - row.card.offsetWidth - 20);
      const progress = row.fn(t);
      row.card.style.transform = `translateX(${((forward ? progress : 1 - progress) * travel).toFixed(2)}px)`;
      row.cursor.setAttribute('x1', String(t * W));
      row.cursor.setAttribute('x2', String(t * W));
    }
  };

  const loop = createLoop((dt, now) => {
    const cycle = (DURATION + HOLD) * 2;
    const elapsed = Math.max(0, now - start) % cycle;
    let t = 1;
    let forward = true;
    if (elapsed < DURATION) t = elapsed / DURATION;
    else if (elapsed < DURATION + HOLD) t = 1;
    else if (elapsed < DURATION * 2 + HOLD) {
      t = (elapsed - DURATION - HOLD) / DURATION;
      forward = false;
    } else forward = false;
    draw(t, forward);
  });
  const sync = () => {
    const running = active && playing;
    root.dataset.running = String(running);
    if (running) { start = performance.now(); loop.start(); }
    else { loop.stop(); if (motion.reduced) draw(0.5); }
  };

  toggle?.addEventListener('click', () => {
    playing = !playing;
    root.classList.toggle('is-paused', !playing);
    toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    sync();
  });
  draw(0.5);
  watchDemoActivity(root, (value) => { active = value; sync(); });
  window.addEventListener('resize', () => { if (!loop.running) draw(0.5); }, { passive: true });
}

/* 2.2 Easing gallery ------------------------------------------------------- */
const GALLERY = [
  ['linear', 'Linear', 'Progress bars, spinners, colour fades.', 'linear'],
  ['easeOutQuad', 'Out quad', 'A gentle default for small UI.', 'out'],
  ['easeOutCubic', 'Out cubic', 'Everyday arrivals.', 'out'],
  ['easeOutQuart', 'Out quart', 'Crisper start, longer glide.', 'out'],
  ['easeOutExpo', 'Out expo', 'Dramatic reveals: fast, then feather-light.', 'out'],
  ['easeOutCirc', 'Out circ', 'Abrupt start, very long tail.', 'out'],
  ['easeInQuad', 'In quad', 'Gentle exits.', 'in'],
  ['easeInCubic', 'In cubic', 'Exits that clear the stage.', 'in'],
  ['easeInExpo', 'In expo', 'Launches. Use sparingly.', 'in'],
  ['easeInOutSine', 'In-out sine', 'Loops, breathing and pulsing.', 'inout'],
  ['easeInOutCubic', 'In-out cubic', 'Moving between two points on screen.', 'inout'],
  ['easeInOutExpo', 'In-out expo', 'Snappy, confident transitions.', 'inout'],
  ['easeOutBack', 'Out back', 'A pop with overshoot for small elements.', 'expressive'],
  ['easeOutElastic', 'Out elastic', 'A playful wobble. Rare in product UI.', 'expressive'],
  ['easeOutBounce', 'Out bounce', 'Rebounds inside the box, like a dropped ball.', 'expressive'],
];

function easingGallery(root) {
  const grid = qs('[data-gallery-grid]', root);
  const W = 120;
  const H = 90;
  const P = 8;
  const RANGE = [-0.25, 1.4];
  const DURATION = 1000;
  const yOf = (v) => P + (1 - (v - RANGE[0]) / (RANGE[1] - RANGE[0])) * (H - P * 2);
  const xOf = (t) => P + t * (W - P * 2);

  grid.innerHTML = GALLERY.map(
    ([key, name, use, kind]) => `
      <button class="ecard" type="button" data-ease="${key}" data-kind="${kind}" aria-label="Play ${escapeHTML(name)}">
        <svg class="ecard__plot" viewBox="0 0 ${W} ${H}" aria-hidden="true">
          <rect class="ecard__frame" x="${P}" y="${yOf(1)}" width="${W - P * 2}" height="${yOf(0) - yOf(1)}"/>
          <path class="ecard__curve" d="${curvePath(easings[key], { width: W, height: H, range: RANGE, padding: P, samples: 120 })}"/>
          <circle class="ecard__dot" r="3.5" cx="${xOf(0)}" cy="${yOf(0)}"/>
        </svg>
        <span class="ecard__rail" aria-hidden="true"><span class="ecard__ball"></span></span>
        <span class="ecard__name">${escapeHTML(name)}</span>
        <code class="ecard__code">${key}</code>
        <span class="ecard__use">${escapeHTML(use)}</span>
      </button>`,
  ).join('');

  const cards = qsa('.ecard', grid).map((card) => ({
    card,
    fn: easings[card.dataset.ease],
    ball: qs('.ecard__ball', card),
    rail: qs('.ecard__rail', card),
    dot: qs('.ecard__dot', card),
  }));
  const active = new Map();
  let enabled = false;
  const resetEntry = (entry) => {
    active.delete(entry);
    entry.card.classList.remove('is-playing');
    entry.ball.style.transform = '';
    entry.dot.setAttribute('cx', xOf(0));
    entry.dot.setAttribute('cy', yOf(0));
  };
  const clear = () => {
    cards.forEach(resetEntry);
    loop.stop();
    root.dataset.running = 'false';
  };

  const loop = createLoop((dt, now) => {
    for (const [entry, start] of active) {
      const t = clamp((now - start) / DURATION);
      const value = entry.fn(t);
      const travel = entry.rail.clientWidth - 12;
      entry.ball.style.transform = `translateX(${(value * travel).toFixed(2)}px)`;
      entry.dot.setAttribute('cx', xOf(t).toFixed(2));
      entry.dot.setAttribute('cy', yOf(value).toFixed(2));
      if (now - start > DURATION + 600) {
        active.delete(entry);
        entry.card.classList.remove('is-playing');
        entry.ball.style.transform = '';
        entry.dot.setAttribute('cx', xOf(0));
        entry.dot.setAttribute('cy', yOf(0));
      }
    }
    if (!active.size) { loop.stop(); root.dataset.running = 'false'; }
  });

  const play = (entry, start = performance.now()) => {
    if (!enabled) {
      if (motion.reduced) {
        resetEntry(entry);
        entry.ball.style.transform = `translateX(${Math.max(0, entry.rail.clientWidth - 12)}px)`;
        entry.dot.setAttribute('cx', xOf(1));
        entry.dot.setAttribute('cy', yOf(1));
      }
      return;
    }
    root.dataset.running = 'true';
    active.set(entry, start);
    entry.card.classList.add('is-playing');
    loop.start();
  };

  cards.forEach((entry) => {
    entry.card.addEventListener('pointerenter', () => play(entry));
    entry.card.addEventListener('focus', () => play(entry));
    entry.card.addEventListener('click', () => play(entry));
    entry.card.addEventListener('blur', () => {
      resetEntry(entry);
      if (!active.size) { loop.stop(); root.dataset.running = 'false'; }
    });
  });

  const playAll = () => {
    const start = performance.now();
    cards.filter((entry) => !entry.card.hidden).forEach((entry) => play(entry, start));
  };
  qs('[data-play]', root)?.addEventListener('click', playAll);

  const filters = qsa('[data-filter]', root);
  filters.forEach((chip) =>
    chip.addEventListener('click', () => {
      const kind = chip.dataset.filter;
      clear();
      filters.forEach((other) => other.setAttribute('aria-pressed', String(other === chip)));
      cards.forEach((entry) => {
        const hidden = !(kind === 'all' || entry.card.dataset.kind === kind);
        if (hidden && entry.card === document.activeElement) chip.focus({ preventScroll: true });
        entry.card.hidden = hidden;
      });
    }),
  );
  watchDemoActivity(root, (value) => { enabled = value; if (!enabled) clear(); });
  onFirstView(root, playAll, { threshold: 0.3 });
}

/* 2.3 Curve for the direction ---------------------------------------------- */
function direction(root) {
  const cells = qsa('[data-cell]', root);
  const effects = new Set();
  const timers = new Set();
  let active = false;
  const cancel = () => {
    timers.forEach(clearTimeout);
    timers.clear();
    effects.forEach((animation) => animation.cancel());
    effects.clear();
  };
  function run() {
    cancel();
    for (const cell of cells) {
      const card = qs('.dcard', cell);
      const action = cell.dataset.action;
      let frames;
      if (action === 'enter') frames = [{ transform: 'translateY(-150%)', opacity: 0 }, { transform: 'translateY(0)', opacity: 1 }];
      else if (action === 'exit') frames = [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(160%)', opacity: 0 }];
      else {
        const distance = Math.max(0, qs('.dcell__stage', cell).clientWidth - card.offsetWidth - 24);
        frames = [{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${distance}px)`, opacity: 1 }];
      }
      Object.assign(card.style, frames[1]);
      if (!active || !card.animate) continue;
      const animation = card.animate(frames, { duration: 700, easing: cell.dataset.curve });
      effects.add(animation);
      animation.onfinish = () => {
        effects.delete(animation);
        animation.cancel();
        if (action === 'exit') {
          const timer = setTimeout(() => {
            timers.delete(timer);
            card.style.transform = 'none';
            card.style.opacity = '1';
          }, 900);
          timers.add(timer);
        }
      };
    }
  }
  watchDemoActivity(root, (value) => { active = value; if (!active) cancel(); });
  qs('[data-play]', root)?.addEventListener('click', run);
  onFirstView(root, run, { threshold: 0.4 });
}

/* 2.5 linear() builder ----------------------------------------------------- */
const LINEAR_PRESETS = {
  spring: { config: { stiffness: 180, damping: 12 } },
  jelly: { config: { stiffness: 260, damping: 7 } },
  bounce: { fn: easings.easeOutBounce, duration: 900 },
  elastic: { fn: easings.easeOutElastic, duration: 1200 },
};

function linearBuilder(root) {
  const svg = qs('[data-lb-plot]', root);
  const code = qs('[data-lb-code]', root);
  const slider = qs('[data-lb-samples]', root);
  const out = qs('[data-lb-samples-out]', root);
  const box = qs('[data-lb-box]', root);
  const rail = qs('[data-lb-rail]', root);
  const meta = qs('[data-lb-meta]', root);
  const chips = qsa('[data-lb-preset]', root);
  const copy = qs('[data-lb-copy]', root);
  const fallbackNote = qs('[data-lb-fallback]', root);
  const supported = typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('transition-timing-function', 'linear(0, 1)');
  if (fallbackNote) fallbackNote.hidden = supported;
  let preset = 'spring';
  let current = null;
  let fallbackLoop = null;
  let active = false;
  let played = false;
  const settle = () => {
    fallbackLoop?.stop();
    box.style.transition = 'none';
    if (played) box.style.transform = `translateX(${Math.max(0, rail.clientWidth - box.offsetWidth - 16)}px)`;
    root.dataset.running = 'false';
  };
  box.addEventListener('transitionend', (event) => { if (event.propertyName === 'transform') root.dataset.running = 'false'; });

  function build() {
    const samples = Number(slider.value);
    const entry = LINEAR_PRESETS[preset];
    if (entry.config) {
      const { easing, duration } = toLinearEasing(entry.config, { samples });
      const seconds = duration / 1000;
      return { easing, duration, fn: (t) => springPosition(t * seconds, { ...entry.config, from: 0, to: 1 }) };
    }
    return { easing: linearFromFunction(entry.fn, samples), duration: entry.duration, fn: entry.fn };
  }

  function render() {
    settle();
    current = build();
    const values = current.easing.slice(7, -1).split(', ').map(Number);
    const exact = Array.from({ length: 101 }, (_, i) => current.fn(i / 100));
    const low = Math.min(0, ...values, ...exact) - 0.06;
    const high = Math.max(1, ...values, ...exact) + 0.06;
    const W = 300;
    const H = 160;
    const P = 8;
    const x = (t) => P + t * (W - P * 2);
    const y = (v) => P + (1 - (v - low) / (high - low)) * (H - P * 2);
    const last = values.length - 1;
    const polyline = values.map((v, i) => `${i ? 'L' : 'M'}${x(i / last).toFixed(2)} ${y(v).toFixed(2)}`).join('');
    const dots = values.map((v, i) => `<circle class="lb__pt" cx="${x(i / last).toFixed(2)}" cy="${y(v).toFixed(2)}" r="2.2"/>`).join('');
    svg.innerHTML = `
      <line class="lb__guide" x1="${P}" x2="${W - P}" y1="${y(0)}" y2="${y(0)}"/>
      <line class="lb__guide" x1="${P}" x2="${W - P}" y1="${y(1)}" y2="${y(1)}"/>
      <path class="lb__fn" d="${curvePath(current.fn, { width: W, height: H, range: [low, high], padding: P, samples: 200 })}"/>
      <path class="lb__poly" d="${polyline}"/>${dots}`;
    code.textContent = current.easing;
    out.textContent = String(slider.value);
    meta.innerHTML = `<b>${current.duration}ms</b> · ${values.length} points · ${current.easing.length} characters`;
    chips.forEach((chip) => chip.setAttribute('aria-pressed', String(chip.dataset.lbPreset === preset)));
  }

  function run() {
    played = true;
    const travel = Math.max(0, rail.clientWidth - box.offsetWidth - 16);
    settle();
    box.style.transition = 'none';
    box.style.transform = 'translateX(0px)';
    void box.offsetWidth;
    if (!active) {
      box.style.transform = `translateX(${travel}px)`;
      return;
    }
    root.dataset.running = 'true';
    if (supported) {
      box.style.transition = `transform ${current.duration}ms ${current.easing}`;
      box.style.transform = `translateX(${travel}px)`;
      return;
    }
    // Fallback for browsers without linear(): evaluate the curve per frame.
    const start = performance.now();
    const { fn, duration } = current;
    fallbackLoop = createLoop((dt, now) => {
      const t = clamp((now - start) / duration);
      box.style.transform = `translateX(${(fn(t) * travel).toFixed(2)}px)`;
      if (t >= 1) settle();
    });
    fallbackLoop.start();
  }

  chips.forEach((chip) =>
    chip.addEventListener('click', () => {
      preset = chip.dataset.lbPreset;
      render();
      run();
    }),
  );
  slider.addEventListener('input', render);
  slider.addEventListener('change', run);
  qs('[data-play]', root)?.addEventListener('click', run);

  let copyTimer = 0;
  copy?.addEventListener('click', async () => {
    const ok = await copyText(current.easing);
    copy.textContent = ok ? 'Copied' : 'Failed';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copy.textContent = 'Copy'), 1400);
  });

  render();
  watchDemoActivity(root, (value) => { active = value; if (!active) settle(); });
  window.addEventListener('resize', settle, { passive: true });
  onFirstView(root, run, { threshold: 0.4 });
}

/* 2.6 Stepped timing ------------------------------------------------------- */
function steps(root) {
  const demo = qs('.steps-demo', root);
  const toggle = qs('[data-clock-toggle]', root);
  const measure = () => qsa('.stepbar__track', demo).forEach((rail) => {
    rail.style.setProperty('--step-travel', `${rail.clientWidth}px`);
  });
  const replay = () => { measure(); replayClass(demo); };
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(demo);
  else window.addEventListener('resize', measure, { passive: true });
  root.dataset.clockPaused = 'false';
  toggle.addEventListener('click', () => {
    const paused = togglePressed(toggle);
    root.dataset.clockPaused = String(paused);
    toggle.textContent = paused ? 'Play clock' : 'Pause clock';
  });
  watchDemoActivity(root, () => {});
  qs('[data-play]', root)?.addEventListener('click', replay);
  onFirstView(root, replay, { threshold: 0.4 });
}

/* 2.7 Easing tokens -------------------------------------------------------- */
const TOKENS = {
  standard: [0.2, 0, 0, 1],
  enter: [0.05, 0.7, 0.1, 1],
  exit: [0.3, 0, 0.8, 0.15],
  emphasized: [0.16, 1, 0.3, 1],
  overshoot: [0.34, 1.56, 0.64, 1],
};
const DURATIONS = { short: 200, medium: 320, long: 500 };

function tokenPlayground(root) {
  const tokenButtons = qsa('[data-token]', root);
  const durationButtons = qsa('[data-dur]', root);
  const menu = qs('[data-token-menu]', root);
  const items = qsa('li', menu);
  const toggle = qs('[data-token-toggle]', root);
  const readout = qs('[data-token-code]', root);
  let token = 'standard';
  let duration = 'medium';
  let cancelIntroduction = () => {};

  tokenButtons.forEach((button) => {
    const svg = qs('svg', button);
    svg.innerHTML = `<path d="${curvePath(cubicBezier(...TOKENS[button.dataset.token]), { width: 44, height: 30, range: [-0.15, 1.35], padding: 2, samples: 48 })}"/>`;
  });

  function renderReadout() {
    const ms = DURATIONS[duration];
    readout.innerHTML =
      `.menu {\n  transition: transform <b>var(--dur-${duration})</b> <b>var(--ease-${token})</b>;\n}\n` +
      `<i>/* opens in ${ms}ms ${formatBezier(TOKENS[token])}\n   closes in ${Math.round(ms * 0.65)}ms with --ease-exit */</i>`;
    tokenButtons.forEach((button) => togglePressed(button, button.dataset.token === token));
    durationButtons.forEach((button) => togglePressed(button, button.dataset.dur === duration));
  }

  let open = false;
  let active = false;
  const cancel = () => menu.getAnimations?.({ subtree: true }).forEach((animation) => animation.cancel());
  function setOpen(next, { instant = false } = {}) {
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-hidden', String(!open));
    menu.inert = !open;
    cancel();
    menu.classList.toggle('is-open', open);
    if (instant || !active || !menu.animate) return;
    const ms = DURATIONS[duration];
    if (open) {
      const easing = formatBezier(TOKENS[token]);
      menu.animate(
        [
          { opacity: 0, transform: 'translateY(-8px) scale(0.94)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: ms, easing },
      );
      items.forEach((item, i) =>
        item.animate(
          [
            { opacity: 0, transform: 'translateY(-6px)' },
            { opacity: 1, transform: 'none' },
          ],
          { duration: ms, delay: 30 + i * 28, easing, fill: 'backwards' },
        ),
      );
    } else {
      menu.animate(
        [
          { opacity: 1, transform: 'none' },
          { opacity: 0, transform: 'translateY(-4px) scale(0.97)' },
        ],
        { duration: Math.round(ms * 0.65), easing: formatBezier(TOKENS.exit) },
      );
    }
  }

  // Explicit keyframes already start from the hidden pose; no replay rAF can
  // reopen a menu after a newer toggle or Escape closes it.
  const replay = () => { cancelIntroduction(); setOpen(true); };

  tokenButtons.forEach((button) =>
    button.addEventListener('click', () => {
      token = button.dataset.token;
      renderReadout();
      replay();
    }),
  );
  durationButtons.forEach((button) =>
    button.addEventListener('click', () => {
      duration = button.dataset.dur;
      renderReadout();
      replay();
    }),
  );
  toggle.addEventListener('click', () => { cancelIntroduction(); setOpen(!open); });
  root.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      cancelIntroduction();
      setOpen(false);
      toggle.focus({ preventScroll: true });
    }
  });
  setOpen(false, { instant: true });
  watchDemoActivity(root, (value) => { active = value; if (!active) setOpen(open, { instant: true }); });
  renderReadout();
  cancelIntroduction = onFirstView(root, () => setOpen(true), { threshold: 0.4 });
}
