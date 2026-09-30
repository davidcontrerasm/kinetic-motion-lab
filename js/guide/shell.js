/**
 * Guide page chrome: chapter menu, mobile menu, table of contents with
 * scroll-spy, lesson tracking (progress), chapter completion, prev/next links
 * and guide-index progress.
 */
import { qs, qsa, escapeHTML } from '../core/dom.js';
import { motion } from '../core/motion.js';
import { burst } from '../core/ui.js';
import { CHAPTERS, chapterById, icon } from './registry.js';
import { createProgressStore } from './progress.js';
import { initSnippets, initNotes, initQuizzes, ringMarkup, setRing } from './widgets.js';

export const progress = createProgressStore();

// A frozen document retains its old store. Reload a BFCache restoration rather
// than merging snapshots into a second store or writing stale progress back.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) window.location.reload();
});

export function initGuideShell() {
  const page = document.body.dataset.page;
  const chapterId = document.body.dataset.chapter ?? null;
  markCurrentNav(page);
  initChapterMenu(chapterId);
  buildMobileMenu(chapterId);
  initSnippets(document);
  initNotes(document);
  if (page === 'chapter' && chapterId) {
    const toc = initToc();
    initLessonTracking(chapterId, toc);
    initQuizzes(document, { onComplete: (score) => progress.setQuiz(chapterId, score) });
    initCompletion(chapterId);
    buildChapterNav(chapterId);
  } else if (page === 'cheatsheet') {
    initToc();
  } else if (page === 'guide-index') {
    initIndexProgress();
  }
}

function markCurrentNav(page) {
  qsa('[data-guide-link]').forEach((link) => {
    if (link.dataset.guideLink === page) link.setAttribute('aria-current', 'page');
  });
  if (page === 'chapter') qs('[data-chapter-toggle]')?.classList.add('is-current');
}

/* -------------------------------------------------------------------------- */
/* Chapter menu (desktop dropdown)                                            */
/* -------------------------------------------------------------------------- */

function chapterLinks(currentId, className) {
  return CHAPTERS.map(
    (chapter, i) => `
      <a class="${className}" href="${chapter.file}" style="--i:${i};--c:${chapter.color}" data-chapter-link="${chapter.id}"${chapter.id === currentId ? ' aria-current="page"' : ''}>
        <span class="${className}__num">${chapter.num}</span>
        <span class="${className}__title">${escapeHTML(chapter.title)}</span>
        <span class="${className}__meta"><span class="mini-bar"><span data-mini-bar="${chapter.id}"></span></span><span data-mini-pct="${chapter.id}">0%</span></span>
      </a>`,
  ).join('');
}

function refreshMiniBars() {
  for (const chapter of CHAPTERS) {
    const pct = progress.percent(chapter.id, chapter.lessons);
    qsa(`[data-mini-bar="${chapter.id}"]`).forEach((bar) => bar.style.setProperty('--p', String(pct / 100)));
    qsa(`[data-mini-pct="${chapter.id}"]`).forEach((label) => (label.textContent = `${pct}%`));
  }
}

function initChapterMenu(currentId) {
  const toggle = qs('[data-chapter-toggle]');
  const menu = qs('[data-chapter-menu]');
  const grid = menu && qs('[data-chapter-grid]', menu);
  if (!toggle || !menu || !grid) return;
  grid.innerHTML = chapterLinks(currentId, 'chapter-link');
  refreshMiniBars();
  progress.subscribe(refreshMiniBars);

  let open = false;
  let hideTimer = 0;
  const setOpen = (next, { focus = false } = {}) => {
    if (next === open) return;
    open = next;
    toggle.setAttribute('aria-expanded', String(open));
    clearTimeout(hideTimer);
    if (open) {
      refreshMiniBars();
      menu.hidden = false;
      void menu.offsetWidth;
      menu.classList.add('is-open');
      if (focus) qs('.chapter-link', menu)?.focus({ preventScroll: true });
    } else {
      menu.classList.remove('is-open');
      hideTimer = setTimeout(() => (menu.hidden = true), motion.reduced ? 0 : 500);
    }
  };

  toggle.addEventListener('click', (event) => setOpen(!open, { focus: event.detail === 0 }));
  document.addEventListener('pointerdown', (event) => {
    if (!open || !(event.target instanceof Node)) return;
    if (!menu.contains(event.target) && !toggle.contains(event.target)) setOpen(false);
  });
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open) {
      setOpen(false);
      toggle.focus();
    }
  });
  window.addEventListener('scroll', () => open && window.scrollY > 40 && setOpen(false), { passive: true });
}

