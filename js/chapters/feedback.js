/** Chapter 04 — local-only interaction studies. No data is sent or persisted. */
import { qs, qsa } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp } from '../core/motion.js';
import { Spring } from '../core/spring.js';
import { rubberBand } from '../core/physics.js';
import { runDemos } from './shared.js';

const animations = new Map();
function stopAnimation(el) { const a = animations.get(el); if (a) { animations.delete(el); a.cancel(); } }
/** Visual-only animations: semantic state always lives in the underlying DOM. */
function animate(el, frames, duration = 240) {
  stopAnimation(el);
  if (motion.reduced) return;
  const a = el.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' });
  animations.set(el, a);
  const done = () => { if (animations.get(el) === a) animations.delete(el); };
  a.onfinish = done; a.oncancel = done;
}
function translate(el, x, y = 0, immediate = false) {
  const from = getComputedStyle(el).transform;
  stopAnimation(el);
  const to = `translate(${x}px, ${y}px)`;
  el.style.transform = to;
  if (!immediate) animate(el, [{ transform: from }, { transform: to }]);
}
motion.subscribe(reduced => { if (reduced) [...animations.keys()].forEach(stopAnimation); });

/** Cancellable simulated work, deliberately independent of animation duration. */
function task() {
  let timer = 0, revision = 0;
  return {
    cancel() { revision++; clearTimeout(timer); },
    run(step, interval, done) {
      this.cancel(); const ticket = revision; let n = 0;
      const tick = () => {
        if (ticket !== revision) return;
        n++; step(n * 10);
        if (n === 10) done(); else timer = setTimeout(tick, interval);
      };
      timer = setTimeout(tick, interval);
    },
    after(ms, done) { this.cancel(); const ticket = revision; timer = setTimeout(() => { if (ticket === revision) done(); }, ms); },
  };
}

/** One pointer owner; horizontal gestures defer to native vertical scrolling. */
function gesture(surface, { axis = 'y', begin, move, end, accept = () => true }) {
  let active = null;
  function finish(cancelled) {
    if (!active) return;
    const a = active; active = null;
    if (surface.hasPointerCapture(a.id)) surface.releasePointerCapture(a.id);
    end(cancelled, a);
  }
  surface.addEventListener('pointerdown', e => {
    if (active || e.button !== 0 || !e.isPrimary || !accept(e)) return;
    if (begin(e) === false) return;
    active = { id: e.pointerId, x: e.clientX, y: e.clientY, locked: axis !== 'x' };
    if (active.locked) surface.setPointerCapture(e.pointerId);
  });
  surface.addEventListener('pointermove', e => {
    if (active?.id !== e.pointerId) return;
    const dx = e.clientX - active.x, dy = e.clientY - active.y;
    if (!active.locked) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
      if (Math.abs(dy) >= Math.abs(dx)) { finish(true); return; }
      active.locked = true; surface.setPointerCapture(e.pointerId);
    }
    move(dx, dy, e);
  });
  surface.addEventListener('pointerup', e => { if (active?.id === e.pointerId) finish(false); });
  ['pointercancel', 'lostpointercapture'].forEach(type => surface.addEventListener(type, e => { if (active?.id === e.pointerId) finish(true); }));
  window.addEventListener('pointerup', e => { if (active?.id === e.pointerId) finish(true); });
  window.addEventListener('keydown', e => { if (e.key === 'Escape' && active) { e.preventDefault(); finish(true); } });
  window.addEventListener('blur', () => finish(true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) finish(true); });
  return { cancel: () => finish(true) };
}

export function init() {
  const demos = { password, otp, 'pull-refresh': pullRefresh, swipe, reorder, accordion, search, menu, wizard, download, upload, skeleton, chips, dock };
  runDemos(Object.fromEntries(Object.entries(demos).map(([key, fn]) => [key, root => {
    fn(root); root.dataset.ready = 'true';
    observeVisibility(root, visible => { root.dataset.visible = String(visible); });
  }])));
}

