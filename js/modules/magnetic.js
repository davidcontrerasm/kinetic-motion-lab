/**
 * Magnetic elements ([data-magnetic="strength"]) lean toward the pointer on
 * springs; an optional [data-magnetic-inner] child moves further for parallax.
 * Uses the independent `translate` property so CSS transforms keep working.
 */
import { qsa } from '../core/dom.js';
import { motion, createLoop, finePointer } from '../core/motion.js';
import { Spring } from '../core/spring.js';

const REACH = 32;

export function initMagnetic() {
  if (!finePointer()) return;
  const items = qsa('[data-magnetic]').map((element) => ({
    element,
    inner: element.querySelector('[data-magnetic-inner]'),
    strength: Number.parseFloat(element.dataset.magnetic) || 0.3,
    x: new Spring({ stiffness: 190, damping: 14, precision: 0.02 }),
    y: new Spring({ stiffness: 190, damping: 14, precision: 0.02 }),
  }));
  if (!items.length) return;

  const loop = createLoop((dt) => {
    let moving = false;
    for (const item of items) {
      item.x.step(dt);
      item.y.step(dt);
      if (!item.x.isSettled() || !item.y.isSettled()) moving = true;
      const { value: x } = item.x;
      const { value: y } = item.y;
      const still = x === 0 && y === 0;
      item.element.style.translate = still ? '' : `${x.toFixed(2)}px ${y.toFixed(2)}px`;
      if (item.inner) item.inner.style.translate = still ? '' : `${(x * 0.5).toFixed(2)}px ${(y * 0.5).toFixed(2)}px`;
    }
    if (!moving) loop.stop();
  });

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse') return;
      const reduced = motion.reduced;
      const viewportHeight = window.innerHeight;
      for (const item of items) {
        const rect = item.element.getBoundingClientRect();
        if (rect.bottom < -REACH || rect.top > viewportHeight + REACH) {
          item.x.target = 0;
          item.y.target = 0;
          continue;
        }
        // Measure from the resting position, not the displaced one, to avoid feedback.
        const cx = rect.left + rect.width / 2 - item.x.value;
        const cy = rect.top + rect.height / 2 - item.y.value;
        const dx = event.clientX - cx;
        const dy = event.clientY - cy;
        const inside = !reduced && Math.abs(dx) < rect.width / 2 + REACH && Math.abs(dy) < rect.height / 2 + REACH;
        item.x.target = inside ? dx * item.strength : 0;
        item.y.target = inside ? dy * item.strength : 0;
      }
      loop.start();
    },
    { passive: true },
  );
}
