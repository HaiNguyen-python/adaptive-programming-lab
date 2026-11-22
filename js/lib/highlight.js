/**
 * Syntax highlighting for Python, JavaScript, SQL, HTML and CSS.
 * Returns HTML text made only of escaped code and <span class="t?"> wrappers.
 *
 * Blanks: a lesson's fill item marks gaps with ___ . Before highlighting, each gap is swapped for one
 * private-use character that survives inside any token; the caller then replaces it with a gap element.
 */

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const span = (cls, text) => `<span class="${cls}">${escHtml(text)}</span>`;

/** Each gap becomes one private-use character: U+E100 for the first gap, U+E101 for the second, and so on. */
const SLOT_BASE = 0xe100;
const SLOT_RE = /[-]/g;

function scan(code, rules) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    let hit = false;
    for (const [re, cls] of rules) {
      re.lastIndex = i;
      const m = re.exec(code);
      if (m && m[0].length) {
        out += typeof cls === 'function' ? cls(m[0]) : cls ? span(cls, m[0]) : escHtml(m[0]);
        i += m[0].length;
        hit = true;
        break;
      }
    }
    if (!hit) { out += escHtml(code[i]); i++; }
  }
  return out;
}

/** Colour {expressions} inside an f-string or ${expressions} inside a template literal. */
function interpolated(text, open) {
  const re = open === '${' ? /\$\{[^}]*\}?/g : /\{[^{}]*\}?/g;
  let out = '';
  let last = 0;
  for (const m of text.matchAll(re)) {
    out += span('ts', text.slice(last, m.index)) + span('ti', m[0]);
    last = m.index + m[0].length;
  }
  return out + span('ts', text.slice(last));
}

