/**
 * Infinite marquees whose speed and skew respond to scroll velocity.
 * Content is cloned until it can loop seamlessly at any viewport width.
 */
import { qsa } from '../core/dom.js';
import { motion, createLoop, observeVisibility, scroll, clamp, damp } from '../core/motion.js';

const BASE_SPEED = 70; // px per second

export function initMarquee() {
  qsa('[data-marquee]').forEach((root) => {
    const track = root.querySelector('.marquee__track');
    const group = track?.querySelector('.marquee__group');
    if (!group) return;

    const direction = Number.parseFloat(root.dataset.marquee) || 1;
    let unit = 0;
    let offset = 0;
    let skew = 0;

    const fill = () => {
      track.querySelectorAll('.marquee__group--clone').forEach((clone) => clone.remove());
      unit = group.offsetWidth;
      if (!unit) return;
      const copies = Math.ceil((root.offsetWidth * 2) / unit);
      for (let i = 0; i < copies; i++) {
        const clone = group.cloneNode(true);
        clone.classList.add('marquee__group--clone');
        clone.setAttribute('aria-hidden', 'true');
        track.appendChild(clone);
      }
    };

    const loop = createLoop((dt) => {
      if (!unit) return;
      const velocity = scroll.velocity;
      const speed = motion.reduced ? 0 : BASE_SPEED * direction + velocity * 0.3 * Math.sign(direction);
      offset = (offset + speed * dt) % unit;
      if (offset < 0) offset += unit;
      skew = motion.reduced ? 0 : damp(skew, clamp(-velocity * 0.006, -10, 10), 8, dt);
      track.style.transform = `translate3d(${(-offset).toFixed(2)}px, 0, 0) skewX(${skew.toFixed(2)}deg)`;
    });

    fill();
    document.fonts?.ready.then(fill);
    if ('ResizeObserver' in window) new ResizeObserver(fill).observe(root);
    observeVisibility(root, (visible) => (visible ? loop.start() : loop.stop()));
  });
}
