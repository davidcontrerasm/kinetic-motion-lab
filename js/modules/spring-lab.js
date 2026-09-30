/**
 * Spring lab: a draggable, throwable weight on a 2D spring with live
 * stiffness / damping / mass controls, analytic readouts and an oscilloscope.
 */
import { qs, qsa } from '../core/dom.js';
import { Spring, springPresets, dampingRatio, dampingRegime, naturalFrequency, settleTime } from '../core/spring.js';
import { motion, createLoop, observeVisibility, clamp, lerp } from '../core/motion.js';
import { syncRange } from '../core/ui.js';

const HISTORY_SECONDS = 4;
const PARAMS = ['stiffness', 'damping', 'mass'];

export function initSpringLab() {
  const root = qs('[data-spring-lab]');
  if (!root) return;
  const canvas = qs('[data-spring-canvas]', root);
  const graph = qs('[data-spring-graph]', root);
  const ctx = canvas?.getContext('2d');
  const gctx = graph?.getContext('2d');
  if (!ctx || !gctx) return;

  const inputs = Object.fromEntries(qsa('[data-param]', root).map((el) => [el.dataset.param, el]));
  const outputs = Object.fromEntries(qsa('[data-param-out]', root).map((el) => [el.dataset.paramOut, el]));
  const presetButtons = qsa('[data-spring-preset]', root);
  const readout = {
    zeta: qs('[data-readout-zeta]', root),
    regime: qs('[data-readout-regime]', root),
    omega: qs('[data-readout-omega]', root),
    settle: qs('[data-readout-settle]', root),
  };
  const kick = qs('[data-spring-kick]', root);

  const css = getComputedStyle(document.documentElement);
  const colors = {
    paper: css.getPropertyValue('--paper').trim() || '#f3f0ea',
    accent: css.getPropertyValue('--accent').trim() || '#ff5a36',
    iris: css.getPropertyValue('--iris').trim() || '#8b7bff',
  };

  const config = { ...springPresets.wobbly };
  const sx = new Spring({ ...config, precision: 0.02 });
  const sy = new Spring({ ...config, precision: 0.02 });
  const view = { w: 0, h: 0, dpr: 1, anchorX: 0, anchorY: 40, restX: 0, restY: 0, gw: 0, gh: 0, peak: 60 };
  const history = [];
  const trail = [];
  const drag = { active: false, id: null, offsetX: 0, offsetY: 0, samples: [] };
  let time = 0;
  let introduced = false;

  const radius = () => 14 + config.mass * 6;
  const bob = () => ({ x: view.restX + sx.value, y: view.restY + sy.value });

  function formatParam(key, value) {
    return key === 'stiffness' ? String(Math.round(value)) : String(Number(value.toFixed(1)));
  }

  function applyConfig({ updateInputs = false } = {}) {
    sx.configure(config);
    sy.configure(config);
    for (const key of PARAMS) {
      if (updateInputs && inputs[key]) {
        inputs[key].value = String(config[key]);
        syncRange(inputs[key]);
      }
      if (outputs[key]) outputs[key].textContent = formatParam(key, config[key]);
    }
    const regime = dampingRegime(config, 0.02);
    readout.zeta.textContent = dampingRatio(config).toFixed(2);
    readout.regime.textContent = regime[0].toUpperCase() + regime.slice(1);
    readout.regime.dataset.regime = regime;
    readout.omega.textContent = `${naturalFrequency(config).toFixed(1)} rad/s`;
    const settle = settleTime(config, { threshold: 0.02, maxTime: 20 });
    readout.settle.textContent = settle >= 20 ? '> 20 s' : `${settle.toFixed(2)} s`;
    presetButtons.forEach((button) => {
      const preset = springPresets[button.dataset.springPreset];
      const match = PARAMS.every((key) => Math.abs(preset[key] - config[key]) < 1e-6);
      button.setAttribute('aria-pressed', String(match));
    });
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    view.w = rect.width;
    view.h = rect.height;
    view.dpr = dpr;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    view.anchorX = view.w / 2;
    view.anchorY = 40;
    view.restX = view.w / 2;
    view.restY = Math.min(view.h * 0.56, view.anchorY + 280);
    const grect = graph.getBoundingClientRect();
    view.gw = grect.width;
    view.gh = grect.height;
    graph.width = Math.max(1, Math.round(grect.width * dpr));
    graph.height = Math.max(1, Math.round(grect.height * dpr));
    draw();
    drawGraph();
  }

  function impulse(vx, vy) {
    if (motion.reduced) {
      sx.value += vx / 30;
      sy.value += vy / 30;
      sx.velocity = sy.velocity = 0;
      constrain();
      trail.length = 0;
      draw();
      drawGraph();
      return;
    }
    sx.velocity += vx;
    sy.velocity += vy;
  }

  /** Soft walls: the weight bounces off the stage edges instead of leaving it. */
  function constrain() {
    const r = radius();
    const limits = [
      [sx, r - view.restX, view.w - r - view.restX],
      [sy, r - view.restY, view.h - r - view.restY],
    ];
    for (const [spring, min, max] of limits) {
      if (spring.value < min) {
        spring.value = min;
        spring.velocity = Math.abs(spring.velocity) * 0.6;
      } else if (spring.value > max) {
        spring.value = max;
        spring.velocity = -Math.abs(spring.velocity) * 0.6;
      }
    }
  }

  function drawCoil(ax, ay, bx, by) {
    const dx = bx - ax;
    const dy = by - ay;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const ux = dx / length;
    const uy = dy / length;
    const nx = -uy;
    const ny = ux;
    const rest = Math.max(view.restY - view.anchorY - radius(), 1);
    const lead = 16;
    const body = Math.max(length - lead * 2, 1);
    const turns = 11;
    const amplitude = clamp(13 * Math.sqrt(rest / length), 4, 24);
    const tension = clamp((length - rest) / rest, 0, 1);
    const mix = (a, b) => Math.round(lerp(a, b, tension));

    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax + ux * lead, ay + uy * lead);
    const steps = 180;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const envelope = Math.min(1, t / 0.06, (1 - t) / 0.06);
      const offset = Math.sin(t * turns * Math.PI * 2) * amplitude * envelope;
      ctx.lineTo(ax + ux * (lead + body * t) + nx * offset, ay + uy * (lead + body * t) + ny * offset);
    }
    ctx.lineTo(bx, by);
    // Stretched springs blush toward the accent colour.
    ctx.strokeStyle = `rgb(${mix(243, 255)}, ${mix(240, 90)}, ${mix(234, 54)})`;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }

  function draw() {
    const { w, h, dpr } = view;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = 'rgba(243, 240, 234, 0.07)';
    for (let x = 18; x < w; x += 28) for (let y = 18; y < h; y += 28) ctx.fillRect(x, y, 1.2, 1.2);

    const r = radius();
    ctx.setLineDash([4, 6]);
    ctx.strokeStyle = 'rgba(243, 240, 234, 0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(view.restX, view.restY, r + 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(243, 240, 234, 0.12)';
    ctx.fillRect(view.anchorX - 44, view.anchorY - 16, 88, 6);
    ctx.fillStyle = colors.paper;
    ctx.beginPath();
    ctx.arc(view.anchorX, view.anchorY, 5, 0, Math.PI * 2);
    ctx.fill();

    trail.forEach((point, i) => {
      const k = i / trail.length;
      ctx.fillStyle = `rgba(255, 90, 54, ${(k * 0.22).toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(point.x, point.y, r * (0.3 + 0.7 * k), 0, Math.PI * 2);
      ctx.fill();
    });

    const b = bob();
    const toAnchor = Math.atan2(view.anchorY - b.y, view.anchorX - b.x);
    drawCoil(view.anchorX, view.anchorY, b.x + Math.cos(toAnchor) * r * 0.9, b.y + Math.sin(toAnchor) * r * 0.9);

    // The weight squashes along its velocity.
    const speed = Math.hypot(sx.velocity, sy.velocity);
    const stretch = drag.active ? 0 : Math.min(speed / 4000, 0.28);
    const angle = Math.atan2(sy.velocity, sx.velocity);
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(angle);
    ctx.scale(1 + stretch, 1 - stretch * 0.6);
    ctx.rotate(-angle);
    const gradient = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
    gradient.addColorStop(0, '#ff9f84');
    gradient.addColorStop(0.55, colors.accent);
    gradient.addColorStop(1, '#b8341a');
    ctx.shadowColor = 'rgba(255, 90, 54, 0.55)';
    ctx.shadowBlur = drag.active ? 40 : 22;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawGraph() {
    const { gw: w, gh: h, dpr } = view;
    gctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    gctx.clearRect(0, 0, w, h);
    gctx.strokeStyle = 'rgba(243, 240, 234, 0.12)';
    gctx.lineWidth = 1;
    gctx.beginPath();
    gctx.moveTo(0, h / 2);
    gctx.lineTo(w, h / 2);
    gctx.stroke();
    if (history.length < 2) return;

    let peak = 60;
    for (const sample of history) peak = Math.max(peak, Math.abs(sample.x), Math.abs(sample.y));
    view.peak = Math.max(peak, view.peak * 0.985); // ease the scale down, snap it up
    const scale = (h / 2 - 6) / view.peak;
    const now = history[history.length - 1].t;

    for (const [key, color] of [
      ['x', colors.iris],
      ['y', colors.accent],
    ]) {
      gctx.strokeStyle = color;
      gctx.lineWidth = 1.6;
      gctx.beginPath();
      history.forEach((sample, i) => {
        const x = w - ((now - sample.t) / HISTORY_SECONDS) * w;
        const y = h / 2 + sample[key] * scale;
        if (i === 0) gctx.moveTo(x, y);
        else gctx.lineTo(x, y);
      });
      gctx.stroke();
    }
  }

  const loop = createLoop((dt) => {
    if (!drag.active) {
      sx.step(dt);
      sy.step(dt);
      constrain();
    }
    time += dt;
    history.push({ t: time, x: sx.value, y: sy.value });
    while (history.length && time - history[0].t > HISTORY_SECONDS) history.shift();
    trail.push(bob());
    if (trail.length > 16) trail.shift();
    draw();
    drawGraph();
  });

  const local = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const p = local(event);
    const b = bob();
    drag.active = true;
    drag.id = event.pointerId;
    // Grab from anywhere; the weight keeps its offset so it never jumps.
    drag.offsetX = b.x - p.x;
    drag.offsetY = b.y - p.y;
    drag.samples = [{ x: p.x, y: p.y, t: performance.now() }];
    canvas.setPointerCapture(event.pointerId);
    root.classList.add('is-dragging');
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!drag.active || event.pointerId !== drag.id) return;
    const p = local(event);
    const r = radius();
    sx.value = clamp(p.x + drag.offsetX, r, view.w - r) - view.restX;
    sy.value = clamp(p.y + drag.offsetY, r, view.h - r) - view.restY;
    sx.velocity = 0;
    sy.velocity = 0;
    const now = performance.now();
    drag.samples.push({ x: p.x, y: p.y, t: now });
    while (drag.samples.length > 2 && now - drag.samples[0].t > 100) drag.samples.shift();
    if (motion.reduced) draw();
  });

  const release = (event) => {
    if (!drag.active || event.pointerId !== drag.id) return;
    drag.active = false;
    drag.id = null;
    root.classList.remove('is-dragging');
    if (motion.reduced) {
      sx.set(0);
      sy.set(0);
      draw();
      return;
    }
    // Throw: release velocity comes from the last ~100ms of pointer movement.
    const now = performance.now();
    const recent = drag.samples.filter((sample) => now - sample.t < 120);
    if (recent.length > 1) {
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = Math.max((b.t - a.t) / 1000, 0.016);
      sx.velocity = clamp((b.x - a.x) / dt, -4000, 4000);
      sy.velocity = clamp((b.y - a.y) / dt, -4000, 4000);
    }
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('keydown', (event) => {
    const pushes = { ArrowLeft: [-700, 0], ArrowRight: [700, 0], ArrowUp: [0, -700], ArrowDown: [0, 700] };
    const push = pushes[event.key];
    if (!push) return;
    event.preventDefault();
    impulse(push[0], push[1]);
  });

  PARAMS.forEach((key) => {
    inputs[key]?.addEventListener('input', () => {
      config[key] = Number(inputs[key].value);
      applyConfig();
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => {
      Object.assign(config, springPresets[button.dataset.springPreset]);
      applyConfig({ updateInputs: true });
      impulse(0, -900);
    });
  });

  kick?.addEventListener('click', () => {
    const side = Math.random() < 0.5 ? -1 : 1;
    impulse(side * (900 + Math.random() * 900), -(600 + Math.random() * 900));
  });

  applyConfig({ updateInputs: true });
  resize();
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    observer.observe(graph);
  } else {
    window.addEventListener('resize', resize);
  }

  let visible = false;
  motion.subscribe((reduced) => {
    if (reduced) {
      loop.stop();
      sx.set(0);
      sy.set(0);
      trail.length = 0;
      history.length = 0;
      draw();
      drawGraph();
    } else if (visible) loop.start();
  });
  observeVisibility(
    root,
    (inView) => {
      visible = inView;
      if (!visible || motion.reduced) {
        loop.stop();
        draw();
        return;
      }
      loop.start();
      if (!introduced && !motion.reduced) {
        // First appearance: release the weight from off-centre so it demonstrates itself.
        introduced = true;
        sx.value = Math.min(150, view.w * 0.25);
        sy.value = -40;
      }
    },
    { rootMargin: '100px' },
  );
}
