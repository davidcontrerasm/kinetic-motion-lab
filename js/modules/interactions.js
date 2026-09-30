/**
 * The twelve micro-interaction demos. Each is self-contained, keyboard
 * accessible and degrades to instant state changes under reduced motion.
 */
import { qs, qsa, copyText, escapeHTML } from '../core/dom.js';
import { motion, createLoop, clamp, damp, springCurve } from '../core/motion.js';
import { Spring } from '../core/spring.js';
import { RollingNumber, burst, slideIndicator, snapIndicator, shake, PALETTE } from '../core/ui.js';

const demos = {
  hold: holdDemo,
  like: likeDemo,
  switch: switchDemo,
  send: sendDemo,
  checklist: checklistDemo,
  field: fieldDemo,
  tabs: tabsDemo,
  rating: ratingDemo,
  stepper: stepperDemo,
  copy: copyDemo,
  slider: sliderDemo,
  notify: notifyDemo,
};

export function initInteractions() {
  const grid = qs('[data-demos]');
  if (!grid) return;
  qsa('[data-demo]', grid).forEach((card) => {
    const init = demos[card.dataset.demo];
    if (!init) return;
    try {
      init(card);
    } catch (error) {
      console.error(`[kinetic] demo "${card.dataset.demo}" failed`, error);
    }
  });
  initSpotlight(grid);
}

/** One pointer listener lights every card's spotlight and border glow. */
function initSpotlight(grid) {
  const cards = qsa('.demo', grid);
  let frame = 0;
  let lastEvent = null;
  grid.addEventListener('pointermove', (event) => {
    lastEvent = event;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      const rects = cards.map((card) => card.getBoundingClientRect()); // read everything first
      cards.forEach((card, i) => {
        card.style.setProperty('--mx', `${lastEvent.clientX - rects[i].left}px`);
        card.style.setProperty('--my', `${lastEvent.clientY - rects[i].top}px`);
      });
    });
  });
  grid.addEventListener('pointerleave', () => {
    cards.forEach((card) => {
      card.style.removeProperty('--mx');
      card.style.removeProperty('--my');
    });
  });
}

/** Centre of `element` in the coordinate space of its positioned `container`. */
function centreWithin(element, container) {
  const a = element.getBoundingClientRect();
  const b = container.getBoundingClientRect();
  return { x: a.left - b.left + a.width / 2, y: a.top - b.top + a.height / 2 };
}

/* 02.01 Hold to confirm ---------------------------------------------------- */
function holdDemo(card) {
  const button = qs('[data-hold]', card);
  const stage = qs('.demo__stage', card);
  const content = qs('.hold__content', button);
  const overlay = content.cloneNode(true);
  overlay.classList.add('hold__content--overlay');
  overlay.setAttribute('aria-hidden', 'true');
  button.appendChild(overlay);

  const labels = qsa('[data-hold-text]', button);
  const setLabel = (text) => labels.forEach((label) => (label.textContent = text));
  const FILL_MS = 1100;
  const DRAIN_MS = 420;
  let progress = 0;
  let holding = false;
  let done = false;
  let resetTimer = 0;

  const paint = () => button.style.setProperty('--progress', progress.toFixed(4));

  const loop = createLoop((dt) => {
    progress = clamp(progress + (holding ? (dt * 1000) / FILL_MS : -(dt * 1000) / DRAIN_MS));
    paint();
    if (progress >= 1 && holding) complete();
    else if (!holding && progress <= 0) loop.stop();
  });

  const start = () => {
    if (done) return;
    holding = true;
    button.classList.add('is-holding');
    loop.start();
  };
  const release = () => {
    if (!holding) return;
    holding = false;
    button.classList.remove('is-holding');
  };

  function complete() {
    holding = false;
    done = true;
    loop.stop();
    progress = 1;
    paint();
    button.classList.remove('is-holding');
    button.classList.add('is-done');
    setLabel('Deleted');
    const { x, y } = centreWithin(button, stage);
    burst(stage, { x, y, count: 16, distance: [70, 130], size: [4, 8] });
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      done = false;
      button.classList.remove('is-done');
      setLabel('Hold to delete');
      loop.start(); // drains the fill: a visible rewind back to idle
    }, 2200);
  }

  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    button.setPointerCapture?.(event.pointerId);
    start();
  });
  button.addEventListener('pointerup', release);
  button.addEventListener('pointercancel', release);
  button.addEventListener('lostpointercapture', release);
  button.addEventListener('keydown', (event) => {
    if ((event.key === ' ' || event.key === 'Enter') && !event.repeat) {
      event.preventDefault();
      start();
    }
  });
  button.addEventListener('keyup', (event) => {
    if (event.key === ' ' || event.key === 'Enter') release();
  });
  button.addEventListener('blur', release);
  button.addEventListener('contextmenu', (event) => event.preventDefault());
}

