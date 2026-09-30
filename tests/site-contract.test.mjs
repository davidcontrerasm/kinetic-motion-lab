import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CHAPTERS } from '../js/guide/registry.js';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const read = (file) => readFileSync(resolve(ROOT, file), 'utf8');
const files = (dir) => readdirSync(resolve(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = `${dir ? `${dir}/` : ''}${entry.name}`;
  if (entry.name.startsWith('.') || ['node_modules', 'notes', 'screenshots', 'screens', '__pycache__'].includes(entry.name)) return [];
  return entry.isDirectory() ? files(path) : [path];
});
const decode = (s) => s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (_, key) => {
  if (key[0] === '#') return String.fromCodePoint(key[1].toLowerCase() === 'x' ? parseInt(key.slice(2), 16) : +key.slice(1));
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }[key.toLowerCase()];
});
const tagPattern = /<\/?([a-z][\w:-]*)\b(?:[^<>"']|"[^"]*"|'[^']*')*>/gi;
const voids = new Set('area base br col embed hr img input link meta param source track wbr use path circle line rect ellipse polygon polyline stop'.split(' '));

// Redact raw text, preserving offsets and real code wrappers. Examples such as
// `querySelector('[data-demo]')` or '<a href=...>' are never treated as HTML.
function parse(source) {
  const blank = (s) => s.replace(/[^\n]/g, ' ');
  let clean = source.replace(/<!--[\s\S]*?-->/g, blank);
  clean = clean.replace(/(<(script|style|code)\b(?:[^>"']|"[^"]*"|'[^']*')*>)([\s\S]*?)(<\/\2\s*>)/gi,
    (_, open, name, body, close) => open + blank(body) + close);
  clean = clean.replace(/(<pre\b[^>]*>)([\s\S]*?)(<\/pre\s*>)/gi,
    (_, open, body, close) => open + (/^\s*<code\b/i.test(body) ? body : blank(body)) + close);
  const root = { children: [], attrs: {}, start: 0, end: source.length };
  const stack = [root];
  const nodes = [];
  for (const match of clean.matchAll(tagPattern)) {
    const token = match[0];
    const name = match[1].toLowerCase();
    if (token.startsWith('</')) {
      const index = stack.findLastIndex((node) => node.name === name);
      if (index > 0) {
        for (const node of stack.splice(index)) node.end = match.index;
      }
      continue;
    }
    const attrs = {};
    const attributes = token.slice(name.length + 1, -1);
    for (const attribute of attributes.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
      attrs[attribute[1].toLowerCase()] = decode(attribute[2] ?? attribute[3] ?? attribute[4] ?? '');
    }
    const node = { name, attrs, children: [], start: match.index + token.length, end: source.length, parent: stack.at(-1) };
    node.parent.children.push(node);
    nodes.push(node);
    if (!voids.has(name) && !token.endsWith('/>')) stack.push(node);
  }
  const text = (node) => decode(source.slice(node.start, node.end).replace(tagPattern, '')).replace(/\s+/g, ' ').trim();
  return { nodes, text };
}
const has = (node, attr) => Object.hasOwn(node.attrs, attr);
const cls = (node, name) => (node.attrs.class ?? '').split(/\s+/).includes(name);
const inside = (node, ancestor) => { for (let p = node.parent; p; p = p.parent) if (p === ancestor) return true; return false; };
const pages = ['index.html', ...files('guide').filter((path) => path.endsWith('.html'))];
const documents = new Map(pages.map((file) => [file, parse(read(file))]));

function checkURL(file, value) {
  if (!value || /^(?:[a-z][\w+.-]*:|\/\/)/i.test(value)) return;
  const url = new URL(value, `https://kinetic.test/${file}`);
  let target = decodeURIComponent(url.pathname).slice(1);
  if (!target || target.endsWith('/')) target += 'index.html';
  const absolute = resolve(ROOT, target);
  assert.ok(absolute.startsWith(ROOT), `${file}: path escapes site: ${value}`);
  assert.ok(existsSync(absolute) && statSync(absolute).isFile(), `${file}: missing ${value}`);
  if (url.hash && ['.html', '.svg'].includes(extname(target))) {
    const parsed = documents.get(target) ?? parse(read(target));
    const id = decodeURIComponent(url.hash.slice(1));
    assert.ok(parsed.nodes.some((node) => node.attrs.id === id), `${file}: missing hash ${value}`);
  }
}

test('nine registered chapters, 54 complete lessons and 63 study structures', () => {
  assert.equal(CHAPTERS.length, 9);
  assert.equal(new Set(CHAPTERS.map((c) => c.id)).size, 9);
  assert.equal(CHAPTERS.reduce((sum, c) => sum + c.lessons, 0), 54);
  const groups = [6, 7, 7, 14, 6, 6, 6, 6, 5];
  let total = 0;
  for (const [index, chapter] of CHAPTERS.entries()) {
    const file = `guide/${chapter.file}`;
    assert.ok(documents.has(file), file);
    const { nodes, text } = documents.get(file);
    const lessons = nodes.filter((n) => has(n, 'data-lesson'));
    assert.equal(lessons.length, chapter.lessons, file);
    assert.ok(nodes.some((n) => n.name === 'body' && n.attrs['data-chapter'] === chapter.id), file);
    assert.ok(nodes.some((n) => cls(n, 'meta-chip') && text(n).includes(`${chapter.lessons} lessons`)), `${file}: hero count`);
    for (const lesson of lessons) {
      assert.ok(lesson.attrs.id, `${file}: lesson ID`);
      for (const name of ['callout--key', 'callout--warn', 'snippet']) {
        assert.ok(nodes.some((n) => inside(n, lesson) && cls(n, name)), `${file}#${lesson.attrs.id}: ${name}`);
      }
      assert.ok(nodes.some((n) => inside(n, lesson) && n.name === 'code' && has(n, 'data-lang')), `${file}: code`);
    }
    const questions = nodes.filter((n) => cls(n, 'quiz__q'));
    assert.equal(questions.length, 3, file);
    for (const question of questions) {
      const options = nodes.filter((n) => inside(n, question) && cls(n, 'quiz__opt'));
      assert.ok(options.length >= 3 && +question.attrs['data-answer'] < options.length);
      assert.ok(nodes.some((n) => inside(n, question) && cls(n, 'quiz__why')));
    }
    const studies = nodes.filter((n) => has(n, 'data-demo') ||
      ((has(n, 'data-bezier') || has(n, 'data-spring-lab')) && !has(n, 'data-demo')));
    assert.equal(studies.length, groups[index], `${file}: studies`);
    total += studies.length;
  }
  assert.equal(total, 63);
});

test('all built HTML IDs, internal destinations and resources resolve', () => {
  for (const [file, { nodes }] of documents) {
    const ids = nodes.filter((n) => n.attrs.id).map((n) => n.attrs.id);
    assert.equal(new Set(ids).size, ids.length, `${file}: duplicate IDs`);
    for (const node of nodes) {
      for (const attr of ['href', 'src', 'poster']) if (has(node, attr)) checkURL(file, node.attrs[attr]);
      for (const attr of ['aria-controls', 'aria-labelledby', 'aria-describedby', 'for']) {
        if (has(node, attr)) for (const id of node.attrs[attr].split(/\s+/)) assert.ok(ids.includes(id), `${file}: ${attr}=${id}`);
      }
    }
    assert.doesNotMatch(read(file), /characters elided|\[content omitted\]|\[\.\.\.\]/i, file);
  }
});

const cssResources = (source) => Array.from(
  source.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^\s)]+))\s*\)/g),
  (match) => match[1] ?? match[2] ?? match[3],
);

