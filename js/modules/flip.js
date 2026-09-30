/**
 * FLIP layout transitions (First, Last, Invert, Play) for a swatch grid:
 * shuffle, sort, filter and grid/list switching, all interruptible, plus a
 * shared-element transition from a tile into a detail dialog.
 */
import { qs, qsa, copyText, escapeHTML } from '../core/dom.js';
import { motion, springCurve, clamp, lerp } from '../core/motion.js';
import { slideIndicator, snapIndicator } from '../core/ui.js';

const SWATCHES = [
  { name: 'Vermilion', hue: 10 },
  { name: 'Tangerine', hue: 26 },
  { name: 'Amber', hue: 38 },
  { name: 'Saffron', hue: 48 },
  { name: 'Citron', hue: 62 },
  { name: 'Lime', hue: 88 },
  { name: 'Jade', hue: 140 },
  { name: 'Mint', hue: 160 },
  { name: 'Lagoon', hue: 182 },
  { name: 'Azure', hue: 200 },
  { name: 'Cobalt', hue: 222 },
  { name: 'Iris', hue: 250 },
  { name: 'Orchid', hue: 280 },
  { name: 'Fuchsia', hue: 312 },
  { name: 'Rose', hue: 340 },
  { name: 'Coral', hue: 356 },
];
const FEATURED = new Set([0, 6, 11]);
const SATURATION = 80;
const LIGHTNESS = 62;

function hslToRgb(h, s, l) {
  const sat = s / 100;
  const light = l / 100;
  const k = (n) => (n + h / 30) % 12;
  const a = sat * Math.min(light, 1 - light);
  const f = (n) => light - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255));
}

