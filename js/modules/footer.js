/**
 * Footer: jelly letters that react to pointer velocity, local clock,
 * back-to-top and the replay-intro CTA.
 */
import { qs, splitText } from '../core/dom.js';
import { motion, createLoop, clamp } from '../core/motion.js';
import { Spring } from '../core/spring.js';
import { replayIntro } from './preloader.js';

export function initFooter() {
  initJelly();
  initClock();
  qs('[data-to-top]')?.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: motion.reduced ? 'auto' : 'smooth' });
  });
  qs('[data-replay]')?.addEventListener('click', () => replayIntro());
}

function initJelly() {
  const title = qs('[data-jelly]');
  if (!title) return;
  const letters = splitText(title, { type: 'chars' }).map((element) => ({
    element,
    y: new Spring({ stiffness: 320, damping: 10, precision: 0.05 }),
    r: new Spring({ stiffness: 280, damping: 9, precision: 0.05 }),
    cx: 0,
    cy: 0,
  }));
  const RADIUS = 150;

  const measure = () => {
    for (const letter of letters) {
      letter.cx = letter.element.offsetLeft + letter.element.offsetWidth / 2;
      letter.cy = letter.element.offsetTop + letter.element.offsetHeight / 2;
    }
  };

  const loop = createLoop((dt) => {
    let active = false;
    for (const letter of letters) {
      letter.y.step(dt);
      letter.r.step(dt);
      if (!letter.y.isSettled() || !letter.r.isSettled()) active = true;
      letter.element.style.transform =
        letter.y.value === 0 && letter.r.value === 0
          ? ''
          : `translate3d(0, ${letter.y.value.toFixed(2)}px, 0) rotate(${letter.r.value.toFixed(2)}deg)`;
    }
    if (!active) loop.stop();
  });

  const nudge = (x, y, vx, vy) => {
    for (const letter of letters) {
      const distance = Math.hypot(letter.cx - x, (letter.cy - y) * 0.7);
      if (distance > RADIUS) continue;
      const falloff = 1 - distance / RADIUS;
      letter.y.velocity = clamp(letter.y.velocity + vy * 0.45 * falloff, -2600, 2600);
      letter.r.velocity = clamp(letter.r.velocity + vx * 0.06 * falloff, -500, 500);
    }
    loop.start();
  };

  let last = null;
  title.addEventListener('pointermove', (event) => {
    if (motion.reduced) return;
    const rect = title.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const now = performance.now();
    if (last) {
      const dt = Math.max((now - last.t) / 1000, 1 / 240);
      nudge(x, y, (x - last.x) / dt, (y - last.y) / dt);
    }
    last = { x, y, t: now };
  });
  title.addEventListener('pointerleave', () => {
    last = null;
  });
  title.addEventListener('pointerdown', (event) => {
    if (motion.reduced) return;
    const rect = title.getBoundingClientRect();
    nudge(event.clientX - rect.left, event.clientY - rect.top, (Math.random() - 0.5) * 1200, -1500);
  });

  measure();
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
}

function initClock() {
  const element = qs('[data-clock]');
  if (!element) return;
  const format = new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' });
  const update = () => {
    element.textContent = format.format(new Date());
  };
  update();
  setInterval(update, 15000);
}
