/** Chapter 01 — timing studies, using the shared activity and motion runtime. */
import { qs, qsa } from '../core/dom.js';
import { motion, createLoop } from '../core/motion.js';
import { scaledDuration } from '../core/physics.js';
import { burst } from '../core/ui.js';
import { runDemos, onFirstView, travelOf, watchDemoActivity } from './shared.js';

const EASE_OUT = 'cubic-bezier(0.25, 1, 0.5, 1)';
const STANDARD = 'cubic-bezier(0.2, 0, 0, 1)';
const demos = { 'duration-ladder': durationLadder, 'distance-duration': distanceDuration, asymmetry, latency, framerate, 'hover-intent': hoverIntent };
export function init() { runDemos(demos); }

// Inline endpoints are authoritative; completed WAAPI effects are not retained.
function animateTo(ball, from, to, duration, easing, effects) {
  ball.style.transform = `translateX(${to}px)`;
  if (!ball.animate) return;
  const animation = ball.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration, easing });
  effects.add(animation);
  animation.onfinish = () => { effects.delete(animation); animation.cancel(); };
}
function cancelEffects(effects) {
  effects.forEach((animation) => animation.cancel());
  effects.clear();
}

function durationLadder(root) {
  const rows = qsa('[data-duration]', root).map((row) => ({ duration: +row.dataset.duration, rail: qs('.rail', row), ball: qs('.rail__ball', row) }));
  const loopChip = qs('[data-loop]', root);
  const effects = new Set();
  const longest = Math.max(...rows.map((row) => row.duration));
  let active = false;
  let timer = 0;
  let direction = 1;
  const looping = () => loopChip.getAttribute('aria-pressed') === 'true';
  const stop = () => {
    clearTimeout(timer);
    timer = 0;
    root.dataset.loopPending = 'false';
    cancelEffects(effects);
  };
  function run(next = 1) {
    stop();
    direction = next;
    rows.forEach(({ duration, rail, ball }) => {
      const travel = travelOf(rail, ball);
      const [from, to] = direction > 0 ? [0, travel] : [travel, 0];
      ball.style.transform = `translateX(${to}px)`;
      if (active) animateTo(ball, from, to, duration, EASE_OUT, effects);
    });
    if (active && looping()) {
      root.dataset.loopPending = 'true';
      timer = setTimeout(() => { timer = 0; run(-direction); }, longest + 700);
    }
  }
  qs('[data-play]', root).addEventListener('click', () => run(1));
  loopChip.addEventListener('click', () => {
    loopChip.setAttribute('aria-pressed', String(!looping()));
    if (looping()) run(1);
    else stop();
  });
  watchDemoActivity(root, (value) => {
    active = value;
    if (!active) stop();
    else if (looping()) run(direction);
  });
  onFirstView(root, () => run(1));
}

function distanceDuration(root) {
  const effects = new Set();
  let active = false;
  let played = false;
  function run(animate = active) {
    played = true;
    cancelEffects(effects);
    for (const pane of qsa('[data-mode]', root)) {
      for (const row of qsa('.dist-row', pane)) {
        const rail = qs('.rail', row);
        const ball = qs('.rail__ball', row);
        const distance = travelOf(rail, ball) * +row.dataset.fraction;
        const duration = pane.dataset.mode === 'fixed' ? 400 : Math.round(scaledDuration(distance, { base: 260, reference: 100, min: 160, max: 700 }));
        const speed = Math.round(distance / (duration / 1000));
        qs('[data-meta]', row).innerHTML = `<b>${duration}ms</b> · ${speed.toLocaleString('en-US')} px/s`;
        ball.style.transform = `translateX(${distance}px)`;
        if (animate) animateTo(ball, 0, distance, duration, STANDARD, effects);
      }
    }
  }
  qs('[data-play]', root).addEventListener('click', () => run());
  watchDemoActivity(root, (value) => { active = value; if (!active) cancelEffects(effects); });
  window.addEventListener('resize', () => { if (played) run(false); }, { passive: true });
  onFirstView(root, () => run());
}

