/** Shared interface pieces: sheets (dialogs), toasts, code blocks, result tables, small widgets. */
import { h, md } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { highlight } from '../lib/highlight.js';
import { previewDoc } from '../run/runners.js';

const layer = () => document.getElementById('layer');
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select, summary, [tabindex]:not([tabindex="-1"])';

/**
 * Open a sheet: a dialog that slides up on phones and sits in the middle on wide screens.
 * Returns { close, el }.
 */
export function openSheet({ title = '', body, foot, wide = false, onClose, dismissable = true }) {
  const previous = document.activeElement;
  let closed = false;
  const sheet = h(`div.sheet${wide ? '.sheet--wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-label': title || 'Dialog' });
  const backdrop = h('div.backdrop', sheet);
  function close(result) {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    if (previous && previous.isConnected && previous.focus) previous.focus();
    if (onClose) onClose(result);
  }
  function onKey(e) {
    if (e.key === 'Escape' && dismissable) { e.stopPropagation(); close(); return; }
    if (e.key !== 'Tab') return;
    const items = [...sheet.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
  sheet.append(
    h('div.sheet-head', h('h2', title), dismissable ? h('button.icon-btn', { type: 'button', 'aria-label': 'Close', onclick: () => close(), html: iconSvg('x') }) : null),
    h('div.sheet-body', body),
  );
  if (foot) sheet.append(h('div.sheet-foot', foot));
  backdrop.addEventListener('mousedown', (e) => { if (e.target === backdrop && dismissable) close(); });
  document.addEventListener('keydown', onKey, true);
  layer().append(backdrop);
  const target = sheet.querySelector('[data-autofocus]') || sheet.querySelector('.sheet-foot .btn--primary') || sheet.querySelector(FOCUSABLE);
  if (target) target.focus({ preventScroll: true });
  return { close, el: sheet };
}

/** Ask a yes or no question. Resolves to true or false. */
export function confirmSheet({ title, text, yes = 'Yes', no = 'Cancel', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { answered = true; sheet.close(); resolve(v); };
    const sheet = openSheet({
      title,
      body: md(text),
      foot: [
        h('button.btn.btn--ghost', { type: 'button', onclick: () => done(false) }, no),
        h(`button.btn.${danger ? 'btn--bad' : 'btn--primary'}`, { type: 'button', onclick: () => done(true) }, yes),
      ],
      onClose: () => { if (!answered) resolve(false); },
    });
  });
}

let toastBox = null;
/** A short message at the top of the screen. */
export function toast(text, iconName = 'spark', ms = 3200) {
  if (!toastBox || !toastBox.isConnected) { toastBox = h('div.toasts', { role: 'status', 'aria-live': 'polite' }); layer().append(toastBox); }
  const el = h('div.toast', { html: iconSvg(iconName) }, h('span', text));
  toastBox.append(el);
  setTimeout(() => { el.classList.add('is-out'); setTimeout(() => el.remove(), 300); }, ms);
}

/**
 * A code block with optional output underneath.
 * opts: { output, error (true when the output is an error), outLabel }
 */
export function codeBlock(code, lang, opts = {}) {
  const pre = h('pre.code', { tabindex: '0', 'aria-label': 'Code' }, h('code', { html: highlight(code, lang) }));
  const wrap = h('div.code-wrap', pre);
  if (opts.output !== undefined && opts.output !== null && opts.output !== '') {
    wrap.append(h(`pre.out${opts.error ? '.is-error' : ''}`, { 'data-label': opts.outLabel || 'Output' }, opts.output));
  }
  return wrap;
}

export function outputPanel(text, { error = false, label = 'Output' } = {}) {
  return h(`pre.out.out--solo${error ? '.is-error' : ''}`, { 'data-label': label }, text === '' ? '(nothing was printed)' : text);
}

/** A table of SQL results. data: { columns, rows } (lesson content) or { columns, cells } (a live run). */
export function resultTable(data, note = '') {
  const rows = data.cells || (data.rows || []).map((row) => row.map((c) => (c === null ? 'NULL' : String(c))));
  const table = h('table.result-table',
    h('thead', h('tr', data.columns.map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', rows.map((row) => h('tr', row.map((cell) => h(`td${cell === 'NULL' ? '.is-null' : /^-?\d+(\.\d+)?$/.test(cell) ? '.is-num' : ''}`, cell))))),
  );
  const wrap = h('div', h('div.result-wrap', { tabindex: '0', 'aria-label': 'Query result' }, table));
  const count = `${rows.length} row${rows.length === 1 ? '' : 's'}`;
  wrap.append(h('div.result-note', note ? `${count}. ${note}` : count));
  return wrap;
}

/** A live preview of HTML and CSS in a frame where scripts cannot run. */
export function previewFrame(code, height = 200) {
  const frame = h('iframe.preview-frame', { sandbox: '', title: 'Preview of the page', style: { height: `${height}px` } });
  frame.srcdoc = previewDoc(code);
  return frame;
}

/** Three flames: lit ones show how well a lesson has stuck. */
export function flamesEl(n, large = false) {
  const labels = ['Not learned yet', 'Learned', 'Remembered the next day', 'Remembered after a week'];
  return h(`span.flames${large ? '.flames--lg' : ''}`, { role: 'img', 'aria-label': labels[n] || labels[0], title: labels[n] || labels[0],
    html: [1, 2, 3].map((i) => iconSvg('flame', i <= n ? 'is-on' : '')).join('') });
}

/** A progress ring. value and max in the same unit. */
export function ringEl(value, max, top, bottom) {
  const r = 32;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, max ? value / max : 0));
  return h(`div.ring${ratio >= 1 ? '.is-full' : ''}`, { role: 'img', 'aria-label': `${top} ${bottom}` },
    h('div', { html: `<svg viewBox="0 0 76 76"><circle class="ring-bg" cx="38" cy="38" r="${r}"/><circle class="ring-fg" cx="38" cy="38" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - ratio)).toFixed(1)}"/></svg>` }),
    h('div.ring-label', top, h('small', bottom)));
}

export function bar(ratio, cls = '') {
  return h(`div.bar${cls ? `.${cls}` : ''}`, h('i', { style: { width: `${Math.round(Math.max(0, Math.min(1, ratio)) * 100)}%` } }));
}

/** A row of buttons where one is selected. options: [{ value, label }] */
export function segmented(options, value, onPick, label) {
  const el = h('div.seg', { role: 'group', 'aria-label': label });
  const paint = (v) => { for (const b of el.children) { const on = b.dataset.value === String(v); b.classList.toggle('is-on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); } };
  for (const o of options) {
    el.append(h('button', { type: 'button', dataset: { value: String(o.value) }, onclick: () => { paint(o.value); onPick(o.value); } }, o.label));
  }
  paint(value);
  return el;
}

export function switchEl(checked, onChange, label) {
  const input = h('input', { type: 'checkbox', role: 'switch', 'aria-label': label });
  input.checked = !!checked;
  input.addEventListener('change', () => onChange(input.checked));
  return h('label.switch', input, h('i'));
}
