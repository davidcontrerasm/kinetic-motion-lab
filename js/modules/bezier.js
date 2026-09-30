/**
 * Cubic-bezier editor: draggable (and keyboard-operable) control points, preset
 * morphing, and live previews of one easing applied to translate, scale,
 * rotation, opacity and width, all driven by the shared solver.
 */
import { qs, qsa, copyText } from '../core/dom.js';
import { cubicBezier, bezierPresets, formatBezier, formatNumber, easeOutCubic } from '../core/easing.js';
import { motion, createLoop, observeVisibility, clamp, lerp } from '../core/motion.js';

const SIZE = 300;
const Y_MIN = -0.4;
const Y_MAX = 1.4;
const HOLD = 520;
const MORPH_MS = 560;

export function initBezier() {
  const root = qs('[data-bezier]');
  if (!root) return;

  const svg = qs('[data-bezier-svg]', root);
  const curvePath = qs('[data-curve]', root);
  const arms = qsa('[data-arm]', root);
  const handles = qsa('[data-handle]', root);
  const playhead = qs('[data-playhead]', root);
  const progressDot = qs('[data-progress-dot]', root);
  const ballCurve = qs('[data-ball="curve"]', root);
  const ballLinear = qs('[data-ball="linear"]', root);
  const rail = qs('[data-rail]', root);
  const props = {
    scale: qs('[data-prop="scale"]', root),
    rotate: qs('[data-prop="rotate"]', root),
    opacity: qs('[data-prop="opacity"]', root),
    width: qs('[data-prop="width"]', root),
  };
  const code = qs('[data-bezier-code]', root);
  const toggle = qs('[data-bezier-toggle]', root);
  const durationInput = qs('[data-bezier-duration]', root);
  const durationOut = qs('[data-bezier-duration-out]', root);
  const copyButton = qs('[data-copy-code]', root);
  const copyLabel = qs('[data-copy-code-label]', root);
  const presetButtons = qsa('[data-preset]', root);

  let points = [...bezierPresets.outBack];
  let ease = cubicBezier(...points);
  let duration = Number(durationInput?.value) || 1000;
  let playing = true;
  let cycleStart = performance.now();
  let travel = 0;
  let dragging = -1;
  let morph = null;
  const pose = { value: 1, linearValue: 1, t: 1, eased: 1 };

  const toSvg = (x, y) => [x * SIZE, (1 - y) * SIZE];

  const measure = () => {
    if (rail && ballCurve) travel = Math.max(0, rail.clientWidth - ballCurve.offsetWidth - 12);
    apply(pose.value, pose.linearValue, pose.t, pose.eased);
  };

  function render() {
    const [x1, y1, x2, y2] = points;
    const [ax, ay] = toSvg(x1, y1);
    const [bx, by] = toSvg(x2, y2);
    curvePath.setAttribute('d', `M0 ${SIZE} C${ax} ${ay} ${bx} ${by} ${SIZE} 0`);
    arms[0].setAttribute('x2', ax);
    arms[0].setAttribute('y2', ay);
    arms[1].setAttribute('x2', bx);
    arms[1].setAttribute('y2', by);
    handles[0].setAttribute('transform', `translate(${ax} ${ay})`);
    handles[1].setAttribute('transform', `translate(${bx} ${by})`);
    handles.forEach((handle, i) => {
      const x = points[i * 2];
      const y = points[i * 2 + 1];
      handle.setAttribute('aria-valuenow', formatNumber(x));
      handle.setAttribute('aria-valuetext', `x ${formatNumber(x)}, y ${formatNumber(y)}`);
    });
    code.textContent = formatBezier(points);
    presetButtons.forEach((button) => {
      const preset = bezierPresets[button.dataset.preset];
      const match = preset.every((value, i) => Math.abs(value - points[i]) < 0.005);
      button.setAttribute('aria-pressed', String(match));
    });
  }

  const commit = () => {
    ease = cubicBezier(...points);
    render();
  };
  const restart = () => {
    cycleStart = performance.now();
  };

  function apply(value, linearValue, t, eased) {
    Object.assign(pose, { value, linearValue, t, eased });
    if (ballCurve) ballCurve.style.transform = `translateX(${(value * travel).toFixed(2)}px)`;
    if (ballLinear) ballLinear.style.transform = `translateX(${(linearValue * travel).toFixed(2)}px)`;
    if (props.scale) props.scale.style.transform = `scale(${lerp(0.25, 1, value).toFixed(4)})`;
    if (props.rotate) props.rotate.style.transform = `rotate(${(value * 180).toFixed(2)}deg)`;
    if (props.opacity) props.opacity.style.opacity = clamp(value).toFixed(3);
    if (props.width) props.width.style.transform = `scaleX(${Math.max(0, value).toFixed(4)})`;
    const [px, py] = toSvg(t, eased);
    playhead.setAttribute('x1', px);
    playhead.setAttribute('x2', px);
    progressDot.setAttribute('cx', px);
    progressDot.setAttribute('cy', py);
  }

  // Forward, hold, backward, hold: the curve is shown on both journeys.
  const playback = createLoop((dt, now) => {
    if (!playing || motion.reduced) return;
    const cycle = duration * 2 + HOLD * 2;
    const elapsed = Math.max(0, now - cycleStart) % cycle;
    let t;
    let forward = true;
    if (elapsed < duration) t = elapsed / duration;
    else if (elapsed < duration + HOLD) t = 1;
    else if (elapsed < duration * 2 + HOLD) {
      t = (elapsed - duration - HOLD) / duration;
      forward = false;
    } else {
      t = 1;
      forward = false;
    }
    const eased = ease(t);
    apply(forward ? eased : 1 - eased, forward ? t : 1 - t, t, eased);
  });

  function stopMorph() {
    morph?.stop();
    morph = null;
  }

  function morphTo(target) {
    stopMorph();
    if (motion.reduced) {
      points = [...target];
      commit();
      restart();
      return;
    }
    const from = [...points];
    const start = performance.now();
    morph = createLoop((dt, now) => {
      const k = clamp((now - start) / MORPH_MS);
      const e = easeOutCubic(k);
      points = from.map((value, i) => lerp(value, target[i], e));
      commit();
      if (k >= 1) {
        stopMorph();
        restart();
      }
    });
    morph.start();
  }

  function toCurveSpace(event) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return null;
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return [clamp(point.x / SIZE, 0, 1), clamp(1 - point.y / SIZE, Y_MIN, Y_MAX)];
  }

  handles.forEach((handle, index) => {
    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      stopMorph();
      dragging = index;
      handle.setPointerCapture?.(event.pointerId);
      handle.classList.add('is-active');
      handle.focus({ preventScroll: true });
    });
    handle.addEventListener('pointermove', (event) => {
      if (dragging !== index) return;
      const next = toCurveSpace(event);
      if (!next) return;
      points[index * 2] = next[0];
      points[index * 2 + 1] = next[1];
      commit();
    });
    const end = () => {
      if (dragging !== index) return;
      dragging = -1;
      handle.classList.remove('is-active');
      restart();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
    handle.addEventListener('lostpointercapture', end);

    handle.addEventListener('keydown', (event) => {
      const step = event.shiftKey ? 0.1 : 0.01;
      const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      stopMorph();
      points[index * 2] = clamp(points[index * 2] + move[0], 0, 1);
      points[index * 2 + 1] = clamp(points[index * 2 + 1] + move[1], Y_MIN, Y_MAX);
      commit();
      restart();
    });
  });

  presetButtons.forEach((button) => {
    button.addEventListener('click', () => morphTo(bezierPresets[button.dataset.preset]));
  });

  toggle?.addEventListener('click', () => {
    playing = !playing;
    root.classList.toggle('is-paused', !playing);
    toggle.setAttribute('aria-label', playing ? 'Pause preview' : 'Play preview');
    if (playing) restart();
  });

  durationInput?.addEventListener('input', () => {
    duration = Number(durationInput.value);
    if (durationOut) durationOut.textContent = `${duration}ms`;
    restart();
  });

  let copyTimer = 0;
  copyButton?.addEventListener('click', async () => {
    const ok = await copyText(code.textContent);
    copyButton.classList.add('is-copied');
    if (copyLabel) copyLabel.textContent = ok ? 'Copied' : 'Failed';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => {
      copyButton.classList.remove('is-copied');
      if (copyLabel) copyLabel.textContent = 'Copy';
    }, 1600);
  });

  measure();
  commit();
  apply(1, 1, 1, 1);
  if ('ResizeObserver' in window && rail) new ResizeObserver(measure).observe(rail);
  else window.addEventListener('resize', measure, { passive: true });
  observeVisibility(root, (visible) => (visible ? playback.start() : playback.stop()));
  motion.subscribe((reduced) => {
    if (reduced) apply(1, 1, 1, 1);
    else restart();
  });
}
