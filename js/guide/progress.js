/**
 * Study progress for the field guide, persisted in localStorage:
 *   { [chapterId]: { seen: string[], quiz: number, done: boolean } }
 *
 * The store takes an injectable storage object so its logic is unit tested
 * in Node; in the browser it falls back gracefully when storage is blocked.
 */

export const PROGRESS_KEY = 'kinetic:guide';

function browserStorage() {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

const blank = () => ({ seen: [], quiz: 0, done: false });

/** Coerces any persisted value into a well-formed chapter entry. */
function normalize(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const seen = Array.isArray(source.seen) ? [...new Set(source.seen.filter((id) => typeof id === 'string'))] : [];
  const quiz = Number.isFinite(source.quiz) && source.quiz > 0 ? source.quiz : 0;
  return { seen, quiz, done: source.done === true };
}

const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function createProgressStore(storage = browserStorage(), key = PROGRESS_KEY) {
  const listeners = new Set();
  let data = read();

  function read() {
    try {
      const parsed = JSON.parse(storage?.getItem(key) ?? '{}');
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const clean = {};
      for (const chapter of Object.keys(parsed)) clean[chapter] = normalize(parsed[chapter]);
      return clean;
    } catch {
      return {};
    }
  }

  function commit() {
    try {
      storage?.setItem(key, JSON.stringify(data));
    } catch {
      /* storage full or blocked: progress lives for this session only */
    }
    for (const listener of listeners) listener();
  }

  function entry(chapter) {
    data[chapter] = normalize(own(data, chapter) ? data[chapter] : null);
    return data[chapter];
  }

  return {
    get(chapter) {
      return normalize(own(data, chapter) ? data[chapter] : null);
    },
    markSeen(chapter, lesson) {
      const value = entry(chapter);
      if (value.seen.includes(lesson)) return false;
      value.seen.push(lesson);
      commit();
      return true;
    },
    setQuiz(chapter, score) {
      const value = entry(chapter);
      if (!(Number.isFinite(score) && score > value.quiz)) return;
      value.quiz = score;
      commit();
    },
    setDone(chapter, done) {
      entry(chapter).done = Boolean(done);
      commit();
    },
    /** 0–100: lessons seen out of `total`, or 100 once marked complete. */
    percent(chapter, total) {
      const value = this.get(chapter);
      if (value.done) return 100;
      if (!(total > 0)) return 0;
      return Math.round((Math.min(value.seen.length, total) / total) * 100);
    },
    /** Mean percentage across `[{ id, lessons }]`. */
    overall(chapters) {
      if (!chapters.length) return 0;
      const sum = chapters.reduce((acc, chapter) => acc + this.percent(chapter.id, chapter.lessons), 0);
      return Math.round(sum / chapters.length);
    },
    reset() {
      data = {};
      commit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
