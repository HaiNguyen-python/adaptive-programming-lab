/**
 * The event log: a detailed record of what happens while learning (attempts, help requests and
 * decisions with their probabilities, confidence ratings, check results). It is the raw data a
 * researcher needs, and it never leaves this device unless the learner exports it in Settings.
 * Stored in IndexedDB; falls back to memory when IndexedDB is not available.
 */
import { APP } from './config.js';
import { POLICY_VERSION } from './engine/help-policy.js';

const DB_NAME = 'haicodelab';
const STORE = 'events';
const memory = [];
let opening = null;

function open() {
  if (opening) return opening;
  opening = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { autoIncrement: true });
        os.createIndex('p', 'p');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
  return opening;
}

/** Record one event. Never throws and never blocks the lesson. */
export function logEvent(profileId, type, data = {}) {
  let row;
  try { row = JSON.parse(JSON.stringify({ p: profileId, t: Date.now(), type, ...data })); } catch { return; }
  open().then((db) => {
    if (!db) { memory.push(row); return; }
    try { db.transaction(STORE, 'readwrite').objectStore(STORE).add(row); } catch { memory.push(row); }
  });
}

export function readEvents(profileId) {
  return open().then((db) => new Promise((resolve) => {
    const extra = memory.filter((r) => r.p === profileId);
    if (!db) { resolve(extra); return; }
    try {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).index('p').getAll(profileId);
      req.onsuccess = () => resolve([...(req.result || []), ...extra].sort((a, b) => a.t - b.t));
      req.onerror = () => resolve(extra);
    } catch { resolve(extra); }
  }));
}

export function clearEvents(profileId) {
  for (let i = memory.length - 1; i >= 0; i--) if (memory[i].p === profileId) memory.splice(i, 1);
  return open().then((db) => new Promise((resolve) => {
    if (!db) { resolve(); return; }
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const req = tx.objectStore(STORE).index('p').openCursor(IDBKeyRange.only(profileId));
      req.onsuccess = () => { const c = req.result; if (c) { c.delete(); c.continue(); } };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch { resolve(); }
  }));
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

/** Everything recorded for this learner, as one JSON file. The learner's name is not included. */
export async function exportJson(state) {
  const events = await readEvents(state.profile.id);
  const data = {
    app: APP.name,
    version: APP.version,
    exportedAt: new Date().toISOString(),
    learner: state.profile.code,
    about: 'Recorded on the learner\'s own device and exported by the learner. The learner is identified by a random code, not by name. Times are milliseconds since 1970-01-01 UTC.',
    policy: { version: POLICY_VERSION, mode: state.settings.helpMode, floor: state.settings.floor, costWeight: state.settings.costWeight, allow: state.settings.allow, confidence: state.settings.confidence },
    totals: { xp: state.xp, lessonsDone: Object.values(state.lessons).filter((l) => l.done).length, counters: state.counters },
    lessons: state.lessons,
    concepts: state.concepts,
    decisions: state.decisions,
    bandit: state.bandit,
    events: events.map(({ p, ...rest }) => rest),
  };
  download(`haicodelab-${state.profile.code}-${stamp()}.json`, JSON.stringify(data, null, 2), 'application/json');
  return events.length;
}

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function toCsv(rows, columns) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n');
}

const EVENT_COLUMNS = ['time', 't', 'type', 'session', 'kind', 'lesson', 'lessonId', 'itemId', 'role', 'solo', 'attempt', 'firstTry', 'correct', 'attempts', 'helps', 'walkthrough', 'skipped', 'conf', 'ms', 'xp', 'pL', 'stage', 'arm', 'policy', 'pk', 'errors', 'probs', 'chars', 'detail'];
const DECISION_COLUMNS = ['time', 't', 'id', 'sessionId', 'lessonId', 'itemId', 'policy', 'pk', 'errors', 'helpsBefore', 'pL', 'arms', 'probs', 'arm', 'cost', 'proximal', 'nextDay', 'week'];

/** Two CSV files for analysis: all events, and all help decisions with their outcomes. */
export async function exportCsv(state) {
  const events = await readEvents(state.profile.id);
  const rows = events.map(({ p, ...e }) => {
    const known = new Set(EVENT_COLUMNS);
    const detail = Object.fromEntries(Object.entries(e).filter(([k]) => !known.has(k)));
    return { ...e, time: new Date(e.t).toISOString(), detail: Object.keys(detail).length ? detail : '' };
  });
  download(`haicodelab-${state.profile.code}-events-${stamp()}.csv`, toCsv(rows, EVENT_COLUMNS), 'text/csv');
  const decisions = state.decisions.map((d) => ({ ...d, time: new Date(d.t).toISOString() }));
  setTimeout(() => download(`haicodelab-${state.profile.code}-help-decisions-${stamp()}.csv`, toCsv(decisions, DECISION_COLUMNS), 'text/csv'), 400);
  return events.length;
}
