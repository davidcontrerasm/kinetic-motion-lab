/** Chapter 06. Scroll is never intercepted; every study names and measures its source. */
import { qs, qsa } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp, lerp, damp } from '../core/motion.js';
import { runDemos } from './shared.js';

const unit = value => clamp(value, 0, 1);
const fraction = el => {
  const range = el.scrollHeight - el.clientHeight;
  return range > 0 ? unit(el.scrollTop / range) : 0;
};
const ease = p => 1 - (1 - unit(p)) ** 3;

// Coalesce event-driven JS writes through the site's ticker. Native poses never enter this queue on scroll.
const pending = new Set();
const flush = createLoop(() => {
  const jobs = [...pending]; pending.clear(); flush.stop();
  jobs.forEach(job => job());
});
function enqueue(job) { pending.add(job); flush.start(); }

/** Lifecycle for a local study. No continuous sampling unless a demo explicitly needs a finite clock. */
function watch(root, paint, activity = () => {}) {
  let visible = false;
  const life = { active: false, invalidate: () => { if (life.active) enqueue(render); } };
  function render() { if (life.active) paint(); }
  function sync() {
    life.active = visible && !document.hidden;
    root.dataset.active = String(life.active);
    if (!life.active) pending.delete(render);
    activity(life.active); life.invalidate();
  }
  observeVisibility(root, v => { visible = v; sync(); });
  document.addEventListener('visibilitychange', sync);
  window.addEventListener('resize', life.invalidate, { passive: true });
  if ('ResizeObserver' in window) new ResizeObserver(life.invalidate).observe(root);
  motion.subscribe(() => { activity(life.active); paint(); });
  return life;
}

export function init() {
  const demos = { 'triggered-linked': triggeredLinked, parallax, story, counters, native, velocity };
  runDemos(Object.fromEntries(Object.entries(demos).map(([key, fn]) => [key, root => {
    if (root.dataset.ready === 'true') return;
    fn(root); root.dataset.ready = 'true';
  }])));
}

function triggeredLinked(root) {
  const left = qs('[data-trigger-scroll]', root), right = qs('[data-linked-scroll]', root), slot = qs('[data-trigger-slot]', root);
  const box = qs('[data-trigger-box]', root), linked = qs('[data-linked-box]', root), status = qs('[data-trigger-status]', root);
  let seen = false, elapsed = 0, active = false, observer = null;
  function paintEntrance() {
    const p = motion.reduced ? 1 : ease(elapsed / 600);
    box.style.opacity = String(.12 + p * .88); box.style.transform = `translateY(${(1 - p) * 24}px)`;
    root.dataset.entrance = (elapsed / 600).toFixed(4);
  }
  const loop = createLoop(dt => {
    elapsed = Math.min(600, elapsed + dt * 1000); paintEntrance();
    if (elapsed === 600) { loop.stop(); status.textContent = 'Entrance complete · scrolling back does not rewind it.'; }
  });
  function intersects() {
    const a = left.getBoundingClientRect(), b = slot.getBoundingClientRect();
    const top = a.top + left.clientTop, bottom = top + left.clientHeight;
    return Math.max(0, Math.min(bottom, b.bottom) - Math.max(top, b.top)) >= b.height * .5;
  }
  function trigger() {
    if (seen || !active || !intersects()) return;
    seen = true; root.dataset.triggered = 'true';
    status.textContent = motion.reduced ? 'Threshold crossed · immediately visible with reduced motion.' : 'Threshold crossed · 600ms entrance running.';
    if (motion.reduced) { elapsed = 600; paintEntrance(); } else loop.start();
  }
  function paint() {
    const lp = fraction(left), rp = fraction(right);
    qs('[data-left-percent]', root).textContent = `${Math.round(lp * 100)}% scrolled`;
    qs('[data-right-percent]', root).textContent = `${Math.round(rp * 100)}% scrolled`;
    right.dataset.progress = rp.toFixed(5); left.dataset.progress = lp.toFixed(5);
    linked.style.transform = `translateY(${rp * 78}px) scale(${.7 + .3 * rp})`;
    if (motion.reduced && seen) { elapsed = 600; loop.stop(); }
    paintEntrance();
    // Geometry check also covers a resize while the observer's threshold ratio stays unchanged.
    trigger();
  }
  const life = watch(root, paint, value => {
    active = value;
    if (active && seen && elapsed < 600 && !motion.reduced) loop.start(); else loop.stop();
  });
  function observe() {
    observer?.disconnect();
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= .5)) trigger();
      }, { root: left, threshold: .5 });
      observer.observe(slot);
    }
  }
  left.addEventListener('scroll', life.invalidate, { passive: true }); right.addEventListener('scroll', life.invalidate, { passive: true });
  qs('[data-replay]', root).addEventListener('click', () => {
    loop.stop(); observer?.disconnect(); seen = false; elapsed = 0; root.dataset.triggered = 'false';
    left.scrollTop = 0; right.scrollTop = 0;
    status.textContent = 'Waiting for the halfway-visible threshold.'; paint(); observe();
  });
  root.dataset.triggered = 'false'; paint(); observe();
}

