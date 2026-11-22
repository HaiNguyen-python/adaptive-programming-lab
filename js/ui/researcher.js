/**
 * Researcher dashboard (#/researcher). Not in the main menu: it is opened from Settings.
 *  - This learner: data health, help decisions with their probabilities and outcomes.
 *  - Pool exports: load several participants' JSON exports and get the pooled report and CSV files,
 *    computed in the browser. Nothing is uploaded anywhere.
 * Not available while a learner is enrolled in a study, so participants never see the policy internals.
 */
import { h, md } from '../lib/dom.js';
import { store } from '../store.js';
import { readEvents, download } from '../log.js';
import { POLICY_VERSION, DATA_VERSION } from '../engine/help-policy.js';
import { toast } from './common.js';

const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
const probText = (d) => (d.arms || []).map((a) => `${a[0]}:${d.probs && d.probs[a] !== undefined ? Number(d.probs[a]).toFixed(2) : '?'}`).join(' ');
const outcome = (v) => (v === null || v === undefined ? '·' : v ? '✓' : '✗');

function tile(value, label) { return h('div.tile', h('b', String(value)), h('span', label)); }

function health(state, events) {
  const ds = state.decisions;
  const items = [];
  const bad = (text) => items.push(h('li', h('span.tag.tag--warn', 'Check'), ' ', text));
  const good = (text) => items.push(h('li', h('span.tag.tag--ok', 'OK'), ' ', text));
  if (!events.length) bad('The event log is empty. If this learner has made progress, browser storage may have been cleared.'); else good(`${events.length} events recorded.`);
  const noProb = ds.filter((d) => !d.probs || !Object.keys(d.probs).length).length;
  if (noProb) bad(`${noProb} help decisions have no logged probabilities (older data format).`); else if (ds.length) good('Every help decision has its probabilities.');
  const open = ds.filter((d) => d.proximal === null || d.proximal === undefined).length;
  if (open) items.push(h('li', h('span.tag', 'Info'), ' ', `${open} help decisions have no outcome yet (the learner left before the check, or it is still to come).`));
  if (ds.some((d) => d.shift) || events.some((e) => e.shift)) bad('The clock testing tool was used, so some timestamps and memory-check timings are not real.');
  const outcomes = events.filter((e) => e.type === 'help_outcome').length;
  if (ds.length && !outcomes) bad('No help_outcome events: this learner used an older data format, so outcomes exist only in the decisions list.');
  if (state.study) good(`Enrolled in ${state.study.id} as ${state.study.pid || 'no pid'}, condition ${state.study.cond} (${state.study.assignment}).`);
  else items.push(h('li', h('span.tag', 'Info'), ' ', 'Not enrolled in a study: the learner chose the help mode, so comparisons are observational.'));
  return h('ul.refs', items);
}

function decisionsTable(ds) {
  const rows = ds.slice(-30).reverse();
  if (!rows.length) return h('p.small.muted', 'No help decisions yet.');
  return h('div', { style: { overflowX: 'auto' } }, h('table.result-table',
    h('thead', h('tr', ['When', 'Lesson', 'Context', 'Probabilities', 'Given', 'Next check', 'Next day', 'One week'].map((t) => h('th', t)))),
    h('tbody', rows.map((d) => h('tr',
      h('td', new Date(d.t).toLocaleString()), h('td', d.lessonId), h('td', `${d.pk}, ${d.errors} error${d.errors === 1 ? '' : 's'}`),
      h('td', probText(d)), h('td', d.arm), h('td', outcome(d.proximal)), h('td', outcome(d.nextDay)), h('td', outcome(d.week)))))));
}