function buildMobileMenu(currentId) {
  const list = qs('[data-mobile-list]');
  if (!list) return;
  const items = [
    { href: '../index.html', num: '00', title: 'Showcase' },
    { href: 'index.html', num: 'FG', title: 'Guide home' },
    ...CHAPTERS.map((chapter) => ({ href: chapter.file, num: chapter.num, title: chapter.title, id: chapter.id })),
    { href: 'cheatsheet.html', num: 'REF', title: 'Cheat sheet' },
  ];
  list.innerHTML = items
    .map(
      (item, i) =>
        `<li style="--i:${i}"><a href="${item.href}"${item.id && item.id === currentId ? ' aria-current="page"' : ''}><small>${item.num}</small>${escapeHTML(item.title)}</a></li>`,
    )
    .join('');
}

/* -------------------------------------------------------------------------- */
/* Table of contents with scroll-spy                                          */
/* -------------------------------------------------------------------------- */

function initToc() {
  const list = qs('[data-toc-list]');
  if (!list) return null;
  const sections = qsa('[data-toc]');
  const links = new Map();
  sections.forEach((section) => {
    const title = qs('h2', section)?.textContent.replace(/\s+/g, ' ').trim() ?? section.id;
    const li = document.createElement('li');
    li.innerHTML = `<a class="toc__link" href="#${section.id}"><span class="toc__num">${escapeHTML(section.dataset.toc)}</span><span class="toc__label">${escapeHTML(title)}</span><span class="toc__dot" aria-hidden="true"></span></a>`;
    list.appendChild(li);
    links.set(section.id, li.firstElementChild);
  });

  const track = list.parentElement;
  const indicator = document.createElement('span');
  indicator.className = 'toc__indicator';
  indicator.setAttribute('aria-hidden', 'true');
  track.appendChild(indicator);

  let active = null;
  const place = () => {
    if (!active) {
      indicator.style.opacity = '0';
      return;
    }
    indicator.style.opacity = '1';
    indicator.style.height = `${active.offsetHeight}px`;
    indicator.style.transform = `translateY(${active.offsetTop}px)`;
  };
  const setActive = (link) => {
    if (link === active) return;
    active?.classList.remove('is-active');
    active?.removeAttribute('aria-current');
    active = link;
    active?.classList.add('is-active');
    active?.setAttribute('aria-current', 'location');
    place();
  };

  if ('IntersectionObserver' in window) {
    const visible = new Set();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target);
          else visible.delete(entry.target);
        }
        const current = sections.filter((section) => visible.has(section)).pop();
        if (current) setActive(links.get(current.id));
      },
      { rootMargin: '-30% 0px -60% 0px' },
    );
    sections.forEach((section) => observer.observe(section));
  }
  window.addEventListener('resize', place);
  document.fonts?.ready.then(place);
  return { links };
}

/* -------------------------------------------------------------------------- */
/* Lesson tracking and chapter completion                                     */
/* -------------------------------------------------------------------------- */

function initLessonTracking(chapterId, toc) {
  const lessons = qsa('[data-lesson]');
  const total = lessons.length;

  const render = () => {
    const state = progress.get(chapterId);
    toc?.links.forEach((link, id) => link.classList.toggle('is-seen', state.seen.includes(id)));
    const pct = progress.percent(chapterId, total);
    qsa('[data-chapter-percent]').forEach((el) => (el.textContent = `${pct}%`));
    qsa('[data-chapter-bar]').forEach((el) => el.style.setProperty('--p', String(pct / 100)));
    qsa('[data-chapter-ring]').forEach((el) => setRing(el, pct));
  };
  render();
  progress.subscribe(render);

  const timers = new Map();
  let frame = 0;
  const engaged = (lesson) => {
    if (document.hidden) return false;
    const rect = lesson.getBoundingClientRect();
    const height = document.documentElement.clientHeight || window.innerHeight;
    const visible = Math.max(0, Math.min(rect.bottom, height) - Math.max(rect.top, 0));
    return rect.height > 0 && rect.width > 0 && rect.right > 0 && rect.left < window.innerWidth &&
      (visible / rect.height >= 0.4 || visible >= height * 0.5);
  };
  const cancel = (id) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  };
  const clear = () => {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const id of timers.keys()) cancel(id);
  };
  const measure = () => {
    frame = 0;
    const seen = progress.get(chapterId).seen;
    for (const lesson of lessons) {
      const id = lesson.id;
      if (seen.includes(id) || !engaged(lesson)) {
        cancel(id);
      } else if (!timers.has(id)) {
        timers.set(id, setTimeout(() => {
          timers.delete(id);
          // Recheck geometry even if no scroll event accompanied a layout change.
          if (engaged(lesson) && !progress.get(chapterId).seen.includes(id)) progress.markSeen(chapterId, id);
        }, 1200));
      }
    }
  };
  const schedule = () => {
    if (document.hidden) clear();
    else if (!frame) frame = requestAnimationFrame(measure);
  };
  // At most seven rect reads per pass. Nested exercise scrolls are coalesced too.
  document.addEventListener('scroll', schedule, { passive: true, capture: true });
  window.addEventListener('resize', schedule, { passive: true });
  document.addEventListener('visibilitychange', schedule);
  window.addEventListener('pagehide', clear);
  window.addEventListener('pageshow', schedule);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(schedule);
    lessons.forEach((lesson) => observer.observe(lesson));
  }
  schedule();
}

