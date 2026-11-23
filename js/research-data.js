/**
 * Pure helpers for the research database (no browser APIs), shared by js/sync.js and js/ui/research-db.js
 * and covered by tests/research-db.test.mjs.
 */
const CODE = /^[A-Za-z0-9_-]{1,40}$/;

export function hash(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** One event as the database function expects it: a stable key (for skipping duplicates), time, type, data. */
export function eventRow(e) {
  const { p, t, type, ...d } = e;
  const body = JSON.stringify(d);
  return { k: `${t}-${type}-${hash(body)}`.slice(0, 120), t, type: String(type).slice(0, 60), d };
}

/**
 * Rebuild one export per participant, in the same shape as "Download my data", from the newest snapshot and
 * the events in the database. Participants whose device sent events but no snapshot yet get an export with
 * events only (no help decisions).
 */
export function rebuildExports(sid, snapshots, events) {
  const byLearner = new Map();
  for (const r of events) {
    if (!byLearner.has(r.learner)) byLearner.set(r.learner, []);
    byLearner.get(r.learner).push({ ...(r.data || {}), t: Date.parse(r.t), type: r.type });
  }
  const out = [];
  const seen = new Set();
  for (const s of snapshots) {
    seen.add(s.learner);
    out.push({ ...s.payload, learner: s.learner, exportedAt: s.received_at || s.payload.exportedAt, events: byLearner.get(s.learner) || [] });
  }
  for (const [learner, evs] of byLearner) {
    if (seen.has(learner)) continue;
    const pid = (events.find((r) => r.learner === learner) || {}).pid || null;
    out.push({ learner, study: { id: sid, pid }, decisions: [], tests: {}, events: evs, partial: true });
  }
  return out;
}

/** Personal study links: one per participant code. */
export function studyLinks(base, sid, codes, { cond = 'random', ai = false } = {}) {
  return codes.map((pid) => {
    const q = new URLSearchParams({ study: sid, pid });
    if (cond !== 'random') q.set('cond', cond);
    if (ai) q.set('ai', '1');
    return { pid, link: `${base}?${q.toString()}` };
  });
}

/** "P01-P20", "P01, P02" or one code per line. */
export function parseCodes(text) {
  const out = [];
  for (const part of String(text).split(/[\s,;]+/).filter(Boolean)) {
    const m = part.match(/^([A-Za-z_-]*)(\d+)-\1?(\d+)$/);
    if (m) {
      const [, prefix, a, b] = m;
      const width = a.length;
      const lo = Number(a);
      const hi = Math.min(Number(b), lo + 499);
      for (let i = lo; i <= hi; i++) out.push(`${prefix}${String(i).padStart(width, '0')}`);
    } else if (CODE.test(part)) out.push(part);
  }
  return [...new Set(out)];
}


const DAY = 86400000;
const share = (a, b) => (b ? a / b : null);

/**
 * One status row per participant, for monitoring a running study: activity, progress, help and outcomes.
 * `exportsList` is what rebuildExports returns (or exported files). `now` is a time in milliseconds.
 */
export function participantStatus(exportsList, now = Date.now()) {
  return exportsList.map((ex) => {
    const events = Array.isArray(ex.events) ? ex.events : [];
    const last = events.reduce((m, e) => Math.max(m, e.t || 0), 0) || Date.parse(ex.exportedAt || '') || 0;
    const ds = Array.isArray(ex.decisions) ? ex.decisions : [];
    const withOutcome = ds.filter((d) => d.proximal === 0 || d.proximal === 1);
    const memory = Object.values(ex.concepts || {}).flatMap((c) => (Array.isArray(c.checks) ? c.checks : [])).filter((c) => c.role === 'memory' || c.role === 'warmup');
    const test = (kind) => {
      let right = 0;
      let total = 0;
      for (const r of Object.values(ex.tests || {})) if (r && r[kind] && r[kind].total) { right += r[kind].right; total += r[kind].total; }
      return share(right, total);
    };
    const lessonsDone = ex.totals && Number.isFinite(ex.totals.lessonsDone) ? ex.totals.lessonsDone : Object.values(ex.lessons || {}).filter((l) => l && l.done).length;
    const daysSince = last ? Math.floor((now - last) / DAY) : null;
    const flags = [];
    if (ex.partial) flags.push('no progress snapshot yet');
    if (daysSince !== null && daysSince >= 3) flags.push(`inactive for ${daysSince} days`);
    if (ex.clockShifted) flags.push('clock tool used');
    return {
      pid: (ex.study && ex.study.pid) || '',
      learner: ex.learner,
      cond: (ex.study && ex.study.cond) || '',
      lastActive: last ? new Date(last).toISOString() : '',
      daysSince,
      events: events.length,
      lessonsDone,
      helpDecisions: ds.length,
      soloAfterHelp: share(withOutcome.filter((d) => d.proximal === 1).length, withOutcome.length),
      memoryChecks: memory.length,
      memoryPassed: share(memory.filter((c) => c.ok).length, memory.length),
      preTest: test('pre'),
      postTest: test('post'),
      delayedTest: test('delayed'),
      notesOpened: events.filter((e) => e.type === 'notes_opened').length,
      flags: flags.join('; '),
    };
  }).sort((a, b) => String(a.pid).localeCompare(String(b.pid), undefined, { numeric: true }));
}

export const STATUS_COLUMNS = ['pid', 'learner', 'cond', 'lastActive', 'daysSince', 'events', 'lessonsDone', 'helpDecisions', 'soloAfterHelp', 'memoryChecks', 'memoryPassed', 'preTest', 'postTest', 'delayedTest', 'notesOpened', 'flags'];

/** How many participants are in each condition, and how many were active in the last 3 days. */
export function conditionBalance(rows) {
  const out = {};
  for (const r of rows) {
    const k = r.cond || 'unknown';
    if (!out[k]) out[k] = { participants: 0, activeLast3Days: 0, lessonsDone: 0 };
    out[k].participants += 1;
    if (r.daysSince !== null && r.daysSince < 3) out[k].activeLast3Days += 1;
    out[k].lessonsDone += r.lessonsDone;
  }
  return out;
}
