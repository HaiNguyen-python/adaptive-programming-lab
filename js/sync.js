/**
 * Automatic sending of study data to the research database (Supabase, EU).
 *
 * Only for learners who joined a study through a study link and agreed to sending (consent version 2 or
 * later; older participants agreed to "nothing is sent", so nothing is sent for them). Each device sends:
 *  - its event log, in batches, through the database function submit_events (duplicates are skipped), and
 *  - every few minutes a snapshot: the same JSON as "Download my data" without the events (progress, help
 *    decisions with probabilities and outcomes, unit tests), through submit_snapshot.
 * The device can only add rows; it can never read anything back. Names and the AI key are never sent.
 * When the network is down, the data waits on the device and is sent later.
 */
import { RESEARCH_DB, APP } from './config.js';
import { store } from './store.js';
import { readEvents } from './log.js';
import { buildJson } from './export.js';
import { onAppChange } from './app.js';
import { eventRow } from './research-data.js';

const BATCH = 400;
const EVERY_MS = 45000;
const SNAPSHOT_MS = 3 * 60 * 1000;

let running = false;
let started = false;
const status = { state: 'idle', lastOk: 0, error: '' };
const listeners = new Set();

export const syncStatus = () => ({ ...status });
export function onSyncChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(p) {
  Object.assign(status, p);
  for (const fn of listeners) { try { fn(); } catch { /* ignore */ } }
}

/** True when this learner's data should be sent: in a study, with a participant code and consent to sending. */
export function syncEnabled(state) {
  return !!(RESEARCH_DB.url && RESEARCH_DB.key && state && state.study && state.study.pid && state.study.upload === true);
}

const markKey = (profileId) => `hcl.sync.${profileId}`;
function readMark(profileId) {
  try { return JSON.parse(localStorage.getItem(markKey(profileId)) || '{}') || {}; } catch { return {}; }
}
function saveMark(profileId, m) {
  try { localStorage.setItem(markKey(profileId), JSON.stringify(m)); } catch { /* storage blocked: events are simply sent again */ }
}
export const lastSent = (state) => (state ? readMark(state.profile.id).lastOk || 0 : 0);

async function rpc(name, body, { keepalive = false } = {}) {
  const res = await fetch(`${RESEARCH_DB.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    keepalive,
    headers: { apikey: RESEARCH_DB.key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let msg = '';
    try { msg = (await res.json()).message || ''; } catch { /* no body */ }
    const err = new Error(msg || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

/** Bodies up to this size can be sent with keepalive, so they still go out when the tab closes. */
const KEEPALIVE_MAX = 60000;
/** Every send repeats the last 10 minutes; the database skips repeats, so an event written late is not lost. */
const OVERLAP_MS = 10 * 60 * 1000;

let pendingFinal = false;
let nextTry = 0;
let failures = 0;

/** Send whatever has not been sent yet. Safe to call often; only one run at a time. */
export async function syncNow({ final = false } = {}) {
  const state = store.state;
  if (!syncEnabled(state)) return;
  if (running) { if (final) pendingFinal = true; return; }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) { setStatus({ state: 'offline' }); return; }
  running = true;
  const st = state.study;
  const profileId = state.profile.id;
  const learner = state.profile.code;
  try {
    setStatus({ state: 'sending' });
    const m = readMark(profileId);
    const now0 = Date.now();
    // A mark in the future means the device clock was wrong when it was saved: start again from the beginning.
    if (m.lastT && m.lastT > now0 + 60000) m.lastT = 0;
    const skip = new Set(m.skip || []);
    const events = await readEvents(profileId);
    const from = Math.max(0, (m.lastT || 0) - OVERLAP_MS);
    const todo = events.filter((e) => e.t >= from).map(eventRow).filter((r) => !skip.has(r.k));
    let batch = Math.max(1, Math.min(BATCH, m.batch || BATCH));
    for (let i = 0; i < todo.length;) {
      const chunk = todo.slice(i, i + batch);
      const body = { sid: st.id, pid: st.pid, learner, rows: chunk };
      try {
        await rpc('submit_events', body, { keepalive: final && JSON.stringify(body).length < KEEPALIVE_MAX });
      } catch (err) {
        // The database refused the data itself (not the study or the network): find the row and set it aside.
        if (err && err.status === 400) {
          if (chunk.length > 1) { batch = Math.max(1, Math.floor(batch / 2)); m.batch = batch; saveMark(profileId, m); continue; }
          skip.add(chunk[0].k);
          m.skip = [...skip].slice(-200);
          saveMark(profileId, m);
          i += 1;
          continue;
        }
        throw err;
      }
      m.lastT = Math.max(m.lastT || 0, chunk[chunk.length - 1].t);
      saveMark(profileId, m);
      i += chunk.length;
    }
    if (m.batch && m.batch < BATCH) { m.batch = Math.min(BATCH, m.batch * 2); }
    const now = Date.now();
    const sig = `${state.xp}|${state.decisions.length}|${state.decisions.filter((d) => d.proximal !== null && d.proximal !== undefined).length}|${JSON.stringify(state.tests || {}).length}|${Object.keys(state.lessons).length}`;
    if (sig !== m.snapSig && (final || !m.snapAt || now - m.snapAt > SNAPSHOT_MS)) {
      const snap = buildJson(state, [], new Date(now), {});
      delete snap.events;
      snap.eventsOnServer = true;
      snap.about = 'Sent automatically by the device of the learner to the research database after consent. The learner is identified by a random code and the study participant code, not by name. Times are milliseconds since 1970-01-01 UTC. The events are in the events table. See docs/RESEARCH_DATA.md.';
      const body = { sid: st.id, pid: st.pid, learner, app_version: APP.version, payload: snap };
      await rpc('submit_snapshot', body, { keepalive: final && JSON.stringify(body).length < KEEPALIVE_MAX });
      m.snapSig = sig;
      m.snapAt = now;
    }
    m.lastOk = now;
    saveMark(profileId, m);
    failures = 0;
    nextTry = 0;
    setStatus({ state: 'ok', lastOk: now, error: '' });
  } catch (err) {
    // Wait longer after each failure (1, 2, 4 ... up to 15 minutes), so a closed study or a dead network is not
    // hammered. A final send when the tab is hidden still goes ahead.
    failures += 1;
    nextTry = Date.now() + Math.min(15 * 60000, 60000 * 2 ** (failures - 1));
    setStatus({ state: err && (err.status === 401 || err.status === 403) ? 'refused' : 'error', error: (err && err.message) || String(err) });
  } finally {
    running = false;
    if (pendingFinal) { pendingFinal = false; syncNow({ final: true }); }
  }
}

/** Start sending in the background: soon after start, every 45 seconds, after changes, and when the tab is hidden. */
export function startSync() {
  if (started) return;
  started = true;
  let soon = null;
  const later = (ms) => { clearTimeout(soon); soon = setTimeout(() => { if (Date.now() >= nextTry) syncNow(); }, ms); };
  later(3000);
  setInterval(() => { if (document.visibilityState !== 'hidden' && Date.now() >= nextTry) syncNow(); }, EVERY_MS);
  onAppChange(() => later(5000));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') syncNow({ final: true }); });
  window.addEventListener('online', () => { nextTry = 0; later(1000); });
}
