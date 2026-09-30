/**
 * A tiny, dependency-free syntax highlighter for the guide's code snippets
 * (JavaScript, CSS and HTML). Pure: it takes source text and returns escaped
 * HTML with <span class="tok-*"> wrappers, so it is unit tested in Node.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = (text) => text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
const wrap = (type, text) => `<span class="tok-${type}">${escape(text)}</span>`;

const JS_KEYWORDS = new Set(
  'const let var function return if else for while do of in new class extends import export from await async this true false null undefined typeof instanceof break continue switch case default try catch finally throw yield'.split(
    ' ',
  ),
);

const STRING = /(['"`])(?:\\[\s\S]|(?!\1)[^\\])*\1/y;
const BLOCK_COMMENT = /\/\*[\s\S]*?\*\//y;
const LINE_COMMENT = /\/\/[^\n]*/y;
const JS_NUMBER = /(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/y;
const IDENT = /[A-Za-z_$][\w$]*/y;

function matchAt(regex, code, index) {
  regex.lastIndex = index;
  const match = regex.exec(code);
  return match ? match[0] : null;
}

function highlightJS(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    let token;
    if ((token = matchAt(LINE_COMMENT, code, i)) || (token = matchAt(BLOCK_COMMENT, code, i))) {
      out += wrap('comment', token);
    } else if ((token = matchAt(STRING, code, i))) {
      out += wrap('string', token);
    } else if (/\d/.test(code[i]) && !/[\w$]/.test(code[i - 1] ?? '') && (token = matchAt(JS_NUMBER, code, i))) {
      out += wrap('number', token);
    } else if ((token = matchAt(IDENT, code, i))) {
      const rest = code.slice(i + token.length);
      if (JS_KEYWORDS.has(token)) out += wrap('keyword', token);
      else if (/^\s*\(/.test(rest)) out += wrap('fn', token);
      else if (code[i - 1] === '.') out += wrap('prop', token);
      else out += escape(token);
    } else {
      token = code[i];
      out += escape(token);
    }
    i += token.length;
  }
  return out;
}

const CSS_NUMBER = /-?(?:\d+\.?\d*|\.\d+)(?:px|ms|s|deg|turn|rad|%|em|rem|vh|vw|svh|fr|ch)?/y;
const CSS_WORD = /--?[\w-]+|[\w-]+/y;
const CSS_AT = /@[\w-]+/y;

function highlightCSS(code) {
  let out = '';
  let i = 0;
  let depth = 0;
  let inValue = false;
  while (i < code.length) {
    const char = code[i];
    let token;
    if ((token = matchAt(BLOCK_COMMENT, code, i))) {
      out += wrap('comment', token);
    } else if ((token = matchAt(STRING, code, i))) {
      out += wrap('string', token);
    } else if ((token = matchAt(CSS_AT, code, i))) {
      out += wrap('keyword', token);
    } else if (char === '{' || char === '}') {
      depth += char === '{' ? 1 : -1;
      inValue = false;
      token = char;
      out += escape(token);
    } else if (char === ';') {
      inValue = false;
      token = char;
      out += token;
    } else if (depth > 0 && !inValue && char === ':') {
      inValue = true;
      token = char;
      out += token;
    } else if (depth > 0 && inValue && /[\d.-]/.test(char) && !/[\w-]/.test(code[i - 1] ?? '') && (token = matchAt(CSS_NUMBER, code, i))) {
      out += wrap('number', token);
    } else if ((token = matchAt(CSS_WORD, code, i))) {
      const next = code[i + token.length];
      if (depth === 0) out += wrap('selector', token);
      else if (!inValue && token.startsWith('--')) out += wrap('var', token);
      else if (!inValue) out += wrap('prop', token);
      else if (next === '(') out += wrap('fn', token);
      else if (token.startsWith('--')) out += wrap('var', token);
      else out += escape(token);
    } else {
      token = char;
      out += escape(token);
    }
    i += token.length;
  }
  return out;
}

const HTML_COMMENT = /<!--[\s\S]*?-->/y;
const HTML_TAG = /<\/?[\w-]+/y;
const HTML_ATTR = /[\w:-]+(?==)/y;

function highlightHTML(code) {
  let out = '';
  let i = 0;
  let inTag = false;
  while (i < code.length) {
    let token;
    if ((token = matchAt(HTML_COMMENT, code, i))) {
      out += wrap('comment', token);
    } else if ((token = matchAt(HTML_TAG, code, i))) {
      inTag = true;
      out += wrap('keyword', token);
    } else if (inTag && code[i] === '>') {
      inTag = false;
      token = '>';
      out += wrap('keyword', token);
    } else if (inTag && (token = matchAt(STRING, code, i))) {
      out += wrap('string', token);
    } else if (inTag && (token = matchAt(HTML_ATTR, code, i))) {
      out += wrap('prop', token);
    } else {
      token = code[i];
      out += escape(token);
    }
    i += token.length;
  }
  return out;
}

/** Highlights `code` for `lang` ('js' | 'css' | 'html'); unknown languages are just escaped. */
export function highlight(code, lang = 'js') {
  const source = String(code);
  if (lang === 'css') return highlightCSS(source);
  if (lang === 'html') return highlightHTML(source);
  if (lang === 'js') return highlightJS(source);
  return escape(source);
}