function password(root) {
  const input = qs('[data-password]', root), show = qs('[data-show]', root), meter = qs('[data-strength]', root), status = qs('[data-status]', root);
  const rules = qsa('[data-rule]', root), labels = rules.map(el => el.textContent.slice(2));
  function update() {
    const value = input.value;
    const met = [value.length >= 12, /[a-z]/.test(value) && /[A-Z]/.test(value), /[0-9]/.test(value), /[^a-zA-Z0-9\s]/.test(value)];
    const score = met.filter(Boolean).length; meter.value = score; meter.textContent = `${score} of 4`;
    status.textContent = `${score} of 4 rules met${score === 4 ? ' · not a security guarantee' : ''}`;
    rules.forEach((el, i) => { el.dataset.met = String(met[i]); el.textContent = `${met[i] ? '✓' : '○'} ${labels[i]}`; });
  }
  input.addEventListener('input', update);
  show.addEventListener('click', () => {
    const reveal = input.type === 'password', start = input.selectionStart, end = input.selectionEnd;
    input.type = reveal ? 'text' : 'password'; input.setSelectionRange(start, end);
    show.setAttribute('aria-pressed', String(reveal)); show.textContent = reveal ? 'Hide' : 'Show';
  });
  qs('[data-reset]', root).addEventListener('click', () => { input.value = ''; input.type = 'password'; show.textContent = 'Show'; show.setAttribute('aria-pressed', 'false'); update(); input.focus(); });
  update();
}

