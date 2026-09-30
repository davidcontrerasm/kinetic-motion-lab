/** Small DOM utilities shared by all modules. */

export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => Array.from(root.querySelectorAll(selector));

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHTML = (value) => String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);

/**
 * Splits an element's text into animatable word (and optionally character) spans
 * while keeping nested inline elements such as <em>. Screen readers get the
 * original sentence from a visually hidden copy; the visual spans are aria-hidden.
 *
 * Each word/char receives `--i` (its index) for CSS staggering.
 *
 * @param {HTMLElement} element
 * @param {{ type?: 'words' | 'chars' }} [options]
 * @returns {HTMLElement[]} the words or characters created
 */
export function splitText(element, { type = 'words' } = {}) {
  const selector = type === 'chars' ? '.split-char' : '.split-word';
  if (element.dataset.splitReady === 'true') return qsa(selector, element);

  const text = element.textContent.replace(/\s+/g, ' ').trim();
  const visual = document.createElement('span');
  visual.className = 'split-visual';
  visual.setAttribute('aria-hidden', 'true');
  while (element.firstChild) visual.appendChild(element.firstChild);

  let index = 0;
  const processNode = (node) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const fragment = document.createDocumentFragment();
        for (const part of child.textContent.split(/(\s+)/)) {
          if (!part) continue;
          if (/^\s+$/.test(part)) {
            fragment.appendChild(document.createTextNode(' '));
            continue;
          }
          const word = document.createElement('span');
          word.className = 'split-word';
          if (type === 'chars') {
            for (const char of part) {
              const span = document.createElement('span');
              span.className = 'split-char';
              span.textContent = char;
              span.style.setProperty('--i', index++);
              word.appendChild(span);
            }
          } else {
            const inner = document.createElement('span');
            inner.className = 'split-inner';
            inner.textContent = part;
            word.style.setProperty('--i', index++);
            word.appendChild(inner);
          }
          fragment.appendChild(word);
        }
        child.replaceWith(fragment);
      } else if (child.nodeType === Node.ELEMENT_NODE && child.tagName !== 'BR') {
        processNode(child);
      }
    }
  };
  processNode(visual);

  const readable = document.createElement('span');
  readable.className = 'sr-only';
  readable.textContent = text;
  element.append(readable, visual);
  element.dataset.splitReady = 'true';
  element.style.setProperty('--split-count', index);
  return qsa(selector, visual);
}

/** Copies text to the clipboard, falling back to execCommand where the async API is blocked. */
export async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to the legacy path */
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(textarea);
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  textarea.remove();
  return ok;
}
