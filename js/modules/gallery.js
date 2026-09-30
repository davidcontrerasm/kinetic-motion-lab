/**
 * Principles gallery: vertical scroll drives horizontal travel of a pinned
 * track. Cards arc and tilt by their distance from the viewport centre.
 */
import { qs, qsa } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp } from '../core/motion.js';
import { RollingNumber } from '../core/ui.js';

export function initGallery() {
  const section = qs('[data-gallery]');
  if (!section) return;
  const sticky = qs('[data-gallery-sticky]', section);
  const track = qs('[data-gallery-track]', section);
  const cards = qsa('.principle', track);
  const bar = qs('[data-gallery-bar]', section);
  const indexEl = qs('[data-gallery-index]', section);
  const counter = indexEl ? new RollingNumber(indexEl, { value: 1, minDigits: 2 }) : null;

  let distance = 0;
  let viewportWidth = 0;
  let offsets = [];
  let widths = [];
  let lastProgress = -1;
  let dirty = true;

  const measure = () => {
    viewportWidth = sticky.clientWidth;
    distance = Math.max(0, track.scrollWidth - viewportWidth);
    offsets = cards.map((card) => card.offsetLeft);
    widths = cards.map((card) => card.offsetWidth);
    section.style.height = `${sticky.offsetHeight + distance}px`;
    dirty = true;
  };

  const loop = createLoop(() => {
    const rect = section.getBoundingClientRect();
    const scrollable = section.offsetHeight - sticky.offsetHeight;
    const progress = clamp(scrollable > 0 ? -rect.top / scrollable : 0);
    if (!dirty && Math.abs(progress - lastProgress) < 0.0002) return;
    dirty = false;
    lastProgress = progress;

    const x = -progress * distance;
    track.style.transform = `translate3d(${x.toFixed(2)}px, 0, 0)`;
    if (bar) bar.style.transform = `scaleX(${progress.toFixed(4)})`;

    const center = viewportWidth / 2;
    cards.forEach((card, i) => {
      if (motion.reduced) {
        card.style.transform = '';
        return;
      }
      const d = (offsets[i] + widths[i] / 2 + x - center) / viewportWidth;
      card.style.transform = `translate3d(0, ${(d * d * 90).toFixed(2)}px, 0) rotate(${(d * 6).toFixed(2)}deg)`;
    });
    counter?.set(Math.round(progress * (cards.length - 1)) + 1);
  });

  measure();
  window.addEventListener('resize', measure);
  document.fonts?.ready.then(measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(track);
  observeVisibility(section, (visible) => (visible ? loop.start() : loop.stop()), { rootMargin: '50px' });
  motion.subscribe(() => {
    dirty = true;
  });
}