function otp(root) {
  const cells = qsa('[data-cells] input', root), form = qs('form', root), status = qs('[data-status]', root), check = qs('[data-check]', root), job = task();
  function state(value, message) {
    root.dataset.state = value; status.textContent = message; check.disabled = value === 'checking';
    form.setAttribute('aria-busy', String(value === 'checking'));
    cells.forEach(cell => cell.setAttribute('aria-invalid', String(value === 'error')));
  }
  function editing() { job.cancel(); state('editing', 'Code changed. Check when ready.'); }
  function distribute(index, text) {
    const digits = text.replace(/\D/g, '').slice(0, 6); editing();
    if (digits.length === 6) index = 0;
    if (!digits.length) { cells[index].value = ''; return; }
    [...digits].forEach((digit, i) => { if (cells[index + i]) cells[index + i].value = digit; });
    const next = Math.min(5, index + digits.length); cells[next].focus(); cells[next].select();
  }
  cells.forEach((cell, i) => {
    cell.addEventListener('focus', () => cell.select());
    cell.addEventListener('input', e => { if (!e.isComposing) distribute(i, cell.value); });
    cell.addEventListener('compositionend', () => distribute(i, cell.value));
    cell.addEventListener('paste', e => { e.preventDefault(); distribute(i, e.clipboardData.getData('text')); });
    cell.addEventListener('keydown', e => {
      if (e.key === 'Backspace') { e.preventDefault(); editing(); const index = cell.value || i === 0 ? i : i - 1; cells[index].value = ''; cells[index].focus(); }
      else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
        e.preventDefault(); const index = e.key === 'Home' ? 0 : e.key === 'End' ? 5 : clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, 5); cells[index].focus();
      } else if (e.key === 'Escape') { job.cancel(); state('editing', 'Local check cancelled.'); }
    });
  });
  form.addEventListener('submit', e => {
    e.preventDefault(); if (root.dataset.state === 'checking') return;
    const code = cells.map(c => c.value).join('');
    if (!/^\d{6}$/.test(code)) { state('error', 'Enter all six digits before checking.'); (cells.find(c => !c.value) || cells[0]).focus(); return; }
    state('checking', 'Checking locally…');
    job.after(600, () => {
      const correct = code === '314159'; state(correct ? 'correct' : 'error', correct ? 'Correct demo code. No authentication performed.' : 'Not the demo code. Try 314159.');
      if (!correct) animate(qs('[data-cells]', root), [{ transform: 'translateX(0)' }, { transform: 'translateX(-5px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], 260);
    });
  });
  qs('[data-reset]', root).addEventListener('click', () => { job.cancel(); cells.forEach(c => { c.value = ''; }); state('editing', 'Enter or paste six digits.'); cells[0].focus(); });
  state('editing', 'Enter or paste six digits.');
}

function pullRefresh(root) {
  const handle = qs('[data-pull-handle]', root), content = qs('[data-feed-content]', root), feed = qs('[data-feed]', root), icon = qs('[data-pull-icon]', root), status = qs('[data-status]', root);
  const refresh = qs('[data-refresh]', root), cancel = qs('[data-cancel]', root), job = task();
  let pull = 0, edition = 1;
  function state(s, message) { root.dataset.state = s; status.textContent = message; const busy = s === 'refreshing'; feed.setAttribute('aria-busy', String(busy)); refresh.disabled = busy; cancel.disabled = !busy; }
  function resetPull() { pull = 0; translate(content, 0, 0); icon.style.transform = ''; }
  function start() {
    if (root.dataset.state === 'refreshing') return;
    drag.cancel(); resetPull(); state('refreshing', 'Refreshing the local edition…'); icon.textContent = '◌';
    job.after(1200, () => {
      edition++; qs('[data-edition]', root).textContent = edition;
      qs('[data-fresh]', root).textContent = ['Today: test the state without its animation.', 'Today: cancel a gesture before you commit.', 'Today: verify focus after closing a panel.'][(edition - 2) % 3];
      icon.textContent = '↓'; state('complete', `Local edition ${edition} is fresh. No network request.`);
    });
  }
  const drag = gesture(handle, {
    begin() { if (root.dataset.state === 'refreshing') return false; stopAnimation(content); state('pulling', 'Pull to 58px to arm.'); },
    move(dx, dy) { pull = rubberBand(Math.max(0, dy), 140, 0.7); translate(content, 0, pull, true); icon.style.transform = `rotate(${pull >= 58 ? 180 : 0}deg)`; state(pull >= 58 ? 'armed' : 'pulling', `${Math.round(pull)} / 58px · ${pull >= 58 ? 'Release to refresh' : 'Keep pulling'}`); },
    end(cancelled) { const armed = pull >= 58; resetPull(); if (!cancelled && armed) start(); else state(cancelled ? 'cancelled' : 'idle', cancelled ? 'Pull cancelled. Nothing refreshed.' : 'Below threshold. Pull again or use Refresh.'); },
  });
  refresh.addEventListener('click', start);
  function abort() { drag.cancel(); job.cancel(); resetPull(); icon.textContent = '↓'; state('cancelled', 'Refresh cancelled. Current edition retained.'); }
  cancel.addEventListener('click', abort);
  root.addEventListener('keydown', e => { if (e.key === 'Escape') abort(); });
  new ResizeObserver(() => drag.cancel()).observe(feed);
  state('idle', 'Pull to 58px or use Refresh.');
}

function swipe(root) {
  const box = qs('[data-swipe]', root), row = qs('[data-swipe-row]', root), actions = qs('[data-swipe-actions]', root), reveal = qs('[data-reveal]', root), undo = qs('[data-undo]', root), status = qs('[data-status]', root);
  let open = false, removed = false, x = 0, startX = 0, startOpen = false;
  const width = () => actions.offsetWidth;
  function setOpen(value, immediate = false) {
    open = value && !removed; x = open ? -width() : 0;
    if (!open && actions.contains(document.activeElement)) reveal.focus();
    actions.inert = !open; actions.setAttribute('aria-hidden', String(!open)); reveal.setAttribute('aria-expanded', String(open)); reveal.textContent = open ? 'Hide actions' : 'Show actions';
    translate(row, x, 0, immediate); root.dataset.state = removed ? 'removed' : open ? 'open' : 'closed';
  }
  const drag = gesture(row, {
    axis: 'x', begin() { if (removed) return false; startX = x; startOpen = open; },
    move(dx) { x = clamp(startX + dx, -width(), 0); translate(row, x, 0, true); root.dataset.state = 'dragging'; },
    end(cancelled) { setOpen(cancelled ? startOpen : x < -width() * 0.45); },
  });
  reveal.addEventListener('click', () => { drag.cancel(); setOpen(!open); });
  function remove(kind) {
    drag.cancel(); removed = true; undo.hidden = false; undo.focus(); setOpen(false); box.hidden = true; reveal.hidden = true;
    status.textContent = `${kind} locally. Undo is available; nothing persisted.`;
  }
  qs('[data-archive]', root).addEventListener('click', () => remove('Archived'));
  qs('[data-delete]', root).addEventListener('click', () => remove('Deleted'));
  function restore(focus = false) { drag.cancel(); removed = false; box.hidden = false; reveal.hidden = false; if (focus || document.activeElement === undo) reveal.focus(); undo.hidden = true; setOpen(false, true); status.textContent = 'Message in inbox.'; }
  undo.addEventListener('click', () => restore(true)); qs('[data-reset]', root).addEventListener('click', () => restore());
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { drag.cancel(); setOpen(false); } });
  new ResizeObserver(() => { drag.cancel(); setOpen(open, true); }).observe(box);
  setOpen(false, true);
}

