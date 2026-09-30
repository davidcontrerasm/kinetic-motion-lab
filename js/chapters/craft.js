/** Chapter 09 — instruments report JS evidence, never inferred compositor FPS. */
import { qs, qsa } from '../core/dom.js';
import { motion, observeVisibility } from '../core/motion.js';
import { runDemos } from './shared.js';
const effects = new Map();
function cancel(el) { effects.get(el)?.cancel(); effects.delete(el); }
function animate(el, frames, duration = 300) {
  cancel(el); if (motion.reduced || document.hidden) return;
  const a = el.animate(frames, { duration, easing: 'cubic-bezier(.2,.8,.2,1)' }); effects.set(el, a);
  a.onfinish = a.oncancel = () => { if (effects.get(el) === a) effects.delete(el); };
}
function inactive(root, stop) {
  observeVisibility(root, visible => { root.dataset.visible = String(visible); if (!visible) stop(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
}
motion.subscribe(reduced => { if (reduced) [...effects.keys()].forEach(cancel); });
export function init() {
  const demos = { reduced, 'main-thread': mainThread, 'property-cost': propertyCost, thrashing, 'focus-ring': focusRing };
  runDemos(Object.fromEntries(Object.entries(demos).map(([key, fn]) => [key, root => { fn(root); root.dataset.ready = 'true'; }])));
}
function reduced(root) {
  const panels = qsa('[data-message]', root), local = qs('[data-local-reduced]', root), scenario = qs('[data-scenario]', root), system = matchMedia('(prefers-reduced-motion: reduce)');
  let count = 0;
  function preference() {
    panels.forEach(cancel);
    root.dataset.reduced = String(motion.reduced || local.checked);
    qs('[data-preference]', root).textContent = `System: ${system.matches ? 'reduce' : 'no preference'} · global: ${motion.reduced ? 'reduced' : 'full'} · local: ${local.checked ? 'reduced' : 'follow global'}. Both panels suppress travel when global reduction is active. Header choices override system preference until cleared.`;
  }
  function replay() {
    count++; const route = scenario.value === 'route', title = route ? (count % 2 ? 'Notebook route' : 'Library route') : 'Note saved';
    panels.forEach(panel => { cancel(panel); qs('[data-message-title]', panel).textContent = title; qs('[data-message-body]', panel).textContent = route ? `Local view ${count}. Your study context is retained.` : `Notification ${count}. Your local note is ready for review.`; qs('[data-ack]', panel).textContent = 'Acknowledge'; });
    const quiet = motion.reduced || local.checked;
    root.dataset.reduced = String(quiet); root.dataset.update = String(count);
    if (!quiet) animate(panels[0], [{ transform: 'translateX(45px) scale(.92)', opacity: .2 }, { transform: 'none', opacity: 1 }], 450);
    if (!motion.reduced) animate(panels[1], [{ opacity: .45 }, { opacity: 1 }], 120);
    qs('[data-message-status]', root).textContent = `${title} · same result in both panels.`;
  }
  qs('[data-replay]', root).addEventListener('click', replay); scenario.addEventListener('change', replay);
  qsa('[data-ack]', root).forEach(button => button.addEventListener('click', () => { panels.forEach(panel => { qs('[data-ack]', panel).textContent = 'Acknowledged ✓'; }); qs('[data-message-status]', root).textContent = 'Acknowledged in both panels. Focus stays on your control.'; }));
  local.addEventListener('change', preference); motion.subscribe(preference); system.addEventListener('change', preference);
  inactive(root, () => panels.forEach(cancel)); preference();
}
function mainThread(root) {
  const rails = qsa('.c-rail', root), js = qs('[data-lane=raf]', root), report = qs('[data-thread-report]', root), block = qs('[data-block]', root), spinner = qs('[data-block-spinner]', root);
  let raf = 0, elapsed = 0, last = 0, travel = 0, frame1 = 0, frame2 = 0, revision = 0, blocks = 0;
  root.dataset.running = 'false'; root.dataset.started = 'false'; root.dataset.blockState = 'idle'; root.dataset.blocks = '0';
  function paint() { const phase = elapsed / 1200 % 2; js.style.transform = `translateX(${(phase <= 1 ? phase : 2 - phase) * travel}px)`; }
  function tick(now) {
    if (root.dataset.running !== 'true') return;
    elapsed += now - last; last = now; paint(); raf = requestAnimationFrame(tick);
  }
  function pause(reset = false) {
    cancelAnimationFrame(raf); root.dataset.running = 'false';
    if (reset || motion.reduced) { root.dataset.started = 'false'; elapsed = 0; js.style.transform = 'none'; }
  }
  function start(replay = false) {
    pause(replay);
    if (motion.reduced || document.hidden) { report.textContent = 'Static lanes · motion reduction or inactive document'; return; }
    if (replay) { root.dataset.started = 'false'; void root.offsetWidth; }
    root.dataset.started = 'true'; root.dataset.running = 'true'; last = performance.now(); raf = requestAnimationFrame(tick); report.textContent = 'Lanes running · no CPU block requested';
  }
  function abortBlock() {
    revision++; cancelAnimationFrame(frame1); cancelAnimationFrame(frame2); frame1 = frame2 = 0;
    block.disabled = false; spinner.hidden = true; root.dataset.blockState = 'idle';
  }
  function reset() { pause(true); abortBlock(); blocks = 0; root.dataset.blocks = '0'; delete root.dataset.blockMs; delete root.dataset.gapMs; report.textContent = 'Idle · no experiment started'; }
  block.addEventListener('click', () => {
    if (block.disabled || document.hidden) return;
    const ticket = ++revision; block.disabled = true; spinner.hidden = false; root.dataset.blockState = 'scheduled';
    report.textContent = 'Warning acknowledged · preparing a bounded two-second main-thread block';
    frame1 = requestAnimationFrame(() => {
      frame2 = requestAnimationFrame(stamp => {
        if (ticket !== revision || document.hidden || root.dataset.visible === 'false') { abortBlock(); return; }
        const startTime = performance.now(); let work = 0;
        // Intentionally bad work, ONLY reachable from the explicit warning button.
        while (performance.now() - startTime < 2000) work = (work + 1) % 1000003;
        const duration = performance.now() - startTime; blocks++;
        root.dataset.blocks = String(blocks); root.dataset.blockMs = duration.toFixed(2); root.dataset.work = String(work);
        root.dataset.blockState = 'measuring'; spinner.hidden = true;
        frame2 = requestAnimationFrame(after => {
          if (ticket !== revision) return;
          root.dataset.gapMs = (after - stamp).toFixed(2); root.dataset.blockState = 'complete'; block.disabled = false;
          report.textContent = `Block ${duration.toFixed(1)}ms · rAF timestamp gap ${(after - stamp).toFixed(1)}ms. JS timing only, not visible FPS or compositor throughput.`;
        });
      });
    });
  });
  qs('[data-start]', root).addEventListener('click', () => start()); qs('[data-pause]', root).addEventListener('click', () => pause()); qs('[data-replay]', root).addEventListener('click', () => start(true)); qs('[data-reset]', root).addEventListener('click', reset);
  new ResizeObserver(() => { pause(true); rails.forEach(rail => rail.style.setProperty('--travel', `${Math.max(0, rail.clientWidth - 28)}px`)); travel = Math.max(0, rails[2].clientWidth - 28); }).observe(rails[0]);
  inactive(root, () => { pause(); if (block.disabled) { abortBlock(); report.textContent = 'Pending block cancelled when study became inactive.'; } });
  motion.subscribe(() => { pause(true); if (block.disabled) abortBlock(); report.textContent = motion.reduced ? 'Reduced motion · static lanes; CPU block still requires explicit activation' : 'Motion enabled · choose Start to run lanes'; });
}
function summarize(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, p95: sorted[Math.ceil(values.length * .95) - 1], longest: sorted.at(-1), longGaps: values.filter(v => v > 50).length };
}
function propertyCost(root) {
  const grid = qs('[data-cost-grid]', root), property = qs('[data-property]', root), active = qs('[data-active]', root), report = qs('[data-frame-report]', root);
  const shapes = [], overlays = [];
  for (let i = 0; i < 150; i++) { const tile = document.createElement('div'); tile.className = 'c-cost-tile'; tile.dataset.tile = String(i); const shape = document.createElement('i'); shape.className = 'c-cost-shape'; const overlay = document.createElement('b'); overlay.className = 'c-cost-overlay'; shape.append(overlay); tile.append(shape); grid.append(tile); shapes.push(shape); overlays.push(overlay); }
  let raf = 0, timer = 0, running = false, started = 0, previous = 0, intervals = [], mode = 'width', staticSample = false;
  root.dataset.state = 'idle'; root.dataset.samples = '0'; root.dataset.property = property.value;
  function clearEffects() { grid.getAnimations({ subtree: true }).forEach(a => a.cancel()); }
  function output(reason) {
    const stats = summarize(intervals); root.dataset.samples = String(intervals.length);
    if (!stats) { report.textContent = `${reason} · no intervals sampled`; return; }
    root.dataset.stats = JSON.stringify(stats);
    report.textContent = `${reason} · ${mode}${staticSample ? ' / static baseline' : ''} · ${intervals.length} intervals · mean ${stats.mean.toFixed(2)}ms · p95 ${stats.p95.toFixed(2)}ms · longest ${stats.longest.toFixed(2)}ms · gaps >50ms: ${stats.longGaps}. JS callbacks, not frame loss.`;
  }
  function stop(reason = 'Stopped') { if (!running) return; running = false; cancelAnimationFrame(raf); clearTimeout(timer); clearEffects(); root.dataset.state = reason === 'Complete' ? 'complete' : 'stopped'; output(reason); }
  function tick(now) { if (!running) return; intervals.push(now - previous); previous = now; if (now - started >= 3000) stop('Complete'); else raf = requestAnimationFrame(tick); }
  function play() {
    stop(); intervals = []; delete root.dataset.stats; mode = property.value; staticSample = motion.reduced || !active.checked;
    root.dataset.property = mode; root.dataset.state = 'running'; root.dataset.samples = '0'; running = true; started = previous = performance.now();
    if (!staticSample) shapes.forEach((shape, i) => {
      const target = mode === 'opacity' ? overlays[i] : shape;
      const frames = mode === 'width' ? [{ width: '40%' }, { width: '100%' }] : mode === 'transform' ? [{ transform: 'scaleX(.4)' }, { transform: 'scaleX(1)' }] : mode === 'shadow' ? [{ boxShadow: '0 0 0 #0000' }, { boxShadow: '0 3px 8px #000b' }] : [{ opacity: 0 }, { opacity: 1 }];
      target.animate(frames, { duration: 600, iterations: 5, direction: 'alternate', easing: 'linear' });
    });
    report.textContent = `Sampling ${mode}${staticSample ? ' · static baseline' : ' · 150 targets'} for at most 3s…`;
    raf = requestAnimationFrame(tick); timer = setTimeout(() => stop('Complete'), 3100);
  }
  function reset() { stop(); clearEffects(); intervals = []; root.dataset.samples = '0'; root.dataset.state = 'idle'; delete root.dataset.stats; report.textContent = 'No sample yet · press Play for a bounded 3s observation'; }
  qs('[data-play]', root).addEventListener('click', play); qs('[data-stop]', root).addEventListener('click', () => stop()); qs('[data-reset]', root).addEventListener('click', reset);
  property.addEventListener('change', () => { stop('Property changed'); clearEffects(); root.dataset.property = property.value; }); active.addEventListener('change', () => stop('Target activation changed'));
  motion.subscribe(() => { stop('Preference changed'); clearEffects(); }); inactive(root, () => stop('Inactive · sample ended'));
}
function thrashing(root) {
  const list = qs('[data-rows]', root), sandbox = qs('[data-sandbox]', root), report = qs('[data-thrash-result]', root), buttons = qsa('[data-run], [data-reset]', root);
  const rows = [];
  for (let i = 0; i < 150; i++) { const row = document.createElement('li'); row.className = 'c-thrash-row'; row.dataset.row = String(i); row.textContent = `Row ${String(i + 1).padStart(3, '0')}`; list.append(row); rows.push(row); }
  let revision = 0, timer = 0, raf1 = 0, raf2 = 0, busy = false;
  const results = {};
  function enable(value) { busy = !value; buttons.forEach(b => { b.disabled = !value; }); root.setAttribute('aria-busy', String(!value)); }
  function resetRows() { rows.forEach(row => { row.style.width = '100px'; }); void sandbox.offsetHeight; }
  function parity() {
    const both = results.interleaved && results.batched;
    const same = both && results.interleaved.widths.every((width, i) => width === results.batched.widths[i] && width === 120);
    root.dataset.parity = both ? String(Boolean(same)) : 'awaiting-pair';
    qs('[data-parity]', root).textContent = both ? `DOM outcomes ${same ? 'match' : 'differ'} · ${same ? '150/150 rows are 120px in both runs' : 'inspect the sandbox'}. No speed ratio is required.` : 'This run produced 150 widths of 120px. Run the other method to check pair parity.';
  }
  function run(mode) {
    if (busy) return; const ticket = ++revision; enable(false); root.dataset.state = 'running'; report.textContent = `Preparing ${mode} · 3 bounded repetitions`;
    const times = []; let widths = [];
    function repeat() {
      if (ticket !== revision) return;
      resetRows(); const start = performance.now();
      if (mode === 'interleaved') rows.forEach(row => { const width = row.offsetWidth; row.style.width = `${width + 20}px`; });
      else { const measured = rows.map(row => row.offsetWidth); rows.forEach((row, i) => { row.style.width = `${measured[i] + 20}px`; }); }
      void sandbox.offsetHeight; times.push(performance.now() - start);
      widths = rows.map(row => row.offsetWidth);
      if (times.length < 3) timer = setTimeout(repeat, 0);
      else {
        const median = [...times].sort((a, b) => a - b)[1]; results[mode] = { median, times, widths }; enable(true); root.dataset.state = 'complete'; root.dataset.results = JSON.stringify(results);
        report.textContent = Object.entries(results).map(([name, result]) => `${name}: median ${result.median.toFixed(2)}ms (${result.times.map(v => v.toFixed(2)).join(', ')}ms)`).join(' · ') + ' · approximate JS + synchronous layout, not full paint'; parity();
      }
    }
    raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(repeat); });
  }
  function abort() { if (!busy) return; revision++; clearTimeout(timer); cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); enable(true); root.dataset.state = 'stopped'; report.textContent = 'Run stopped because the study became inactive. Start a fresh run.'; }
  qsa('[data-run]', root).forEach(b => b.addEventListener('click', () => run(b.dataset.run)));
  qs('[data-reset]', root).addEventListener('click', () => { abort(); resetRows(); delete results.interleaved; delete results.batched; delete root.dataset.results; root.dataset.state = 'idle'; root.dataset.parity = 'awaiting-pair'; report.textContent = 'No measurements yet · 150 rows, 3 repeats per explicit run'; qs('[data-parity]', root).textContent = 'Outcome parity will be checked after both methods run.'; });
  inactive(root, abort); root.dataset.state = 'idle'; root.dataset.parity = 'awaiting-pair';
}
function focusRing(root) {
  const area = qs('[data-focus-area]', root), ring = qs('[data-ring]', root), controls = qsa('[data-focus-control]', root), report = qs('[data-ring-report]', root);
  function place(travel = false) {
    const target = document.activeElement;
    if (!controls.includes(target)) { cancel(ring); ring.hidden = true; root.dataset.focus = ''; report.textContent = 'Native Tab order · supplemental ring inactive'; return; }
    const previous = ring.hidden ? null : ring.getBoundingClientRect(); cancel(ring);
    const box = target.getBoundingClientRect(), parent = area.getBoundingClientRect();
    Object.assign(ring.style, { left: `${box.left - parent.left + area.scrollLeft - area.clientLeft}px`, top: `${box.top - parent.top + area.scrollTop - area.clientTop}px`, width: `${box.width}px`, height: `${box.height}px`, transform: 'none' });
    ring.hidden = false; root.dataset.focus = target.id;
    report.textContent = `${target.id} focused · ${motion.reduced ? 'static supplemental ring' : 'native outline immediate'}`;
    if (travel && previous && !motion.reduced) animate(ring, [{ transform: `translate(${previous.left - box.left}px,${previous.top - box.top}px) scale(${previous.width / box.width},${previous.height / box.height})` }, { transform: 'none' }], 240);
  }
  area.addEventListener('focusin', () => place(true)); area.addEventListener('focusout', () => queueMicrotask(() => { if (!area.contains(document.activeElement)) place(); }));
  window.addEventListener('scroll', () => place(), { capture: true, passive: true }); window.addEventListener('resize', () => place());
  const observer = new ResizeObserver(() => place()); observer.observe(area); controls.forEach(el => observer.observe(el)); motion.subscribe(() => place());
  qs('#cf-save', root).addEventListener('click', () => { qs('[data-focus-status]', root).textContent = `Saved for this demonstration: ${qs('#cf-note', root).value} · ${qs('#cf-format', root).value}. Not persisted.`; });
  qs('#cf-undo', root).addEventListener('click', () => { qs('[data-focus-status]', root).textContent = 'Local save undone. Nothing persisted.'; });
  inactive(root, () => cancel(ring));
}
