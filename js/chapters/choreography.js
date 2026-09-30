/** Chapter 05. All finite poses are samples of an owned clock; no queued timers or forwards fills. */
import { qs, qsa, splitText } from '../core/dom.js';
import { motion, createLoop, observeVisibility, clamp, lerp } from '../core/motion.js';
import { staggerDelays, staggerTotal, schedule } from '../core/choreo.js';
import { runDemos } from './shared.js';

const unit = value => clamp(value, 0, 1);
const ease = p => 1 - (1 - unit(p)) ** 3;
const local = (time, start, duration) => ease((time - start) / duration);

/** An elapsed-time transport, not a second rAF runtime. Hidden/offscreen time is suspended. */
function clock(root, paint, complete = () => {}) {
  let time = 0, total = 1, direction = 1, playing = false, visible = false;
  const draw = () => {
    root.dataset.time = time.toFixed(2);
    root.dataset.total = total.toFixed(2);
    root.dataset.playback = playing ? (visible && !document.hidden ? 'playing' : 'suspended') : 'paused';
    paint(time, total);
  };
  const end = () => { playing = false; loop.stop(); draw(); complete(time); };
  const loop = createLoop(dt => {
    time = clamp(time + direction * dt * 1000, 0, total);
    if ((direction > 0 && time === total) || (direction < 0 && time === 0)) end();
    else draw();
  });
  function sync() {
    if (playing && motion.reduced) { time = direction > 0 ? total : 0; end(); return; }
    if (playing && visible && !document.hidden) loop.start(); else loop.stop();
    draw();
  }
  observeVisibility(root, value => { visible = value; root.dataset.active = String(value && !document.hidden); sync(); });
  document.addEventListener('visibilitychange', () => { root.dataset.active = String(visible && !document.hidden); sync(); });
  motion.subscribe(sync);
  return {
    get time() { return time; }, get total() { return total; }, get playing() { return playing; },
    set(duration, position = duration) { loop.stop(); playing = false; total = Math.max(1, duration); time = clamp(position, 0, total); draw(); },
    seek(value) { playing = false; loop.stop(); time = clamp(value, 0, total); draw(); },
    pause() { playing = false; loop.stop(); draw(); },
    play(backward = false) {
      direction = backward ? -1 : 1; playing = true;
      if ((direction > 0 && time >= total) || (direction < 0 && time <= 0)) { end(); return; }
      sync();
    },
    replay() { time = 0; direction = 1; playing = true; sync(); },
    draw,
  };
}

export function init() {
  runDemos(Object.fromEntries(Object.entries({ stagger, sequence, text, loaders, continuity, attention }).map(([key, fn]) => [key, root => {
    if (root.dataset.ready === 'true') return;
    fn(root); root.dataset.ready = 'true';
  }])));
}

function stagger(root) {
  const blocks = qsa('.ch-blocks span', root), pattern = qs('[data-pattern]', root), step = qs('[data-step]', root), duration = qs('[data-duration]', root);
  let delays = [], ms = 400;
  const transport = clock(root, (time, total) => {
    blocks.forEach((block, i) => {
      const p = motion.reduced ? 1 : local(time, delays[i] || 0, ms);
      block.style.opacity = String(.12 + .88 * p);
      block.style.transform = `translateY(${(1 - p) * 20}px) scale(${.7 + .3 * p})`;
    });
    qs('[data-time-label]', root).textContent = motion.reduced ? 'All 30 visible · reduced motion' : `${Math.round(time)} / ${Math.round(total)}ms · ${time === total ? 'complete' : 'shared clock'}`;
  });
  function configure(play = true) {
    ms = Number(duration.value);
    delays = staggerDelays(blocks.length, { columns: 6, pattern: pattern.value, step: Number(step.value), seed: 17 });
    blocks.forEach((el, i) => { el.dataset.delay = delays[i].toFixed(3); });
    const total = staggerTotal(delays, ms);
    qs('[data-step-out]', root).textContent = `${step.value}ms`;
    qs('[data-duration-out]', root).textContent = `${ms}ms`;
    qs('[data-total]', root).textContent = `Total: ${Math.round(total).toLocaleString()}ms · last delay ${Math.round(Math.max(...delays)).toLocaleString()}ms + duration ${ms}ms`;
    transport.set(total); if (play) transport.replay();
  }
  pattern.addEventListener('change', () => configure());
  [step, duration].forEach(input => input.addEventListener('input', () => configure()));
  qs('[data-replay]', root).addEventListener('click', () => transport.replay());
  configure(false);
}