function reorder(root) {
  const list = qs('[data-list]', root), initial = qsa('[data-item]', root), status = qs('[data-status]', root);
  let held = null, snapshot = null, anchor = 0, lastY = 0;
  const items = () => qsa('[data-item]', list);
  function announce(message) {
    const order = items(); status.textContent = message || order.map(el => el.dataset.name).join(' → ');
    order.forEach((el, i) => { qs('[data-up]', el).setAttribute('aria-disabled', String(i === 0)); qs('[data-down]', el).setAttribute('aria-disabled', String(i === order.length - 1)); });
    root.dataset.order = order.map(el => el.dataset.item).join(',');
  }
  function arrange(order, excluded = null) {
    const first = new Map(items().map(el => [el, el.getBoundingClientRect()]));
    items().forEach(el => { stopAnimation(el); el.style.transform = ''; });
    // Avoid needless reinsertions: these can disturb focus and pointer capture.
    order.forEach((el, i) => { if (list.children[i] !== el) list.insertBefore(el, list.children[i] || null); });
    order.forEach(el => { if (el === excluded) return; const before = first.get(el), after = el.getBoundingClientRect(); const dy = before.top - after.top; if (Math.abs(dy) > 0.5) animate(el, [{ transform: `translateY(${dy}px)` }, { transform: 'translateY(0)' }], 260); });
    announce();
  }
  function track() {
    if (!held) return;
    const base = list.getBoundingClientRect().top;
    const others = items().filter(el => el !== held), center = lastY - anchor + held.offsetHeight / 2;
    let index = others.findIndex(el => center < base + el.offsetTop + el.offsetHeight / 2);
    if (index < 0) index = others.length;
    const next = [...others]; next.splice(index, 0, held);
    if (next.some((el, i) => el !== list.children[i])) arrange(next, held);
    held.style.transform = `translateY(${lastY - anchor - (base + held.offsetTop)}px)`;
  }
  const drag = gesture(list, {
    accept: e => Boolean(e.target.closest('[data-handle]')),
    begin(e) {
      held = e.target.closest('[data-item]'); snapshot = items();
      const top = held.getBoundingClientRect().top; anchor = e.clientY - top; lastY = e.clientY;
      stopAnimation(held); held.classList.add('fb-held'); root.dataset.state = 'dragging';
      qs('[data-handle]', held).focus({ preventScroll: true });
    },
    move(dx, dy, e) { lastY = e.clientY; track(); },
    end(cancelled) {
      const item = held; if (!item) return;
      held = null; item.classList.remove('fb-held');
      arrange(cancelled ? snapshot : items()); root.dataset.state = 'idle';
      qs('[data-handle]', item).focus({ preventScroll: true });
      announce(`${cancelled ? 'Cancelled. ' : 'Order updated. '}${items().map(el => el.dataset.name).join(' → ')}`);
    },
  });
  list.addEventListener('click', e => {
    const button = e.target.closest('[data-up], [data-down]'); if (!button) return;
    drag.cancel(); const row = button.closest('[data-item]'), order = items(), index = order.indexOf(row), next = index + (button.hasAttribute('data-up') ? -1 : 1);
    if (next < 0 || next >= order.length) return;
    [order[index], order[next]] = [order[next], order[index]]; arrange(order); button.focus({ preventScroll: true });
  });
  qs('[data-reset]', root).addEventListener('click', () => { drag.cancel(); arrange(initial); });
  window.addEventListener('resize', () => drag.cancel());
  root.dataset.state = 'idle'; announce();
}

