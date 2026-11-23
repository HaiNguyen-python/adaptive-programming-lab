/**
 * The event log: a detailed record of what happens while learning (attempts, help requests and
 * decisions with their probabilities, confidence ratings, check results). It is the raw data a
 * researcher needs, and it never leaves this device unless the learner exports it in Settings.
 * Stored in IndexedDB; falls back to memory when IndexedDB is not available.
 */
import { buildJson, eventsCsv, decisionsCsv, checksCsv } from './export.js';
import { buildBackup } from './backup.js';

// Kept from the app's first name on purpose: renaming the database would orphan event logs already on devices.
const DB_NAME = 'phd-programming-lab';
const STORE = 'events';
const PENDING_KEY = 'hcl.events.pending';
const memory = [];
let opening = null;
let healthy = true;

/** Events that could not be written to IndexedDB are kept in local storage too, so a reload does not lose them. */
function persistPending() {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify(memory.slice(-5000))); } catch { /* storage full or blocked */ }
}
function fallback(rows) {
  healthy = false;
  memory.push(...rows);
  persistPending();
}

function open() {
  if (opening) return opening;
  try {
    const saved = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) memory.push(...saved);
  } catch { /* nothing saved */ }
  opening = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const os = req.result.createObjectStore(STORE, { autoIncrement: true });
        os.createIndex('p', 'p');
      };
      req.onsuccess = () => {
        const db = req.result;
        // Move events that were kept aside while IndexedDB was unavailable into the database.
        if (memory.length) {
          const rows = memory.splice(0, memory.length);
          try {
            const tx = db.transaction(STORE, 'readwrite');
            rows.forEach((r) => tx.objectStore(STORE).add(r));
            tx.oncomplete = () => { try { localStorage.removeItem(PENDING_KEY); } catch { /* ignore */ } };
            tx.onerror = () => { memory.unshift(...rows); persistPending(); };
          } catch { memory.unshift(...rows); persistPending(); }
        }
        resolve(db);
      };
      req.onerror = () => { healthy = false; resolve(null); };
      req.onblocked = () => { healthy = false; resolve(null); };
    } catch { healthy = false; resolve(null); }
  });
  return opening;
}

/** 'ok' while every event reached IndexedDB; 'fallback' when some were kept in local storage instead. */
export const eventLogStatus = () => (healthy ? 'ok' : 'fallback');

/**
 * Record one event. Never throws and never blocks the lesson. `t` is always the real time of logging; a
 * time that comes with the data (for example a help decision's app-clock time) is kept as `clockT`.
 */
export function logEvent(profileId, type, data = {}) {
  let row;
  try {
    const { p, t, type: ignored, ...rest } = data;
    row = JSON.parse(JSON.stringify({ ...rest, ...(t !== undefined ? { clockT: t } : {}), p: profileId, t: Date.now(), type }));
  } catch { return; }
  open().then((db) => {
    if (!db) { fallback([row]); return; }
    try {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).add(row);
      tx.onerror = () => fallback([row]);
      tx.onabort = () => fallback([row]);
    } catch { fallback([row]); }
  });
}

/** Store many events at once (used when restoring a backup). */
export function addEvents(profileId, events) {
  const rows = events.map((e) => ({ ...e, p: profileId }));
  return open().then((db) => new Promise((resolve) => {
    if (!db) { fallback(rows); resolve(); return; }
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      rows.forEach((r) => os.add(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => { fallback(rows); resolve(); };
    } catch { fallback(rows); resolve(); }
  }));
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
  persistPending();
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

export function download(name, text, type) {
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
  download(`adaptive-programming-lab-${state.profile.code}-${stamp()}.json`, JSON.stringify(buildJson(state, events, new Date(), { eventLog: eventLogStatus() }), null, 2), 'application/json');
  return events.length;
}

/** A full backup of this learner (name, progress, settings, events) that can be restored later. */
export async function exportBackup(state) {
  const events = await readEvents(state.profile.id);
  const safe = state.profile.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'learner';
  download(`adaptive-programming-lab-backup-${safe}-${stamp()}.json`, JSON.stringify(buildBackup(state, events)), 'application/json');
  return events.length;
}

/** Three CSV files for analysis: all events, help decisions with their outcomes, and unaided checks. */
export async function exportCsv(state) {
  const events = await readEvents(state.profile.id);
  const code = state.profile.code;
  download(`adaptive-programming-lab-${code}-events-${stamp()}.csv`, eventsCsv(state, events), 'text/csv');
  setTimeout(() => download(`adaptive-programming-lab-${code}-help-decisions-${stamp()}.csv`, decisionsCsv(state), 'text/csv'), 400);
  setTimeout(() => download(`adaptive-programming-lab-${code}-unaided-checks-${stamp()}.csv`, checksCsv(state, events), 'text/csv'), 800);
  return events.length;
}