function sequence(root) {
  const durations = [600, 400, 300], parts = qsa('[data-part]', root), blocks = qsa('[data-block]', root);
  const mode = qs('[data-mode]', root), overlap = qs('[data-overlap]', root), scrub = qs('[data-scrub]', root), pause = qs('[data-pause]', root);
  let starts = [0, 300, 500];
  // The painter uses DOM playback state so even synchronous visibility fallbacks are safe.
  const transport = clock(root, (time, total) => {
    parts.forEach((part, i) => {
      const p = motion.reduced ? 1 : local(time, starts[i], durations[i]);
      part.style.opacity = String(p);
      part.style.transform = `translateY(${(1 - p) * 22}px)`;
      part.dataset.progress = p.toFixed(4);
    });
    scrub.value = String(time);
    scrub.setAttribute('aria-valuetext', `${Math.round(time)} of ${Math.round(total)} milliseconds`);
    qs('[data-playhead]', root).style.left = `${time / total * 100}%`;
    const playing = root.dataset.playback !== 'paused';
    pause.textContent = playing ? 'Pause' : time === total ? 'Play' : 'Resume';
    pause.setAttribute('aria-pressed', String(playing));
    qs('[data-sequence-readout]', root).textContent = `${Math.round(time)} / ${Math.round(total)}ms · ${playing ? root.dataset.playback : time === total ? 'complete' : 'paused'}${motion.reduced ? ' · static preview' : ''}`;
  });
  function configure(play = true) {
    starts = schedule(durations, mode.value, Number(overlap.value) / 100);
    const total = Math.max(...starts.map((s, i) => s + durations[i]));
    root.dataset.starts = starts.join(',');
    overlap.disabled = mode.value !== 'overlap';
    qs('[data-overlap-out]', root).textContent = `${overlap.value}%${overlap.disabled ? ' (overlap mode only)' : ''}`;
    blocks.forEach((block, i) => {
      block.style.left = `${starts[i] / total * 100}%`;
      block.style.width = `${durations[i] / total * 100}%`;
      block.textContent = `${starts[i]}–${starts[i] + durations[i]}ms`;
      block.title = `${['Card', 'Title', 'Action'][i]}: ${block.textContent}`;
    });
    scrub.max = String(total); transport.set(total); if (play) transport.replay();
  }
  mode.addEventListener('change', () => configure()); overlap.addEventListener('input', () => configure());
  scrub.addEventListener('input', () => transport.seek(Number(scrub.value)));
  pause.addEventListener('click', () => { if (transport.playing) transport.pause(); else if (transport.time === transport.total) transport.replay(); else transport.play(); });
  qs('[data-replay]', root).addEventListener('click', () => transport.replay());
  configure(false);
}