function asymmetry(root) {
  const toggle = qs('[data-toggle-sheet]', root);
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-pressed') !== 'true';
    toggle.setAttribute('aria-pressed', String(open));
    qsa('.sheet, .scrim', root).forEach((layer) => layer.classList.toggle('is-open', open));
    qsa('.sheet', root).forEach((sheet) => sheet.setAttribute('aria-hidden', String(!open)));
    qs('[data-label]', toggle).textContent = open ? 'Close both' : 'Open both';
  });
}

function latency(root) {
  const MAX = 1200;
  const button = qs('[data-latency-btn]', root);
  const status = qs('[data-latency-status]', root);
  const slider = qs('[data-latency-delay]', root);
  const ack = qs('[data-latency-ack]', root);
  const extraEl = qs('[data-latency-extra]', root);
  const timeline = qs('[data-timeline]', root);
  const marker = qs('[data-timeline-marker]', root);
  const effects = new Set();
  let active = false;
  let busy = false;
  let extra = 0;
  let resetTimer = 0;
  const ackOn = () => ack.getAttribute('aria-pressed') === 'true';
  const note = document.createElement('p');
  note.className = 'timing-explanation';
  note.textContent = 'Local timer only: no network request or save. Extra clicks counts repeat attempts in either mode; none starts another save.';
  root.append(note);
  const placeResponse = () => {
    const delay = +slider.value;
    qs('[data-latency-out]', root).textContent = `${delay}ms`;
    qs('[data-timeline-response]', root).style.left = `${delay / MAX * 100}%`;
  };
  slider.addEventListener('input', placeResponse);
  placeResponse();
  ack.addEventListener('click', () => {
    ack.setAttribute('aria-pressed', String(!ackOn()));
    root.classList.toggle('is-no-ack', !ackOn());
    if (busy) {
      button.classList.toggle('is-busy', ackOn());
      status.textContent = ackOn() ? 'Saving…' : 'Ready';
    }
  });
  watchDemoActivity(root, (value) => {
    active = value;
    if (!active) cancelEffects(effects);
  });
  button.addEventListener('click', () => {
    if (busy) {
      extraEl.textContent = String(++extra);
      return;
    }
    busy = true;
    button.setAttribute('aria-busy', 'true');
    clearTimeout(resetTimer);
    button.classList.remove('is-done');
    button.classList.toggle('is-busy', ackOn());
    status.textContent = ackOn() ? 'Saving…' : 'Ready';
    const delay = +slider.value;
    cancelEffects(effects);
    marker.classList.add('is-running');
    const distance = delay / MAX * timeline.clientWidth;
    marker.style.transform = `translateX(${distance}px)`;
    if (active) animateTo(marker, 0, distance, Math.max(delay, 1), 'linear', effects);
    // Functional completion is deliberately independent of decorative motion.
    setTimeout(() => {
      busy = false;
      button.setAttribute('aria-busy', 'false');
      button.classList.remove('is-busy');
      button.classList.add('is-done');
      status.textContent = `Saved after ${delay}ms`;
      if (active) {
        const stage = button.parentElement;
        burst(stage, { x: stage.clientWidth / 2, y: button.offsetTop + button.offsetHeight / 2, count: 10, distance: [40, 80] });
        if (!ackOn() && extra > 0 && extraEl.parentElement.animate) {
          const flash = extraEl.parentElement.animate([{ color: '#ff5a36' }, { color: 'rgba(243,240,234,.66)' }], { duration: 900 });
          effects.add(flash);
          flash.onfinish = () => { effects.delete(flash); flash.cancel(); };
        }
      }
      resetTimer = setTimeout(() => {
        button.classList.remove('is-done');
        marker.classList.remove('is-running');
        cancelEffects(effects);
        status.textContent = 'Ready';
      }, 1600);
    }, delay);
  });
}

