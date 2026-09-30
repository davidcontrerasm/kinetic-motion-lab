import { test } from 'node:test';
import assert from 'node:assert/strict';
import { highlight } from '../js/guide/highlight.js';

test('JavaScript: keywords, strings, numbers, comments and calls', () => {
  const html = highlight("const d = 200; // ms\nel.animate('x', 1.5)", 'js');
  assert.match(html, /<span class="tok-keyword">const<\/span>/);
  assert.match(html, /<span class="tok-number">200<\/span>/);
  assert.match(html, /<span class="tok-comment">\/\/ ms<\/span>/);
  assert.match(html, /<span class="tok-fn">animate<\/span>/);
  assert.match(html, /<span class="tok-string">&#39;x&#39;<\/span>/);
  assert.match(html, /<span class="tok-number">1.5<\/span>/);
});

test('JavaScript: digits inside identifiers are not numbers', () => {
  const html = highlight('const x2 = h1;', 'js');
  assert.ok(!html.includes('tok-number'));
});

test('CSS: selectors, properties, values, numbers and functions', () => {
  const html = highlight('.card:hover { transform: scale(1.02); --lift: 4px; }', 'css');
  assert.match(html, /<span class="tok-selector">card<\/span>/);
  assert.match(html, /<span class="tok-prop">transform<\/span>/);
  assert.match(html, /<span class="tok-fn">scale<\/span>/);
  assert.match(html, /<span class="tok-number">1.02<\/span>/);
  assert.match(html, /<span class="tok-var">--lift<\/span>/);
  assert.match(html, /<span class="tok-number">4px<\/span>/);
});

test('CSS: at-rules and comments', () => {
  const html = highlight('/* note */ @media (x) { a { b: 0 } }', 'css');
  assert.match(html, /tok-comment/);
  assert.match(html, /<span class="tok-keyword">@media<\/span>/);
});

test('HTML: tags, attributes and values; everything is escaped', () => {
  const html = highlight('<button class="x">Go & see</button>', 'html');
  assert.match(html, /<span class="tok-keyword">&lt;button<\/span>/);
  assert.match(html, /<span class="tok-prop">class<\/span>/);
  assert.match(html, /<span class="tok-string">&quot;x&quot;<\/span>/);
  assert.ok(html.includes('Go &amp; see'));
  assert.ok(!/<button/.test(html));
});

test('unknown languages are escaped verbatim', () => {
  assert.equal(highlight('<b>', 'txt'), '&lt;b&gt;');
});
