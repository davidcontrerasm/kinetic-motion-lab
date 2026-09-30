/**
 * Entrance choreography: masked word reveals ([data-split]), fade-up blocks
 * ([data-reveal]) and decoding labels ([data-scramble]).
 */
import { qsa, splitText, escapeHTML } from '../core/dom.js';
import { motion } from '../core/motion.js';

export function initReveal() {
  qsa('[data-split]').forEach((element) => {
    splitText(element, { type: element.dataset.split === 'chars' ? 'chars' : 'words' });
  });

  // Stagger grid cards by column so rows cascade left to right.
  qsa('[data-demos] > [data-reveal]').forEach((card, index) => {
    card.style.setProperty('--reveal-delay', `${(index % 3) * 90}ms`);
  });

  const targets = qsa('[data-split], [data-reveal]');
  if (!('IntersectionObserver' in window)) {
    targets.forEach((element) => element.classList.add('is-inview'));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-inview');
        observer.unobserve(entry.target);
      }
    },
    { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
  );
  targets.forEach((element) => observer.observe(element));
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&*+=/<>';

/** Decodes text from random glyphs, each character resolving at its own moment. */
class Scrambler {
  constructor(element) {
    this.element = element;
    this.text = element.textContent;
    const readable = document.createElement('span');
    readable.className = 'sr-only';
    readable.textContent = this.text;
    this.visual = document.createElement('span');
    this.visual.className = 'scramble-text';
    this.visual.setAttribute('aria-hidden', 'true');
    this.visual.textContent = this.text;
    element.replaceChildren(readable, this.visual);
    this.queue = [];
    this.frame = 0;
    this.raf = 0;
    this.update = this.update.bind(this);
    motion.subscribe((reduced) => {
      if (!reduced) return;
      cancelAnimationFrame(this.raf);
      this.visual.textContent = this.text;
    });
  }

  play() {
    cancelAnimationFrame(this.raf);
    if (motion.reduced) {
      this.visual.textContent = this.text;
      return;
    }
    const target = this.text;
    this.queue = Array.from(target, (char) => {
      const start = Math.floor(Math.random() * 12);
      return { to: char, start, end: start + 8 + Math.floor(Math.random() * 16), glyph: '' };
    });
    this.frame = 0;
    this.update();
  }

  update() {
    let output = '';
    let complete = 0;
    for (const item of this.queue) {
      if (this.frame >= item.end || item.to === ' ') {
        complete++;
        output += escapeHTML(item.to);
      } else if (this.frame >= item.start) {
        if (!item.glyph || Math.random() < 0.3) item.glyph = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
        output += `<span class="scramble-glyph">${item.glyph}</span>`;
      } else {
        output += escapeHTML(item.to);
      }
    }
    this.visual.innerHTML = output;
    if (complete === this.queue.length) return;
    this.frame++;
    this.raf = requestAnimationFrame(this.update);
  }
}

export function initScramble() {
  const items = qsa('[data-scramble]');
  if (!items.length) return;
  const scramblers = new WeakMap();

  const observer =
    'IntersectionObserver' in window
      ? new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              scramblers.get(entry.target)?.play();
              observer.unobserve(entry.target);
            }
          },
          { threshold: 0.6 },
        )
      : null;

  items.forEach((element) => {
    const scrambler = new Scrambler(element);
    scramblers.set(element, scrambler);
    observer?.observe(element);
    element.addEventListener('pointerenter', () => scrambler.play());
  });
}
