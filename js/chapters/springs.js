/** Chapter 03. Each simulation owns its state and subscribes to the shared ticker. */
import { qs, qsa } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp } from '../core/motion.js';
import { Spring, springPosition, settleTime } from '../core/spring.js';
import { rubberBand, decayStep, projectMomentum } from '../core/physics.js';
import { easeInOutCubic } from '../core/easing.js';
import { PALETTE } from '../core/ui.js';
import { initSpringLab } from '../modules/spring-lab.js';
import { runDemos, onFirstView, togglePressed } from './shared.js';

export function init() {
  try { initSpringLab(); } catch (error) { console.error('[kinetic] spring lab failed', error); }
  runDemos({ interrupt, regimes, fling, rubber, gravity, chain });
}

function fitCanvas(canvas) {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const { width: w, height: h } = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}
function releaseVelocity(samples) {
  const recent = samples.filter(s => performance.now() - s.t < 120);
  if (recent.length < 2) return { vx: 0, vy: 0 };
  const a = recent[0], b = recent.at(-1), dt = Math.max((b.t - a.t) / 1000, 0.016);
  return { vx: clamp((b.x - a.x) / dt, -4000, 4000), vy: clamp((b.y - a.y) / dt, -4000, 4000) };
}
function sample(samples, x, y) {
  const t = performance.now();
  samples.push({ x, y, t });
  while (samples.length > 2 && t - samples[0].t > 120) samples.shift();
}
function unCapture(el, id) { if (id !== null && el.hasPointerCapture(id)) el.releasePointerCapture(id); }
/** Visibility does not reset state; callers decide whether to pause or settle. */
function visibility(root, changed) {
  let inView = true;
  const sync = () => changed(inView && !document.hidden);
  observeVisibility(root, value => { inView = value; sync(); });
  document.addEventListener('visibilitychange', sync);
}

function interrupt(root) {
  const area = qs('[data-interrupt-area]', root), auto = qs('[data-auto]', root);
  const lanes = ['tween', 'spring'].map(name => {
    const el = qs(`[data-lane="${name}"]`, root);
    return { track: qs('.lane__track', el), ball: qs('.lane__ball', el), marker: qs('.lane__target', el), canvas: qs('canvas', el), trace: [], color: name === 'tween' ? '#ff5a36' : '#45e3b8' };
  });
  const spring = new Spring({ stiffness: 170, damping: 20, precision: 0.05 });
  let width = 1, x = 0, from = 0, elapsed = 0.45, visible = true, autoTime = 0, index = 0;
  function paint(l, value, velocity) {
    l.ball.style.transform = `translateX(${value}px)`;
    l.marker.style.transform = `translateX(${spring.target}px)`;
    if (velocity !== null) { l.trace.push(velocity); if (l.trace.length > 150) l.trace.shift(); }
    const { ctx, w, h } = l;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(243,240,234,.15)'; ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
    ctx.strokeStyle = l.color; ctx.beginPath();
    l.trace.forEach((v, i) => { const px = i / 149 * w, py = h / 2 - clamp(v / 2600, -1, 1) * (h / 2 - 3); if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); });
    ctx.stroke();
  }
  function settle() {
    loop.stop(); x = spring.target; spring.set(x); elapsed = 0.45;
    lanes.forEach(l => { l.trace = [0]; paint(l, x, 0); });
  }
  function retarget(f) {
    from = x; elapsed = 0; spring.target = clamp(f) * width;
    paint(lanes[0], x, 0); paint(lanes[1], spring.value, spring.velocity);
    if (motion.reduced) settle(); else if (visible) loop.start();
  }
  const loop = createLoop(dt => {
    if (auto.getAttribute('aria-pressed') === 'true') {
      autoTime += dt;
      if (autoTime > 0.32) { autoTime = 0; retarget([0.85, 0.2, 0.65, 0.05][index++ % 4]); }
    }
    elapsed += dt;
    const t = clamp(elapsed / 0.45), distance = spring.target - from;
    x = from + distance * easeInOutCubic(t);
    const velocity = distance / 0.45 * (t < 0.5 ? 12 * t * t : 12 * (1 - t) ** 2);
    spring.step(dt); paint(lanes[0], x, velocity); paint(lanes[1], spring.value, spring.velocity);
    if (elapsed >= 0.45 && spring.isSettled() && auto.getAttribute('aria-pressed') !== 'true') loop.stop();
  });
  function measure() {
    width = Math.max(1, lanes[0].track.clientWidth - lanes[0].ball.offsetWidth - 10);
    lanes.forEach(l => Object.assign(l, fitCanvas(l.canvas)));
    x = clamp(x, 0, width); from = x; elapsed = 0;
    spring.value = clamp(spring.value, 0, width); spring.target = clamp(spring.target, 0, width);
    if (motion.reduced) settle(); else { lanes.forEach((l, i) => paint(l, i ? spring.value : x, null)); if (visible) loop.start(); }
  }
  area.addEventListener('pointerdown', e => { if (e.button === 0) retarget((e.clientX - lanes[0].track.getBoundingClientRect().left - 16) / width); });
  area.addEventListener('keydown', e => { if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); retarget(spring.target / width + (e.key === 'ArrowRight' ? 0.25 : -0.25)); });
  auto.addEventListener('click', () => {
    if (motion.reduced) { togglePressed(auto, false); retarget([0.2, 0.8][index++ % 2]); return; }
    togglePressed(auto); autoTime = 0; if (visible) loop.start();
  });
  visibility(root, value => { visible = value; if (!value) { loop.stop(); togglePressed(auto, false); } else if (!motion.reduced) loop.start(); });
  motion.subscribe(reduced => { if (reduced) { togglePressed(auto, false); settle(); } });
  measure(); new ResizeObserver(measure).observe(area);
  onFirstView(root, () => retarget(0.8));
  root.dataset.ready = 'true';
}

