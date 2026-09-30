/** Chapter 08 — isolated material studies. Shared tilt is imported, never forked. */
import { qs, qsa } from '../core/dom.js';
import { motion, observeVisibility, clamp } from '../core/motion.js';
import { syncRange } from '../core/ui.js';
import { initTilt } from '../modules/tilt.js';
import { runDemos } from './shared.js';
const effects = new Map();
function cancel(el) { effects.get(el)?.cancel(); effects.delete(el); }
function transform(el, value, instant = false) {
  const from = getComputedStyle(el).transform; cancel(el); el.style.transform = value;
  if (instant || motion.reduced || document.hidden) return;
  const a = el.animate([{ transform: from }, { transform: value }], { duration: 500, easing: 'cubic-bezier(.2,.8,.2,1)' });
  effects.set(el, a); a.onfinish = a.oncancel = () => { if (effects.get(el) === a) effects.delete(el); };
}
motion.subscribe(reduced => { if (reduced) [...effects.keys()].forEach(cancel); });
document.addEventListener('visibilitychange', () => { if (document.hidden) [...effects.keys()].forEach(cancel); });
export function init() {
  const demos = { elevation, 'card-flip': cardFlip, tilt, glass, spotlight, focus: focusPlanes };
  runDemos(Object.fromEntries(Object.entries(demos).map(([key, fn]) => [key, root => { fn(root); root.dataset.ready = 'true'; }])));
}
function elevation(root) {
  const buttons = qsa('[data-elevation]', root), height = qs('[data-height]', root), angle = qs('[data-angle]', root), heights = [0, 4, 8, 12, 16];
  let selected = 2;
  function render() {
    buttons.forEach((button, i) => {
      const h = heights[i], radians = +angle.value * Math.PI / 180;
      const ambient = `0 ${(h * .5).toFixed(1)}px ${(h * 2 + 2).toFixed(1)}px 0 #0003`;
      const contact = `${(Math.cos(radians) * h).toFixed(1)}px ${(Math.sin(radians) * h).toFixed(1)}px ${(h + 2).toFixed(1)}px -2px #0008`;
      button.style.boxShadow = h === 0 ? 'none' : `${ambient}, ${contact}`;
      button.setAttribute('aria-pressed', String(i === selected)); button.dataset.elevationHeight = String(h);
      if (i === selected) qs('[data-shadow-code]', root).textContent = `height: ${h}px; light: ${angle.value}deg; box-shadow: ${button.style.boxShadow}; /* ambient, contact */`;
    });
  }
  buttons.forEach((b, i) => b.addEventListener('click', () => { selected = i; height.value = String(heights[i]); syncRange(height); render(); }));
  height.addEventListener('input', () => { heights[selected] = +height.value; render(); }); angle.addEventListener('input', render); render();
}
function cardFlip(root) {
  const rotor = qs('[data-rotor]', root), space = qs('[data-space]', root), faces = qsa('[data-face]', root), button = qs('[data-flip-card]', root), axis = qs('[data-axis]', root), perspective = qs('[data-perspective]', root);
  let back = false;
  function render(instant = false) {
    const hidden = faces[back ? 0 : 1];
    if (hidden.contains(document.activeElement)) button.focus({ preventScroll: true });
    faces.forEach((face, i) => { face.inert = i !== (back ? 1 : 0); face.setAttribute('aria-hidden', String(face.inert)); });
    button.setAttribute('aria-pressed', String(back)); button.setAttribute('aria-expanded', String(back)); button.textContent = back ? 'Show front' : 'Show back';
    space.style.perspective = `${perspective.value}px`;
    const rotation = axis.value === 'x' ? 'rotateX' : 'rotateY';
    faces[1].style.transform = `${rotation}(180deg)`;
    if (motion.reduced) {
      cancel(rotor); rotor.style.transform = 'none';
      faces.forEach(face => { face.style.visibility = face.inert ? 'hidden' : 'visible'; face.style.transform = 'none'; });
    } else {
      faces.forEach(face => { face.style.visibility = ''; }); faces[0].style.transform = '';
      transform(rotor, `${rotation}(${back ? 180 : 0}deg)`, instant);
    }
    root.dataset.face = back ? 'back' : 'front';
    qs('[data-card-report]', root).textContent = `${back ? 'Back' : 'Front'} · perspective ${perspective.value}px · ${axis.value.toUpperCase()} axis${motion.reduced ? ' · instant face switch' : ''}`;
  }
  button.addEventListener('click', () => { back = !back; render(); });
  axis.addEventListener('change', () => render()); perspective.addEventListener('input', () => render(true));
  root.addEventListener('keydown', e => { if (e.key === 'Escape') { back = false; render(); } });
  motion.subscribe(() => render(true)); observeVisibility(root, visible => { if (!visible) cancel(rotor); }); render(true);
}
function tilt(root) {
  initTilt(); // Retains the exact .case/.case__inner/.case__glare/.case__layer pointer implementation.
  qsa('.d-case-wrap', root).forEach(wrap => {
    const card = qs('[data-tilt]', wrap), inner = qs('.case__inner', card), layers = qsa('.case__layer', card), report = qs('[data-tilt-report]', wrap);
    let x = 0, y = 0, visible = true;
    const release = () => card.dispatchEvent(new PointerEvent('pointerleave'));
    function neutral() {
      // The borrowed spring has no disposal API. Release its hover ownership so it
      // finitely settles internally, and immediately repaint a neutral local surface.
      release(); x = y = 0; inner.style.transform = 'none'; layers.forEach(el => { el.style.transform = 'none'; });
      card.classList.remove('is-active'); card.dataset.pose = 'neutral'; report.textContent = motion.reduced ? 'Reduced motion · neutral artwork' : 'Neutral artwork';
    }
    function keyboard(direction) {
      if (motion.reduced || !visible || document.hidden || direction === 'reset') { neutral(); return; }
      release();
      x = clamp(x + (direction === 'up' ? 3 : direction === 'down' ? -3 : 0), -10, 10);
      y = clamp(y + (direction === 'right' ? 3 : direction === 'left' ? -3 : 0), -10, 10);
      inner.style.transform = `rotateX(${x}deg) rotateY(${y}deg)`;
      layers.forEach(el => { const depth = +el.style.getPropertyValue('--depth'); el.style.transform = `translate3d(${y / 10 * depth}px,${-x / 10 * depth}px,0)`; });
      card.dataset.pose = 'keyboard'; report.textContent = `Keyboard tilt · X ${x}° / Y ${y}°`;
    }
    // Capture gates borrowed pointer handlers without modifying their source.
    card.addEventListener('pointermove', e => {
      if (motion.reduced || !visible || document.hidden || e.pointerType === 'touch') { e.stopImmediatePropagation(); return; }
      inner.style.transform = ''; layers.forEach(el => { el.style.transform = ''; }); x = y = 0; card.dataset.pose = 'pointer'; report.textContent = 'Shared pointer springs · up to 10°';
    }, true);
    qsa('[data-tilt-key]', wrap).forEach(button => button.addEventListener('click', () => keyboard(button.dataset.tiltKey)));
    wrap.addEventListener('keydown', e => {
      const keys = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Home: 'reset', Escape: 'reset' };
      if (keys[e.key]) { e.preventDefault(); keyboard(keys[e.key]); }
    });
    motion.subscribe(() => neutral()); observeVisibility(card, v => { visible = v; if (!v) neutral(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) neutral(); });
    if (motion.reduced) neutral();
  });
}
function glass(root) {
  const panel = qs('[data-glass]', root), blur = qs('[data-blur]', root), sat = qs('[data-saturation]', root), solid = qs('[data-solid]', root);
  const supported = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
  root.dataset.supported = String(supported);
  function render() {
    const opaque = solid.checked || !supported, filter = opaque ? 'none' : `blur(${blur.value}px) saturate(${sat.value}%)`;
    panel.style.backdropFilter = filter; panel.style.webkitBackdropFilter = filter; panel.style.background = opaque ? '#151725' : 'rgba(10,12,24,.86)';
    root.dataset.material = opaque ? 'solid' : 'glass';
    qs('[data-glass-code]', root).textContent = `${opaque ? 'Solid fallback' : 'Supported glass'}${!supported ? ' · backdrop-filter unavailable' : ''}; backdrop-filter: ${filter};`;
  }
  [blur, sat].forEach(el => el.addEventListener('input', render)); solid.addEventListener('change', render); render();
}
function spotlight(root) {
  const plane = qs('[data-spot-plane]', root), mask = qs('[data-mask]', root), radius = qs('[data-radius]', root), hardness = qs('[data-hardness]', root), reveal = qs('[data-reveal-all]', root);
  const supported = CSS.supports('mask-image', 'radial-gradient(#000, transparent)') || CSS.supports('-webkit-mask-image', 'radial-gradient(#000, transparent)');
  let x = 50, y = 50, all = false;
  root.dataset.supported = String(supported);
  function render() {
    const full = all || motion.reduced || !supported;
    const image = full ? 'none' : `radial-gradient(circle at ${x}% ${y}%, #000 ${+radius.value * +hardness.value / 100}px, transparent ${radius.value}px)`;
    mask.style.maskImage = image; mask.style.webkitMaskImage = image;
    root.dataset.x = x.toFixed(1); root.dataset.y = y.toFixed(1); root.dataset.reveal = String(full);
    reveal.setAttribute('aria-pressed', String(full)); reveal.disabled = motion.reduced || !supported; reveal.textContent = full ? 'All detail revealed' : 'Reveal all';
    qs('[data-mask-report]', root).textContent = !supported ? 'Mask unsupported · static full blueprint' : motion.reduced ? 'Reduced motion · static full blueprint' : full ? 'All detail visible · caption always available' : `Light ${x.toFixed(0)}%, ${y.toFixed(0)}% · radius ${radius.value}px · hardness ${hardness.value}%`;
  }
  function point(e) { if (motion.reduced || !supported) return; const r = plane.getBoundingClientRect(); x = clamp((e.clientX - r.left) / r.width * 100, 0, 100); y = clamp((e.clientY - r.top) / r.height * 100, 0, 100); render(); }
  plane.addEventListener('pointermove', e => { if (e.pointerType !== 'touch') point(e); }); plane.addEventListener('pointerdown', point);
  plane.addEventListener('keydown', e => {
    const keys = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] };
    if (!keys[e.key]) return; e.preventDefault(); if (motion.reduced || !supported) return;
    x = clamp(x + keys[e.key][0], 0, 100); y = clamp(y + keys[e.key][1], 0, 100); render();
  });
  reveal.addEventListener('click', () => { all = !all; render(); }); [radius, hardness].forEach(el => el.addEventListener('input', render)); motion.subscribe(render); render();
}
function focusPlanes(root) {
  const planes = qsa('[data-plane]', root), buttons = qsa('[data-focus]', root), blur = qs('[data-blur]', root);
  const summaries = ['Map selected: paths through the city.', 'Notes selected: observations from the walk.', 'People selected: who joins the next review.'];
  let selected = 0;
  function render(instant = false) {
    planes.forEach((plane, i) => {
      const rank = (i - selected + 3) % 3;
      plane.style.zIndex = String(3 - rank); plane.style.filter = rank ? `blur(${blur.value}px)` : 'none';
      transform(plane, `translate(${rank * 8}px,${rank * 20 - 12}px) scale(${1 - rank * .1})`, instant);
      buttons[i].setAttribute('aria-pressed', String(i === selected));
    });
    root.dataset.selected = String(selected); qs('[data-focus-summary]', root).textContent = summaries[selected];
  }
  buttons.forEach((button, i) => button.addEventListener('click', () => { selected = i; render(); }));
  blur.addEventListener('input', () => render(true)); motion.subscribe(() => render(true));
  observeVisibility(root, visible => { if (!visible) planes.forEach(cancel); }); render(true);
}