/* 02.02 Like burst --------------------------------------------------------- */
function likeDemo(card) {
  const button = qs('[data-like]', card);
  const icon = qs('.like__icon', button);
  const formatter = new Intl.NumberFormat('en-US');
  const counter = new RollingNumber(qs('[data-like-count]', button), { value: 1284, format: (v) => formatter.format(v) });
  let liked = false;

  button.addEventListener('click', () => {
    liked = !liked;
    button.setAttribute('aria-pressed', String(liked));
    button.classList.toggle('is-liked', liked);
    counter.set(counter.value + (liked ? 1 : -1));
    button.classList.remove('is-popping');
    if (!liked) return;
    void button.offsetWidth; // restart the CSS keyframes
    button.classList.add('is-popping');
    burst(icon, { x: icon.offsetWidth / 2, y: icon.offsetHeight / 2, count: 12, distance: [26, 48], size: [4, 7] });
  });
  button.addEventListener('animationend', (event) => {
    if (event.target instanceof Element && event.target.classList.contains('like__ring')) button.classList.remove('is-popping');
  });
}

/* 02.03 Day / night switch ------------------------------------------------- */
function switchDemo(card) {
  const toggle = qs('[data-switch]', card);
  const sky = qs('[data-sky]', card);
  const caption = qs('[data-switch-caption]', card);
  toggle.addEventListener('click', () => {
    const on = toggle.getAttribute('aria-checked') !== 'true';
    toggle.setAttribute('aria-checked', String(on));
    sky.classList.toggle('is-night', on);
    caption.textContent = on ? 'Night' : 'Day';
  });
}

/* 02.04 Morphing submit ---------------------------------------------------- */
function sendDemo(card) {
  const button = qs('[data-send]', card);
  const stage = qs('.demo__stage', card);
  const status = qs('[data-send-status]', card);
  let timer = 0;

  button.addEventListener('click', () => {
    if (button.dataset.state !== 'idle') return;
    button.dataset.state = 'loading';
    button.setAttribute('aria-busy', 'true');
    status.textContent = 'Sending';
    clearTimeout(timer);
    timer = setTimeout(
      () => {
        button.dataset.state = 'success';
        button.removeAttribute('aria-busy');
        status.textContent = 'Message sent';
        const { x, y } = centreWithin(button, stage);
        burst(stage, { x, y, count: 12, distance: [44, 76], colors: ['#d4ff4f', '#45e3b8', '#f3f0ea'] });
        timer = setTimeout(() => {
          button.dataset.state = 'idle';
          status.textContent = '';
        }, 2000);
      },
      motion.reduced ? 700 : 1800,
    );
  });
}

/* 02.05 Checklist ---------------------------------------------------------- */
function checklistDemo(card) {
  const inputs = qsa('input[type="checkbox"]', card);
  const bar = qs('[data-checklist-bar]', card);
  const status = qs('[data-checklist-status]', card);
  const list = qs('.checklist', card);
  const stage = qs('.demo__stage', card);

  const update = (changed) => {
    const done = inputs.filter((input) => input.checked).length;
    const total = inputs.length;
    const complete = done === total;
    bar.style.transform = `scaleX(${done / total})`;
    list.classList.toggle('is-complete', complete);
    status.textContent = complete ? 'All done. Ship it.' : `${done} of ${total} done`;
    if (!changed?.checked) return;
    const box = changed.nextElementSibling;
    burst(box, { x: box.offsetWidth / 2, y: box.offsetHeight / 2, count: 8, distance: [16, 30], size: [3, 5], colors: ['#d4ff4f', '#45e3b8', '#ffc53d'] });
    if (complete) {
      const { x, y } = centreWithin(status, stage);
      burst(stage, { x, y, count: 26, distance: [60, 150], size: [4, 8], spread: Math.PI * 1.1, angle: -Math.PI / 2 });
    }
  };

  inputs.forEach((input) => input.addEventListener('change', () => update(input)));
  update(null);
}