const PY = [
  [/#.*/y, 'tc'],
  [/[rRbBfF]{0,2}("""[\s\S]*?(?:"""|$)|'''[\s\S]*?(?:'''|$))/y, 'ts'],
  [/[fF][rR]?(?:"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)/y, (t) => interpolated(t, '{')],
  [/[rRbB]{0,2}(?:"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?)/y, 'ts'],
  [/\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?\b/y, 'tn'],
  [/\b(?:def|return|if|elif|else|for|while|in|not|and|or|is|import|from|as|break|continue|pass|class|try|except|finally|with|lambda|global|nonlocal|raise|del|assert|yield)\b/y, 'tk'],
  [/\b(?:True|False|None)\b/y, 'tb'],
  [/[A-Za-z_]\w*(?=\s*\()/y, 'tf'],
  [/[A-Za-z_]\w*/y, ''],
  [/[+\-*/%=<>!&|^~]+/y, 'to'],
  [/\s+/y, ''],
];

const JS = [
  [/\/\/.*/y, 'tc'],
  [/\/\*[\s\S]*?(?:\*\/|$)/y, 'tc'],
  [/`(?:[^`\\]|\\[\s\S])*`?/y, (t) => interpolated(t, '${')],
  [/"(?:[^"\\\n]|\\.)*"?|'(?:[^'\\\n]|\\.)*'?/y, 'ts'],
  [/\b\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?n?\b/y, 'tn'],
  [/\b(?:const|let|var|function|return|if|else|for|while|do|of|in|new|class|extends|break|continue|switch|case|default|try|catch|finally|throw|typeof|instanceof|async|await|import|export|from|this|delete)\b/y, 'tk'],
  [/\b(?:true|false|null|undefined|NaN|Infinity)\b/y, 'tb'],
  [/[A-Za-z_$][\w$]*(?=\s*\()/y, 'tf'],
  [/[A-Za-z_$][\w$]*/y, ''],
  [/=>|[+\-*/%=<>!&|^~?]+/y, 'to'],
  [/\s+/y, ''],
];

const SQL_WORDS = 'SELECT|FROM|WHERE|AND|OR|NOT|IN|BETWEEN|LIKE|IS|NULL|ORDER|BY|ASC|DESC|LIMIT|OFFSET|DISTINCT|AS|GROUP|HAVING|JOIN|INNER|LEFT|RIGHT|FULL|OUTER|CROSS|ON|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|DROP|ALTER|ADD|PRIMARY|KEY|FOREIGN|REFERENCES|UNIQUE|DEFAULT|CHECK|INTEGER|REAL|TEXT|BLOB|NUMERIC|CASE|WHEN|THEN|ELSE|END|UNION|ALL|EXISTS|IF';
const SQL = [
  [/--.*/y, 'tc'],
  [/'(?:[^']|'')*'?/y, 'ts'],
  [/\b\d+(?:\.\d+)?\b/y, 'tn'],
  [new RegExp(`\\b(?:${SQL_WORDS})\\b`, 'iy'), 'tk'],
  [/[A-Za-z_]\w*(?=\s*\()/y, 'tf'],
  [/[A-Za-z_]\w*/y, ''],
  [/[=<>!*+\-/%|]+/y, 'to'],
  [/\s+/y, ''],
];

const CSS_VALUE = [
  [/\/\*[\s\S]*?(?:\*\/|$)/y, 'tc'],
  [/"[^"\n]*"?|'[^'\n]*'?/y, 'ts'],
  [/#[0-9a-fA-F]{3,8}\b/y, 'tn'],
  [/-?\d*\.?\d+(?:px|em|rem|%|vh|vw|s|ms|deg|fr)?/y, 'tn'],
  [/[a-zA-Z-]+(?=\()/y, 'tf'],
  [/[a-zA-Z-]+/y, ''],
  [/\s+/y, ''],
];

function css(code) {
  let out = '';
  let i = 0;
  let depth = 0;
  while (i < code.length) {
    if (code.startsWith('/*', i)) {
      let end = code.indexOf('*/', i + 2);
      end = end < 0 ? code.length : end + 2;
      out += span('tc', code.slice(i, end));
      i = end;
    } else if (code[i] === '{') { depth++; out += '{'; i++; }
    else if (code[i] === '}') { depth = Math.max(0, depth - 1); out += '}'; i++; }
    else if (depth === 0) {
      const m = /[^{}/]+|\//y;
      m.lastIndex = i;
      const sel = m.exec(code)[0];
      out += /\S/.test(sel) ? span('tt', sel) : escHtml(sel);
      i += sel.length;
    } else {
      const m = /(\s*)([-\w]+)(\s*:)([^;}]*)(;?)/y;
      m.lastIndex = i;
      const decl = m.exec(code);
      if (decl && decl[0].length) {
        out += escHtml(decl[1]) + span('tp', decl[2]) + escHtml(decl[3]) + scan(decl[4], CSS_VALUE) + escHtml(decl[5]);
        i += decl[0].length;
      } else { out += escHtml(code[i]); i++; }
    }
  }
  return out;
}

function html(code) {
  let out = '';
  let i = 0;
  while (i < code.length) {
    if (code.startsWith('<!--', i)) {
      let end = code.indexOf('-->', i + 4);
      end = end < 0 ? code.length : end + 3;
      out += span('tc', code.slice(i, end));
      i = end;
      continue;
    }
    const doctype = /<!doctype[^>]*>?/iy;
    doctype.lastIndex = i;
    const dm = doctype.exec(code);
    if (dm) { out += span('tk', dm[0]); i += dm[0].length; continue; }
    const open = /<\/?[a-zA-Z-][\w-]*/y;
    open.lastIndex = i;
    const tm = open.exec(code);
    if (tm) {
      out += span('tt', tm[0]);
      i += tm[0].length;
      const name = tm[0].replace(/^<\/?/, '').toLowerCase();
      const closing = tm[0][1] === '/';
      // attributes up to the end of the tag
      while (i < code.length && code[i] !== '>') {
        const attr = /(\s+)|([^\s=>/"']+)|(=)|("[^"]*"?|'[^']*'?)|(\/)/y;
        attr.lastIndex = i;
        const am = attr.exec(code);
        if (!am || !am[0].length) { out += escHtml(code[i]); i++; continue; }
        if (am[2]) out += span('ta', am[2]);
        else if (am[4]) out += span('ts', am[4]);
        else out += escHtml(am[0]);
        i += am[0].length;
      }
      if (code[i] === '>') { out += span('tt', '>'); i++; }
      if (name === 'style' && !closing) {
        let end = code.toLowerCase().indexOf('</style', i);
        if (end < 0) end = code.length;
        out += css(code.slice(i, end));
        i = end;
      }
      continue;
    }
    const text = /[^<]+|</y;
    text.lastIndex = i;
    const t = text.exec(code)[0];
    out += escHtml(t);
    i += t.length;
  }
  return out;
}

/** Highlighted HTML for code in the given language. */
export function highlight(code, lang) {
  const src = String(code ?? '');
  switch (lang) {
    case 'python': return scan(src, PY);
    case 'javascript': return scan(src, JS);
    case 'sql': return scan(src, SQL);
    case 'web': case 'html': return html(src);
    case 'css': return css(src);
    default: return escHtml(src);
  }
}

/**
 * Highlighted HTML, one string per line of code. Tokens that span several lines
 * (comments, CSS selectors) are closed at the end of a line and reopened on the next.
 */
export function highlightLines(code, lang) {
  const html = highlight(code, lang);
  const lines = [];
  const open = [];
  let cur = '';
  for (const m of html.matchAll(/(<span class="[^"]*">)|(<\/span>)|([^<]+)/g)) {
    if (m[1]) { open.push(m[1]); cur += m[1]; }
    else if (m[2]) { open.pop(); cur += m[2]; }
    else {
      const parts = m[3].split('\n');
      parts.forEach((part, i) => {
        if (i > 0) {
          lines.push(cur + '</span>'.repeat(open.length));
          cur = open.join('');
        }
        cur += part;
      });
    }
  }
  lines.push(cur);
  return lines;
}

/**
 * Highlight code that contains ___ blanks. slotHtml(index) returns the HTML for each gap.
 */
export function highlightWithSlots(code, lang, slotHtml) {
  let n = 0;
  const marked = String(code).replace(/___/g, () => String.fromCharCode(SLOT_BASE + n++));
  return highlight(marked, lang).replace(SLOT_RE, (m) => slotHtml(m.charCodeAt(0) - SLOT_BASE));
}
