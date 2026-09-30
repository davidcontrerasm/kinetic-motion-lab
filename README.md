# Kinetic — motion showcase & field guide

A vanilla HTML, CSS and JavaScript portfolio with a nine-chapter study guide.
**No runtime dependencies, no build step.** The showcase remains a working portfolio;
the guide adds explanations, key ideas, pitfalls, code and three-question checks.

## Run

From this directory:

```sh
python3 -m http.server 8080
# or npm run serve
```

Open [the showcase](http://localhost:8080/index.html) or
[the field guide](http://localhost:8080/guide/index.html).
ES modules require HTTP: opening the files directly with `file://` does not initialize
interactive tools. Static lessons, curriculum links, snippets and showcase notes remain
readable without JavaScript. Early chapters also link back to the static guide curriculum
through their breadcrumb and footer.

## Showcase

| Section | Working study |
| --- | --- |
| Intro / hero | Replayable curtain, variable-font proximity, spring canvas, pointer coordinates and an approximate rAF cadence readout |
| Marquees / 00 Manifesto | Scroll-velocity typography and a pinned, scroll-linked paragraph |
| 01 Timing & easing | Keyboard/pointer cubic-bezier editor, shared solver, presets, previews and CSS copy |
| 02 Micro-interactions | 12 original components: hold, like, switch, submit, checklist, email, tabs, rating, stepper, copy, slider and notifications; each has static How it works notes |
| 03 Physics | Throwable 2D spring lab, parameters, regime, settle estimate and oscilloscope |
| 04 Principles | Eight CSS studies in a scroll-linked horizontal gallery |
| 05 Layout | Interruptible FLIP filtering, sorting, grid/list and swatch dialog |
| 06 Depth | Three conceptual layered artworks with spring tilt and pointer glare |
| 07 Field guide | Nine static curriculum cards, shared local progress, resume and reference links |
| 08 Fin | Jelly lettering, intro replay and back-to-top progress |

## Curriculum

**54 lessons and over 60 study groups**, including reused primary tools. Chapter 04 adds
**14 micro-interaction patterns** alongside the showcase's **12 original components**;
the guide is not a replacement for them. Counts describe lessons, not a fabricated count
of entirely new algorithms.

| Chapter | Lessons | Scope |
| --- | ---: | --- |
| [01 Timing & duration](guide/timing.html) | 6 | Duration ladder, distance, asymmetry, simulated latency, quantized sampling, hover intent |
| [02 Easing & curves](guide/easing.html) | 7 | Velocity, families, direction, reused curve editor, linear() builder, steps, tokens |
| [03 Springs & physics](guide/springs.html) | 7 | Reused spring lab, interruption, damping regimes, momentum, rubber bands, gravity, chains |
| [04 Micro-interactions](guide/feedback.html) | 5 | Forms, manipulation, disclosure, progress and delight; 14 patterns |
| [05 Choreography](guide/choreography.html) | 6 | Stagger, scheduling, text, loaders, continuity and attention |
| [06 Scroll-driven motion](guide/scroll.html) | 6 | Triggered/linked, parallax, storytelling, counters, native/fallback timelines, velocity |
| [07 Layout & continuity](guide/layout.html) | 6 | FLIP debugger and shared grid, height, View Transitions, morphs and leaderboard |
| [08 Depth & material](guide/depth.html) | 6 | Elevation, card flip, shared tilt, glass, spotlight and focal planes |
| [09 Accessibility & performance](guide/craft.html) | 5 | Equivalent reduced states, main thread, property cost, layout batching and native focus |

The [cheat sheet](guide/cheatsheet.html) includes duration heuristics, easing tokens,
spring presets, typical rendering paths, 10 shipping checks and a searchable 36-term
[glossary](guide/cheatsheet.html#glossary). Timing values are starting points, not universal
perceptual thresholds. Layer promotion and visible smoothness are not guaranteed.

## Progress, privacy and accessibility

- `kinetic:guide` in localStorage stores lesson IDs seen, best quiz score and explicit
  chapter completion. A lesson counts after **1.2 continuous seconds** with at least
  40% of its height or half the viewport visible. Hidden documents do not accrue dwell.
  Percentages count seen lessons, or 100% for explicit completion; quiz scores are separate.
  Overall progress is the mean chapter percentage. Resume chooses the first incomplete
  chapter, not a saved scroll position. Showcase and guide use the same store and key.
- `kinetic:motion` stores an explicit motion preference. Otherwise the live OS preference
  applies. The header toggle and **M** shortcut control the shared runtime. The cheat-sheet
  checklist separately saves only checked item identifiers in localStorage. Reset progress
  does not erase the motion preference or shipping checklist; each has its own control.
- Storage denial and malformed progress JSON fall back safely; blocked storage means
  progress cannot survive a page reload. There is no account, analytics or progress server.
- Save, send, upload, download, OTP, route and data demonstrations are **local simulators**.
  They do not upload files, send mail, authenticate or make real network requests. Fonts
  are the deliberate third-party requests (Google Fonts CSS and font files); system-font
  fallbacks keep content usable offline. Most demo state is in memory, not persisted.
- Semantic controls retain keyboard operation and focus. Split headings retain intact
  accessible text. Notes are readable before enhancement; the shared disclosure adds
  `aria-expanded` and inert collapsed content. Reduced presentation retains feedback,
  usually as static endpoints; short fades are an optional design alternative.
- New browser features are capability-guarded: linear() has an easing/JS fallback,
  native scroll timelines and View Transitions have JS/local-state alternatives, and
  material effects have readable solid/full-reveal alternatives. No browser-version sniffing.

## Experiments are not benchmarks

The craft chapter's **Block main thread · 2s** button deliberately freezes main-thread
interaction for about two seconds, **only after explicit activation**. Nothing blocks on
load. Property sampling is bounded to three seconds and layout batching uses bounded
repetitions with outcome-parity checks. Results are real main-thread timestamps or layout
measurements, not true visible FPS, compositor throughput, dropped-frame counts or a
promised speed ratio. The timing chapter's rows simulate lower sampling rates; its cadence
estimate is not a display capability test. Profile on your own device with browser tools.

## Architecture

- `index.html` / `js/main.js`: original showcase, isolated module initialization.
- `guide/*.html` / `js/guide.js`: static lessons and common guide boot, chapter modules.
- `js/guide/registry.js`: canonical order, titles, lesson denominators and card metadata.
- `js/guide/progress.js`: dependency-free, injectable-storage progress logic.
  `js/guide/shell.js` owns the one browser store and exports index progress rendering;
  `js/modules/field-guide.js` supplies only the home-relative `guide/` routing base.
- `js/guide/widgets.js`: shared notes, snippets/highlighting, quizzes and rings.
- `js/chapters/shared.js`: isolated, idempotent demo runner (ready only after success),
  first-view dwell and shared early-study activity gating.
- `js/core/`: pure easing, exact damped-spring stepping, physics, choreography and morph
  helpers; DOM/UI helpers; a shared motion preference and rAF ticker.
- `js/modules/`: reusable showcase tools; the guide reuses the curve editor, spring lab,
  FLIP grid and tilt rather than replacing their algorithms.
- `css/guide.css`: guide shell and shared widgets; `css/showcase-guide.css` scopes home
  integration. `css/chapters/` styles individual studies.

Most continuous JS demonstrations subscribe to the shared ticker. CSS/WAAPI effects and
finite instrumentation also exist; this is **not** a promise of literally one rAF caller,
zero offscreen work site-wide or transforms-only rendering. The early chapter loops stop
when inactive/reduced, while functional completion timers remain real. Cost experiments
intentionally animate or measure properties that a production fast path might avoid.

## Validation commands

Node's built-in test runner requires no packages:

```sh
npm test
```

It includes pure helper/storage tests and `tests/site-contract.test.mjs`: all registered
chapters, 54 lessons, 63 study structures (including two non-data-demo primary tools),
lesson callouts/snippets/quizzes, static curriculum parity, original hooks, notes,
IDs, internal links/hashes, CSS/JS assets/imports and shared initializer contracts.

Browser tests use Python Playwright, not npm dependencies. Use your existing working
Python environment (including `/tmp/pw` if that is your configured Playwright environment).
Do not install into a system-managed Python. For a new environment only:

```sh
python3 -m venv /tmp/kinetic-browser-venv
. /tmp/kinetic-browser-venv/bin/activate
python -m pip install playwright
python -m playwright install chromium
```

Keep the HTTP server running in another terminal. From the environment containing
Playwright:

```sh
python tests/e2e/run.py --url http://localhost:8080/
# equivalently, with that environment's python3 on PATH:
npm run test:e2e -- --url http://localhost:8080/
```

The runner invokes these unchanged/existing suites and the new global suite sequentially,
using **the same `sys.executable`**, and stops with a nonzero exit on failure:

```sh
python tests/e2e/smoke.py --url http://localhost:8080/
python tests/e2e/feedback_springs.py --url http://localhost:8080/
python tests/e2e/choreography_scroll.py --url http://localhost:8080/
python tests/e2e/layout_depth_craft.py --url http://localhost:8080/
python tests/e2e/guide_smoke.py --url http://localhost:8080/
```

**Chromium is the default.** `--browser firefox` or `--browser webkit` is forwarded only
to suites supporting it; smoke and feedback/springs remain Chromium-only. Install any
additional browser deliberately before selecting it; there is no implicit `all` mode.
`--shots /tmp/kinetic-shots` optionally saves screenshots from suites supporting shots;
no screenshots, logs or temporary files are written into source by default.

Coverage includes original interactions, all page entries and study groups, desktop and
phone layout, intermediate header fit, reduced/live preferences, native/forced fallbacks,
keyboard/copy, notes/snippets/quizzes, tall-lesson dwell interruption, completion/reset,
resume routing, persistence/back navigation, reference filtering/checklist and no-JS
content. These are executable coverage contracts, **not a claim that external browser
validation has passed**. Run the full suite in the target environment and inspect results.