/* 02.06 Floating label & validation --------------------------------------- */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function fieldDemo(card) {
  const form = qs('[data-field]', card);
  const input = qs('input', form);
  const control = qs('[data-field-control]', form);
  const message = qs('[data-field-msg]', form);
  const OK = 'Looks good. Nice one.';

  const setState = (state, text) => {
    if (state) form.dataset.state = state;
    else delete form.dataset.state;
    message.textContent = text;
    input.setAttribute('aria-invalid', String(state === 'error'));
  };

  const validate = () => {
    const value = input.value.trim();
    if (!value) {
      setState('error', 'Please enter an email address.');
      shake(control);
    } else if (!EMAIL.test(value)) {
      setState('error', 'That doesn’t look like an email yet.');
      shake(control);
    } else {
      setState('valid', OK);
    }
  };

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    validate();
  });
  input.addEventListener('input', () => {
    const ok = EMAIL.test(input.value.trim());
    if (form.dataset.state === 'error' && ok) setState('valid', OK);
    else if (form.dataset.state === 'valid' && !ok) setState('', '');
  });
  input.addEventListener('blur', (event) => {
    // The submit button validates on its own; avoid a double shake.
    if (event.relatedTarget instanceof HTMLElement && event.relatedTarget.type === 'submit') return;
    if (input.value.trim() && form.dataset.state !== 'valid') validate();
  });
}

/* 02.07 Elastic tabs ------------------------------------------------------- */
const TAB_CONTENT = [
  { title: 'Home', meta: '3 new', lines: [92, 68, 80] },
  { title: 'Search', meta: 'Cmd K', lines: [100, 54, 74] },
  { title: 'Inbox', meta: '12 unread', lines: [76, 88, 60] },
  { title: 'Profile', meta: 'Pro', lines: [58, 94, 70] },
];

