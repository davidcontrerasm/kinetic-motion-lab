import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createProgressStore } from '../js/guide/progress.js';

function memoryStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    dump: () => Object.fromEntries(map),
  };
}

test('marks lessons once, persists and computes percentages', () => {
  const storage = memoryStorage();
  const store = createProgressStore(storage, 'k');
  assert.equal(store.markSeen('timing', 'ladder'), true);
  assert.equal(store.markSeen('timing', 'ladder'), false);
  store.markSeen('timing', 'distance');
  assert.equal(store.percent('timing', 4), 50);
  const reloaded = createProgressStore(storage, 'k');
  assert.deepEqual(reloaded.get('timing').seen, ['ladder', 'distance']);
});

test('done forces 100% and overall averages chapters', () => {
  const store = createProgressStore(memoryStorage(), 'k');
  store.setDone('easing', true);
  store.markSeen('timing', 'a');
  assert.equal(store.percent('easing', 7), 100);
  assert.equal(store.overall([{ id: 'easing', lessons: 7 }, { id: 'timing', lessons: 2 }]), 75);
  assert.equal(store.overall([]), 0);
});

test('quiz keeps the best score and listeners fire on change', () => {
  const store = createProgressStore(memoryStorage(), 'k');
  let calls = 0;
  const unsubscribe = store.subscribe(() => calls++);
  store.setQuiz('springs', 2);
  store.setQuiz('springs', 1);
  assert.equal(store.get('springs').quiz, 2);
  assert.equal(calls, 1);
  unsubscribe();
  store.setQuiz('springs', 3);
  assert.equal(calls, 1);
});

test('corrupt or blocked storage degrades to an empty session store', () => {
  const corrupt = createProgressStore(memoryStorage({ k: '{nope' }), 'k');
  assert.deepEqual(corrupt.get('x'), { seen: [], quiz: 0, done: false });
  const blocked = createProgressStore(
    { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
    'k',
  );
  blocked.markSeen('a', 'b');
  assert.equal(blocked.percent('a', 1), 100);
  const none = createProgressStore(null, 'k');
  none.setDone('a', true);
  assert.equal(none.get('a').done, true);
});

test('get returns copies that cannot mutate the store', () => {
  const store = createProgressStore(memoryStorage(), 'k');
  store.markSeen('c', 'one');
  store.get('c').seen.push('hacked');
  assert.deepEqual(store.get('c').seen, ['one']);
  store.reset();
  assert.deepEqual(store.get('c').seen, []);
});

test('valid JSON with malformed chapter entries is normalised, not fatal', () => {
  const storage = memoryStorage({
    k: JSON.stringify({ x: null, y: { seen: 42, quiz: 'lots', done: 'yes' }, z: [1, 2], w: { seen: ['a', 7, 'a', 'b'], quiz: 2, done: true } }),
  });
  const store = createProgressStore(storage, 'k');
  assert.equal(store.markSeen('x', 'a'), true);
  assert.deepEqual(store.get('y'), { seen: [], quiz: 0, done: false });
  assert.equal(store.percent('y', 1), 0);
  assert.deepEqual(store.get('z'), { seen: [], quiz: 0, done: false });
  assert.deepEqual(store.get('w'), { seen: ['a', 'b'], quiz: 2, done: true });
  store.setQuiz('y', Number.NaN);
  assert.equal(store.get('y').quiz, 0);
  assert.equal(store.overall([{ id: 'x', lessons: 1 }, { id: 'y', lessons: 2 }]), 50);
});