function disclose(trigger, panel, open, restore = true) {
  if (!open && restore && panel.contains(document.activeElement)) trigger.focus({ preventScroll: true });
  trigger.setAttribute('aria-expanded', String(open)); panel.inert = !open;
  panel.setAttribute('aria-hidden', String(!open)); panel.classList.toggle('fb-open', open);
}
function accordion(root) {
  const buttons = qsa('[data-accordion-toggle]', root);
  buttons.forEach(button => {
    const panel = qs(`#${button.getAttribute('aria-controls')}`, root);
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') !== 'true';
      buttons.forEach(other => disclose(other, qs(`#${other.getAttribute('aria-controls')}`, root), other === button && open));
    });
    panel.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); disclose(button, panel, false); } });
  });
}
function search(root) {
  const group = qs('[data-search-group]', root), button = qs('[data-search-toggle]', root), panel = qs('[data-search-panel]', root), input = qs('[data-search-input]', root), rows = qsa('[data-results] li', root);
  let suppress = false;
  function set(open, focus = false) { disclose(button, panel, open, false); root.dataset.state = open ? 'open' : 'closed'; if (focus) input.focus({ preventScroll: true }); }
  button.addEventListener('click', () => set(true, true));
  group.addEventListener('focusin', () => { if (!suppress) set(true); });
  group.addEventListener('focusout', () => queueMicrotask(() => { if (!group.contains(document.activeElement)) set(false); }));
  group.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return; e.preventDefault(); suppress = true; button.focus({ preventScroll: true }); set(false); suppress = false;
  });
  input.addEventListener('input', () => { const query = input.value.trim().toLowerCase(); rows.forEach(row => { row.hidden = !row.textContent.toLowerCase().includes(query); }); qs('[data-status]', root).textContent = `${rows.filter(row => !row.hidden).length} local topics`; });
  set(false);
}
function menu(root) {
  const button = qs('[data-menu-button]', root), panel = qs('[data-menu-panel]', root);
  function set(open) { disclose(button, panel, open); qs('[data-menu-label]', root).textContent = open ? 'Close study links' : 'Open study links'; root.dataset.state = open ? 'open' : 'closed'; }
  button.addEventListener('click', () => set(button.getAttribute('aria-expanded') !== 'true'));
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); set(false); button.focus(); } });
  document.addEventListener('pointerdown', e => { if (!root.contains(e.target)) set(false); });
  qsa('a', panel).forEach(a => a.addEventListener('click', () => set(false)));
  set(false);
}