function framerate(root) {
  const rows = qsa('[data-fps]', root).map((row) => ({ fps: +row.dataset.fps, rail: qs('.rail', row), ball: qs('.rail__ball', row), travel: 0 }));
  const toggle = qs('[data-toggle]', root);
  const refresh = qs('[data-refresh]', root);
  if (refresh) refresh.parentElement.firstChild.textContent = 'rAF cadence ≈ ';
  let active = false;
  let playing = true;
  let elapsed = 0;
  let sampleStart = 0;
  let frames = 0;
  let sampled = false;
  function draw(time) {
    rows.forEach((row) => {
      const t = Math.floor(time * row.fps) / row.fps;
      const x = (Math.sin(t * Math.PI * 2 * 0.4 - Math.PI / 2) * 0.5 + 0.5) * row.travel;
      row.ball.style.transform = `translateX(${x.toFixed(2)}px)`;
    });
  }
  const loop = createLoop((dt, now) => {
    elapsed += dt;
    draw(elapsed);
    if (!sampled) {
      if (!sampleStart) sampleStart = now;
      else frames++;
      if (now - sampleStart >= 1000) {
        if (refresh) refresh.textContent = String(Math.round(frames * 1000 / (now - sampleStart)));
        sampled = true;
      }
    }
  });
  const sync = () => {
    const running = active && playing;
    root.dataset.running = String(running);
    if (running) loop.start();
    else {
      loop.stop();
      sampleStart = frames = 0;
      if (motion.reduced) draw(0.7);
    }
  };
  const measure = () => {
    rows.forEach((row) => { row.travel = travelOf(row.rail, row.ball); });
    draw(motion.reduced ? 0.7 : elapsed);
  };
  toggle.addEventListener('click', () => {
    playing = !playing;
    root.classList.toggle('is-paused', !playing);
    toggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    sync();
  });
  measure();
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(root);
  else window.addEventListener('resize', measure, { passive: true });
  watchDemoActivity(root, (value) => { active = value; sync(); });
}

function hoverIntent(root) {
  const counters = [];
  qsa('[data-intent-group]', root).forEach((group) => {
    const mode = group.dataset.intentGroup;
    const tip = qs('[data-tip-el]', group);
    const buttons = qsa('[data-tip]', group);
    const counter = { count: 0, el: qs(`[data-count="${mode}"]`, root) };
    counters.push(counter);
    tip.id = `tip-${mode}`;
    tip.setAttribute('aria-hidden', 'true');
    let current = null;
    let openTimer = 0;
    let hideTimer = 0;
    let warmUntil = 0;
    const focused = () => buttons.includes(document.activeElement) ? document.activeElement : null;
    const clear = () => { clearTimeout(openTimer); clearTimeout(hideTimer); openTimer = hideTimer = 0; };
    const hide = () => {
      clear();
      tip.classList.remove('is-visible', 'is-gliding');
      tip.setAttribute('aria-hidden', 'true');
      current?.removeAttribute('aria-describedby');
      current = null;
    };
    const show = (button) => {
      clear();
      if (focused() && focused() !== button) return;
      const wasVisible = Boolean(current);
      tip.textContent = button.dataset.tip;
      tip.classList.toggle('is-gliding', wasVisible);
      if (!wasVisible) tip.style.transition = 'none';
      tip.style.setProperty('--x', `${button.offsetLeft + button.offsetWidth / 2}px`);
      if (!wasVisible) { void tip.offsetWidth; tip.style.transition = ''; }
      tip.classList.add('is-visible');
      tip.setAttribute('aria-hidden', 'false');
      if (current !== button) {
        current?.removeAttribute('aria-describedby');
        current = button;
        button.setAttribute('aria-describedby', tip.id);
        counter.el.textContent = String(++counter.count);
      }
    };
    buttons.forEach((button) => {
      button.addEventListener('pointerenter', () => {
        clear();
        if (focused() && focused() !== button) return;
        if (mode === 'instant' || current || performance.now() < warmUntil) show(button);
        else openTimer = setTimeout(() => show(button), 400);
      });
      button.addEventListener('pointerleave', () => {
        clear();
        if (focused()) return;
        if (mode === 'instant') hide();
        else {
          if (current) warmUntil = performance.now() + 300;
          hideTimer = setTimeout(hide, 140);
        }
      });
      button.addEventListener('focus', () => show(button));
      button.addEventListener('blur', hide);
    });
    root.addEventListener('pointerleave', () => { clear(); if (!focused()) hide(); });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { warmUntil = 0; hide(); }
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) hide(); });
  });
  qs('[data-reset-counts]', root).addEventListener('click', () => {
    counters.forEach((counter) => { counter.count = 0; counter.el.textContent = '0'; });
  });
}
