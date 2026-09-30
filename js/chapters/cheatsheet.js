/**
 * Cheat sheet page: draws easing-token curves and spring-preset graphs from
 * the same maths the demos use, persists the ship checklist, and filters the
 * glossary as you type.
 */
import { qs, qsa, escapeHTML } from '../core/dom.js';
import { cubicBezier } from '../core/easing.js';
import { springPresets, springPosition, dampingRatio, settleTime } from '../core/spring.js';

const CHECKLIST_KEY = 'kinetic:ship-checklist';

export function init() {
  drawTokens();
  drawPresets();
  initChecklist();
  initGlossary();
}

/** Maps progress y to the 0–100 viewBox with headroom for overshoot. */
const toY = (value) => 86 - value * 68;

function curvePath(fn, samples = 80) {
  let d = '';
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    d += `${i ? 'L' : 'M'}${(t * 200).toFixed(2)} ${toY(fn(t)).toFixed(2)}`;
  }
  return d;
}

function guides() {
  return `<line class="guide-line" x1="0" y1="${toY(0)}" x2="200" y2="${toY(0)}"/><line class="guide-line" x1="0" y1="${toY(1)}" x2="200" y2="${toY(1)}"/>`;
}

function drawTokens() {
  qsa('[data-token-grid] .token-card').forEach((card) => {
    const svg = qs('svg', card);
    let path;
    if (card.dataset.steps) {
      const steps = Number(card.dataset.steps);
      path = curvePath((t) => Math.min(1, Math.floor(t * steps) / steps), 400);
    } else {
      const [x1, y1, x2, y2] = card.dataset.curve.split(',').map(Number);
      path = curvePath(cubicBezier(x1, y1, x2, y2));
    }
    svg.innerHTML = `${guides()}<path d="${path}"/>`;
  });
}

function drawPresets() {
  const grid = qs('[data-preset-grid]');
  if (!grid) return;
  grid.innerHTML = Object.entries(springPresets)
    .map(([name, config]) => {
      const settle = settleTime(config, { threshold: 0.01, maxTime: 6 });
      const span = Math.max(settle * 1.15, 0.4);
      const path = curvePath((t) => springPosition(t * span, { ...config, from: 0, to: 1 }), 120);
      const zeta = dampingRatio(config);
      return `<article class="preset-card">
          <svg viewBox="0 0 200 100" preserveAspectRatio="none" aria-hidden="true">${guides()}<path d="${path}"/></svg>
          <h3>${escapeHTML(name[0].toUpperCase() + name.slice(1))}</h3>
          <code>stiffness ${config.stiffness} · damping ${config.damping} · mass ${config.mass}</code>
          <p>ζ ${zeta.toFixed(2)} · settles in ${settle.toFixed(2)}s · ${zeta < 1 ? 'bouncy' : zeta > 1.02 ? 'no overshoot, slow' : 'no overshoot'}</p>
        </article>`;
    })
    .join('');
}

function initChecklist() {
  const list = qs('[data-ship-checklist]');
  if (!list) return;
  const inputs = qsa('input[type="checkbox"]', list);
  const count = qs('[data-ship-count]');
  let saved = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(CHECKLIST_KEY) ?? '[]');
    saved = Array.isArray(parsed) ? parsed : [];
  } catch {
    saved = [];
  }
  inputs.forEach((input) => (input.checked = saved.includes(input.value)));
  const sync = () => {
    const checked = inputs.filter((input) => input.checked).map((input) => input.value);
    if (count) count.textContent = String(checked.length);
    try {
      localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checked));
    } catch {
      /* session only */
    }
  };
  inputs.forEach((input) => input.addEventListener('change', sync));
  qs('[data-ship-reset]')?.addEventListener('click', () => {
    inputs.forEach((input) => (input.checked = false));
    sync();
  });
  sync();
}

function highlightMatch(text, query) {
  if (!query) return escapeHTML(text);
  const index = text.toLowerCase().indexOf(query);
  if (index < 0) return escapeHTML(text);
  return `${escapeHTML(text.slice(0, index))}<mark>${escapeHTML(text.slice(index, index + query.length))}</mark>${escapeHTML(text.slice(index + query.length))}`;
}

function initGlossary() {
  const input = qs('[data-glossary-search]');
  const items = qsa('[data-glossary] .glossary__item');
  const count = qs('[data-glossary-count]');
  const empty = qs('[data-glossary-empty]');
  if (!input || !items.length) return;
  const entries = items.map((item) => {
    const dt = qs('dt', item);
    const dd = qs('dd', item);
    return { item, dt, dd, term: dt.textContent, definition: dd.textContent };
  });
  const filter = () => {
    const query = input.value.trim().toLowerCase();
    let shown = 0;
    for (const entry of entries) {
      const match = !query || entry.term.toLowerCase().includes(query) || entry.definition.toLowerCase().includes(query);
      entry.item.hidden = !match;
      if (match) {
        shown++;
        entry.dt.innerHTML = highlightMatch(entry.term, query);
        entry.dd.innerHTML = highlightMatch(entry.definition, query);
      }
    }
    if (count) count.textContent = `${shown} ${shown === 1 ? 'term' : 'terms'}`;
    if (empty) empty.hidden = shown > 0;
  };
  input.addEventListener('input', filter);
  filter();
}
