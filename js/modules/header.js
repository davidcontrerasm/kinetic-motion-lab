/**
 * Header behaviour: rolling nav labels, active-section indicator, smart
 * hide-on-scroll, scroll progress, the motion toggle and the mobile menu.
 */
import { qs, qsa } from '../core/dom.js';
import { motion, onFrame, clamp } from '../core/motion.js';

export function initHeader() {
  const header = qs('[data-header]');
  if (!header) return;
  initRoll();
  initMotionToggle();
  initMenu(header);
  initActiveSection();
  initScrollChrome(header);
}

function initRoll() {
  qsa('[data-roll]').forEach((element) => {
    const text = element.textContent.trim();
    element.textContent = '';
    const readable = document.createElement('span');
    readable.className = 'sr-only';
    readable.textContent = text;
    const visual = document.createElement('span');
    visual.className = 'roll';
    visual.setAttribute('aria-hidden', 'true');
    Array.from(text).forEach((char, index) => {
      const span = document.createElement('span');
      span.className = 'roll__char';
      span.textContent = char === ' ' ? '\u00a0' : char;
      span.dataset.char = span.textContent;
      span.style.setProperty('--i', index);
      visual.appendChild(span);
    });
    element.append(readable, visual);
  });
}

function initMotionToggle() {
  const button = qs('[data-motion-toggle]');
  const label = qs('[data-motion-label]');
  const sync = (reduced) => {
    button?.setAttribute('aria-pressed', String(!reduced));
    if (label) label.textContent = reduced ? 'Off' : 'On';
  };
  sync(motion.reduced);
  motion.subscribe(sync);
  button?.addEventListener('click', () => motion.toggle());

  window.addEventListener('keydown', (event) => {
    if (typeof event.key !== 'string' || event.key.toLowerCase() !== 'm') return;
    if (event.metaKey || event.ctrlKey || event.altKey || event.repeat) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    motion.toggle();
  });
}

function initMenu(header) {
  const toggle = qs('[data-menu-toggle]');
  const menu = qs('[data-menu]');
  if (!toggle || !menu) return;
  let open = false;
  let hideTimer = 0;

  const setOpen = (next) => {
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    header.classList.toggle('is-menu-open', open);
    header.classList.remove('is-hidden');
    document.documentElement.classList.toggle('is-menu-open', open);
    clearTimeout(hideTimer);
    if (open) {
      menu.hidden = false;
      void menu.offsetWidth;
      menu.classList.add('is-open');
      qs('a', menu)?.focus({ preventScroll: true });
    } else {
      menu.classList.remove('is-open');
      hideTimer = setTimeout(() => {
        menu.hidden = true;
      }, motion.reduced ? 0 : 800);
    }
  };

  toggle.addEventListener('click', () => setOpen(!open));
  menu.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('a')) setOpen(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.matchMedia('(min-width: 1081px)').addEventListener?.('change', (event) => {
    if (event.matches && open) setOpen(false);
  });
}

function initActiveSection() {
  const links = qsa('[data-nav-link]');
  const indicator = qs('[data-nav-indicator]');
  if (!links.length || !('IntersectionObserver' in window)) return;

  const byId = new Map(links.map((link) => [link.getAttribute('href').slice(1), link]));
  const visible = new Map();
  let active = null;

  const place = () => {
    if (!indicator) return;
    if (!active) {
      indicator.classList.remove('is-visible');
      return;
    }
    const nav = indicator.parentElement;
    const navRect = nav.getBoundingClientRect();
    const rect = active.getBoundingClientRect();
    indicator.style.width = `${rect.width}px`;
    indicator.style.transform = `translateX(${rect.left - navRect.left - nav.clientLeft}px)`;
    indicator.classList.add('is-visible');
  };

  const setActive = (link) => {
    if (link === active) return;
    active?.removeAttribute('aria-current');
    active = link;
    active?.setAttribute('aria-current', 'true');
    place();
  };

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
      const current = [...byId.keys()].reverse().find((id) => visible.get(id));
      setActive(current ? byId.get(current) : null);
    },
    { rootMargin: '-45% 0px -50% 0px' },
  );
  byId.forEach((_, id) => {
    const section = document.getElementById(id);
    if (section) observer.observe(section);
  });
  window.addEventListener('resize', place);
  document.fonts?.ready.then(place);
}

function initScrollChrome(header) {
  const bar = qs('[data-scroll-progress]');
  const ring = qs('[data-top-progress]');
  const circumference = ring ? 2 * Math.PI * ring.r.baseVal.value : 0;
  if (ring) ring.style.strokeDasharray = String(circumference);

  let maxScroll = 1;
  const measure = () => {
    maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
  };
  measure();
  window.addEventListener('resize', measure);
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(document.body);

  let lastY = window.scrollY;
  let hidden = false;
  let scrolled = false;
  let lastProgress = -1;

  header.addEventListener('focusin', () => {
    hidden = false;
    header.classList.remove('is-hidden');
  });

  onFrame(() => {
    const y = window.scrollY;
    const delta = y - lastY;
    if (Math.abs(delta) > 6) {
      const menuOpen = document.documentElement.classList.contains('is-menu-open');
      const shouldHide = delta > 0 && y > window.innerHeight * 0.6 && !menuOpen;
      if (shouldHide !== hidden) {
        hidden = shouldHide;
        header.classList.toggle('is-hidden', hidden);
      }
      lastY = y;
    }

    const isScrolled = y > 24;
    if (isScrolled !== scrolled) {
      scrolled = isScrolled;
      header.classList.toggle('is-scrolled', scrolled);
    }

    const progress = clamp(y / maxScroll);
    if (Math.abs(progress - lastProgress) > 0.0005) {
      lastProgress = progress;
      if (bar) bar.style.transform = `scaleX(${progress.toFixed(4)})`;
      if (ring) ring.style.strokeDashoffset = String(circumference * (1 - progress));
    }
  });
}
