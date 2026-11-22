/**
 * A small code editor: a transparent textarea over a highlighted copy of the text.
 * It handles Tab, Shift+Tab, Enter with auto-indent, and has a row of symbol keys for phones.
 */
import { h } from './dom.js';
import { highlight } from './highlight.js';

const INDENT = { python: '    ', javascript: '  ', sql: '  ', web: '  ' };
const KEYS = {
  python: ['Tab', ':', '(', ')', '"', '=', '[', ']', '{', '}', '#', '_', '+', '-', '*', '/', '%', '<', '>'],
  javascript: ['Tab', ';', '(', ')', '{', '}', '"', '=', '[', ']', '`', '$', '=>', '+', '-', '*', '/', '<', '>', '!', '&', '|'],
  sql: ['*', ',', "'", ';', '(', ')', '=', '<', '>', '%', '_', '.'],
  web: ['<', '>', '/', '"', '=', '{', '}', ':', ';', '#', '.', '-', 'Tab'],
};

export function createEditor({ value = '', lang = 'python', onChange, label = 'Code editor', keys = true }) {
  const unit = INDENT[lang] || '  ';
  const code = h('code');
  const hl = h('pre.editor-hl', { 'aria-hidden': 'true' }, code);
  const ta = h('textarea.editor-ta', {
    spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off', autocorrect: 'off', wrap: 'off', 'aria-label': label,
  });
  ta.value = value;
  const inner = h('div', { style: { position: 'relative', width: 'max-content', minWidth: '100%' } }, hl, ta);
  const scroll = h('div.editor-scroll', inner);
  const keyRow = h('div.keys', { role: 'group', 'aria-label': 'Symbol keys' });
  const el = h('div.editor', scroll, keys ? keyRow : null);

  function paint() {
    // The extra newline keeps the highlighted copy as tall as the textarea when the text ends in a newline.
    code.innerHTML = `${highlight(ta.value, lang)}\n`;
  }

  function insert(text, selectFrom, selectTo) {
    ta.focus();
    let ok = false;
    try { ok = document.execCommand('insertText', false, text); } catch { ok = false; }
    if (!ok) ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, 'end');
    if (selectFrom !== undefined) ta.setSelectionRange(selectFrom, selectTo ?? selectFrom);
    paint();
    if (onChange) onChange(ta.value);
  }

  function lineStart(pos) { return ta.value.lastIndexOf('\n', pos - 1) + 1; }

  ta.addEventListener('input', () => { paint(); if (onChange) onChange(ta.value); });
  ta.addEventListener('keydown', (e) => {
    const { selectionStart: a, selectionEnd: b, value: v } = ta;
    if (e.key === 'Tab' && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      if (e.shiftKey) {
        const ls = lineStart(a);
        const lead = v.slice(ls).match(/^ */)[0].length;
        const cut = Math.min(unit.length, lead);
        if (cut) {
          ta.setSelectionRange(ls, ls + cut);
          insert('', Math.max(ls, a - cut), Math.max(ls, b - cut));
        }
      } else insert(unit);
    } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      const ls = lineStart(a);
      const before = v.slice(ls, a);
      let lead = before.match(/^ */)[0];
      const opener = lang === 'python' ? /:\s*$/ : /[{([]\s*$/;
      if (opener.test(before)) lead += unit;
      insert(`\n${lead}`);
    } else if (e.key === 'Backspace' && a === b) {
      const ls = lineStart(a);
      const before = v.slice(ls, a);
      if (before.length && /^ +$/.test(before)) {
        const cut = ((before.length - 1) % unit.length) + 1;
        e.preventDefault();
        ta.setSelectionRange(a - cut, a);
        insert('');
      }
    } else if (e.key === 'Escape') ta.blur();
  });

  for (const k of (keys ? KEYS[lang] || [] : [])) {
    keyRow.append(h('button', {
      type: 'button',
      'aria-label': k === 'Tab' ? 'Indent' : `Insert ${k}`,
      onpointerdown: (e) => e.preventDefault(),
      onclick: () => insert(k === 'Tab' ? unit : k),
    }, k === 'Tab' ? '⇥' : k));
  }

  paint();
  return {
    el,
    textarea: ta,
    getValue: () => ta.value,
    setValue: (text) => { ta.value = text; paint(); if (onChange) onChange(ta.value); },
    focus: () => ta.focus(),
  };
}