function text(root) {
  const sentence = qs('[data-sentence]', root), select = qs('[data-style]', root), original = sentence.textContent;
  let pieces = [], step = 55, kind = 'words';
  const transport = clock(root, (time, total) => {
    pieces.forEach((piece, i) => {
      const p = motion.reduced ? 1 : local(time, i * step, 420);
      piece.style.opacity = String(p);
      piece.style.filter = kind === 'blur' ? `blur(${(1 - p) * 8}px)` : '';
      piece.style.transform = kind === 'rotation' ? `perspective(400px) rotateX(${(1 - p) * -80}deg)` : ['words', 'chars', 'lines'].includes(kind) ? `translateY(${(1 - p) * (kind === 'lines' ? 110 : 70)}%)` : '';
    });
    qs('[data-text-report]', root).textContent = `${select.selectedOptions[0].textContent} · ${motion.reduced ? 'immediately readable' : time === total ? 'complete' : `${Math.round(time)} / ${Math.round(total)}ms`}`;
  });
  function build(play = true) {
    transport.pause(); sentence.textContent = original; delete sentence.dataset.splitReady;
    kind = select.value;
    if (kind === 'lines') {
      sentence.textContent = '';
      const readable = document.createElement('span'); readable.className = 'sr-only'; readable.textContent = original;
      const visual = document.createElement('span'); visual.setAttribute('aria-hidden', 'true');
      pieces = ['Good motion helps', 'people see', 'what changed.'].map(line => {
        const mask = document.createElement('span'), inner = document.createElement('span');
        mask.className = 'ch-mask'; inner.textContent = line; mask.append(inner); visual.append(mask); return inner;
      });
      sentence.append(readable, visual); step = 90;
    } else {
      pieces = splitText(sentence, { type: kind === 'chars' ? 'chars' : 'words' });
      if (kind === 'fade') pieces = [qs('.split-visual', sentence)];
      step = kind === 'chars' ? 20 : 55;
    }
    transport.set(420 + (pieces.length - 1) * step); if (play) transport.replay();
  }
  select.addEventListener('change', () => build());
  qs('[data-replay]', root).addEventListener('click', () => transport.replay());
  build(false);
}

function loaders(root) {
  let visible = false, paused = false;
  const button = qs('[data-pause]', root);
  function update() {
    const active = visible && !document.hidden;
    root.dataset.active = String(active);
    root.dataset.paused = String(paused);
    button.setAttribute('aria-pressed', String(paused)); button.textContent = paused ? 'Resume loaders' : 'Pause loaders';
    qs('[data-loader-report]', root).textContent = motion.reduced ? 'Static loading symbols · reduced motion' : `${paused ? 'Paused by you' : active ? 'Running' : 'Suspended offscreen'} · 1,200ms cycle / 100ms phases`;
  }
  button.addEventListener('click', () => { paused = !paused; update(); });
  observeVisibility(root, value => { visible = value; update(); });
  document.addEventListener('visibilitychange', update); motion.subscribe(update); update();
}

