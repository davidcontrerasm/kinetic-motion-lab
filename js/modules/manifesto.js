/**
 * Manifesto: a pinned paragraph whose words light up with scroll progress.
 * Scroll-linked rather than time-based, so the reader controls the pace.
 */
import { qs, splitText } from '../core/dom.js';
import { createLoop, observeVisibility, clamp } from '../core/motion.js';

export function initManifesto() {
  const section = qs('[data-manifesto]');
  if (!section) return;
  const text = qs('[data-manifesto-text]', section);
  const progressEl = qs('[data-manifesto-progress]', section);
  const words = splitText(text, { type: 'words' });
  const total = words.length;
  let last = -1;

  const loop = createLoop(() => {
    const rect = section.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    const progress = clamp(scrollable > 0 ? -rect.top / scrollable : 1);
    if (Math.abs(progress - last) < 0.0005) return;
    last = progress;
    // A soft leading edge a few words wide sweeps through the paragraph.
    const head = progress * (total + 8) - 4;
    for (let i = 0; i < total; i++) words[i].style.setProperty('--p', clamp(head - i).toFixed(3));
    if (progressEl) progressEl.textContent = String(Math.round(progress * 100));
  });

  observeVisibility(section, (visible) => (visible ? loop.start() : loop.stop()));
}