function parallax(root) {
  const scene = qs('[data-scene]', root), layers = qsa('[data-depth]', scene), slider = qs('[data-depth-speed]', root);
  function paint() {
    const rect = scene.getBoundingClientRect();
    const p = unit((innerHeight - rect.top) / (innerHeight + rect.height));
    const speed = Number(slider.value), offset = (p - .5) * 56 * speed;
    layers.forEach(layer => { layer.style.transform = motion.reduced ? 'none' : `translateY(${offset * Number(layer.dataset.depth)}px)`; });
    root.dataset.progress = p.toFixed(5);
    qs('[data-depth-out]', root).textContent = `${speed.toFixed(1)}×`;
    qs('[data-parallax-report]', root).textContent = `${Math.round(p * 100)}% page-local progress · ${motion.reduced ? 'static landscape' : `${speed.toFixed(1)}× relative depth`}`;
  }
  const life = watch(root, paint);
  window.addEventListener('scroll', life.invalidate, { passive: true });
  slider.addEventListener('input', paint); paint();
}

function story(root) {
  const steps = qsa('[data-story-step]', root), buttons = qsa('[data-jump]', root), bars = qsa('[data-story-bar]', root), values = qsa('[data-story-value]', root);
  const states = [[20, 35, 15], [55, 50, 40], [85, 70, 90]], names = ['Baseline', 'Revision', 'Review'];
  let reducedStep = 0;
  // On phones the sticky chart is above the passages; reserve its measured height in the reading line.
  const readingLine = () => Math.min(innerHeight - 80, 100 + (innerWidth <= 680 ? qs('[data-chart]', root).offsetHeight : 80));
  function paint() {
    const tops = steps.map(step => step.getBoundingClientRect().top), line = readingLine();
    let position;
    if (motion.reduced) position = reducedStep;
    else if (line <= tops[1]) position = unit((line - tops[0]) / Math.max(1, tops[1] - tops[0]));
    else position = 1 + unit((line - tops[1]) / Math.max(1, tops[2] - tops[1]));
    const index = Math.min(1, Math.floor(position)), f = position - index, nearest = Math.round(position);
    bars.forEach((bar, i) => { const value = lerp(states[index][i], states[index + 1][i], f); bar.style.transform = `scaleX(${value / 100})`; values[i].textContent = String(Math.round(value)); });
    root.dataset.progress = (position / 2).toFixed(5);
    buttons.forEach((button, i) => { if (i === nearest) button.setAttribute('aria-current', 'step'); else button.removeAttribute('aria-current'); });
    qs('[data-story-report]', root).textContent = motion.reduced || position === Math.round(position) ? `Step ${nearest + 1} · ${names[nearest]}${motion.reduced ? ' · static' : ''}` : `${names[index]} → ${names[index + 1]} · ${Math.round(f * 100)}% between states`;
  }
  const life = watch(root, paint);
  window.addEventListener('scroll', life.invalidate, { passive: true });
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    reducedStep = i;
    const heading = qs('h3', steps[i]);
    if (motion.reduced) heading.scrollIntoView({ block: 'center', behavior: 'instant' });
    else window.scrollTo({ top: window.scrollY + steps[i].getBoundingClientRect().top - readingLine(), behavior: 'instant' });
    heading.focus({ preventScroll: true }); paint();
  }));
  motion.subscribe(() => {
    // A live layout collapse must not strand focused content above or below the new viewport.
    if (root.contains(document.activeElement)) document.activeElement.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });
  paint();
}

function counters(root) {
  const rows = qsa('[data-counter]', root), status = qs('[data-counter-status]', root);
  let elapsed = 0, seen = false, running = false, active = false;
  function paint() {
    const p = motion.reduced ? 1 : ease(elapsed / 850);
    rows.forEach(row => {
      const target = Number(row.dataset.target), value = clamp(Math.round(target * p), 0, target);
      qs('[data-number]', row).textContent = String(value);
      qs('[data-value-bar]', row).style.transform = `scaleX(${value / 100})`;
    });
    root.dataset.time = String(elapsed); root.dataset.state = running ? active ? 'running' : 'suspended' : elapsed === 850 ? 'complete' : 'ready';
  }
  function finish() { elapsed = 850; running = false; loop.stop(); paint(); status.textContent = 'All known quantities revealed: 72 reading, 48 practice, 90 review.'; }
  const loop = createLoop(dt => { elapsed = Math.min(850, elapsed + dt * 1000); if (elapsed === 850) finish(); else paint(); });
  function replay() {
    seen = true; elapsed = 0; running = true; loop.stop(); status.textContent = 'Revealing the known study-plan quantities.';
    if (motion.reduced) finish(); else { paint(); if (active) loop.start(); }
  }
  watch(root, () => { if (motion.reduced && running) finish(); else paint(); }, value => {
    active = value;
    if (active && !seen) { if (motion.reduced) { seen = true; finish(); } else replay(); }
    else if (motion.reduced && running) finish();
    else if (active && running) loop.start(); else loop.stop();
  });
  qs('[data-replay]', root).addEventListener('click', replay);
  if (motion.reduced) { elapsed = 850; paint(); } else paint();
}