function initCompletion(chapterId) {
  const button = qs('[data-complete]');
  if (!button) return;
  const label = qs('[data-complete-label]', button);
  const render = () => {
    const done = progress.get(chapterId).done;
    button.setAttribute('aria-pressed', String(done));
    if (label) label.textContent = done ? 'Chapter studied' : 'Mark chapter as studied';
  };
  render();
  progress.subscribe(render);
  button.addEventListener('click', () => {
    const done = !progress.get(chapterId).done;
    progress.setDone(chapterId, done);
    if (done) {
      const box = qs('.complete__box', button);
      burst(box, { x: box.offsetWidth / 2, y: box.offsetHeight / 2, count: 18, distance: [30, 70] });
    }
  });
}

function navCard(target, direction) {
  const label = direction === 'prev' ? 'Previous' : 'Next';
  const arrow = icon(direction === 'prev' ? 'arrow-left' : 'arrow-right', 'icon chapter-nav__arrow');
  const num = target.num ? `<span class="chapter-nav__num">${target.num}</span>` : '';
  return `<a class="chapter-nav__link chapter-nav__link--${direction}" href="${target.file}" style="--c:${target.color ?? 'var(--paper)'}">
      <span class="chapter-nav__dir">${direction === 'prev' ? arrow : ''}${label}</span>
      <span class="chapter-nav__title">${num}${escapeHTML(target.title)}</span>
      ${direction === 'next' ? arrow : ''}
    </a>`;
}

function buildChapterNav(chapterId) {
  const nav = qs('[data-chapter-nav]');
  if (!nav) return;
  const index = CHAPTERS.findIndex((chapter) => chapter.id === chapterId);
  const prev = CHAPTERS[index - 1] ?? { file: 'index.html', title: 'Field guide home' };
  const next = CHAPTERS[index + 1] ?? { file: 'cheatsheet.html', title: 'Cheat sheet & glossary' };
  nav.innerHTML = navCard(prev, 'prev') + navCard(next, 'next');
}

/* -------------------------------------------------------------------------- */
/* Guide index progress                                                       */
/* -------------------------------------------------------------------------- */

let indexProgressInitialized = false;

export function initIndexProgress(basePath = '') {
  if (indexProgressInitialized) return;
  indexProgressInitialized = true;
  const rows = qsa('[data-chapter-row]');
  rows.forEach((row) => {
    const slot = qs('[data-ring-slot]', row);
    if (slot && !slot.querySelector('.ring')) slot.insertAdjacentHTML('afterbegin', ringMarkup());
  });
  const render = () => {
    rows.forEach((row) => {
      const chapter = chapterById(row.dataset.chapterRow);
      if (!chapter) return;
      const pct = progress.percent(chapter.id, chapter.lessons);
      const ring = qs('.ring', row);
      if (ring) setRing(ring, pct);
      const label = qs('[data-ring-label]', row);
      if (label) label.textContent = `${pct}%`;
      row.classList.toggle('is-done', pct === 100);
    });
    const overall = progress.overall(CHAPTERS);
    qsa('[data-overall-ring]').forEach((ring) => setRing(ring, overall));
    qsa('[data-overall-pct]').forEach((el) => (el.textContent = String(overall)));
    const completed = CHAPTERS.filter((chapter) => progress.percent(chapter.id, chapter.lessons) === 100).length;
    qsa('[data-overall-done]').forEach((el) => (el.textContent = String(completed)));
    const resume = qs('[data-resume]');
    if (resume) {
      const nextChapter = CHAPTERS.find((chapter) => progress.percent(chapter.id, chapter.lessons) < 100) ?? CHAPTERS[0];
      resume.href = `${basePath}${nextChapter.file}`;
      const label = qs('[data-resume-label]', resume);
      if (label) label.textContent = overall === 0 ? 'Start with chapter 01' : `Continue with chapter ${nextChapter.num}`;
    }
  };
  render();
  progress.subscribe(render);
  qs('[data-progress-reset]')?.addEventListener('click', () => progress.reset());
}
