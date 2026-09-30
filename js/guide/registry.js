/**
 * Field guide chapter registry: the single source for chapter order, titles,
 * lesson counts (the denominator for progress) and colours.
 */

export const CHAPTERS = [
  {
    id: 'timing',
    num: '01',
    title: 'Timing & duration',
    file: 'timing.html',
    lessons: 6,
    minutes: 15,
    color: 'var(--gold)',
    blurb: 'How long motion should last, and why distance, direction and latency change the answer.',
  },
  {
    id: 'easing',
    num: '02',
    title: 'Easing & curves',
    file: 'easing.html',
    lessons: 7,
    minutes: 20,
    color: 'var(--accent)',
    blurb: 'Curves give motion its character. Learn the families, when to use each, and how to author your own.',
  },
  {
    id: 'springs',
    num: '03',
    title: 'Springs & physics',
    file: 'springs.html',
    lessons: 7,
    minutes: 20,
    color: 'var(--mint)',
    blurb: 'Physical motion that stays interruptible: stiffness, damping, momentum, rubber bands and gravity.',
  },
  {
    id: 'feedback',
    num: '04',
    title: 'Micro-interactions',
    file: 'feedback.html',
    lessons: 5,
    minutes: 25,
    color: 'var(--lime)',
    blurb: 'Fourteen production patterns for forms, gestures, progress and delight, each taken apart.',
  },
  {
    id: 'choreography',
    num: '05',
    title: 'Choreography',
    file: 'choreography.html',
    lessons: 6,
    minutes: 18,
    color: 'var(--iris)',
    blurb: 'Stagger, sequence and overlap: turning many moving parts into one readable gesture.',
  },
  {
    id: 'scroll',
    num: '06',
    title: 'Scroll-driven motion',
    file: 'scroll.html',
    lessons: 6,
    minutes: 16,
    color: 'var(--sky)',
    blurb: 'Scroll-triggered versus scroll-linked, parallax, pinned storytelling and native scroll timelines.',
  },
  {
    id: 'layout',
    num: '07',
    title: 'Layout & continuity',
    file: 'layout.html',
    lessons: 6,
    minutes: 18,
    color: 'var(--accent)',
    blurb: 'Keep objects continuous when layout changes: FLIP, animating height, View Transitions and morphing.',
  },
  {
    id: 'depth',
    num: '08',
    title: 'Depth & material',
    file: 'depth.html',
    lessons: 6,
    minutes: 14,
    color: 'var(--iris)',
    blurb: 'Shadows, perspective, blur and light that give a flat screen a sense of material.',
  },
  {
    id: 'craft',
    num: '09',
    title: 'Accessibility & performance',
    file: 'craft.html',
    lessons: 5,
    minutes: 16,
    color: 'var(--mint)',
    blurb: 'Motion that includes everyone and respects the frame budget: reduced motion, compositor trade-offs and layout cost.',
  },
];

export const chapterById = (id) => CHAPTERS.find((chapter) => chapter.id === id) ?? null;

/** Absolute URL of the shared icon sprite, valid from any page depth. */
export const ICONS = new URL('../../assets/icons.svg', import.meta.url).href;

/** Markup for a sprite icon. */
export const icon = (name, className = 'icon') =>
  `<svg class="${className}" aria-hidden="true"><use href="${ICONS}#i-${name}"/></svg>`;
