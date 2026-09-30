/**
 * Reusable study-guide widgets, shared by guide pages and the showcase:
 * highlighted code snippets with animated disclosure and copy, quizzes with
 * instant feedback, "How it works" notes, and progress rings.
 */
import { qs, qsa, copyText } from '../core/dom.js';
import { motion } from '../core/motion.js';
import { RollingNumber, burst, shake } from '../core/ui.js';
import { highlight } from './highlight.js';

const CHECK_PATH = 'M5 12.5l4.5 4.5L19 7.5';
const CROSS_PATH = 'M7 7l10 10M17 7L7 17';

/* -------------------------------------------------------------------------- */
/* Code snippets                                                              */
/* -------------------------------------------------------------------------- */

export function initSnippets(root = document) {
  qsa('details.snippet', root).forEach((details) => {
    if (details.dataset.snippetReady) return;
    details.dataset.snippetReady = 'true';
    const code = qs('code[data-lang]', details);
    const body = qs('.snippet__body', details);
    const summary = qs('summary', details);
    if (!code || !body || !summary) return;

    const source = code.textContent.replace(/^\n+/, '').replace(/\s+$/, '');
    code.innerHTML = highlight(source, code.dataset.lang);

    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'snippet__copy';
    copy.textContent = 'Copy';
    body.appendChild(copy);
    let copyTimer = 0;
    copy.addEventListener('click', async () => {
      const ok = await copyText(source);
      copy.textContent = ok ? 'Copied' : 'Failed';
      copy.classList.add('is-copied');
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        copy.textContent = 'Copy';
        copy.classList.remove('is-copied');
      }, 1400);
    });

    // Animated disclosure. The native toggle still works when motion is reduced.
    let animation = null;
    summary.addEventListener('click', (event) => {
      if (motion.reduced) return;
      event.preventDefault();
      const current = body.getBoundingClientRect().height;
      animation?.cancel();
      if (!details.open || details.classList.contains('is-closing')) {
        details.classList.remove('is-closing');
        details.open = true;
        const target = body.scrollHeight;
        animation = body.animate([{ height: `${current}px` }, { height: `${target}px` }], {
          duration: 460,
          easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        });
        animation.onfinish = () => (animation = null);
      } else {
        details.classList.add('is-closing');
        animation = body.animate([{ height: `${current}px` }, { height: '0px' }], {
          duration: 300,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards',
        });
        animation.onfinish = () => {
          details.open = false;
          details.classList.remove('is-closing');
          animation?.cancel();
          animation = null;
        };
      }
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Notes ("How it works")                                                     */
/* -------------------------------------------------------------------------- */

let notesId = 0;

export function initNotes(root = document) {
  qsa('[data-notes]', root).forEach((notes) => {
    if (notes.dataset.notesReady) return;
    notes.dataset.notesReady = 'true';
    const toggle = qs('.notes__toggle', notes);
    const body = qs('.notes__body', notes);
    if (!toggle || !body) return;
    body.id ||= `notes-${++notesId}`;
    toggle.setAttribute('aria-controls', body.id);
    const set = (open) => {
      notes.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      body.inert = !open;
    };
    set(false);
    toggle.addEventListener('click', () => set(!notes.classList.contains('is-open')));
  });
}

/* -------------------------------------------------------------------------- */
/* Quizzes                                                                    */
/* -------------------------------------------------------------------------- */

const RESULT_MESSAGES = [
  'Worth another pass: reread the lessons above and try again.',
  'A start. The explanations under each answer fill the gaps.',
  'Nearly there. One idea to revisit.',
  'Nailed it. You have this chapter down.',
];

export function initQuizzes(root = document, { onComplete } = {}) {
  qsa('[data-quiz]', root).forEach((quiz) => {
    if (quiz.dataset.quizReady) return;
    quiz.dataset.quizReady = 'true';
    const questions = qsa('.quiz__q', quiz);
    const scoreEl = qs('[data-quiz-score]', quiz);
    const result = qs('[data-quiz-result]', quiz);
    const retry = qs('[data-quiz-retry]', quiz);
    const live = document.createElement('p');
    live.className = 'sr-only';
    live.setAttribute('aria-live', 'polite');
    quiz.appendChild(live);
    const counter = scoreEl ? new RollingNumber(scoreEl, { value: 0 }) : null;
    let score = 0;
    let answered = 0;

    questions.forEach((question) => {
      const answer = Number(question.dataset.answer);
      const options = qsa('.quiz__opt', question);
      options.forEach((option, index) => {
        option.insertAdjacentHTML('afterbegin', `<span class="quiz__letter" aria-hidden="true">${'ABCDE'[index]}</span>`);
        option.insertAdjacentHTML(
          'beforeend',
          `<svg class="quiz__mark" viewBox="0 0 24 24" aria-hidden="true"><path d="${index === answer ? CHECK_PATH : CROSS_PATH}"/></svg>`,
        );
        option.addEventListener('click', () => choose(question, options, index, answer));
      });
    });

    function choose(question, options, index, answer) {
      if (question.classList.contains('is-answered')) return;
      question.classList.add('is-answered');
      const correct = index === answer;
      options.forEach((option, i) => {
        option.setAttribute('aria-disabled', 'true');
        if (i === answer) option.classList.add('is-correct');
        else if (i === index) option.classList.add('is-wrong');
        else option.classList.add('is-dim');
      });
      if (correct) {
        score++;
        counter?.set(score);
        const option = options[index];
        const rect = option.getBoundingClientRect();
        burst(option, { x: rect.width - 24, y: rect.height / 2, count: 10, distance: [18, 40], size: [3, 6] });
      } else {
        shake(options[index]);
      }
      live.textContent = correct ? 'Correct.' : `Not quite. The answer is ${'ABCDE'[answer]}.`;
      answered++;
      if (answered === questions.length) finish();
    }

    function finish() {
      const index = Math.round((score / questions.length) * (RESULT_MESSAGES.length - 1));
      if (result) {
        result.textContent = `${score} of ${questions.length}. ${RESULT_MESSAGES[index]}`;
        result.hidden = false;
      }
      if (retry) retry.hidden = false;
      onComplete?.(score, questions.length);
    }

    retry?.addEventListener('click', () => {
      score = 0;
      answered = 0;
      counter?.set(0);
      questions.forEach((question) => {
        question.classList.remove('is-answered');
        qsa('.quiz__opt', question).forEach((option) => {
          option.classList.remove('is-correct', 'is-wrong', 'is-dim');
          option.removeAttribute('aria-disabled');
        });
      });
      if (result) result.hidden = true;
      retry.hidden = true;
      qs('.quiz__opt', quiz)?.focus({ preventScroll: true });
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Progress rings                                                             */
/* -------------------------------------------------------------------------- */

/** Markup for a small progress ring; update with `setRing`. */
export function ringMarkup(size = 44) {
  return `<svg class="ring" viewBox="0 0 44 44" width="${size}" height="${size}" aria-hidden="true"><circle class="ring__track" cx="22" cy="22" r="19"/><circle class="ring__value" cx="22" cy="22" r="19"/></svg>`;
}

export function setRing(element, percent) {
  element.style.setProperty('--p', String(Math.max(0, Math.min(100, percent)) / 100));
}
