/**
 * Pure builders for the research exports (no DOM, no storage), so they can be tested.
 * The meaning of every field is documented in docs/RESEARCH_DATA.md.
 */
import { APP } from './config.js';
import { POLICY_VERSION, DATA_VERSION } from './engine/help-policy.js';

const csvCell = (v) => {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(rows, columns) {
  return [columns.join(','), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(','))].join('\r\n');
}

const iso = (t) => (typeof t === 'number' ? new Date(t).toISOString() : '');

/** Who this row belongs to: the study participant code when there is one, and the condition. */
export function who(state) {
  const st = state.study;
  return { learner: state.profile.code, study: st ? st.id : '', pid: st ? st.pid : '', cond: st ? st.cond : '' };
}

/** Everything recorded for this learner, as one JSON document. The learner's name is not included. */
export function buildJson(state, events, now = new Date(), { eventLog = 'ok' } = {}) {
  const rows = events.map(({ p, ...rest }) => rest);
  return {
    app: APP.name,
    version: APP.version,
    dataVersion: DATA_VERSION,
    exportedAt: now.toISOString(),
    learner: state.profile.code,
    study: state.study || null,
    about: 'Recorded on the learner\'s own device and exported by the learner. The learner is identified by a random code, not by name. Times are milliseconds since 1970-01-01 UTC. See docs/RESEARCH_DATA.md.',
    policy: { version: POLICY_VERSION, mode: state.settings.helpMode, floor: state.settings.floor, costWeight: state.settings.costWeight, allow: state.settings.allow, confidence: state.settings.confidence },
    clockShifted: rows.some((e) => e.shift) || state.decisions.some((d) => d.shift),
    // 'fallback' means IndexedDB was not available for some events on this device (they were kept in local
    // storage). The events are still included, but check the device's storage settings.
    eventLog,
    totals: { xp: state.xp, lessonsDone: Object.values(state.lessons).filter((l) => l.done).length, counters: state.counters },
    lessons: state.lessons,
    tests: state.tests || {},
    concepts: state.concepts,
    decisions: state.decisions,
    bandit: state.bandit,
    events: rows,
  };
}

export const EVENT_COLUMNS = ['learner', 'study', 'pid', 'cond', 'time', 't', 'type', 'session', 'kind', 'lesson', 'lessonId', 'itemId', 'role', 'solo', 'attempt', 'firstTry', 'correct', 'attempts', 'helps', 'walkthrough', 'skipped', 'conf', 'ms', 'xp', 'pL', 'stage', 'arm', 'policy', 'pk', 'errors', 'probs', 'chars', 'shift', 'detail'];

export const DECISION_COLUMNS = ['learner', 'study', 'pid', 'cond', 'time', 't', 'id', 'sessionId', 'lessonId', 'itemId', 'policy', 'pk', 'errors', 'helpsBefore', 'pL', 'arms', 'probs', 'posterior', 'u', 'floor', 'costWeight', 'allow', 'arm', 'cost', 'source', 'model', 'aiMs', 'aiError', 'proximal', 'proximalRole', 'proximalItemId', 'proximalAt', 'nextDay', 'nextDayGap', 'week', 'weekGap', 'shift'];

export const CHECK_COLUMNS = ['learner', 'study', 'pid', 'cond', 'time', 't', 'session', 'lessonId', 'itemId', 'kind', 'role', 'conf', 'correct', 'attempts', 'ms', 'pL', 'stageBefore', 'stageAfter', 'gapDays', 'afterHelp', 'shift'];

export function eventsCsv(state, events) {
  const w = who(state);
  const known = new Set(EVENT_COLUMNS);
  const rows = events.map(({ p, ...e }) => {
    const detail = Object.fromEntries(Object.entries(e).filter(([k]) => !known.has(k)));
    return { ...w, ...e, time: iso(e.t), detail: Object.keys(detail).length ? detail : '' };
  });
  return toCsv(rows, EVENT_COLUMNS);
}

export function decisionsCsv(state) {
  const w = who(state);
  return toCsv(state.decisions.map((d) => ({ ...w, ...d, cond: d.cond || w.cond, time: iso(d.t) })), DECISION_COLUMNS);
}

/**
 * One row for every unaided check (solo item): the data for durable learning (stage and gap in days)
 * and calibration (confidence against correctness). Built from the full event log, so it is not capped.
 * `afterHelp` is true when the learner had asked for help earlier in the same session on the same lesson.
 */
export function checkRows(state, events) {
  const w = who(state);
  const helped = new Set();
  const rows = [];
  for (const e of events) {
    if (e.type === 'help_decision') helped.add(`${e.sessionId}|${e.lessonId}`);
    if (e.type !== 'item_result' || !e.solo || e.role === 'placement') continue;
    const m = e.memory || null;
    rows.push({
      ...w, time: iso(e.t), t: e.t, session: e.session, lessonId: e.lessonId, itemId: e.itemId, kind: e.kind, role: e.role,
      conf: e.conf, correct: e.firstTry ? 1 : 0, attempts: e.attempts, ms: e.ms, pL: e.pL,
      stageBefore: m ? m.stageBefore : e.stage, stageAfter: m ? m.after : e.stage, gapDays: m ? m.gapDays : '',
      afterHelp: helped.has(`${e.session}|${e.lessonId}`) ? 1 : 0, shift: e.shift || 0,
    });
  }
  return rows;
}

export const checksCsv = (state, events) => toCsv(checkRows(state, events), CHECK_COLUMNS);
