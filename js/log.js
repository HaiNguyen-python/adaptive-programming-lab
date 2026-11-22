/**
 * The event log: a detailed record of what happens while learning (attempts, help requests and
 * decisions with their probabilities, confidence ratings, check results). It is the raw data a
 * researcher needs, and it never leaves this device unless the learner exports it in Settings.
 * Stored in IndexedDB; falls back to memory when IndexedDB is not available.
 */
import { buildJson, eventsCsv, decisionsCsv, checksCsv } from './export.js';
import { buildBackup } from './backup.js';

const DB_NAME = 'phd-programming-lab';
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

/** Store many events at once (used when restoring a backup). */
export function addEvents(profileId, events) {
  const rows = events.map((e) => ({ ...e, p: profileId }));
  return open().then((db) => new Promise((resolve) => {
    if (!db) { memory.push(...rows); resolve(); return; }
    try {
      const tx = db.transaction(STORE, 'readwrite');
      const os = tx.objectStore(STORE);
      rows.forEach((r) => os.add(r));
      tx.oncomplete = () => resolve();
      tx.onerror = () => { memory.push(...rows); resolve(); };
    } catch { memory.push(...rows); resolve(); }
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
  download(`phd-programming-lab-${state.profile.code}-${stamp()}.json`, JSON.stringify(buildJson(state, events), null, 2), 'application/json');
  return events.length;
}

/** A full backup of this learner (name, progress, settings, events) that can be restored later. */
export async function exportBackup(state) {
  const events = await readEvents(state.profile.id);
  const safe = state.profile.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'learner';
  download(`phd-programming-lab-backup-${safe}-${stamp()}.json`, JSON.stringify(buildBackup(state, events)), 'application/json');
  return events.length;
}

/** Three CSV files for analysis: all events, help decisions with their outcomes, and unaided checks. */
export async function exportCsv(state) {
  const events = await readEvents(state.profile.id);
  const code = state.profile.code;
  download(`phd-programming-lab-${code}-events-${stamp()}.csv`, eventsCsv(state, events), 'text/csv');
  setTimeout(() => download(`phd-programming-lab-${code}-help-decisions-${stamp()}.csv`, decisionsCsv(state), 'text/csv'), 400);
  setTimeout(() => download(`phd-programming-lab-${code}-unaided-checks-${stamp()}.csv`, checksCsv(state, events), 'text/csv'), 800);
  return events.length;
}