test('CSS URL parsing keeps embedded SVG filters inside their data resource', () => {
  assert.deepEqual(cssResources(`background: url("data:image/svg+xml,%3Cfilter%20style='filter:url(%23n)'%3E"); mask: url('../assets/icons.svg'); fill: url(#paint);`),
    ["data:image/svg+xml,%3Cfilter%20style='filter:url(%23n)'%3E", '../assets/icons.svg', '#paint']);
});

test('static relative JavaScript imports and CSS resources resolve', () => {
  for (const file of [...files('js'), ...files('css')]) {
    const source = read(file);
    assert.doesNotMatch(source, /\d[\d,]* characters elided/i, file);
    if (file.endsWith('.js')) {
      const patterns = [/(?:\bimport\s+(?:[^;'"`]*?\s+from\s*)?|\bexport\s+[^;'"`]*?\s+from\s*)['"](\.[^'"]+)['"]/g,
        /\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g,
        /new URL\(\s*['"](\.[^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g];
      for (const pattern of patterns) for (const match of source.matchAll(pattern)) checkURL(file, match[1]);
    } else if (file.endsWith('.css')) {
      for (const resource of cssResources(source)) {
        if (!resource.startsWith('#')) checkURL(file, resource);
      }
    }
  }
});

test('static home and guide curricula match the registry, including all lesson counts', () => {
  for (const file of ['index.html', 'guide/index.html']) {
    const { nodes, text } = documents.get(file);
    const rows = nodes.filter((n) => has(n, 'data-chapter-row'));
    assert.equal(rows.length, 9, file);
    for (const [i, chapter] of CHAPTERS.entries()) {
      const row = rows[i];
      assert.equal(row.attrs['data-chapter-row'], chapter.id);
      assert.equal(row.attrs.href, `${file === 'index.html' ? 'guide/' : ''}${chapter.file}`);
      for (const [name, expected] of [['chapter-row__title', chapter.title], ['chapter-row__blurb', chapter.blurb]]) {
        const child = nodes.find((n) => inside(n, row) && cls(n, name));
        assert.ok(child, `${file}: ${name}`);
        assert.equal(text(child), expected);
      }
      assert.ok(text(row).includes(`${chapter.lessons} lessons`));
      assert.ok(nodes.some((n) => inside(n, row) && has(n, 'data-ring-slot')));
      assert.ok(nodes.some((n) => inside(n, row) && has(n, 'data-ring-label')));
    }
    for (const hook of ['data-resume', 'data-overall-ring', 'data-overall-pct', 'data-overall-done', 'data-progress-reset']) assert.ok(nodes.some((n) => has(n, hook)), hook);
  }
});

test('original showcase hooks and twelve static three-part explanations survive', () => {
  const { nodes, text } = documents.get('index.html');
  const original = ['hold', 'like', 'switch', 'send', 'checklist', 'field', 'tabs', 'rating', 'stepper', 'copy', 'slider', 'notify'];
  const cards = nodes.filter((n) => has(n, 'data-demo'));
  assert.deepEqual(cards.map((n) => n.attrs['data-demo']), original);
  assert.equal(nodes.filter((n) => has(n, 'data-notes')).length, 12);
  for (const card of cards) {
    const note = nodes.find((n) => inside(n, card) && has(n, 'data-notes'));
    assert.ok(note);
    assert.equal(nodes.filter((n) => inside(n, note) && n.name === 'li').length, 3);
    for (const label of ['Rationale', 'Timing', 'Mechanism']) assert.ok(text(note).includes(label));
  }
  for (const hook of ['data-hero', 'data-preloader', 'data-manifesto', 'data-bezier', 'data-spring-lab', 'data-gallery', 'data-flip', 'data-swatch-modal', 'data-tilt', 'data-jelly', 'data-replay']) assert.ok(nodes.some((n) => has(n, hook)), hook);
  const studies = nodes.filter((n) => cls(n, 'section__study'));
  assert.deepEqual(studies.map((n) => nodes.find((child) => inside(child, n) && child.name === 'a').attrs.href),
    ['easing', 'feedback', 'springs', 'choreography', 'layout', 'depth'].map((id) => `guide/${id}.html`));
});

test('reference retains 36 terms and 10 shipping checks; late chapter chrome is shared', () => {
  const { nodes } = documents.get('guide/cheatsheet.html');
  assert.equal(nodes.filter((n) => cls(n, 'glossary__item')).length, 36);
  const checklist = nodes.find((n) => has(n, 'data-ship-checklist'));
  assert.equal(nodes.filter((n) => inside(n, checklist) && n.attrs.type === 'checkbox').length, 10);
  for (const id of ['layout', 'depth', 'craft']) {
    const { nodes: page } = documents.get(`guide/${id}.html`);
    assert.ok(page.some((n) => has(n, 'data-cursor-root')));
    assert.ok(page.some((n) => cls(n, 'grain')));
    assert.ok(page.some((n) => n.name === 'h1' && has(n, 'data-split')));
    assert.ok(page.some((n) => n.attrs.href === '../assets/icons.svg#i-asterisk'));
    assert.ok(page.some((n) => cls(n, 'nav__chevron')));
    assert.ok(page.some((n) => cls(n, 'mobile-menu__foot')));
    assert.ok(page.some((n) => cls(n, 'guide-footer')));
  }
});

test('README local links and listed scripts exist, without runtime dependencies', () => {
  for (const match of read('README.md').matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) checkURL('README.md', match[1]);
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:e2e'], 'python3 tests/e2e/run.py');
  assert.equal(Object.keys(pkg.dependencies ?? {}).length, 0);
  for (const script of ['smoke', 'feedback_springs', 'choreography_scroll', 'layout_depth_craft', 'guide_smoke', 'run']) assert.ok(existsSync(resolve(ROOT, `tests/e2e/${script}.py`)));
});

test('shared runner is idempotent, isolates failure, retries, and first-view fallback is safe', async () => {
  const keys = ['window', 'document', 'requestAnimationFrame', 'cancelAnimationFrame'];
  const descriptors = keys.map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]);
  const listeners = new Map();
  const events = { addEventListener(type, fn) { listeners.set(type, fn); }, removeEventListener(type) { listeners.delete(type); } };
  Object.assign(globalThis, {
    window: { ...events, innerHeight: 800, scrollY: 0, matchMedia: () => ({ matches: false, addEventListener() {} }) },
    document: { ...events, hidden: false, documentElement: { dataset: {} } },
    requestAnimationFrame: () => 1, cancelAnimationFrame() {},
  });
  const log = console.error;
  const errors = [];
  console.error = (...args) => errors.push(args);
  try {
    const { runDemos, onFirstView } = await import('../js/chapters/shared.js');
    const a = { dataset: { demo: 'a' } }, b = { dataset: { demo: 'b' } };
    const root = { querySelectorAll: () => [a, b] };
    let count = 0;
    runDemos({ a: () => { throw Error('intentional contract failure'); }, b: () => count++ }, root);
    assert.equal(a.dataset.ready, undefined);
    assert.equal(b.dataset.ready, 'true');
    assert.equal(errors.length, 1);
    runDemos({ a: () => count++, b: () => count++ }, root);
    runDemos({ a: () => count++, b: () => count++ }, root);
    assert.equal(count, 2);
    let calls = 0;
    const element = { getBoundingClientRect: () => ({ top: 0, bottom: 600, height: 600 }) };
    onFirstView(element, () => calls++, { delay: 5 });
    await new Promise((done) => setTimeout(done, 20));
    assert.equal(calls, 1);
    const cancel = onFirstView(element, () => calls++, { delay: 5 });
    cancel();
    await new Promise((done) => setTimeout(done, 20));
    assert.equal(calls, 1);
  } finally {
    console.error = log;
    for (const [key, descriptor] of descriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