function regimes(root) {
  const span = 2.4;
  const columns = qsa('[data-zeta]', root).map(el => {
    const config = { stiffness: 170, mass: 1, damping: Number(el.dataset.zeta) * 2 * Math.sqrt(170) };
    qs('[data-damping]', el).textContent = config.damping.toFixed(1);
    qs('[data-settle]', el).textContent = `${settleTime(config, { threshold: 0.02 }).toFixed(2)}s`;
    const line = qs('.regime__rest-line', el);
    line.setAttribute('y1', 56 - 52 / 1.55); line.setAttribute('y2', 56 - 52 / 1.55);
    return { el, config, ball: qs('.regime__ball', el), track: qs('.regime__track', el), rest: qs('.regime__rest', el), path: qs('.regime__trace', el) };
  });
  let time = 0, visible = true;
  function paint() {
    columns.forEach(c => {
      const rest = (c.track.clientHeight - c.ball.offsetHeight - 8) * 0.62;
      const value = time >= span ? 1 : springPosition(time, c.config);
      c.ball.style.transform = `translateY(${value * rest}px)`;
      c.rest.style.transform = `translateY(${rest + c.ball.offsetHeight / 2}px)`;
      let d = '';
      for (let i = 0; i <= 100; i++) { const t = i / 100 * Math.min(time, span); d += `${i ? 'L' : 'M'}${t / span * 100} ${56 - springPosition(t, c.config) / 1.55 * 52}`; }
      c.path.setAttribute('d', d);
    });
  }
  const loop = createLoop(dt => { time = Math.min(span, time + dt); paint(); if (time >= span) loop.stop(); });
  function release() { loop.stop(); time = motion.reduced ? span : 0; paint(); if (!motion.reduced && visible) loop.start(); }
  qs('[data-play]', root).addEventListener('click', release);
  visibility(root, v => { visible = v; if (!v) loop.stop(); else if (time > 0 && time < span && !motion.reduced) loop.start(); });
  motion.subscribe(reduced => { if (reduced) { loop.stop(); time = span; paint(); } });
  paint(); new ResizeObserver(paint).observe(root); onFirstView(root, release);
  root.dataset.ready = 'true';
}

