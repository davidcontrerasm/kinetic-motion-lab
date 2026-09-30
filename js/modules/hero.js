/**
 * Hero: a spring-driven dot field that parts around the pointer and ripples on
 * click, plus a variable-font headline whose weight and width swell near the
 * cursor. Touch devices get a drifting "ghost pointer" instead.
 */
import { qs, splitText } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp, damp, lerp, finePointer } from '../core/motion.js';

export function initHero() {
  const hero = qs('[data-hero]');
  if (!hero) return;
  const field = createDotField(qs('[data-hero-field]', hero), hero);
  const title = createProximityTitle(qs('[data-hero-title]', hero), hero);
  const readouts = createReadouts(hero);

  const loop = createLoop((dt, now) => {
    field?.update(dt, now);
    title?.update(dt, now);
    readouts.update(dt);
  });
  observeVisibility(hero, (visible) => (visible ? loop.start() : loop.stop()));
  motion.subscribe(() => {
    field?.drawStatic();
    title?.reset();
  });
}

function createDotField(canvas, host) {
  if (!canvas) return null;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff5a36';
  const RADIUS = 150;
  const STIFFNESS = 90;
  const DAMPING = 11;
  const mouse = { x: -9999, y: -9999, active: false };
  const ripples = [];
  let width = 0;
  let height = 0;
  let count = 0;
  let hx = new Float32Array(0);
  let hy = new Float32Array(0);
  let ox = new Float32Array(0);
  let oy = new Float32Array(0);
  let vx = new Float32Array(0);
  let vy = new Float32Array(0);

  function resize() {
    const rect = host.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const spacing = width < 720 ? 24 : 30;
    const cols = Math.floor(width / spacing) + 2;
    const rows = Math.floor(height / spacing) + 2;
    const startX = (width - (cols - 1) * spacing) / 2;
    const startY = (height - (rows - 1) * spacing) / 2;
    count = cols * rows;
    hx = new Float32Array(count);
    hy = new Float32Array(count);
    ox = new Float32Array(count);
    oy = new Float32Array(count);
    vx = new Float32Array(count);
    vy = new Float32Array(count);
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        hx[i] = startX + c * spacing;
        hy[i] = startY + r * spacing;
        i++;
      }
    }
    drawStatic();
  }

  function render() {
    ctx.clearRect(0, 0, width, height);
    // Three intensity buckets keep this to three fill calls per frame.
    const buckets = [new Path2D(), new Path2D(), new Path2D()];
    for (let i = 0; i < count; i++) {
      const displacement = Math.abs(ox[i]) + Math.abs(oy[i]);
      const bucket = displacement > 14 ? 2 : displacement > 5 ? 1 : 0;
      const size = bucket === 2 ? 1.9 : bucket === 1 ? 1.5 : 1.05;
      const x = hx[i] + ox[i];
      const y = hy[i] + oy[i];
      buckets[bucket].moveTo(x + size, y);
      buckets[bucket].arc(x, y, size, 0, Math.PI * 2);
    }
    ctx.fillStyle = 'rgba(243, 240, 234, 0.16)';
    ctx.fill(buckets[0]);
    ctx.fillStyle = 'rgba(243, 240, 234, 0.5)';
    ctx.fill(buckets[1]);
    ctx.fillStyle = accent;
    ctx.fill(buckets[2]);
  }

  function drawStatic() {
    ox.fill(0);
    oy.fill(0);
    vx.fill(0);
    vy.fill(0);
    render();
  }

  function update(dt, now) {
    if (motion.reduced || !count) return;
    const t = now * 0.001;

    for (let r = ripples.length - 1; r >= 0; r--) {
      const ripple = ripples[r];
      ripple.radius += 540 * dt;
      ripple.strength -= 0.55 * dt;
      if (ripple.strength <= 0) ripples.splice(r, 1);
    }

    const { x: mx, y: my, active } = mouse;
    const radiusSq = RADIUS * RADIUS;
    for (let i = 0; i < count; i++) {
      const px = hx[i];
      const py = hy[i];
      let tx = 0;
      let ty = 0;

      if (active) {
        const dx = px - mx;
        const dy = py - my;
        const distSq = dx * dx + dy * dy;
        if (distSq < radiusSq) {
          const d = Math.sqrt(distSq) || 1;
          const falloff = 1 - d / RADIUS;
          const push = falloff * falloff * 42;
          tx += (dx / d) * push;
          ty += (dy / d) * push;
        }
      }

      for (const ripple of ripples) {
        const dx = px - ripple.x;
        const dy = py - ripple.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const band = Math.abs(d - ripple.radius);
        if (band < 60) {
          const force = (1 - band / 60) * ripple.strength * 26;
          tx += (dx / d) * force;
          ty += (dy / d) * force;
        }
      }

      // A slow idle swell keeps the field breathing.
      ty += Math.sin(px * 0.011 + t * 1.1) * Math.cos(py * 0.013 + t * 0.8) * 2.2;

      const ax = (tx - ox[i]) * STIFFNESS - vx[i] * DAMPING;
      const ay = (ty - oy[i]) * STIFFNESS - vy[i] * DAMPING;
      vx[i] += ax * dt;
      vy[i] += ay * dt;
      ox[i] += vx[i] * dt;
      oy[i] += vy[i] * dt;
    }
    render();
  }

  host.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = event.clientX - rect.left;
    mouse.y = event.clientY - rect.top;
    mouse.active = true;
  });
  host.addEventListener('pointerleave', () => {
    mouse.active = false;
  });
  host.addEventListener('pointerdown', (event) => {
    if (event.target instanceof Element && event.target.closest('a, button')) return;
    const rect = canvas.getBoundingClientRect();
    ripples.push({ x: event.clientX - rect.left, y: event.clientY - rect.top, radius: 0, strength: 1 });
    if (ripples.length > 5) ripples.shift();
  });

  resize();
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(host);
  else window.addEventListener('resize', resize);
  return { update, drawStatic };
}

