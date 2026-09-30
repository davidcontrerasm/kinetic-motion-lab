/**
 * Custom cursor: an exact dot plus a lagging ring that stretches along its
 * velocity, grows over interactive elements and shows contextual labels
 * (elements with data-cursor-label).
 */
import { onFrame, damp, clamp, motion, finePointer } from '../core/motion.js';

const INTERACTIVE =
  'a, button, [role="button"], [role="tab"], [role="radio"], [role="switch"], label, select, summary, input[type="range"], input[type="checkbox"], [data-cursor]';
const TEXT_INPUT = 'input[type="text"], input[type="email"], input[type="search"], textarea, [contenteditable="true"]';

export function initCursor() {
  const root = document.querySelector('[data-cursor-root]');
  if (!root) return;
  if (!finePointer()) {
    root.remove();
    return;
  }

  document.documentElement.classList.add('has-cursor');
  const ring = root.querySelector('.cursor__ring');
  const shape = root.querySelector('.cursor__shape');
  const label = root.querySelector('.cursor__label');
  const dot = root.querySelector('.cursor__dot');

  const state = { x: -100, y: -100, rx: -100, ry: -100, px: -100, py: -100, stretch: 0, angle: 0, visible: false };

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      state.x = event.clientX;
      state.y = event.clientY;
      if (!state.visible) {
        state.visible = true;
        state.rx = state.px = event.clientX;
        state.ry = state.py = event.clientY;
        root.classList.add('is-visible');
      }
    },
    { passive: true },
  );

  window.addEventListener('mouseout', (event) => {
    if (event.relatedTarget) return;
    state.visible = false;
    root.classList.remove('is-visible');
  });
  window.addEventListener('pointerdown', () => root.classList.add('is-pressed'));
  window.addEventListener('pointerup', () => root.classList.remove('is-pressed'));
  window.addEventListener('blur', () => root.classList.remove('is-pressed'));

  document.addEventListener('pointerover', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const labelled = target.closest('[data-cursor-label]');
    const interactive = target.closest(INTERACTIVE);
    const text = target.closest(TEXT_INPUT);
    // A nested control inside a labelled region takes priority over the label.
    const labelWins = Boolean(labelled) && !(interactive && interactive !== labelled && labelled.contains(interactive));
    root.classList.toggle('has-label', labelWins);
    if (labelWins) label.textContent = labelled.dataset.cursorLabel;
    root.classList.toggle('is-text', Boolean(text) && !labelWins);
    root.classList.toggle('is-hover', Boolean(interactive) && !labelWins && !text);
  });

  onFrame((dt) => {
    if (!state.visible) return;
    const snap = motion.reduced;
    state.rx = snap ? state.x : damp(state.rx, state.x, 22, dt);
    state.ry = snap ? state.y : damp(state.ry, state.y, 22, dt);
    const vx = dt > 0 ? (state.rx - state.px) / dt : 0;
    const vy = dt > 0 ? (state.ry - state.py) / dt : 0;
    state.px = state.rx;
    state.py = state.ry;

    const speed = Math.hypot(vx, vy);
    const target = snap || root.classList.contains('has-label') ? 0 : clamp(speed / 2600, 0, 0.42);
    state.stretch = damp(state.stretch, target, 16, dt);
    if (speed > 30) state.angle = Math.atan2(vy, vx);

    dot.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
    ring.style.transform = `translate3d(${state.rx.toFixed(2)}px, ${state.ry.toFixed(2)}px, 0)`;
    shape.style.transform = `translate(-50%, -50%) rotate(${state.angle.toFixed(3)}rad) scale(${(1 + state.stretch).toFixed(3)}, ${(1 - state.stretch * 0.55).toFixed(3)})`;
  });
}
