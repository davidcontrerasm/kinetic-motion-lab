/**
 * Reusable interaction primitives: particle bursts, rolling numbers, elastic
 * indicators, shakes, directional button fills and range fill syncing.
 */
import { motion } from './motion.js';
import { rangePercent } from './math.js';

const random = (min, max) => min + Math.random() * (max - min);

export const PALETTE = ['#ff5a36', '#ffc53d', '#d4ff4f', '#8b7bff', '#45e3b8'];

/**
 * Emits a short-lived burst of particles from (x, y), relative to `container`
 * (which must be positioned). Particles clean themselves up.
 */
export function burst(
  container,
  {
    x,
    y,
    count = 10,
    colors = PALETTE,
    distance = [24, 56],
    size = [4, 8],
    duration = 700,
    spread = Math.PI * 2,
    angle = 0,
  } = {},
) {
  if (motion.reduced || !container) return;
  for (let i = 0; i < count; i++) {
    const particle = document.createElement('span');
    particle.className = 'particle';
    const s = random(size[0], size[1]);
    const theta = angle - spread / 2 + (spread * (i + Math.random() * 0.6)) / count;
    const d = random(distance[0], distance[1]);
    particle.style.cssText = `left:${x}px;top:${y}px;width:${s}px;height:${s}px;margin:${-s / 2}px 0 0 ${-s / 2}px;background:${colors[i % colors.length]}`;
    container.appendChild(particle);
    const animation = particle.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(theta) * d}px, ${Math.sin(theta) * d}px) scale(0)`, opacity: 0.4 },
      ],
      { duration: duration * random(0.75, 1.2), easing: 'cubic-bezier(0.15, 0.85, 0.3, 1)', fill: 'forwards' },
    );
    const cleanup = () => particle.remove();
    animation.onfinish = cleanup;
    animation.oncancel = cleanup;
  }
}

/**
 * A number whose changed digits roll in the direction of change
 * (up when increasing, down when decreasing). Unchanged digits stay still.
 */
export class RollingNumber {
  /**
   * @param {HTMLElement} element
   * @param {{ value?: number, minDigits?: number, format?: (value: number) => string }} [options]
   */
  constructor(element, { value = 0, minDigits = 1, format } = {}) {
    this.element = element;
    this.minDigits = minDigits;
    this.format = format ?? ((v) => String(v).padStart(this.minDigits, '0'));
    this.value = value;
    this.slots = [];

    element.classList.add('roller');
    element.textContent = '';
    this.readable = document.createElement('span');
    this.readable.className = 'sr-only';
    this.visual = document.createElement('span');
    this.visual.className = 'roller__digits';
    this.visual.setAttribute('aria-hidden', 'true');
    element.append(this.readable, this.visual);
    this.render(this.format(value), 0, false);
  }

  set(next) {
    if (next === this.value) return;
    const direction = next > this.value ? 1 : -1;
    this.value = next;
    this.render(this.format(next), direction, true);
  }

  render(text, direction, animate) {
    this.readable.textContent = text;
    const chars = Array.from(text);

    // Slots are right-aligned so units stay put when the digit count changes.
    while (this.slots.length < chars.length) {
      const slot = document.createElement('span');
      slot.className = 'roller__slot';
      this.visual.prepend(slot);
      this.slots.unshift(slot);
    }
    while (this.slots.length > chars.length) this.slots.shift().remove();

    chars.forEach((char, i) => {
      const slot = this.slots[i];
      const current = slot.querySelector('.roller__char:not(.is-leaving)');
      if (current && current.textContent === char) return;

      const incoming = document.createElement('span');
      incoming.className = 'roller__char';
      incoming.textContent = char;
      slot.appendChild(incoming);

      if (!animate || motion.reduced) {
        current?.remove();
        return;
      }

      const delay = (chars.length - 1 - i) * 40;
      incoming.animate(
        [
          { transform: `translateY(${direction * 100}%)`, opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ],
        { duration: 560, delay, easing: 'cubic-bezier(0.34, 1.45, 0.64, 1)', fill: 'backwards' },
      );

      if (current) {
        current.classList.add('is-leaving');
        const leave = current.animate(
          [
            { transform: 'translateY(0)', opacity: 1 },
            { transform: `translateY(${-direction * 100}%)`, opacity: 0 },
          ],
          { duration: 420, delay, easing: 'cubic-bezier(0.55, 0, 0.3, 1)', fill: 'forwards' },
        );
        leave.onfinish = () => current.remove();
        leave.oncancel = () => current.remove();
      }
    });
  }
}

/**
 * Moves an absolutely positioned pill (using left/right insets) under `target`.
 * The leading edge moves first and the trailing edge follows, which reads as an
 * elastic stretch. The pill's CSS must transition `left, right` in that order.
 */
export function slideIndicator(pill, target, direction = 0) {
  const container = pill.offsetParent ?? pill.parentElement;
  if (!container || !target) return;
  const left = target.offsetLeft;
  const right = container.clientWidth - (target.offsetLeft + target.offsetWidth);
  const lag = motion.reduced ? 0 : 80;
  pill.style.transitionDelay = direction > 0 ? `${lag}ms, 0ms` : direction < 0 ? `0ms, ${lag}ms` : '0ms, 0ms';
  pill.style.left = `${left}px`;
  pill.style.right = `${right}px`;
}

/** Places an indicator instantly (no transition), e.g. on first paint or resize. */
export function snapIndicator(pill, target) {
  const previous = pill.style.transition;
  pill.style.transition = 'none';
  slideIndicator(pill, target, 0);
  void pill.offsetWidth;
  pill.style.transition = previous;
}

/** A decaying horizontal shake: the universal "no". */
export function shake(element, { distance = 8, duration = 440 } = {}) {
  if (motion.reduced || !element) return null;
  return element.animate(
    [
      { transform: 'translateX(0)' },
      { transform: `translateX(${-distance}px)` },
      { transform: `translateX(${distance * 0.8}px)` },
      { transform: `translateX(${-distance * 0.5}px)` },
      { transform: `translateX(${distance * 0.3}px)` },
      { transform: 'translateX(0)' },
    ],
    { duration, easing: 'ease-out' },
  );
}

/** Buttons fill from the point where the pointer enters and drain toward where it leaves. */
export function initFillButtons(root = document) {
  root.querySelectorAll('.btn').forEach((button) => {
    const setOrigin = (event) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty('--fx', `${event.clientX - rect.left}px`);
      button.style.setProperty('--fy', `${event.clientY - rect.top}px`);
    };
    button.addEventListener('pointerenter', setOrigin);
    button.addEventListener('pointerleave', setOrigin);
  });
}

/** Keeps the `--fill` custom property of a styled range input in sync with its value. */
export function syncRange(input) {
  input.style.setProperty('--fill', `${rangePercent(input.value, input.min, input.max)}%`);
}

export function initRanges(root = document) {
  root.querySelectorAll('input.range').forEach((input) => {
    input.addEventListener('input', () => syncRange(input));
    syncRange(input);
  });
}