function createProximityTitle(title, hero) {
  if (!title) return null;
  const items = splitText(title, { type: 'chars' }).map((element) => {
    const accent = Boolean(element.closest('.hero__line--accent'));
    const base = accent ? 520 : 300;
    return { element, accent, base, weight: base, width: 100, cx: 0, cy: 0, lastWeight: -1, lastWidth: -1 };
  });
  const ghost = !finePointer();
  const pointer = { x: -9999, y: -9999, inside: false };
  let radius = 300;
  let boxWidth = 0;
  let boxHeight = 0;

  // Centres are measured at rest (offsets ignore the intro transforms) to avoid feedback.
  const measure = () => {
    boxWidth = title.clientWidth;
    boxHeight = title.clientHeight;
    radius = clamp(boxWidth * 0.3, 160, 420);
    for (const item of items) {
      item.cx = item.element.offsetLeft + item.element.offsetWidth / 2;
      item.cy = item.element.offsetTop + item.element.offsetHeight / 2;
    }
  };

  hero.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const rect = title.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.inside = true;
  });
  hero.addEventListener('pointerleave', () => {
    pointer.inside = false;
  });

  function update(dt, now) {
    if (motion.reduced) return;
    let { x: px, y: py, inside: active } = pointer;
    if (ghost) {
      const t = now * 0.00045;
      px = boxWidth * (0.5 + Math.sin(t * 1.3) * 0.45);
      py = boxHeight * (0.5 + Math.sin(t * 2.1) * 0.42);
      active = true;
    }
    for (const item of items) {
      let influence = 0;
      if (active) {
        const dx = item.cx - px;
        const dy = (item.cy - py) * 1.25;
        influence = clamp(1 - Math.sqrt(dx * dx + dy * dy) / radius);
        influence = influence * influence * (3 - 2 * influence);
      }
      item.weight = damp(item.weight, lerp(item.base, 900, influence), 9, dt);
      item.width = damp(item.width, lerp(100, 138, influence), 9, dt);
      if (Math.abs(item.weight - item.lastWeight) > 0.8 || Math.abs(item.width - item.lastWidth) > 0.3) {
        item.lastWeight = item.weight;
        item.lastWidth = item.width;
        item.element.style.fontVariationSettings = `'wght' ${item.weight.toFixed(0)}, 'wdth' ${item.width.toFixed(1)}, 'opsz' 144${item.accent ? ", 'slnt' -10" : ''}`;
      }
    }
  }

  function reset() {
    for (const item of items) {
      item.weight = item.base;
      item.width = 100;
      item.lastWeight = -1;
      item.lastWidth = -1;
      item.element.style.fontVariationSettings = '';
    }
  }

  measure();
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
  return { update, reset };
}

function createReadouts(hero) {
  const xEl = qs('[data-coord-x]', hero);
  const yEl = qs('[data-coord-y]', hero);
  const fpsEl = qs('[data-fps]', hero);
  const pad = (value) => String(Math.max(0, Math.round(value))).padStart(4, '0');
  let x = 0;
  let y = 0;
  let dirty = false;
  let frames = 0;
  let elapsed = 0;

  window.addEventListener(
    'pointermove',
    (event) => {
      x = event.clientX;
      y = event.clientY;
      dirty = true;
    },
    { passive: true },
  );

  return {
    update(dt) {
      frames++;
      elapsed += dt;
      if (elapsed >= 0.5) {
        if (fpsEl) fpsEl.textContent = String(Math.round(frames / elapsed));
        frames = 0;
        elapsed = 0;
      }
      if (dirty) {
        dirty = false;
        if (xEl) xEl.textContent = pad(x);
        if (yEl) yEl.textContent = pad(y);
      }
    },
  };
}