function fling(root) {
  const stage = qs('[data-fling-stage]', root), puck = qs('[data-puck]', root), ring = qs('[data-projection]', root);
  const snap = qs('[data-snap]', root), friction = qs('[data-friction]', root), readout = qs('[data-fling-readout]', root);
  const sx = new Spring({ stiffness: 190, damping: 22, precision: 0.3 }), sy = new Spring({ stiffness: 190, damping: 22, precision: 0.3 });
  const s = { x: 0, y: 0, vx: 0, vy: 0, mode: 'idle' };
  let w = 1, h = 1, points = [], drag = null, visible = true;
  const snapping = () => snap.getAttribute('aria-pressed') === 'true';
  const projection = () => ({ x: clamp(projectMomentum(s.x, s.vx, +friction.value), 24, w - 24), y: clamp(projectMomentum(s.y, s.vy, +friction.value), 24, h - 24) });
  function nearest(p) { return points.reduce((a, b) => Math.hypot(a.x - p.x, a.y - p.y) <= Math.hypot(b.x - p.x, b.y - p.y) ? a : b); }
  function bounds() {
    const x = clamp(s.x, 24, w - 24), y = clamp(s.y, 24, h - 24);
    if (x !== s.x) { s.vx = 0; sx.value = x; sx.velocity = 0; }
    if (y !== s.y) { s.vy = 0; sy.value = y; sy.velocity = 0; }
    s.x = x; s.y = y;
  }
  function render() {
    root.dataset.state = s.mode;
    puck.style.transform = `translate(${s.x}px, ${s.y}px)`;
    const p = s.mode === 'snap' ? { x: sx.target, y: sy.target } : projection();
    ring.style.transform = `translate(${p.x}px, ${p.y}px)`;
    ring.classList.toggle('is-visible', s.mode !== 'idle' && Math.hypot(s.vx, s.vy) > 30);
    const speed = Math.hypot(s.vx, s.vy);
    readout.textContent = `${s.mode} · ${Math.round(speed)} px/s · ${s.mode === 'snap' ? 'spring settling' : `free decay to 5 px/s ≈ ${Math.max(0, Math.log(Math.max(speed, 5) / 5) / +friction.value).toFixed(2)}s`}`;
  }
  function finishStatic() {
    const p = s.mode === 'snap' ? { x: sx.target, y: sy.target } : snapping() ? nearest(projection()) : projection();
    Object.assign(s, p, { vx: 0, vy: 0, mode: 'idle' }); bounds(); loop.stop(); render();
  }
  function launch() {
    if (snapping()) {
      const p = nearest(projection());
      Object.assign(sx, { value: s.x, velocity: s.vx, target: p.x }); Object.assign(sy, { value: s.y, velocity: s.vy, target: p.y }); s.mode = 'snap';
    } else s.mode = 'coast';
    if (motion.reduced) finishStatic(); else { render(); if (visible) loop.start(); }
  }
  const loop = createLoop(dt => {
    if (s.mode === 'snap') {
      s.x = sx.step(dt); s.y = sy.step(dt); s.vx = sx.velocity; s.vy = sy.velocity; bounds();
      if (sx.isSettled() && sy.isSettled()) s.mode = 'idle';
    } else if (s.mode === 'coast') {
      const x = decayStep(s.x, s.vx, +friction.value, dt), y = decayStep(s.y, s.vy, +friction.value, dt);
      Object.assign(s, { x: x.position, vx: x.velocity, y: y.position, vy: y.velocity });
      if (s.x < 24 || s.x > w - 24) { s.x = clamp(s.x, 24, w - 24); s.vx *= -0.55; }
      if (s.y < 24 || s.y > h - 24) { s.y = clamp(s.y, 24, h - 24); s.vy *= -0.55; }
      if (Math.hypot(s.vx, s.vy) < 5) { s.vx = s.vy = 0; s.mode = 'idle'; }
    }
    render(); if (s.mode === 'idle') loop.stop();
  });
  function end(cancel = false) {
    if (!drag) return;
    const d = drag; drag = null; unCapture(puck, d.id); puck.classList.remove('is-dragging');
    if (cancel) { Object.assign(s, d.origin, { vx: 0, vy: 0, mode: 'idle' }); bounds(); render(); }
    else { Object.assign(s, releaseVelocity(d.samples)); launch(); }
  }
  puck.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    loop.stop(); const rect = stage.getBoundingClientRect();
    drag = { id: e.pointerId, dx: s.x - (e.clientX - rect.left), dy: s.y - (e.clientY - rect.top), origin: { x: s.x, y: s.y }, samples: [] };
    sample(drag.samples, s.x, s.y); s.vx = s.vy = 0; s.mode = 'drag'; puck.setPointerCapture(e.pointerId); puck.classList.add('is-dragging'); render();
  });
  puck.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    const rect = stage.getBoundingClientRect(); s.x = e.clientX - rect.left + drag.dx; s.y = e.clientY - rect.top + drag.dy; bounds();
    // All samples use the bounded puck position in stage coordinates.
    sample(drag.samples, s.x, s.y);
    Object.assign(s, releaseVelocity(drag.samples)); render();
  });
  puck.addEventListener('pointerup', e => { if (drag?.id === e.pointerId) end(); });
  ['pointercancel', 'lostpointercapture'].forEach(type => puck.addEventListener(type, e => { if (drag?.id === e.pointerId) end(true); }));
  root.addEventListener('keydown', e => {
    if (e.key === 'Escape') { end(true); loop.stop(); s.vx = s.vy = 0; s.mode = 'idle'; render(); }
    if (e.target !== puck) return;
    const v = { ArrowLeft: [-1400, 0], ArrowRight: [1400, 0], ArrowUp: [0, -1000], ArrowDown: [0, 1000] }[e.key];
    if (v) { e.preventDefault(); end(true); [s.vx, s.vy] = v; launch(); }
  });
  snap.addEventListener('click', () => { stage.classList.toggle('is-snapping', togglePressed(snap)); if (['snap', 'coast'].includes(s.mode)) launch(); });
  friction.addEventListener('input', () => { qs('[data-friction-out]', root).textContent = (+friction.value).toFixed(1); render(); });
  qs('[data-reset]', root).addEventListener('click', () => { end(true); loop.stop(); Object.assign(s, points[0], { vx: 0, vy: 0, mode: 'idle' }); render(); });
  function layout() {
    end(true); loop.stop(); w = Math.max(48, stage.clientWidth); h = Math.max(48, stage.clientHeight);
    points = qsa('[data-target]', root).map((el, i) => { const p = { x: w * (0.2 + i * 0.3), y: h / 2 }; el.style.transform = `translate(${p.x}px, ${p.y}px)`; return p; });
    if (!s.x) Object.assign(s, points[0]); bounds(); s.vx = s.vy = 0; s.mode = 'idle'; render();
  }
  layout(); new ResizeObserver(layout).observe(stage);
  visibility(root, v => { visible = v; if (!v) { end(true); loop.stop(); } else if (s.mode !== 'idle' && !motion.reduced) loop.start(); });
  motion.subscribe(reduced => { if (reduced && !drag) finishStatic(); });
  root.dataset.ready = 'true';
}