function tabsDemo(card) {
  const list = qs('[data-tabs-list]', card);
  const tabs = qsa('[role="tab"]', list);
  const pill = qs('[data-tabs-pill]', card);
  const panel = qs('[data-tabs-panel]', card);
  let index = 0;

  const build = (i) => {
    const content = TAB_CONTENT[i];
    const element = document.createElement('div');
    element.className = 'tabs__content';
    element.innerHTML = `<h4>${escapeHTML(content.title)} <span>${escapeHTML(content.meta)}</span></h4>${content.lines
      .map((w) => `<span class="skeleton" style="--w:${w}%"></span>`)
      .join('')}`;
    return element;
  };
  panel.appendChild(build(0));

  function select(next, focus) {
    if (next === index) {
      if (focus) tabs[next].focus();
      return;
    }
    const direction = next > index ? 1 : -1;
    tabs[index].setAttribute('aria-selected', 'false');
    tabs[index].tabIndex = -1;
    index = next;
    tabs[index].setAttribute('aria-selected', 'true');
    tabs[index].tabIndex = 0;
    panel.setAttribute('aria-labelledby', tabs[index].id);
    if (focus) tabs[index].focus();
    slideIndicator(pill, tabs[index], direction);

    const previous = qsa('.tabs__content:not(.is-leaving)', panel);
    const incoming = build(index);
    panel.appendChild(incoming);
    if (motion.reduced) {
      previous.forEach((element) => element.remove());
      return;
    }
    previous.forEach((element) => {
      element.classList.add('is-leaving');
      const out = element.animate(
        [
          { opacity: 1, transform: 'translateX(0)' },
          { opacity: 0, transform: `translateX(${-direction * 36}px)` },
        ],
        { duration: 260, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
      );
      out.onfinish = () => element.remove();
    });
    incoming.animate(
      [
        { opacity: 0, transform: `translateX(${direction * 36}px)` },
        { opacity: 1, transform: 'translateX(0)' },
      ],
      { duration: 480, delay: 90, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'backwards' },
    );
  }

  tabs.forEach((tab, i) => tab.addEventListener('click', () => select(i, false)));
  list.addEventListener('keydown', (event) => {
    const n = tabs.length;
    const keys = { ArrowRight: (index + 1) % n, ArrowLeft: (index - 1 + n) % n, Home: 0, End: n - 1 };
    if (!(event.key in keys)) return;
    event.preventDefault();
    select(keys[event.key], true);
  });

  const relayout = () => snapIndicator(pill, tabs[index]);
  relayout();
  document.fonts?.ready.then(relayout);
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(list);
  else window.addEventListener('resize', relayout);
}

/* 02.08 Expressive rating -------------------------------------------------- */
const RATING_LABELS = ['Rate your experience', 'Terrible', 'Not great', 'It was okay', 'Pretty good', 'Absolutely loved it'];

function ratingDemo(card) {
  const stars = qsa('.star', card);
  const group = qs('[data-stars]', card);
  const face = qs('[data-face]', card);
  const mouth = qs('[data-mouth]', card);
  const eyes = qsa('[data-eye]', card);
  const label = qs('[data-rating-label]', card);
  const stage = qs('.demo__stage', card);
  stars.forEach((star, i) => star.style.setProperty('--i', i));

  let value = 0;
  const mood = new Spring({ stiffness: 240, damping: 13, precision: 0.002 });

  const drawFace = () => {
    const m = mood.value;
    mouth.setAttribute('d', `M32 ${(66 - m * 2).toFixed(2)} Q50 ${(66 + m * 18).toFixed(2)} 68 ${(66 - m * 2).toFixed(2)}`);
    const squint = Math.max(0, m) * 3;
    eyes.forEach((eye) => eye.setAttribute('ry', (6 - squint).toFixed(2)));
    face.style.setProperty('--mood', m.toFixed(3));
  };

  const loop = createLoop((dt) => {
    mood.step(dt);
    drawFace();
    if (mood.isSettled()) loop.stop();
  });

  const moodFor = (n) => (n === 0 ? 0 : (n - 3) / 2);
  const paint = (n) => {
    stars.forEach((star, i) => star.classList.toggle('is-lit', i < n));
    mood.target = moodFor(n);
    if (motion.reduced) {
      mood.set(mood.target);
      drawFace();
    } else {
      loop.start();
    }
  };

  // The exit animation always lands on the most recently requested label, so rapid
  // reversals (5 -> 1 -> 5 within one exit) can never leave a stale caption behind.
  let labelAnimation = null;
  let requestedLabel = label.textContent;
  const setLabel = (text) => {
    requestedLabel = text;
    if (motion.reduced) {
      labelAnimation?.cancel();
      labelAnimation = null;
      label.textContent = text;
      return;
    }
    if (labelAnimation) return; // an exit is in flight and will pick up requestedLabel
    if (label.textContent === text) return;
    labelAnimation = label.animate(
      [
        { opacity: 1, transform: 'translateY(0)' },
        { opacity: 0, transform: 'translateY(-8px)' },
      ],
      { duration: 140, easing: 'ease-in', fill: 'forwards' },
    );
    labelAnimation.onfinish = () => {
      labelAnimation?.cancel();
      labelAnimation = null;
      label.textContent = requestedLabel;
      label.animate(
        [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
        { duration: 320, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' },
      );
    };
  };

  const commit = (n, focus) => {
    value = n;
    stars.forEach((star, i) => {
      star.setAttribute('aria-checked', String(i === n - 1));
      star.tabIndex = i === n - 1 ? 0 : -1;
    });
    if (focus) stars[n - 1].focus();
    paint(n);
    setLabel(RATING_LABELS[n]);
    if (motion.reduced) return;
    stars.slice(0, n).forEach((star, i) => {
      star.animate(
        [
          { transform: 'scale(1) rotate(0deg)' },
          { transform: 'scale(1.35) rotate(-14deg)' },
          { transform: 'scale(1) rotate(0deg)' },
        ],
        { duration: 480, delay: i * 55, easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      );
    });
    if (n === 5) {
      const { x, y } = centreWithin(face, stage);
      burst(stage, { x, y, count: 18, distance: [50, 96], colors: ['#ffc53d', '#d4ff4f', '#ff5a36'] });
    }
  };

  stars.forEach((star, i) => {
    star.addEventListener('pointerenter', () => paint(i + 1));
    star.addEventListener('click', () => commit(i + 1, false));
  });
  group.addEventListener('pointerleave', () => paint(value));
  group.addEventListener('keydown', (event) => {
    let next = null;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = Math.min(5, value + 1);
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = Math.max(1, value - 1);
    if (next === null) return;
    event.preventDefault();
    commit(next, true);
  });
  drawFace();
}

/* 02.09 Rolling stepper ---------------------------------------------------- */
function stepperDemo(card) {
  const output = qs('[data-stepper-value]', card);
  const counter = new RollingNumber(output, { value: 8, minDigits: 2 });
  const MIN = 0;
  const MAX = 99;
  let timer = 0;

  const change = (step) => {
    const next = clamp(counter.value + step, MIN, MAX);
    if (next === counter.value) {
      shake(output, { distance: 6 });
      return false;
    }
    counter.set(next);
    return true;
  };

  qsa('[data-step]', card).forEach((button) => {
    const step = Number(button.dataset.step);
    const stop = () => {
      clearTimeout(timer);
      timer = 0;
    };
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      stop();
      if (!change(step)) return;
      let delay = 420;
      const repeat = () => {
        timer = setTimeout(() => {
          if (!change(step)) return;
          delay = Math.max(45, delay * 0.78); // accelerate while held
          repeat();
        }, delay);
      };
      repeat();
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach((type) => button.addEventListener(type, stop));
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      change(step);
    });
  });
}

/* 02.10 Copy confirmation -------------------------------------------------- */
function copyDemo(card) {
  const button = qs('[data-copy-btn]', card);
  const source = qs('[data-copy-source]', card);
  const tip = qs('.copy__tip', button);
  tip.textContent = '';
  let hideTimer = 0;
  let clearTimer = 0;

  button.addEventListener('click', async () => {
    const ok = await copyText(source.textContent.trim());
    clearTimeout(hideTimer);
    clearTimeout(clearTimer);
    tip.textContent = ok ? 'Copied' : 'Copy failed';
    button.classList.remove('is-copied');
    void button.offsetWidth;
    button.classList.add('is-copied');
    burst(button, { x: 20, y: 20, count: 8, distance: [22, 36], size: [3, 5], colors: ['#d4ff4f', '#f3f0ea'] });
    hideTimer = setTimeout(() => {
      button.classList.remove('is-copied');
      clearTimer = setTimeout(() => (tip.textContent = ''), 350);
    }, 1600);
  });
}

/* 02.11 Pendulum slider ---------------------------------------------------- */
function sliderDemo(card) {
  const root = qs('[data-pendulum]', card);
  const input = qs('input', root);
  const bubble = qs('[data-bubble]', root);
  const valueEl = qs('[data-bubble-value]', root);
  const fill = qs('[data-pendulum-fill]', root);
  const THUMB = 28;
  const angle = new Spring({ stiffness: 150, damping: 7, precision: 0.01 });
  let push = 0;
  let lastX = null;
  let lastTime = 0;

  const thumb = () => {
    const min = Number(input.min);
    const max = Number(input.max);
    const p = (Number(input.value) - min) / (max - min);
    return { p, x: THUMB / 2 + p * (input.clientWidth - THUMB) };
  };

  const render = () => {
    const { p, x } = thumb();
    bubble.style.transform = `translateX(${x.toFixed(2)}px) translateX(-50%) rotate(${angle.value.toFixed(2)}deg)`;
    fill.style.transform = `scaleX(${p.toFixed(4)})`;
    valueEl.textContent = input.value;
  };

  const loop = createLoop((dt) => {
    push = damp(push, 0, 10, dt);
    angle.target = push;
    angle.step(dt);
    render();
    if (Math.abs(push) < 0.05 && angle.isSettled()) loop.stop();
  });

  input.addEventListener('input', () => {
    const { x } = thumb();
    const now = performance.now();
    if (lastX !== null && !motion.reduced) {
      const dt = Math.max((now - lastTime) / 1000, 1 / 240);
      // The bubble lags behind the thumb, like a pendulum hanging from it.
      push = clamp((-(x - lastX) / dt) * 0.035, -40, 40);
    }
    lastX = x;
    lastTime = now;
    render();
    loop.start();
  });
  input.addEventListener('pointerdown', () => root.classList.add('is-active'));
  const up = () => {
    root.classList.remove('is-active');
    lastX = null;
  };
  input.addEventListener('pointerup', up);
  input.addEventListener('pointercancel', up);
  input.addEventListener('blur', up);

  render();
  if ('ResizeObserver' in window) new ResizeObserver(render).observe(input);
}

/* 02.12 Stacked notifications ---------------------------------------------- */
const MESSAGES = [
  { from: 'Ada', text: 'Loved the spring presets.', color: '#8b7bff' },
  { from: 'Linus', text: 'Can we ship the new easing today?', color: '#45e3b8' },
  { from: 'Grace', text: 'Deploy finished in 42 seconds.', color: '#ffc53d' },
  { from: 'Alan', text: 'That out-back curve is perfect.', color: '#62b6ff' },
  { from: 'Margaret', text: 'Reduced-motion QA passed.', color: '#ff5a36' },
];

function notifyDemo(card) {
  const bell = qs('[data-bell]', card);
  const body = qs('.bell__body', bell);
  const clapper = qs('.bell__clapper', bell);
  const badge = qs('[data-bell-badge]', card);
  const list = qs('[data-toasts]', card);
  const spring = springCurve({ stiffness: 220, damping: 20 });
  const MAX_VISIBLE = 3;
  let next = 0;

  const active = () => qsa('.toast:not(.is-leaving)', list);

  function layout() {
    const items = active();
    items.forEach((toast, i) => {
      toast.style.setProperty('--i', i);
      toast.classList.toggle('is-overflow', i >= MAX_VISIBLE);
    });
    badge.textContent = items.length > 9 ? '9+' : String(items.length);
    badge.classList.toggle('is-visible', items.length > 0);
  }

  function ring(popBadge) {
    if (motion.reduced) return;
    body.animate(
      ['0deg', '18deg', '-16deg', '12deg', '-8deg', '4deg', '0deg'].map((a) => ({ transform: `rotate(${a})` })),
      { duration: 800, easing: 'ease-out' },
    );
    clapper.animate(
      ['0px', '-3px', '3px', '-2px', '1.5px', '0px'].map((x) => ({ transform: `translateX(${x})` })),
      { duration: 800, delay: 40, easing: 'ease-out' },
    );
    if (popBadge) {
      badge.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.4)' }, { transform: 'scale(1)' }], {
        duration: 420,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      });
    }
  }

  function dismiss(toast, direction = 1) {
    if (toast.classList.contains('is-leaving')) return;
    toast.classList.add('is-leaving');
    layout();
    if (motion.reduced) {
      toast.remove();
      return;
    }
    const from = toast.style.translate || '0px 0px';
    const opacity = getComputedStyle(toast).opacity;
    const out = toast.animate(
      [
        { translate: from, opacity },
        { translate: `${direction * 120}% 0px`, opacity: 0 },
      ],
      { duration: 360, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
    );
    out.onfinish = () => toast.remove();
    out.oncancel = () => toast.remove();
  }

  function enableSwipe(toast) {
    let id = null;
    let startX = 0;
    let dx = 0;
    toast.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return;
      id = event.pointerId;
      startX = event.clientX;
      dx = 0;
      toast.setPointerCapture(id);
      toast.classList.add('is-dragging');
    });
    toast.addEventListener('pointermove', (event) => {
      if (event.pointerId !== id) return;
      dx = event.clientX - startX;
      const resisted = dx < 0 ? dx * 0.25 : dx; // rubber-band against the wrong direction
      toast.style.translate = `${resisted}px 0px`;
      toast.style.opacity = String(clamp(1 - Math.abs(resisted) / 220, 0.2, 1));
    });
    const end = (event) => {
      if (event.pointerId !== id) return;
      id = null;
      toast.classList.remove('is-dragging');
      if (dx > 90) {
        dismiss(toast, 1);
        return;
      }
      const from = toast.style.translate;
      toast.style.translate = '';
      toast.style.opacity = '';
      if (from && !motion.reduced) {
        toast.animate([{ translate: from }, { translate: '0px 0px' }], { duration: 520, easing: spring.easing });
      }
    };
    toast.addEventListener('pointerup', end);
    toast.addEventListener('pointercancel', end);
  }

  function add() {
    const message = MESSAGES[next++ % MESSAGES.length];
    const toast = document.createElement('li');
    toast.className = 'toast';
    toast.innerHTML = `
      <span class="toast__avatar" style="--c:${message.color}" aria-hidden="true">${escapeHTML(message.from[0])}</span>
      <div class="toast__body"><b>${escapeHTML(message.from)}</b><p>${escapeHTML(message.text)}</p></div>
      <button class="toast__close" type="button" aria-label="Dismiss notification from ${escapeHTML(message.from)}"><svg class="icon"><use href="#i-close"/></svg></button>
      <span class="toast__timer" aria-hidden="true"></span>`;
    list.prepend(toast);
    layout();
    if (!motion.reduced) {
      toast.animate([{ transform: 'translateY(110%) scale(0.92)', opacity: 0 }], { duration: 560, easing: spring.easing });
    }
    qs('.toast__close', toast).addEventListener('click', () => dismiss(toast, 1));
    qs('.toast__timer', toast).addEventListener('animationend', () => dismiss(toast, 1));
    enableSwipe(toast);
  }

  bell.addEventListener('click', () => {
    const hadBadge = badge.classList.contains('is-visible');
    add();
    ring(hadBadge);
  });
}
