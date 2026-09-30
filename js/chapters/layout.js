/** Chapter 07. All persistent meaning lives in the DOM, not animation completion. */
import { qs, qsa } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp } from '../core/motion.js';
import { RollingNumber, syncRange } from '../core/ui.js';
import { createMorph } from '../core/morph.js';
import { initFlip } from '../modules/flip.js';
import { runDemos } from './shared.js';

const effects = new Map();
function cancel(el) { const a = effects.get(el); effects.delete(el); a?.cancel(); }
function animate(el, frames, duration = 450) {
  cancel(el);
  if (motion.reduced || document.hidden) return;
  const a = el.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
  effects.set(el, a);
  a.onfinish = a.oncancel = () => { if (effects.get(el) === a) effects.delete(el); };
}
const inverse = (a, b) => `translate(${a.left - b.left}px,${a.top - b.top}px) scale(${a.width / b.width},${a.height / b.height})`;
function settleEffects(root) { qsa('*', root).forEach(cancel); }
function onInactive(root, settle) {
  observeVisibility(root, visible => { root.dataset.visible = String(visible); if (!visible) settle(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  motion.subscribe(reduced => { if (reduced) settle(); });
}
export function init() {
  const demos = { 'flip-debugger': debuggerStudy, 'flip-grid': swatches, height, 'view-transitions': albums, morph, leaderboard };
  runDemos(Object.fromEntries(Object.entries(demos).map(([name, fn]) => [name, root => { fn(root); root.dataset.ready = 'true'; }])));
}

function debuggerStudy(root) {
  const board = qs('[data-board]', root), tile = qs('[data-tile]', root), scrub = qs('[data-scrub]', root);
  let first, last, destination = true, p = 0, started = 0, active = false;
  function layout(value) { board.dataset.destination = String(value); tile.style.transform = ''; }
  function ghosts() {
    const origin = board.getBoundingClientRect();
    [[qs('[data-first]', root), first], [qs('[data-last]', root), last]].forEach(([el, rect]) => {
      Object.assign(el.style, { left: `${rect.left - origin.left}px`, top: `${rect.top - origin.top}px`, width: `${rect.width}px`, height: `${rect.height}px` });
    });
    qs('[data-geometry]', root).textContent = `dx ${(first.left - last.left).toFixed(1)}px · dy ${(first.top - last.top).toFixed(1)}px · sx ${(first.width / last.width).toFixed(3)} · sy ${(first.height / last.height).toFixed(3)}`;
  }
  function stage(value) {
    scrub.value = String(value); syncRange(scrub); root.dataset.phase = value < 1 ? 'F' : value < 2 ? 'L' : value < 3 ? 'I/P' : 'P';
    qs('[data-phase-report]', root).textContent = value < 1 ? 'F · original layout' : value < 2 ? 'L · last layout committed' : value < 3 ? `I → P · last layout, ${Math.round((value - 2) * 100)}% inverse removed` : 'P · identity transform';
    qsa('[data-phase]', root).forEach(b => b.setAttribute('aria-pressed', String(Math.floor(value) === +b.dataset.phase)));
  }
  function paint(t) {
    p = t; const k = 1 - t;
    tile.style.transform = `translate(${(first.left - last.left) * k}px,${(first.top - last.top) * k}px) scale(${1 + (first.width / last.width - 1) * k},${1 + (first.height / last.height - 1) * k})`;
    stage(2 + t);
  }
  const loop = createLoop((dt, now) => { const t = clamp((now - started) / 800, 0, 1); paint(1 - (1 - t) ** 3); if (t === 1) { active = false; loop.stop(); } });
  function stop() { loop.stop(); active = false; }
  function calibrate() { stop(); layout(false); first = tile.getBoundingClientRect(); layout(true); last = tile.getBoundingClientRect(); ghosts(); layout(false); stage(0); destination = true; }
  function choose(value) {
    stop();
    if (value < 1) { layout(!destination); stage(value); }
    else if (value < 2) { layout(destination); stage(value); }
    else { layout(destination); paint(value - 2); }
  }
  function play() { layout(destination); paint(motion.reduced ? 1 : 0); if (!motion.reduced) { started = performance.now(); active = true; loop.start(); } }
  function retarget(reverse) {
    // Snapshot BEFORE dropping the transform. A finished rerun deliberately starts at F.
    if (!reverse && !active && p === 1) layout(!destination);
    const visual = tile.getBoundingClientRect(); stop();
    if (reverse) destination = !destination;
    first = visual; layout(destination); last = tile.getBoundingClientRect(); ghosts(); play();
  }
  qsa('[data-phase]', root).forEach(b => b.addEventListener('click', () => { const value = +b.dataset.phase; if (value === 3) play(); else choose(value); }));
  scrub.addEventListener('input', () => choose(+scrub.value));
  qs('[data-rerun]', root).addEventListener('click', () => retarget(false));
  qs('[data-reverse]', root).addEventListener('click', () => retarget(true));
  onInactive(root, () => { if (active) { stop(); paint(1); } });
  new ResizeObserver(calibrate).observe(board); calibrate();
}

function swatches(root) {
  initFlip(); // Exact showcase initializer, including its document-level modal lookup.
  const modal = qs('[data-swatch-modal]');
  function settle() {
    [root, modal].forEach(el => el.getAnimations({ subtree: true }).forEach(a => {
      // Finish first: the borrowed dialog's closing promise must resolve and restore focus.
      try { a.finish(); } catch { /* An effect without a finite end can only be cancelled. */ }
      a.cancel();
    }));
    qsa('.tile--ghost', root).forEach(el => el.remove());
  }
  motion.subscribe(reduced => { if (reduced) settle(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) settle(); });
  root.addEventListener('click', () => queueMicrotask(() => {
    const focused = document.activeElement;
    if (focused?.closest('.tile[hidden]')) qs('[role=radio][aria-checked=true]', root).focus({ preventScroll: true });
  }));
}

function height(root) {
  const cards = qsa('[data-method]', root), all = qs('[data-toggle-all]', root), grow = qs('[data-grow]', root), width = qs('[data-width]', root);
  const animations = new Map();
  function report(card) {
    const content = qs('[data-height-content]', card), panel = qs('[data-height-panel]', card);
    qs('[data-measure]', card).textContent = `Content ${content.scrollHeight}px · visible box ${panel.getBoundingClientRect().height.toFixed(0)}px`;
  }
  function measure(card, instant = false) {
    const panel = qs('[data-height-panel]', card), content = qs('[data-height-content]', card), open = card.classList.contains('is-open');
    const current = panel.getBoundingClientRect().height;
    const old = animations.get(card); animations.delete(card); old?.cancel();
    const target = open ? content.scrollHeight : 0;
    panel.style.height = open ? 'auto' : '0px';
    if (!instant && !motion.reduced && !document.hidden) {
      const a = panel.animate([{ height: `${current}px` }, { height: `${target}px` }], { duration: 350, easing: 'ease' });
      animations.set(card, a);
      a.onfinish = () => { if (animations.get(card) === a) { animations.delete(card); report(card); } };
    }
    report(card);
  }
  function set(card, open, instant = false) {
    const panel = qs('[data-height-panel]', card), trigger = qs('[data-height-toggle]', card);
    if (!open && panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
    trigger.setAttribute('aria-expanded', String(open)); panel.inert = !open; panel.setAttribute('aria-hidden', String(!open));
    card.classList.toggle('is-open', open);
    if (card.dataset.method === 'js') measure(card, instant); else report(card);
    all.textContent = cards.every(c => c.classList.contains('is-open')) ? 'Close all' : 'Open all';
  }
  cards.forEach(card => {
    qs('[data-height-toggle]', card).addEventListener('click', () => set(card, !card.classList.contains('is-open')));
    card.addEventListener('transitionend', () => report(card));
    card.addEventListener('keydown', e => { if (e.key === 'Escape') set(card, false); });
    new ResizeObserver(() => { if (card.dataset.method === 'js') measure(card); else report(card); }).observe(qs('[data-height-content]', card));
    set(card, false, true);
  });
  all.addEventListener('click', () => { const open = !cards.every(c => c.classList.contains('is-open')); cards.forEach(c => set(c, open)); });
  function content() { qsa('[data-more]', root).forEach(el => { el.hidden = grow.getAttribute('aria-pressed') !== 'true'; }); cards.forEach(report); }
  grow.addEventListener('click', () => { grow.setAttribute('aria-pressed', String(grow.getAttribute('aria-pressed') !== 'true')); content(); });
  width.addEventListener('input', () => { qs('[data-height-grid]', root).style.width = `${width.value}%`; });
  qs('[data-reset]', root).addEventListener('click', () => { grow.setAttribute('aria-pressed', 'false'); width.value = '100'; syncRange(width); qs('[data-height-grid]', root).style.width = '100%'; content(); cards.forEach(c => set(c, false, true)); });
  onInactive(root, () => { cards.forEach(c => { if (c.dataset.method === 'js') measure(c, true); }); });
}

function albums(root) {
  const sources = qsa('[data-album]', root), covers = qsa('[data-cover]', root), list = qs('[data-album-list]', root), detail = qs('[data-album-detail]', root), slot = qs('[data-cover-slot]', root), back = qs('[data-back]', root), force = qs('[data-force-fallback]', root), save = qs('[data-save]', root);
  const titles = ['Night lines', 'Solar rooms', 'Field recordings'];
  const notes = ['Low Tide · 8 tracks. Nocturnal rhythms and quiet intervals.', 'Ada North · 6 tracks. Warm harmonies arranged around a repeating motif.', 'Moss Club · 9 tracks. A collection of small outdoor textures.'];
  const saved = [false, false, false];
  let shown = null, desired = null, lastSource = 0, revision = 0, active = null;
  root.dataset.supported = String(typeof document.startViewTransition === 'function');
  function engine(value, text) { root.dataset.engine = value; qs('[data-engine-report]', root).textContent = text; }
  function names(enabled) {
    covers.forEach((el, i) => { el.style.viewTransitionName = enabled && el.getClientRects().length ? `layout-album-${i}` : 'none'; });
  }
  function savedState() { const value = shown !== null && saved[shown]; save.setAttribute('aria-pressed', String(value)); save.textContent = value ? 'Saved locally ✓' : 'Save album locally'; }
  function commit(next, focus) {
    const oldFocus = document.activeElement;
    if (next === null) {
      list.hidden = false; list.inert = false; list.removeAttribute('aria-hidden');
      covers.forEach((el, i) => { if (el.parentElement !== sources[i]) sources[i].prepend(el); });
      if (focus || detail.contains(oldFocus)) sources[lastSource].focus({ preventScroll: true });
      detail.hidden = true; detail.inert = true; detail.setAttribute('aria-hidden', 'true');
    } else {
      lastSource = next; detail.hidden = false; detail.inert = false; detail.setAttribute('aria-hidden', 'false');
      covers.forEach((el, i) => { if (i !== next && el.parentElement !== sources[i]) sources[i].prepend(el); });
      slot.append(covers[next]);
      qs('[data-album-title]', root).textContent = titles[next];
      qs('[data-album-description]', root).textContent = `${notes[next]} Local notes only; no audio is played.`;
      if (focus || list.contains(oldFocus)) back.focus({ preventScroll: true });
      list.inert = true; list.setAttribute('aria-hidden', 'true'); list.hidden = true;
    }
    shown = next; sources.forEach((b, i) => b.setAttribute('aria-expanded', String(i === next)));
    root.dataset.state = next === null ? 'grid' : 'detail'; root.dataset.album = next === null ? '' : String(next); savedState();
  }
  async function request(next, focus = true) {
    desired = next; const ticket = ++revision; const previous = active;
    if (previous) {
      previous.skipTransition();
      await Promise.allSettled([previous.ready, previous.updateCallbackDone, previous.finished]);
    }
    if (ticket !== revision) return;
    active = null; names(false); delete document.documentElement.dataset.layoutVt;
    const selected = next ?? shown ?? lastSource;
    const from = covers[selected].getBoundingClientRect(); // before fallback cancellation
    settleEffects(root);
    if (motion.reduced || document.hidden) {
      commit(next, focus); engine('instant', 'Instant · reduced motion or inactive document'); return;
    }
    if (force.checked || typeof document.startViewTransition !== 'function') {
      commit(next, focus); const to = covers[selected].getBoundingClientRect();
      if (from.width && to.width) animate(covers[selected], [{ transform: inverse(from, to) }, { transform: 'none' }]);
      if (next !== null) animate(qs('[data-album-copy]', root), [{ opacity: .2 }, { opacity: 1 }], 220);
      engine('fallback', 'Fallback · current-rectangle FLIP + content fade'); return;
    }
    document.documentElement.dataset.layoutVt = 'true'; names(true);
    engine('native', 'Native View Transition · preparing snapshots');
    try {
      const vt = document.startViewTransition(() => {
        if (ticket !== revision) return;
        commit(next, focus); names(true);
      });
      active = vt;
      // Attach all rejection handlers immediately, including ready after skipTransition.
      const ready = vt.ready.then(() => { if (ticket === revision) engine('native', 'Native View Transition · named cover snapshots'); }, () => { if (ticket === revision) engine('instant', 'Native animation skipped · semantic update retained'); });
      const updated = vt.updateCallbackDone.catch(() => { if (ticket === revision) commit(next, focus); });
      await Promise.allSettled([ready, updated, vt.finished]);
      if (active === vt) { active = null; names(false); delete document.documentElement.dataset.layoutVt; }
    } catch {
      if (ticket !== revision) return;
      active = null; names(false); delete document.documentElement.dataset.layoutVt;
      commit(next, focus); engine('fallback', 'Fallback · native capture unavailable; state committed');
    }
  }
  sources.forEach((b, i) => b.addEventListener('click', () => { void request(i); }));
  back.addEventListener('click', () => { void request(null); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && desired !== null) { e.preventDefault(); void request(null); } });
  force.addEventListener('change', () => { void request(desired, false); });
  save.addEventListener('click', () => { if (shown !== null) { saved[shown] = !saved[shown]; savedState(); } });
  motion.subscribe(() => { void request(desired, false); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) void request(desired, false); });
  commit(null, false); engine(motion.reduced ? 'instant' : root.dataset.supported === 'true' ? 'native' : 'fallback', motion.reduced ? 'Instant · reduced motion' : root.dataset.supported === 'true' ? 'Native View Transition available · choose a cover' : 'Fallback · View Transition API unavailable');
}

function morph(root) {
  const select = qs('[data-shape]', root), scrub = qs('[data-scrub]', root);
  const shapes = qsa('[data-morph]', root).map(button => {
    const path = qs('[data-path]', button);
    return { button, path, sample: createMorph(path.dataset.from, path.dataset.to), labels: button.dataset.labels.split('|'), p: 0, from: 0, target: 0, start: 0, moving: false };
  });
  const selected = () => shapes.find(s => s.button.dataset.morph === select.value);
  function paint(s) {
    s.path.setAttribute('d', s.sample(s.p)); s.button.dataset.progress = s.p.toFixed(4);
    s.button.setAttribute('aria-pressed', String(s.target === 1));
    qs('[data-shape-label]', s.button).textContent = s.labels[s.target];
    s.button.setAttribute('aria-label', `${s.labels.join(' / ')} study: ${s.labels[s.target]}; activate to toggle`);
    if (s === selected()) { scrub.value = String(s.p); syncRange(scrub); qs('[data-path-readout]', root).textContent = s.path.getAttribute('d'); }
  }
  const loop = createLoop((dt, now) => {
    shapes.filter(s => s.moving).forEach(s => { const t = clamp((now - s.start) / 500, 0, 1); s.p = s.from + (s.target - s.from) * (1 - (1 - t) ** 3); if (t === 1) s.moving = false; paint(s); });
    if (!shapes.some(s => s.moving)) loop.stop();
  });
  function go(s, target, replay = false) {
    s.target = target; if (replay) s.p = 1 - target;
    s.from = s.p; s.start = performance.now(); s.moving = !motion.reduced;
    if (motion.reduced) s.p = target; else loop.start(); paint(s);
  }
  shapes.forEach(s => { s.button.addEventListener('click', () => { select.value = s.button.dataset.morph; go(s, 1 - s.target); }); paint(s); });
  select.addEventListener('change', () => paint(selected()));
  scrub.addEventListener('input', () => { const s = selected(), value = +scrub.value; s.moving = false; s.target = value >= .5 ? 1 : 0; s.p = motion.reduced ? s.target : value; paint(s); });
  qs('[data-replay]', root).addEventListener('click', () => go(selected(), selected().target, true));
  onInactive(root, () => { loop.stop(); shapes.forEach(s => { s.moving = false; s.p = s.target; paint(s); }); });
}

function leaderboard(root) {
  const list = qs('[data-players]', root), rows = qsa('[data-player]', root);
  const players = rows.map((el, i) => ({ el, index: i, score: +el.dataset.score, initial: +el.dataset.score, roller: new RollingNumber(qs('[data-score-value]', el), { value: +el.dataset.score }) }));
  let round = 0;
  function settleNumbers() { rows.forEach(el => { el.getAnimations({ subtree: true }).forEach(a => a.cancel()); qsa('.is-leaving', el).forEach(n => n.remove()); }); }
  function update(reset = false) {
    const first = new Map(rows.map(el => [el, el.getBoundingClientRect()]));
    const focused = document.activeElement; settleNumbers(); rows.forEach(cancel);
    round = reset ? 0 : round + 1;
    players.forEach(p => { p.score = reset ? p.initial : p.score + ((p.index + round * 2) % 5) * 17 + 3; p.el.dataset.score = String(p.score); p.roller.set(p.score); });
    const order = [...players].sort((a, b) => b.score - a.score || a.index - b.index);
    order.forEach((p, i) => { if (list.children[i] !== p.el) list.insertBefore(p.el, list.children[i] || null); qs('[data-badge]', p.el).textContent = ['1 · Gold', '2 · Silver', '3 · Bronze'][i] || String(i + 1); });
    const last = new Map(rows.map(el => [el, el.getBoundingClientRect()]));
    rows.forEach(el => animate(el, [{ transform: `translateY(${first.get(el).top - last.get(el).top}px)` }, { transform: 'none' }]));
    if (list.contains(focused)) focused.focus({ preventScroll: true });
    root.dataset.round = String(round); root.dataset.order = order.map(p => p.el.dataset.player).join(',');
    qs('[data-order-report]', root).textContent = `Round ${round}: ${order.map(p => `${p.el.dataset.name} ${p.score}`).join(' → ')}`;
  }
  qs('[data-round]', root).addEventListener('click', () => update()); qs('[data-reset]', root).addEventListener('click', () => update(true));
  onInactive(root, () => { settleNumbers(); rows.forEach(cancel); });
  root.dataset.round = '0'; root.dataset.order = rows.map(el => el.dataset.player).join(',');
}
