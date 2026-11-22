/** Small DOM helpers. No framework: views are plain functions that build elements. */

function append(el, kids) {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false || k === true) continue;
    el.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
}

/**
 * h('div.card.stack', { onclick, class, style, html, ... }, ...children)
 * `html` is only ever used with strings the app itself builds (icons, highlighted code).
 */
export function h(tag, attrs, ...kids) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs !== null && attrs !== undefined && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    kids.unshift(attrs);
    attrs = null;
  }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.className += (el.className ? ' ' : '') + v;
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') {
      for (const [p, val] of Object.entries(v)) {
        if (p.startsWith('--')) el.style.setProperty(p, val); else el.style[p] = val;
      }
    } else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, kids);
  return el;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...kids) {
  clear(el);
  append(el, kids);
  return el;
}

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(parent, text) {
  text.split('`').forEach((part, i) => {
    if (i % 2) { parent.append(h('code', part)); return; }
    part.split('**').forEach((seg, j) => {
      if (!seg) return;
      parent.append(j % 2 ? h('strong', seg) : document.createTextNode(seg));
    });
  });
}

/**
 * Lesson text: `inline code`, **bold**, and blank lines between paragraphs.
 * Everything else is shown as plain text, so lesson text can never inject markup.
 */
export function md(text, cls = '') {
  const root = h(`div.md${cls ? `.${cls}` : ''}`);
  for (const para of String(text || '').split(/\n{2,}/)) {
    if (!para.trim()) continue;
    const p = h('p');
    para.split('\n').forEach((line, i) => {
      if (i) p.append(h('br'));
      inline(p, line);
    });
    root.append(p);
  }
  return root;
}

/** A span with inline lesson formatting, for labels and short strings. */
export function mdInline(text, tag = 'span') {
  const el = h(tag);
  inline(el, String(text || ''));
  return el;
}

export const plural = (n, one, many) => `${n} ${n === 1 ? one : (many || `${one}s`)}`;

export function formatDate(ts) {
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/** "today", "tomorrow", "in 6 days", "yesterday", "3 days ago" */
export function relDay(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return 'yesterday';
  return days > 0 ? `in ${days} days` : `${-days} days ago`;
}
