/**
 * 3D tilt cards: rotation follows the pointer on springs, a glare tracks the
 * light source and layers ([data-depth] via --depth) shift for parallax.
 */
import { qsa } from '../core/dom.js';
import { motion, createLoop } from '../core/motion.js';
import { Spring } from '../core/spring.js';

const MAX_TILT = 10; // degrees

export function initTilt() {
  qsa('[data-tilt]').forEach((card) => {
    const rx = new Spring({ stiffness: 170, damping: 15, precision: 0.01 });
    const ry = new Spring({ stiffness: 170, damping: 15, precision: 0.01 });
    let hovering = false;

    const render = () => {
      card.style.setProperty('--rx', `${rx.value.toFixed(2)}deg`);
      card.style.setProperty('--ry', `${ry.value.toFixed(2)}deg`);
      card.style.setProperty('--px', (ry.value / MAX_TILT).toFixed(3));
      card.style.setProperty('--py', (-rx.value / MAX_TILT).toFixed(3));
    };

    const loop = createLoop((dt) => {
      rx.step(dt);
      ry.step(dt);
      render();
      if (!hovering && rx.isSettled() && ry.isSettled()) loop.stop();
    });

    card.addEventListener('pointermove', (event) => {
      if (motion.reduced || event.pointerType === 'touch') return;
      const rect = card.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width;
      const y = (event.clientY - rect.top) / rect.height;
      ry.target = (x - 0.5) * 2 * MAX_TILT;
      rx.target = -(y - 0.5) * 2 * MAX_TILT;
      card.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`);
      card.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
      if (!hovering) {
        hovering = true;
        card.classList.add('is-active');
      }
      loop.start();
    });

    card.addEventListener('pointerleave', () => {
      hovering = false;
      card.classList.remove('is-active');
      rx.target = 0;
      ry.target = 0;
      loop.start();
    });
  });
}