function native(root) {
  const source = qs('[data-native-scroll]', root), progress = qs('[data-native-progress]', root), card = qs('[data-native-card]', root), force = qs('[data-force-js]', root);
  const supported = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: scroll()') && CSS.supports('animation-range: 0% 100%');
  let engine = 'js', distance = 0;
  root.dataset.supported = String(supported);
  function report() {
    const p = fraction(source);
    root.dataset.progress = p.toFixed(5);
    qs('[data-native-report]', root).textContent = `${Math.round(p * 100)}% · ${engine === 'native' ? 'native CSS' : 'JavaScript fallback'}${motion.reduced ? ' · progress only' : ''}`;
    return p;
  }
  function paint() {
    distance = Math.max(0, Math.min(180, qs('.sc-native-pin', root).clientWidth - card.offsetWidth));
    root.style.setProperty('--sc-travel', `${distance}px`);
    root.dataset.travel = String(distance);
    const p = report();
    if (engine === 'js') {
      progress.style.transform = `scaleX(${p})`;
      card.style.transform = `translateX(${motion.reduced ? 0 : p * distance}px)`;
    }
  }
  function choose() {
    engine = supported && !force.checked ? 'native' : 'js';
    root.dataset.engine = engine;
    progress.style.transform = ''; card.style.transform = '';
    qs('[data-capability]', root).textContent = supported
      ? `Native timeline + range syntax supported · ${engine === 'native' ? 'using CSS scroll(nearest block)' : 'JS fallback forced for comparison'}.`
      : 'Native timeline + range syntax unavailable · using JavaScript fallback.';
    paint();
  }
  const life = watch(root, paint);
  // Native scroll events update only a textual measurement. No JS per-frame native pose driver.
  source.addEventListener('scroll', () => { if (engine === 'native') { if (life.active) report(); } else life.invalidate(); }, { passive: true });
  force.addEventListener('change', choose);
  qs('[data-replay]', root).addEventListener('click', () => { source.scrollTop = 0; paint(); });
  if ('ResizeObserver' in window) new ResizeObserver(life.invalidate).observe(source);
  choose();
}

function velocity(root) {
  const source = qs('[data-velocity-scroll]', root), cards = qsa('[data-velocity-card]', root), slider = qs('[data-sensitivity]', root), pause = qs('[data-pause]', root);
  let previous = source.scrollTop, speed = 0, paused = false, active = false;
  function paint() {
    const angle = motion.reduced || paused ? 0 : clamp(speed / 1000 * Number(slider.value), -8, 8);
    cards.forEach(card => { card.style.transform = `skewY(${angle}deg)`; });
    root.dataset.angle = angle.toFixed(4); root.dataset.velocity = speed.toFixed(2);
    qs('[data-velocity-report]', root).textContent = `${Math.round(speed)} px/s · ${angle.toFixed(1)}°${motion.reduced ? ' · reduced motion' : paused ? ' · paused' : ''}`;
    qs('[data-sensitivity-out]', root).textContent = `${slider.value}° per 1,000px/s`;
  }
  function reset() { loop.stop(); previous = source.scrollTop; speed = 0; paint(); }
  const loop = createLoop(dt => {
    const y = source.scrollTop, raw = dt > 0 ? (y - previous) / dt : 0; previous = y;
    speed = damp(speed, clamp(raw, -6000, 6000), 12, dt);
    if (Math.abs(speed) < .5 && raw === 0) { reset(); return; }
    paint();
  });
  watch(root, () => { if (motion.reduced || paused || !active) reset(); else paint(); }, value => { active = value; if (!value || motion.reduced || paused) reset(); else previous = source.scrollTop; });
  source.addEventListener('scroll', () => {
    if (active && !motion.reduced && !paused) loop.start(); else reset();
  }, { passive: true });
  slider.addEventListener('input', paint);
  pause.addEventListener('click', () => { paused = !paused; pause.setAttribute('aria-pressed', String(paused)); pause.textContent = paused ? 'Resume skew' : 'Pause skew'; reset(); });
  paint();
}