const toHex = (rgb) => `#${rgb.map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

function createTile(swatch, index) {
  const rgb = hslToRgb(swatch.hue, SATURATION, LIGHTNESS);
  const hex = toHex(rgb);
  const color = `hsl(${swatch.hue} ${SATURATION}% ${LIGHTNESS}%)`;
  const tone = swatch.hue < 75 || swatch.hue >= 300 ? 'warm' : 'cool';
  const el = document.createElement('li');
  el.className = FEATURED.has(index) ? 'tile tile--wide' : 'tile';
  el.innerHTML = `
    <button class="tile__btn" type="button" data-cursor-label="Open" aria-label="${escapeHTML(swatch.name)}, ${hex}. Open details">
      <span class="tile__bg" style="--c:${color}"></span>
      <span class="tile__content">
        <span class="tile__top"><span class="tile__num">${String(index + 1).padStart(2, '0')}</span><span class="tile__tone">${tone}</span></span>
        <span class="tile__bottom"><span class="tile__name">${escapeHTML(swatch.name)}</span><span class="tile__hex">${hex}</span></span>
      </span>
    </button>`;
  return {
    el,
    button: el.querySelector('.tile__btn'),
    bg: el.querySelector('.tile__bg'),
    name: swatch.name,
    hue: swatch.hue,
    tone,
    rgb,
    hex,
    color,
    index,
  };
}

export function initFlip() {
  const root = qs('[data-flip]');
  const grid = root && qs('[data-flip-grid]', root);
  if (!root || !grid) return;

  const spring = springCurve({ stiffness: 170, damping: 20 });
  const items = SWATCHES.map(createTile);
  items.forEach((item) => grid.appendChild(item.el));
  let order = [...items];
  let sortAscending = true;
  const running = new Set();

  const track = (animation) => {
    running.add(animation);
    animation.finished.catch(() => {}).finally(() => running.delete(animation));
    return animation;
  };

  const snapshot = () => {
    const map = new Map();
    for (const item of items) {
      if (item.el.hidden) continue;
      map.set(item, { box: item.el.getBoundingClientRect(), bg: item.bg.getBoundingClientRect() });
    }
    return map;
  };

  /** Runs `mutate` and animates every tile from where it was to where it is. */
  function flip(mutate) {
    const first = snapshot(); // includes in-flight transforms, so FLIP is interruptible
    running.forEach((animation) => animation.cancel());
    running.clear();
    qsa('.tile--ghost', grid).forEach((ghost) => ghost.remove());

    mutate();

    const last = snapshot();
    if (motion.reduced) return;
    const gridRect = grid.getBoundingClientRect();
    const duration = 720;
    let visibleIndex = 0;

    for (const item of order) {
      const from = first.get(item);
      const to = last.get(item);
      const delay = Math.min(visibleIndex * 14, 220);
      if (to) visibleIndex++;

      if (from && to) {
        const dx = from.box.left - to.box.left;
        const dy = from.box.top - to.box.top;
        const sx = from.bg.width / to.bg.width;
        const sy = from.bg.height / to.bg.height;
        // The colour layer can also move inside its tile (grid <-> list), so invert that too.
        const bx = from.bg.left - from.box.left - (to.bg.left - to.box.left);
        const by = from.bg.top - from.box.top - (to.bg.top - to.box.top);
        const moved = Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5;
        const morphed = Math.abs(sx - 1) > 0.005 || Math.abs(sy - 1) > 0.005 || Math.abs(bx) > 0.5 || Math.abs(by) > 0.5;
        if (moved) {
          track(
            item.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], {
              duration,
              easing: spring.easing,
              delay,
              fill: 'backwards',
            }),
          );
        }
        if (morphed) {
          track(
            item.bg.animate(
              [{ transform: `translate(${bx}px, ${by}px) scale(${sx}, ${sy})` }, { transform: 'translate(0, 0) scale(1, 1)' }],
              { duration, easing: spring.easing, delay, fill: 'backwards' },
            ),
          );
        }
      } else if (!from && to) {
        track(
          item.el.animate([{ opacity: 0, transform: 'scale(0.6)' }, { opacity: 1, transform: 'scale(1)' }], {
            duration: 560,
            easing: spring.easing,
            delay: delay + 120,
            fill: 'backwards',
          }),
        );
      } else if (from && !to) {
        // Leaving tiles are already out of the layout; a ghost fades out in their place.
        const ghost = item.el.cloneNode(true);
        ghost.hidden = false;
        ghost.classList.add('tile--ghost');
        ghost.setAttribute('aria-hidden', 'true');
        ghost.querySelector('button')?.setAttribute('tabindex', '-1');
        Object.assign(ghost.style, {
          position: 'absolute',
          left: `${from.box.left - gridRect.left}px`,
          top: `${from.box.top - gridRect.top}px`,
          width: `${from.box.width}px`,
          height: `${from.box.height}px`,
          margin: '0',
          pointerEvents: 'none',
        });
        grid.appendChild(ghost);
        const out = ghost.animate([{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.7)' }], {
          duration: 320,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        });
        out.finished.catch(() => {}).finally(() => ghost.remove());
      }
    }
  }

  const applyOrder = () => order.forEach((item) => grid.insertBefore(item.el, null));

  /* Toolbar actions ------------------------------------------------------- */
  const actions = {
    shuffle() {
      const next = [...order];
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      order = next;
      flip(applyOrder);
    },
    sort(button) {
      const ascending = sortAscending;
      order = [...order].sort((a, b) => (ascending ? a.hue - b.hue : b.hue - a.hue));
      sortAscending = !sortAscending;
      button.textContent = sortAscending ? 'Sort by hue' : 'Reverse hue';
      flip(applyOrder);
    },
    layout(button) {
      const list = !grid.classList.contains('is-list');
      flip(() => grid.classList.toggle('is-list', list));
      button.setAttribute('aria-pressed', String(list));
      button.textContent = list ? 'Grid view' : 'List view';
    },
  };
  qsa('[data-flip-action]', root).forEach((button) => {
    button.addEventListener('click', () => actions[button.dataset.flipAction]?.(button));
  });

  /* Filter (segmented control with an elastic pill) ------------------------ */
  const filterGroup = qs('[data-flip-filter]', root);
  const filterButtons = qsa('[role="radio"]', filterGroup);
  const pill = qs('[data-segmented-pill]', filterGroup);
  let filterIndex = 0;

  function setFilter(index, focus) {
    if (index === filterIndex) return;
    const direction = index > filterIndex ? 1 : -1;
    filterIndex = index;
    filterButtons.forEach((button, i) => {
      button.setAttribute('aria-checked', String(i === index));
      button.tabIndex = i === index ? 0 : -1;
    });
    if (focus) filterButtons[index].focus();
    slideIndicator(pill, filterButtons[index], direction);
    const value = filterButtons[index].dataset.value;
    flip(() => {
      for (const item of items) item.el.hidden = !(value === 'all' || item.tone === value);
    });
  }

  filterButtons.forEach((button, i) => button.addEventListener('click', () => setFilter(i, false)));
  filterGroup.addEventListener('keydown', (event) => {
    const n = filterButtons.length;
    const keys = { ArrowRight: (filterIndex + 1) % n, ArrowLeft: (filterIndex - 1 + n) % n };
    if (!(event.key in keys)) return;
    event.preventDefault();
    setFilter(keys[event.key], true);
  });
  const placePill = () => snapIndicator(pill, filterButtons[filterIndex]);
  placePill();
  document.fonts?.ready.then(placePill);
  window.addEventListener('resize', placePill);

  /* Shared-element detail dialog ----------------------------------------- */
  const modal = qs('[data-swatch-modal]');
  if (!modal) return;
  const modalColor = qs('[data-modal-color]', modal);
  const modalBody = qs('[data-modal-body]', modal);
  const modalName = qs('[data-modal-name]', modal);
  const modalEyebrow = qs('[data-modal-eyebrow]', modal);
  const modalValues = qs('[data-modal-values]', modal);
  const modalTints = qs('[data-modal-tints]', modal);
  const backdrop = qs('.modal__backdrop', modal);
  const closeButton = qs('.modal__close', modal);
  let openItem = null;
  let lastFocus = null;
  let closing = false;

  function fill(item) {
    modal.style.setProperty('--c', item.color);
    modalName.textContent = item.name;
    modalEyebrow.textContent = `Swatch ${String(item.index + 1).padStart(2, '0')} · ${item.tone}`;
    const values = [
      ['HEX', item.hex],
      ['RGB', `rgb(${item.rgb.join(', ')})`],
      ['HSL', `hsl(${item.hue} ${SATURATION}% ${LIGHTNESS}%)`],
    ];
    modalValues.innerHTML = values
      .map(
        ([key, value]) =>
          `<div><dt>${key}</dt><dd><span>${escapeHTML(value)}</span><button class="modal__copy" type="button" data-copy-value="${escapeHTML(value)}" aria-label="Copy ${key} value">Copy</button></dd></div>`,
      )
      .join('');
    modalTints.innerHTML = [86, 76, 62, 50, 38, 26]
      .map((l) => `<span style="--t:hsl(${item.hue} ${SATURATION}% ${l}%)" title="${l}% lightness"></span>`)
      .join('');
  }

  modalValues.addEventListener('click', async (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-copy-value]') : null;
    if (!button) return;
    const ok = await copyText(button.dataset.copyValue);
    button.textContent = ok ? 'Copied' : 'Failed';
    button.classList.add('is-copied');
    setTimeout(() => {
      button.textContent = 'Copy';
      button.classList.remove('is-copied');
    }, 1400);
  });

  /** Transform that maps rect `to` onto rect `from` (origin top-left), radius-corrected. */
  const invert = (from, to, radius) => {
    const sx = from.width / to.width;
    const sy = from.height / to.height;
    return {
      transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${sx}, ${sy})`,
      borderRadius: `${radius / sx}px / ${radius / sy}px`,
    };
  };

  function open(item) {
    if (openItem || closing) return;
    openItem = item;
    lastFocus = document.activeElement;
    fill(item);
    const from = item.bg.getBoundingClientRect();
    modal.hidden = false;
    document.documentElement.classList.add('is-modal-open');
    const to = modalColor.getBoundingClientRect();
    item.el.classList.add('is-source');
    closeButton.focus({ preventScroll: true });
    if (motion.reduced) return;

    modalColor.animate([invert(from, to, 18), { transform: 'none', borderRadius: '28px' }], {
      duration: 760,
      easing: spring.easing,
    });
    backdrop.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 400, easing: 'ease-out' });
    modalBody.animate(
      [
        { opacity: 0, transform: 'translateX(40px)' },
        { opacity: 1, transform: 'none' },
      ],
      { duration: 700, delay: 120, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
    );
    qsa('span', modalTints).forEach((tint, i) => {
      tint.animate(
        [
          { opacity: 0, transform: 'translateY(16px) scale(0.6)' },
          { opacity: 1, transform: 'none' },
        ],
        { duration: 500, delay: 300 + i * 50, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)', fill: 'backwards' },
      );
    });
  }

  function close() {
    if (!openItem || closing) return;
    const item = openItem;
    closing = true;
    const finish = () => {
      modal.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
      modal.hidden = true;
      document.documentElement.classList.remove('is-modal-open');
      item.el.classList.remove('is-source');
      openItem = null;
      closing = false;
      const target = lastFocus instanceof HTMLElement && lastFocus.isConnected ? lastFocus : item.button;
      target.focus({ preventScroll: true });
    };
    if (motion.reduced) {
      finish();
      return;
    }

    // Capture what is on screen right now (the opening may still be in flight)...
    const visual = modalColor.getBoundingClientRect();
    const backdropOpacity = getComputedStyle(backdrop).opacity;
    const bodyStyle = getComputedStyle(modalBody);
    const bodyFrom = { opacity: bodyStyle.opacity, transform: bodyStyle.transform === 'none' ? 'none' : bodyStyle.transform };
    // ...then drop the opening animations and measure the true, untransformed layout.
    modal.getAnimations({ subtree: true }).forEach((animation) => animation.cancel());
    const layout = modalColor.getBoundingClientRect();
    const to = item.bg.getBoundingClientRect();

    const easing = 'cubic-bezier(0.65, 0, 0.35, 1)';
    backdrop.animate([{ opacity: backdropOpacity }, { opacity: 0 }], { duration: 420, easing, fill: 'forwards' });
    modalBody.animate([bodyFrom, { opacity: 0, transform: 'translateX(40px)' }], {
      duration: 260,
      easing: 'ease-in',
      fill: 'forwards',
    });

    // Approximate the current corner radius from how far the opening had progressed.
    const span = layout.width - to.width;
    const openProgress = span > 0 ? clamp((visual.width - to.width) / span) : 1;
    const start = invert(visual, layout, lerp(18, 28, openProgress));
    const end = to.width > 0 ? invert(to, layout, 18) : { transform: 'scale(0.8)', borderRadius: '28px', opacity: 0 };
    if ('opacity' in end) start.opacity = 1;
    const animation = modalColor.animate([start, end], { duration: 560, easing, fill: 'forwards' });
    animation.finished.then(finish, finish);
  }

  items.forEach((item) => item.button.addEventListener('click', () => open(item)));
  qsa('[data-modal-close]', modal).forEach((element) => element.addEventListener('click', close));
  modal.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusables = qsa('button, [href], input, [tabindex]:not([tabindex="-1"])', modal).filter(
      (element) => element.offsetParent !== null,
    );
    if (!focusables.length) return;
    const firstEl = focusables[0];
    const lastEl = focusables[focusables.length - 1];
    if (event.shiftKey && document.activeElement === firstEl) {
      event.preventDefault();
      lastEl.focus();
    } else if (!event.shiftKey && document.activeElement === lastEl) {
      event.preventDefault();
      firstEl.focus();
    }
  });
}