function wizard(root) {
  const form = qs('form', root), panels = qsa('[data-step]', root), name = qs('[data-name]', root), back = qs('[data-back]', root), next = qs('[data-next]', root), status = qs('[data-status]', root);
  let step = 0, done = false;
  function render(focus = true) {
    // Move focus out before hiding the old fieldset.
    if (focus && panels.some(p => p.contains(document.activeElement))) next.focus({ preventScroll: true });
    panels.forEach((p, i) => { stopAnimation(p); p.hidden = i !== step; p.inert = i !== step; p.disabled = i !== step; });
    qsa('[data-step-marker]', root).forEach((el, i) => { if (i === step) el.setAttribute('aria-current', 'step'); else el.removeAttribute('aria-current'); });
    qs('[data-progress]', root).value = step + 1;
    back.disabled = step === 0; next.disabled = done; next.textContent = step === 2 ? 'Finish locally' : 'Next';
    root.dataset.step = String(step); root.dataset.state = done ? 'complete' : 'editing';
    if (step === 2) qs('[data-review]', root).textContent = `${name.value.trim()} will study with ${qs('input[name="fb-format"]:checked', root)?.value || 'a format still to choose'}.`;
    status.textContent = done ? 'Local plan complete. Nothing saved or sent.' : `Step ${step + 1} of 3`;
    if (focus) { const target = qs('input, legend', panels[step]); target.focus({ preventScroll: true }); animate(panels[step], [{ opacity: 0.4 }, { opacity: 1 }], 180); }
  }
  name.addEventListener('input', () => { name.setCustomValidity(''); name.removeAttribute('aria-invalid'); });
  form.addEventListener('submit', e => {
    e.preventDefault(); if (done) return;
    if (step === 0) name.setCustomValidity(name.value.trim() ? '' : 'Please enter a name.');
    const invalid = qsa('input', panels[step]).find(input => !input.checkValidity());
    if (invalid) { invalid.setAttribute('aria-invalid', 'true'); status.textContent = step === 0 ? 'Enter a name to continue.' : 'Choose a format to continue.'; invalid.reportValidity(); invalid.focus(); return; }
    qsa('input', panels[step]).forEach(input => input.removeAttribute('aria-invalid'));
    if (step < 2) step++; else done = true;
    render();
  });
  back.addEventListener('click', () => { if (step > 0) { done = false; step--; render(); } });
  qs('[data-reset]', root).addEventListener('click', () => { form.reset(); name.setCustomValidity(''); qsa('[aria-invalid]', root).forEach(el => el.removeAttribute('aria-invalid')); step = 0; done = false; render(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape' && step > 0) { e.preventDefault(); done = false; step--; render(); } });
  render(false);
}

function download(root) {
  const ring = qs('[data-ring]', root), stroke = qs('[data-ring-value]', root), status = qs('[data-status]', root), start = qs('[data-start]', root), cancel = qs('[data-cancel]', root), job = task();
  let value = 0, state = 'idle';
  function render() {
    root.dataset.state = state; ring.setAttribute('aria-valuenow', String(value)); ring.setAttribute('aria-valuetext', `${value}% · ${state} · local demo`);
    stroke.style.strokeDashoffset = String(100 - value); qs('[data-percent]', root).textContent = `${value}%`;
    start.disabled = state === 'running'; cancel.disabled = state !== 'running'; start.textContent = state === 'idle' ? 'Start demo' : 'Restart demo';
    status.textContent = state === 'idle' ? 'Ready to simulate.' : `${state === 'done' ? 'Complete' : state === 'cancelled' ? 'Cancelled' : 'Simulating'} · ${value}% · local demo, no download`;
  }
  start.addEventListener('click', () => { value = 0; state = 'running'; render(); job.run(p => { value = p; render(); }, 240, () => { state = 'done'; render(); }); });
  function abort() { if (state !== 'running') return; job.cancel(); state = 'cancelled'; render(); }
  cancel.addEventListener('click', abort);
  qs('[data-reset]', root).addEventListener('click', () => { job.cancel(); value = 0; state = 'idle'; render(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') abort(); }); render();
}
function upload(root) {
  const input = qs('[data-file]', root), zone = qs('[data-dropzone]', root), status = qs('[data-status]', root), progress = qs('[data-progress]', root), cancel = qs('[data-cancel]', root), job = task();
  let state = 'idle', value = 0, filename = '', depth = 0;
  function render() {
    root.dataset.state = state; progress.value = value; progress.textContent = `${value}%`; cancel.disabled = state !== 'running';
    qs('[data-filename]', root).textContent = filename || 'No file selected';
    status.textContent = state === 'idle' ? 'Choose a file to simulate.' : `${state === 'done' ? 'Local simulation complete' : state === 'cancelled' ? 'Cancelled' : 'Simulating locally'} · ${value}%. No file contents read or sent.`;
  }
  function select(file) {
    if (!file) return;
    job.cancel(); filename = file.name; value = 0; state = 'running'; input.value = ''; render();
    job.run(p => { value = p; render(); }, 200, () => { state = 'done'; render(); });
  }
  input.addEventListener('change', () => select(input.files[0]));
  zone.addEventListener('dragenter', e => { e.preventDefault(); depth++; zone.classList.add('fb-over'); });
  zone.addEventListener('dragover', e => { e.preventDefault(); if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'; });
  zone.addEventListener('dragleave', e => { e.preventDefault(); depth = Math.max(0, depth - 1); if (!depth) zone.classList.remove('fb-over'); });
  zone.addEventListener('drop', e => { e.preventDefault(); depth = 0; zone.classList.remove('fb-over'); select(e.dataTransfer?.files[0]); });
  function abort() { if (state !== 'running') return; job.cancel(); state = 'cancelled'; render(); }
  cancel.addEventListener('click', abort);
  qs('[data-reset]', root).addEventListener('click', () => { job.cancel(); input.value = ''; filename = ''; value = 0; state = 'idle'; depth = 0; zone.classList.remove('fb-over'); render(); });
  root.addEventListener('keydown', e => { if (e.key === 'Escape') abort(); }); render();
}
function skeleton(root) {
  const preview = qs('[data-preview]', root), content = qs('[data-content]', root), ghost = qs('[data-skeleton]', root), status = qs('[data-status]', root), load = qs('[data-load]', root), cancel = qs('[data-cancel]', root), job = task();
  let version = 1;
  function busy(value) {
    if (value && content.contains(document.activeElement)) load.focus();
    preview.setAttribute('aria-busy', String(value)); content.inert = value; content.setAttribute('aria-hidden', String(value));
    content.style.visibility = value ? 'hidden' : 'visible'; ghost.hidden = !value; cancel.disabled = !value; root.dataset.state = value ? 'loading' : 'ready';
  }
  load.addEventListener('click', () => {
    stopAnimation(content); busy(true); status.textContent = 'Loading a local preview…';
    job.after(1200, () => { version++; qs('[data-version]', root).textContent = version; busy(false); status.textContent = `Local preview ${version} ready.`; animate(content, [{ opacity: 0 }, { opacity: 1 }], 200); });
  });
  function abort() { if (root.dataset.state !== 'loading') return; job.cancel(); busy(false); status.textContent = 'Load cancelled. Previous preview retained.'; }
  cancel.addEventListener('click', abort); root.addEventListener('keydown', e => { if (e.key === 'Escape') abort(); }); busy(false);
}

function chips(root) {
  const buttons = qsa('[data-choice]', root), status = qs('[data-status]', root);
  function render() { const selected = buttons.filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent.replace('✓', '').trim()); status.textContent = selected.length ? `Selected: ${selected.join(', ')}.` : 'No lenses selected.'; }
  buttons.forEach(button => button.addEventListener('click', () => { button.setAttribute('aria-pressed', String(button.getAttribute('aria-pressed') !== 'true')); render(); animate(button, [{ transform: 'scale(.94)' }, { transform: 'scale(1.04)' }, { transform: 'scale(1)' }], 220); }));
  qs('[data-reset]', root).addEventListener('click', () => { buttons.forEach(b => { stopAnimation(b); b.setAttribute('aria-pressed', 'false'); }); render(); }); render();
}
function dock(root) {
  const bar = qs('[data-dock]', root), buttons = qsa('[data-dock-item]', root), icons = buttons.map(b => qs('.fb-dock-icon', b));
  const springs = buttons.map(() => new Spring({ value: 1, stiffness: 260, damping: 26, precision: 0.001 }));
  let pointer = null, visible = true;
  function paint() { icons.forEach((icon, i) => { icon.style.transform = `scale(${springs[i].value})`; }); }
  const loop = createLoop(dt => { springs.forEach(s => s.step(dt)); paint(); if (springs.every(s => s.isSettled())) loop.stop(); });
  function update() {
    const focus = buttons.indexOf(document.activeElement);
    const center = b => { const rect = b.getBoundingClientRect(); return rect.left + rect.width / 2; };
    const x = focus >= 0 ? center(buttons[focus]) : pointer;
    buttons.forEach((button, i) => {
      const d = x === null ? Infinity : x - center(button);
      const target = 1 + 0.55 * Math.exp(-d * d / (2 * 65 * 65));
      if (motion.reduced || !visible) springs[i].set(1); else springs[i].target = target;
    });
    if (motion.reduced || !visible) { loop.stop(); paint(); } else loop.start();
  }
  bar.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') { pointer = e.clientX; update(); } });
  bar.addEventListener('pointerleave', () => { pointer = null; update(); });
  bar.addEventListener('focusin', update); bar.addEventListener('focusout', () => queueMicrotask(update));
  buttons.forEach((button, i) => {
    button.addEventListener('keydown', e => {
      const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1 : e.key === 'ArrowRight' ? (i + 1) % buttons.length : e.key === 'ArrowLeft' ? (i + buttons.length - 1) % buttons.length : null;
      if (next !== null) { e.preventDefault(); buttons[next].focus(); }
    });
    button.addEventListener('click', () => { buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button))); qs('[data-status]', root).textContent = `${button.getAttribute('aria-label')} selected · local dock only`; });
  });
  observeVisibility(root, v => { visible = v && !document.hidden; update(); });
  document.addEventListener('visibilitychange', () => { visible = !document.hidden && root.dataset.visible !== 'false'; update(); });
  motion.subscribe(update); new ResizeObserver(update).observe(bar); paint();
}