function rubber(root) {
  const viewport = qs('[data-rb-viewport]', root), list = qs('[data-rb-list]', root), toggle = qs('[data-rb-toggle]', root), readout = qs('[data-rb-readout]', root);
  const spring = new Spring({ stiffness: 170, damping: 24, precision: 0.2 });
  let offset = 0, velocity = 0, min = 0, height = 1, mode = 'idle', drag = null, visible = true;
  const enabled = () => toggle.getAttribute('aria-pressed') === 'true';
  function render(raw = offset) {
    list.style.transform = `translateY(${offset}px)`;
    root.dataset.offset = offset.toFixed(3); root.dataset.min = String(min); root.dataset.state = mode;
    const excess = raw - clamp(raw, min, 0), shown = offset - clamp(offset, min, 0);
    readout.textContent = `offset ${Math.round(offset)}px · pulled ${Math.round(Math.abs(excess))}px past edge → displayed ${Math.round(Math.abs(shown))}px`;
  }
  function hardStop() { loop.stop(); offset = clamp(offset, min, 0); velocity = 0; spring.set(offset); mode = drag ? 'drag' : 'idle'; render(); }
  function returnTo(target) { Object.assign(spring, { value: offset, velocity, target }); mode = 'spring'; if (visible) loop.start(); }
  const loop = createLoop(dt => {
    if (mode === 'coast') {
      const next = decayStep(offset, velocity, 5, dt); offset = next.position; velocity = next.velocity;
      if (offset > 0 || offset < min) { if (enabled()) returnTo(clamp(offset, min, 0)); else hardStop(); }
      else if (Math.abs(velocity) < 5) { velocity = 0; mode = 'idle'; }
    }
    if (mode === 'spring') { offset = spring.step(dt); velocity = spring.velocity; if (spring.isSettled()) mode = 'idle'; }
    render(); if (mode === 'idle') loop.stop();
  });
  function end(cancel = false) {
    if (!drag) return;
    const d = drag; drag = null; unCapture(viewport, d.id); viewport.classList.remove('is-dragging');
    if (cancel) { offset = d.origin; hardStop(); return; }
    velocity = releaseVelocity(d.samples).vy;
    if (motion.reduced) { if (offset >= min && offset <= 0) offset += velocity / 5; hardStop(); }
    else if (offset > 0 || offset < min) { if (enabled()) returnTo(clamp(offset, min, 0)); else hardStop(); }
    else { mode = 'coast'; if (visible) loop.start(); }
    render();
  }
  viewport.addEventListener('pointerdown', e => {
    if (e.button !== 0 || drag) return;
    loop.stop(); velocity = 0; mode = 'drag';
    const edge = clamp(offset, min, 0), shown = offset - edge;
    // Inverse of rubberBand, not a second application of compression.
    const raw = edge + shown * height / (0.55 * Math.max(0.01, height - Math.abs(shown)));
    drag = { id: e.pointerId, startY: e.clientY, currentY: e.clientY, startRaw: raw, origin: offset, samples: [] };
    sample(drag.samples, 0, offset); viewport.setPointerCapture(e.pointerId); viewport.classList.add('is-dragging'); render(raw);
  });
  viewport.addEventListener('pointermove', e => {
    if (drag?.id !== e.pointerId) return;
    drag.currentY = e.clientY;
    const raw = drag.startRaw + e.clientY - drag.startY, edge = clamp(raw, min, 0);
    offset = edge + (enabled() ? rubberBand(raw - edge, height) : 0);
    sample(drag.samples, 0, offset); render(raw);
  });
  viewport.addEventListener('pointerup', e => { if (drag?.id === e.pointerId) end(); });
  ['pointercancel', 'lostpointercapture'].forEach(type => viewport.addEventListener(type, e => { if (drag?.id === e.pointerId) end(true); }));
  viewport.addEventListener('keydown', e => {
    if (e.key === 'Escape') { end(true); hardStop(); return; }
    const target = { ArrowDown: offset - 90, ArrowUp: offset + 90, Home: 0, End: min }[e.key];
    if (target === undefined) return;
    e.preventDefault(); end(true); velocity = 0;
    if (motion.reduced) { offset = clamp(target, min, 0); hardStop(); } else returnTo(clamp(target, min, 0));
  });
  toggle.addEventListener('click', () => {
    togglePressed(toggle);
    if (!enabled()) hardStop();
    if (drag) {
      const edge = clamp(offset, min, 0), shown = offset - edge;
      drag.startRaw = edge + shown * height / (0.55 * Math.max(0.01, height - Math.abs(shown)));
      drag.startY = drag.currentY; drag.origin = clamp(drag.origin, min, 0); drag.samples = []; sample(drag.samples, 0, offset);
    }
    render();
  });
  function measure() { end(true); height = Math.max(1, viewport.clientHeight); min = Math.min(0, height - list.scrollHeight); hardStop(); }
  measure(); new ResizeObserver(measure).observe(viewport);
  visibility(root, v => { visible = v; if (!v) { end(true); hardStop(); } });
  motion.subscribe(reduced => { if (reduced && !drag) hardStop(); });
  root.dataset.ready = 'true';
}

