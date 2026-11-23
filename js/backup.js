/**
 * Backup and restore. A backup is one JSON file with a learner's progress, settings and event log,
 * so progress can move to another device or survive clearing the browser. Unlike the research
 * export it includes the learner's name and everything needed to restore them.
 */
import { APP } from './config.js';
import { STATE_VERSION, repairState } from './engine/state.js';

// Kept from the app's first name on purpose, so backups made before the rename can still be restored.
export const BACKUP_KIND = 'phd-programming-lab-backup';

export function buildBackup(state, events = [], now = new Date()) {
  return {
    kind: BACKUP_KIND,
    app: APP.name,
    appVersion: APP.version,
    stateVersion: STATE_VERSION,
    exportedAt: now.toISOString(),
    state,
    events: events.map(({ p, ...rest }) => rest),
  };
}

/** Read backup text. Returns { state, events } or throws an Error with a message fit to show. */
export function parseBackup(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not a backup. It could not be read.'); }
  if (!data || data.kind !== BACKUP_KIND || !data.state || !data.state.profile) throw new Error('This file is not a backup from this app.');
  if (typeof data.stateVersion === 'number' && data.stateVersion > STATE_VERSION) throw new Error('This backup comes from a newer version of the app. Update the app first.');
  const state = repairState(data.state);
  const events = Array.isArray(data.events) ? data.events.filter((e) => e && typeof e === 'object' && typeof e.t === 'number') : [];
  return { state, events };
}