async function armSummary(state) {
  const { armValues, ARMS } = await import('../../tools/analysis.mjs');
  const v = armValues(state.decisions, 'proximal');
  if (!v.n) return h('p.small.muted', 'Outcomes will appear here once the learner has had a check after help.');
  return h('table.result-table',
    h('thead', h('tr', ['Help type', 'Given (with outcome)', 'Pass rate', 'IPW value'].map((t) => h('th', t)))),
    h('tbody', ARMS.map((a) => h('tr', h('td', a), h('td', String(v.arms[a].chosen)), h('td', pct(v.arms[a].value)), h('td', v.arms[a].ipw === null ? 'n/a' : String(v.arms[a].ipw))))));
}

function poolPanel() {
  const out = h('div.stack');
  let last = null;
  const input = h('input', { type: 'file', accept: 'application/json,.json', multiple: true, hidden: true, 'aria-label': 'Choose export files' });
  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    const A = await import('../../tools/analysis.mjs');
    const parsed = [];
    const skipped = [];
    for (const f of files) {
      try { parsed.push(JSON.parse(await f.text())); } catch { skipped.push(f.name); }
    }
    const data = A.pool(parsed);
    if (!data.participants.length) { out.replaceChildren(h('p.small', 'No usable exports found. Use the "Download (JSON)" files from Settings.')); return; }
    const summary = A.summarise(data);
    last = { data, A, md: A.reportMarkdown(summary, data) };
    out.replaceChildren(
      h('p.small', `Read ${parsed.length} of ${files.length} files: ${data.participants.length} participants, ${data.decisions.length} decisions, ${data.checks.length} unaided checks.${skipped.length ? ` Could not read: ${skipped.join(', ')}.` : ''}`),
      h('pre.pool-report', last.md),
      h('div.row-wrap',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => download('participants.csv', A.participantsCsv(data), 'text/csv') }, 'participants.csv'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => setTimeout(() => download('decisions.csv', A.pooledDecisionsCsv(data), 'text/csv'), 0) }, 'decisions.csv'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => download('checks.csv', A.pooledChecksCsv(data), 'text/csv') }, 'checks.csv'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { download('report.md', last.md, 'text/markdown'); toast('Report downloaded.', 'download'); } }, 'report.md')));
  });
  return h('div.card.stack',
    h('h3', 'Pool several participants'),
    md('Choose the JSON files participants sent you. They are read in this browser only and combined into analysis-ready files. The same tool is available as `node tools/merge-exports.mjs`.', 'small.muted'),
    h('div', h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: () => input.click() }, 'Choose JSON files')), input, out);
}

export async function researcherPage(root) {
  const state = store.state;
  const page = h('div.page.page--wide.stack-l');
  root.append(page);
  if (state.study) {
    page.append(h('h1', 'Researcher dashboard'), h('div.callout', 'This is not available while you are taking part in a study.'));
    return;
  }
  const events = await readEvents(state.profile.id);
  const ds = state.decisions;
  const withOutcome = ds.filter((d) => d.proximal !== null && d.proximal !== undefined).length;
  page.append(
    h('div.page-head', h('h1', 'Researcher dashboard'), h('p.muted', `Help policy ${POLICY_VERSION}, data format ${DATA_VERSION}. Learner code ${state.profile.code}.`)),
    h('div.stat-row', tile(events.length, 'events'), tile(ds.length, 'help decisions'), tile(withOutcome, 'with an outcome'), tile(Object.values(state.concepts).reduce((n, c) => n + (c.checks ? c.checks.length : 0), 0), 'unaided checks')),
    h('div.insight-grid',
      h('div.card.stack', h('h3', 'Data health'), health(state, events)),
      h('div.card.stack', h('h3', 'Help types so far'), await armSummary(state), md('Pass rate is the result on the first unaided check after the help. IPW value divides by the logged probability of the help type, as in off-policy evaluation. Read `docs/RESEARCH_DATA.md` before interpreting.', 'small.muted')),
      h('div.card.stack.span-2', h('h3', 'Latest help decisions'), decisionsTable(ds), md('✓ passed, ✗ missed, · not yet. Probabilities are the chance each available help type had of being chosen.', 'small.muted')),
      poolPanel()));
}