function gravity(root) {
  const canvas = qs('[data-gravity-canvas]', root), slider = qs('[data-restitution]', root), pause = qs('[data-pause]', root), status = qs('[data-gravity-status]', root);
  const balls = []; let view, accumulator = 0, visible = true, paused = false, sleepy = 0;
  const STEP = 1 / 120;
  function bound(b) { b.x = clamp(b.x, b.r, Math.max(b.r, view.w - b.r)); b.y = clamp(b.y, b.r, Math.max(b.r, view.h - b.r)); }
  function staticLayout() {
    const cols = Math.max(1, Math.floor(view.w / 44));
    balls.forEach((b, i) => { b.x = 22 + i % cols * 44; b.y = view.h - 22 - Math.floor(i / cols) * 44; b.vx = b.vy = b.squash = 0; bound(b); });
  }
  function draw() {
    const { ctx, w, h } = view; ctx.clearRect(0, 0, w, h); ctx.fillStyle = 'rgba(243,240,234,.15)'; ctx.fillRect(0, h - 1, w, 1);
    balls.forEach(b => { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(b.angle); ctx.scale(1 - b.squash, 1 + b.squash * 0.7); ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, Math.PI * 2); ctx.fill(); ctx.restore(); });
    canvas.dataset.positions = JSON.stringify(balls.map(({ x, y, r }) => ({ x, y, r })));
    qs('[data-ball-count]', root).textContent = String(balls.length);
  }
  function sync() {
    const running = visible && !paused && !motion.reduced && balls.length > 0;
    if (running) loop.start(); else { loop.stop(); accumulator = 0; }
    pause.disabled = motion.reduced;
    pause.textContent = paused ? 'Resume' : 'Pause'; pause.setAttribute('aria-pressed', String(paused));
    root.dataset.state = motion.reduced ? 'static' : paused ? 'paused' : running ? 'running' : 'idle';
    status.textContent = motion.reduced ? 'Static arrangement · motion reduced' : paused ? 'Paused' : !visible ? 'Paused out of view' : balls.length ? 'Simulation active · Pause stops stacks' : 'Ready';
  }
  function impact(b, speed, angle) { if (speed > 160) { b.squash = Math.min(0.32, speed / 3200); b.angle = angle; } }
  function physics() {
    const e = +slider.value;
    balls.forEach(b => {
      b.vy += 1800 * STEP; b.x += b.vx * STEP; b.y += b.vy * STEP;
      if (b.y > view.h - b.r) { impact(b, Math.abs(b.vy), Math.PI / 2); b.vy = Math.abs(b.vy) < 60 ? 0 : -Math.abs(b.vy) * e; b.vx *= 0.985; }
      if (b.y < b.r) b.vy = Math.abs(b.vy) * e;
      if (b.x < b.r || b.x > view.w - b.r) { impact(b, Math.abs(b.vx), 0); b.vx = (b.x < b.r ? 1 : -1) * Math.abs(b.vx) * e; }
      bound(b); b.squash = Math.max(0, b.squash - STEP * 3.2);
    });
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), overlap = a.r + b.r - d;
        if (overlap <= 0) continue;
        const nx = d > 0.0001 ? dx / d : 1, ny = d > 0.0001 ? dy / d : 0, total = a.m + b.m;
        a.x -= nx * overlap * b.m / total; a.y -= ny * overlap * b.m / total;
        b.x += nx * overlap * a.m / total; b.y += ny * overlap * a.m / total;
        const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vn < 0) {
          const impulse = -(1 + e) * vn / (1 / a.m + 1 / b.m);
          a.vx -= impulse * nx / a.m; a.vy -= impulse * ny / a.m; b.vx += impulse * nx / b.m; b.vy += impulse * ny / b.m;
          impact(a, -vn, Math.atan2(ny, nx)); impact(b, -vn, Math.atan2(ny, nx));
        }
        bound(a); bound(b);
      }
    }
  }
  const loop = createLoop(dt => {
    accumulator += Math.min(dt, 0.05);
    while (accumulator >= STEP) { physics(); accumulator -= STEP; }
    draw();
    const quiet = balls.every(b => Math.hypot(b.vx, b.vy) < 4 && b.squash === 0);
    sleepy = quiet ? sleepy + dt : 0;
    if (sleepy > 0.7) { loop.stop(); root.dataset.state = 'settled'; status.textContent = 'Settled'; }
  });
  function spawn(x, y) {
    const r = 12 + balls.length % 3 * 4;
    balls.push({ x, y, r, m: r * r, vx: 0, vy: 0, squash: 0, angle: Math.PI / 2, color: PALETTE[balls.length % PALETTE.length] });
    if (balls.length > 14) balls.shift(); balls.forEach(bound); sleepy = 0;
    if (motion.reduced) staticLayout(); draw(); sync();
  }
  canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; const rect = canvas.getBoundingClientRect(); spawn(e.clientX - rect.left, e.clientY - rect.top); });
  canvas.addEventListener('keydown', e => { if (['Enter', ' '].includes(e.key)) { e.preventDefault(); spawn(view.w / 2, view.h * 0.15); } });
  pause.addEventListener('click', () => { paused = !paused; sync(); });
  qs('[data-clear]', root).addEventListener('click', () => { balls.length = 0; sleepy = accumulator = 0; loop.stop(); draw(); sync(); });
  slider.addEventListener('input', () => { qs('[data-restitution-out]', root).textContent = (+slider.value).toFixed(2); sleepy = 0; sync(); });
  function measure() { view = fitCanvas(canvas); if (motion.reduced) staticLayout(); else balls.forEach(bound); draw(); }
  measure(); new ResizeObserver(measure).observe(canvas);
  visibility(root, v => { visible = v; sync(); });
  motion.subscribe(reduced => { if (reduced) staticLayout(); else paused = true; draw(); sync(); });
  onFirstView(root, () => { if (!balls.length) [0.3, 0.55, 0.75].forEach(f => spawn(view.w * f, view.h * 0.15)); });
  root.dataset.ready = 'true';
}