function continuity(root) {
  const list = qs('[data-list-view]', root), detail = qs('[data-detail]', root), hero = qs('[data-hero]', root), buttons = qsa('[data-item]', root);
  const back = qs('[data-back]', root), title = qs('[data-detail-title]', root), body = qs('[data-detail-body]', root), actions = qs('[data-detail-actions]', root), save = qs('[data-save]', root), status = qs('[data-phone-status]', root);
  const saved = new Set(); let source = null, opening = false, geometry = { x: 0, y: 0, sx: 1, sy: 1 };
  function measure() {
    if (!source || detail.hidden) return;
    hero.style.transform = '';
    const first = qs('.ch-cover', source).getBoundingClientRect(), last = hero.getBoundingClientRect();
    geometry = { x: first.left - last.left, y: first.top - last.top, sx: first.width / Math.max(1, last.width), sy: first.height / Math.max(1, last.height) };
  }
  const transport = clock(root, time => {
    const p = local(time, 0, 400), g = geometry;
    hero.style.transform = `translate(${g.x * (1 - p)}px, ${g.y * (1 - p)}px) scale(${lerp(g.sx, 1, p)}, ${lerp(g.sy, 1, p)})`;
    [title, body, actions].forEach((el, i) => {
      const p = local(time, [180, 280, 360][i], [260, 280, 240][i]);
      el.style.opacity = String(p); el.style.transform = `translateY(${(1 - p) * 14}px)`;
    });
    // Keep Back available even at time zero; it owns interruption of this panel.
  }, time => {
    if (time === 0 && !opening) { detail.hidden = true; root.dataset.state = 'list'; }
    else if (opening) root.dataset.state = 'detail';
  });
  function bookmark() {
    const isSaved = source && saved.has(source);
    save.setAttribute('aria-pressed', String(Boolean(isSaved))); save.textContent = isSaved ? 'Saved ✓' : 'Save reading';
  }
  function open(button) {
    transport.pause(); source = button; opening = true;
    title.textContent = button.dataset.title; body.textContent = button.dataset.body;
    const cover = qs('.ch-cover', button); hero.textContent = cover.textContent;
    hero.style.backgroundColor = getComputedStyle(cover).backgroundColor;
    detail.hidden = false; detail.inert = false; detail.setAttribute('aria-hidden', 'false');
    list.style.visibility = 'hidden';
    buttons.forEach(b => b.setAttribute('aria-expanded', String(b === button)));
    back.focus({ preventScroll: true }); list.inert = true; list.setAttribute('aria-hidden', 'true');
    bookmark(); measure(); root.dataset.state = 'opening'; root.dataset.selected = String(buttons.indexOf(button));
    status.textContent = `Reading: ${button.dataset.title}. Back returns to this item.`;
    transport.set(600, 0); transport.play();
  }
  function close() {
    if (!opening || !source) return;
    opening = false; root.dataset.state = 'closing';
    list.style.visibility = ''; list.inert = false; list.setAttribute('aria-hidden', 'false');
    buttons.forEach(b => b.setAttribute('aria-expanded', 'false'));
    source.focus({ preventScroll: true }); detail.inert = true; detail.setAttribute('aria-hidden', 'true');
    status.textContent = `Back on shelf: ${source.dataset.title}.`;
    transport.play(true);
  }
  buttons.forEach(button => button.addEventListener('click', () => open(button)));
  back.addEventListener('click', close);
  save.addEventListener('click', () => { if (!source) return; if (saved.has(source)) saved.delete(source); else saved.add(source); bookmark(); status.textContent = `${saved.has(source) ? 'Saved' : 'Unsaved'} locally: ${source.dataset.title}.`; });
  root.addEventListener('keydown', event => { if (event.key === 'Escape' && opening) { event.preventDefault(); event.stopPropagation(); close(); } });
  if ('ResizeObserver' in window) new ResizeObserver(() => { measure(); transport.draw(); }).observe(qs('[data-phone]', root));
  root.dataset.state = 'list'; transport.set(600, 0);
}

function attention(root) {
  const chaotic = qsa('[data-inbox="chaotic"] li', root), calm = qsa('[data-inbox="calm"] li', root);
  let selected = 0;
  const transport = clock(root, (time, total) => {
    const p = time / total, envelope = motion.reduced ? 0 : Math.sin(Math.PI * p) * (1 - p);
    chaotic.forEach((row, i) => { row.style.transform = `translateY(${Math.sin(p * Math.PI * 6 + i) * 12 * envelope}px) rotate(${Math.sin(p * Math.PI * 4 + i) * 3 * envelope}deg)`; });
    calm.forEach((row, i) => { row.style.transform = `scale(${1 + (i === selected ? .04 * envelope : 0)})`; });
  });
  qs('[data-replay]', root).addEventListener('click', () => {
    selected = (selected + 1) % calm.length;
    [chaotic, calm].forEach(rows => rows.forEach((row, i) => { row.classList.toggle('ch-changed', i === selected); qs('[data-saved]', row).textContent = i === selected ? 'Saved ✓' : 'Not saved'; }));
    const name = qs('b', calm[selected]).textContent;
    root.dataset.changed = String(selected);
    qs('[data-attention-result]', root).textContent = `Changed: ${name} saved in both inboxes.`;
    transport.replay();
  });
  transport.set(1100);
}
