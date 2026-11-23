/**
 * The research database panel on the Researcher dashboard.
 *  - Sign in with the researcher account (Supabase Auth, email and password). The first account that signs in
 *    becomes the researcher; later accounts see nothing until a researcher adds them.
 *  - Open studies, close them, and make personal study links for participants.
 *  - Load everything participants' devices sent for a study and analyse it with the same tools as exported
 *    files (tools/analysis.mjs and tools/research-questions.mjs), or download it raw.
 * The session is kept for this browser tab only (sessionStorage).
 */
import { h, md } from '../lib/dom.js';
import { RESEARCH_DB } from '../config.js';
import { download } from '../log.js';
import { toast } from './common.js';
import { rebuildExports, studyLinks, parseCodes } from '../research-data.js';

const SESSION_KEY = 'hcl.rdb.session';
const CODE = /^[A-Za-z0-9_-]{1,40}$/;

function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
}
function saveSession(s) {
  try { if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); else sessionStorage.removeItem(SESSION_KEY); } catch { /* blocked */ }
}
function fromAuth(j) {
  return { access: j.access_token, refresh: j.refresh_token, expires: Date.now() + (j.expires_in || 3600) * 1000, email: j.user && j.user.email };
}

async function authCall(path, body) {
  const res = await fetch(`${RESEARCH_DB.url}/auth/v1/${path}`, {
    method: 'POST', headers: { apikey: RESEARCH_DB.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.msg || j.error_description || j.message || `HTTP ${res.status}`);
  return j;
}

async function token() {
  let s = loadSession();
  if (!s) return null;
  if (Date.now() > s.expires - 60000) {
    try { s = { ...fromAuth(await authCall('token?grant_type=refresh_token', { refresh_token: s.refresh })), email: s.email }; saveSession(s); } catch { saveSession(null); return null; }
  }
  return s.access;
}

/** A call to the database as the signed-in researcher. */
async function api(path, { method = 'GET', body, headers = {} } = {}) {
  const tk = await token();
  if (!tk) throw new Error('Signed out. Sign in again.');
  const res = await fetch(`${RESEARCH_DB.url}/rest/v1/${path}`, {
    method,
    headers: { apikey: RESEARCH_DB.key, Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j.message || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

/** Every event of a study, page by page (the database returns at most 1000 rows per request). */
async function allEvents(sid, onProgress) {
  const rows = [];
  const size = 1000;
  for (let from = 0; ; from += size) {
    const page = await api(`events?study_id=eq.${encodeURIComponent(sid)}&select=learner,pid,t,type,data&order=id.asc`, { headers: { 'Range-Unit': 'items', Range: `${from}-${from + size - 1}` } });
    rows.push(...page);
    if (onProgress) onProgress(rows.length);
    if (page.length < size) break;
  }
  return rows;
}

export function researchDbPanel() {
  const box = h('section.card.stack.rdb', { 'aria-label': 'Research database' });
  if (!RESEARCH_DB.url || !RESEARCH_DB.key) {
    box.append(h('h2', 'Research database'), md('No research database is set up in `js/config.js`.', 'small.muted'));
    return box;
  }
  render();
  return box;

  function render() {
    const s = loadSession();
    if (!s) renderSignIn(); else renderStudies(s);
  }

  function renderSignIn(message = '') {
    const email = h('input.input', { type: 'email', autocomplete: 'username', placeholder: 'Email', 'aria-label': 'Email' });
    const pass = h('input.input', { type: 'password', autocomplete: 'current-password', placeholder: 'Password', 'aria-label': 'Password' });
    const note = h('p.small', message);
    const go = async (kind) => {
      if (!email.value || pass.value.length < 8) { note.textContent = 'Enter your email and a password of at least 8 characters.'; return; }
      note.textContent = kind === 'up' ? 'Creating the account…' : 'Signing in…';
      try {
        if (kind === 'up') {
          const j = await authCall(`signup?redirect_to=${encodeURIComponent(location.origin + location.pathname)}`, { email: email.value, password: pass.value });
          if (!j.access_token) { note.textContent = 'Account created. Open the email from Supabase and click the link to confirm it, then sign in here.'; return; }
          saveSession(fromAuth(j));
        } else {
          saveSession(fromAuth(await authCall('token?grant_type=password', { email: email.value, password: pass.value })));
        }
        render();
      } catch (e) { note.textContent = /confirm/i.test(e.message) ? 'Confirm your email first: open the email from Supabase and click the link.' : `Could not sign in: ${e.message}`; }
    };
    pass.addEventListener('keydown', (e) => { if (e.key === 'Enter') go('in'); });
    box.replaceChildren(
      h('div.rdb-head', h('div', h('h2', 'Research database'), md('Data that study participants\' devices send automatically. Sign in with your researcher account to see it.', 'small.muted'))),
      h('div.rdb-signin', email, pass,
        h('div.row-wrap', h('button.btn.btn--primary', { type: 'button', onclick: () => go('in') }, 'Sign in'), h('button.btn.btn--ghost', { type: 'button', onclick: () => go('up') }, 'Create researcher account'))),
      note,
      md('The first account that signs in becomes the researcher. Create yours before you share any study link.', 'small.muted'));
  }

  async function renderStudies(s) {
    box.replaceChildren(h('h2', 'Research database'), h('p.small.muted', 'Loading…'));
    let role;
    try { role = await api('rpc/claim_researcher', { method: 'POST', body: {} }); } catch (e) { saveSession(null); renderSignIn(`Signed out: ${e.message}`); return; }
    const signOut = h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { saveSession(null); render(); } }, 'Sign out');
    const head = h('div.rdb-head', h('div', h('h2', 'Research database'), h('p.small.muted', `Signed in as ${s.email || 'researcher'}.`)), signOut);
    if (role !== 'researcher') {
      box.replaceChildren(head, h('div.callout', 'This account is not a researcher on this database. Ask the researcher to add it.'));
      return;
    }
    let studies = [];
    let overview = [];
    try {
      [studies, overview] = await Promise.all([api('studies?select=*&order=created_at.desc'), api('rpc/study_overview', { method: 'POST', body: {} })]);
    } catch (e) { box.replaceChildren(head, h('p.small', `Could not load studies: ${e.message}`)); return; }
    const stats = new Map(overview.map((o) => [o.study_id, o]));
    const detail = h('div.stack');

    const idIn = h('input.input', { type: 'text', placeholder: 'Study code, e.g. pilot-2027', 'aria-label': 'Study code', maxlength: '40' });
    const titleIn = h('input.input', { type: 'text', placeholder: 'Title (only you see it)', 'aria-label': 'Study title', maxlength: '200' });
    const createNote = h('span.small');
    const create = async () => {
      const id = idIn.value.trim();
      if (!CODE.test(id)) { createNote.textContent = 'Use 1 to 40 letters, digits, - or _.'; return; }
      try { await api('studies', { method: 'POST', body: { id, title: titleIn.value.trim() }, headers: { Prefer: 'return=minimal' } }); toast(`Study ${id} is open.`, 'check'); renderStudies(s); } catch (e) { createNote.textContent = /duplicate/i.test(e.message) ? 'That study code is taken.' : e.message; }
    };

    const rows = studies.map((st) => {
      const o = stats.get(st.id) || {};
      return h('tr',
        h('td', h('b', st.id), st.title ? h('div.small.muted', st.title) : null),
        h('td', String(o.participants || 0)),
        h('td', String(o.events || 0)),
        h('td', o.last_received ? new Date(o.last_received).toLocaleString() : 'nothing yet'),
        h('td', h('span.tag', st.open ? 'Open' : 'Closed')),
        h('td.rdb-actions',
          h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: () => analyse(st, detail) }, 'Analyse'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => linksView(st, detail) }, 'Links'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
            try { await api(`studies?id=eq.${encodeURIComponent(st.id)}`, { method: 'PATCH', body: { open: !st.open }, headers: { Prefer: 'return=minimal' } }); renderStudies(s); } catch (e) { toast(e.message, 'x'); }
          } }, st.open ? 'Close' : 'Reopen')));
    });

    box.replaceChildren(head,
      studies.length
        ? h('div', { style: { overflowX: 'auto' } }, h('table.result-table.rdb-table',
          h('thead', h('tr', ['Study', 'Participants', 'Events', 'Last data', 'Status', ''].map((t) => h('th', t)))),
          h('tbody', rows)))
        : md('No studies yet. Open one below, then make participant links for it.', 'small.muted'),
      h('div.rdb-create', h('h3', 'Open a study'), h('div.rdb-form', idIn, titleIn, h('button.btn.btn--primary', { type: 'button', onclick: create }, 'Open study')), createNote,
        md('Devices can only send data to an open study. Close it when data collection ends: devices then stop sending, and nothing already sent is lost.', 'small.muted')),
      detail);
  }

  function linksView(st, detail) {
    const codes = h('textarea.input', { rows: '3', placeholder: 'Participant codes: P01-P30, or one per line', 'aria-label': 'Participant codes' });
    const cond = h('select.input', { 'aria-label': 'Condition' },
      h('option', { value: 'random' }, 'Random (half adaptive, half fixed)'), h('option', { value: 'adaptive' }, 'Adaptive help for everyone'), h('option', { value: 'fixed' }, 'Fixed order of help for everyone'));
    const ai = h('input', { type: 'checkbox', id: 'rdb-ai' });
    const out = h('div.stack');
    const base = location.origin + location.pathname;
    const make = () => {
      const list = studyLinks(base, st.id, parseCodes(codes.value), { cond: cond.value, ai: ai.checked });
      if (!list.length) { out.replaceChildren(h('p.small', 'Enter at least one participant code.')); return; }
      const csv = ['pid,link', ...list.map((l) => `${l.pid},${l.link}`)].join('\r\n');
      out.replaceChildren(
        h('div.row-wrap',
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => download(`${st.id}-links.csv`, csv, 'text/csv') }, 'Download as CSV'),
          h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => { try { await navigator.clipboard.writeText(list.map((l) => `${l.pid}\t${l.link}`).join('\n')); toast('Links copied.', 'check'); } catch { toast('Copy did not work. Use the CSV.', 'x'); } } }, 'Copy all')),
        h('pre.pool-report', list.map((l) => `${l.pid}  ${l.link}`).join('\n')));
    };
    detail.replaceChildren(h('div.card.stack',
      h('h3', `Participant links for ${st.id}`),
      md('Give each participant their own link. It enrols them on first use: they read the information, agree, and from then on their device sends its data here. Use codes, never names.', 'small.muted'),
      codes, h('div.row-wrap', cond, h('label.row', { for: 'rdb-ai', style: { gap: '8px' } }, ai, h('span.small', 'Nova\'s AI tutor writes the help (needs a Claude key on each device)'))),
      h('div', h('button.btn.btn--primary.btn--sm', { type: 'button', onclick: make }, 'Make links')), out));
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function analyse(st, detail) {
    const out = h('div.stack', h('p.small.muted', 'Loading the data…'));
    detail.replaceChildren(h('div.card.stack', h('h3', `Analysis of ${st.id}`), out));
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
    try {
      const [snaps, events] = await Promise.all([
        api('rpc/latest_snapshots', { method: 'POST', body: { sid: st.id } }),
        allEvents(st.id, (n) => { out.firstChild.textContent = `Loading the data… ${n} events`; }),
      ]);
      const exportsList = rebuildExports(st.id, snaps, events);
      if (!exportsList.length) { out.replaceChildren(h('p.small', 'No data has arrived for this study yet.')); return; }
      const partial = exportsList.filter((x) => x.partial).length;
      const raw = h('div.row-wrap',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => download(`${st.id}-all-participants.json`, JSON.stringify(exportsList, null, 1), 'application/json') }, 'All data (JSON)'));
      const report = h('div.stack');
      out.replaceChildren(raw, report);
      const { showPooled } = await import('./researcher.js');
      await showPooled(report, exportsList, `${events.length} events. ${partial ? `${partial} participant(s) have sent events but no progress snapshot yet. ` : ''}`);
    } catch (e) {
      out.replaceChildren(h('p.small', `Could not load the data: ${e.message}`));
    }
  }
}