function chain(root) {
  const canvas = qs('[data-chain-canvas]', root), k = qs('[data-chain-stiffness]', root), c = qs('[data-chain-damping]', root);
  const links = Array.from({ length: 12 }, () => ({ x: new Spring({ precision: 0.08 }), y: new Spring({ precision: 0.08 }) }));
  let view, visible = true, initialized = false;
  const pointer = { x: 0, y: 0 };
  function draw() {
    const { ctx, w, h } = view; ctx.clearRect(0, 0, w, h); ctx.lineWidth = 2;
    links.forEach((l, i) => {
      ctx.fillStyle = i % 2 ? '#8b7bff' : '#45e3b8'; ctx.globalAlpha = 1 - i / 18;
      if (i) { ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.moveTo(links[i - 1].x.value, links[i - 1].y.value); ctx.lineTo(l.x.value, l.y.value); ctx.stroke(); }
      ctx.beginPath(); ctx.arc(l.x.value, l.y.value, 10 - i * 0.5, 0, Math.PI * 2); ctx.fill();
    }); ctx.globalAlpha = 1;
    canvas.dataset.target = `${pointer.x.toFixed(1)},${pointer.y.toFixed(1)}`;
  }
  function staticPose() { links.forEach((l, i) => { l.x.set(clamp(pointer.x - i * 6, 10, view.w - 10)); l.y.set(pointer.y); }); draw(); }
  const loop = createLoop(dt => {
    const steps = Math.max(1, Math.ceil(dt / (1 / 120)));
    for (let step = 0; step < steps; step++) links.forEach((l, i) => {
      l.x.target = i ? links[i - 1].x.value : pointer.x; l.y.target = i ? links[i - 1].y.value : pointer.y;
      l.x.step(dt / steps); l.y.step(dt / steps);
      l.x.value = clamp(l.x.value, 10, view.w - 10); l.y.value = clamp(l.y.value, 10, view.h - 10);
    });
    draw(); if (links.every(l => l.x.isSettled() && l.y.isSettled())) loop.stop();
  });
  function update() { pointer.x = clamp(pointer.x, 10, view.w - 10); pointer.y = clamp(pointer.y, 10, view.h - 10); if (motion.reduced) { loop.stop(); staticPose(); } else if (visible) loop.start(); draw(); }
  canvas.addEventListener('pointermove', e => { const rect = canvas.getBoundingClientRect(); pointer.x = e.clientX - rect.left; pointer.y = e.clientY - rect.top; update(); });
  canvas.addEventListener('keydown', e => {
    const delta = { ArrowLeft: [-24, 0], ArrowRight: [24, 0], ArrowUp: [0, -24], ArrowDown: [0, 24] }[e.key];
    if (!delta && e.key !== 'Home') return; e.preventDefault();
    if (delta) { pointer.x += delta[0]; pointer.y += delta[1]; } else { pointer.x = view.w / 2; pointer.y = view.h / 2; } update();
  });
  function configure() { qs('[data-chain-stiffness-out]', root).textContent = k.value; qs('[data-chain-damping-out]', root).textContent = (+c.value).toFixed(1); links.forEach(l => { l.x.configure({ stiffness: +k.value, damping: +c.value }); l.y.configure({ stiffness: +k.value, damping: +c.value }); }); if (view) update(); }
  function measure() { view = fitCanvas(canvas); if (!initialized) { pointer.x = view.w / 2; pointer.y = view.h / 2; initialized = true; } links.forEach(l => { l.x.set(clamp(l.x.value || pointer.x, 10, view.w - 10)); l.y.set(clamp(l.y.value || pointer.y, 10, view.h - 10)); }); update(); }
  k.addEventListener('input', configure); c.addEventListener('input', configure); configure(); measure();
  new ResizeObserver(measure).observe(canvas); visibility(root, v => { visible = v; if (v) update(); else loop.stop(); }); motion.subscribe(update);
  root.dataset.ready = 'true';
}
