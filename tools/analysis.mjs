/**
 * Analysis of pooled exports from many participants (pure functions, no file access).
 * Used by tools/merge-exports.mjs and tested in tests/research.test.mjs.
 *
 * Unit of analysis note: help decisions and unaided checks are nested in participants. Use the pooled
 * CSV files with a mixed model (random intercept per `learner`) for inference. The numbers produced here
 * are descriptive and meant for monitoring a pilot, not for reporting p-values.
 */
import { checkRows, toCsv, DECISION_COLUMNS, CHECK_COLUMNS } from '../js/export.js';
import { calibration, confProb } from '../js/engine/calibration.js';

export const ARMS = ['hint', 'explain', 'worked'];

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);

/** Turn parsed JSON exports into one dataset. Exports without events still contribute decisions. */
export function pool(exportsList) {
  const participants = [];
  const decisions = [];
  const checks = [];
  const seen = new Set();
  for (const ex of exportsList) {
    if (!ex || !ex.learner || !Array.isArray(ex.decisions)) continue;
    if (seen.has(ex.learner)) continue; // the same learner exported twice: keep the first file given
    seen.add(ex.learner);
    const state = { profile: { code: ex.learner }, study: ex.study || null, decisions: ex.decisions };
    const events = Array.isArray(ex.events) ? ex.events : [];
    const cond = ex.study ? ex.study.cond : ex.policy ? (ex.policy.mode === 'fixed' ? 'fixed' : 'adaptive') : '';
    const ds = ex.decisions.map((d) => ({ learner: ex.learner, study: ex.study ? ex.study.id : '', pid: ex.study ? ex.study.pid : '', ...d, cond: d.cond || cond }));
    const cs = checkRows(state, events).map((r) => ({ ...r, cond: r.cond || cond }));
    decisions.push(...ds);
    checks.push(...cs);
    participants.push({
      learner: ex.learner, study: ex.study ? ex.study.id : '', pid: ex.study ? ex.study.pid : '', cond,
      decisions: ds.length, checks: cs.length, lessonsDone: ex.totals ? ex.totals.lessonsDone : null,
      xp: ex.totals ? ex.totals.xp : null, clockShifted: !!ex.clockShifted, dataVersion: ex.dataVersion || 1,
    });
  }
  return { participants, decisions, checks };
}

/**
 * Inverse-probability-weighted value of each help type on an outcome, from logged propensities:
 * V(a) = mean over decisions of 1[arm = a] * Y / pi(a). Needs probs for the arm to be > 0.
 * Decisions where `a` was not available count as zero for `a`, so read V(a) next to the share of
 * decisions in which `a` was available. `value` is the plain average of Y among decisions that chose `a`.
 */
export function armValues(decisions, outcome = 'proximal') {
  const rows = decisions.filter((d) => d[outcome] !== null && d[outcome] !== undefined && d[outcome] !== '');
  const out = {};
  for (const a of ARMS) {
    const chosen = rows.filter((d) => d.arm === a);
    const avail = rows.filter((d) => (d.arms || []).includes(a));
    const ipw = avail.length
      ? mean(avail.map((d) => {
        const p = d.probs && d.probs[a];
        return d.arm === a && p > 0 ? Number(d[outcome]) / p : 0;
      }))
      : null;
    out[a] = { chosen: chosen.length, available: avail.length, value: round(mean(chosen.map((d) => Number(d[outcome])))), ipw: round(ipw) };
  }
  return { n: rows.length, arms: out };
}

/** Pass rate of unaided checks by memory stage (1 = next day, 2 = one week, higher = later). */
export function retention(checks) {
  const memory = checks.filter((c) => c.role === 'memory' || c.role === 'warmup');
  const by = {};
  for (const c of memory) {
    const k = Number(c.stageBefore);
    (by[k] = by[k] || []).push(Number(c.correct));
  }
  const label = (k) => (k === 1 ? 'next day' : k === 2 ? 'one week' : `stage ${k}`);
  return Object.fromEntries(Object.keys(by).map(Number).sort((a, b) => a - b).map((k) => [label(k), { n: by[k].length, rate: round(mean(by[k])) }]));
}

/** Calibration of one set of rated checks: bias, mean absolute error and Brier score. */
export function calibrationOf(checks) {
  const rated = checks.filter((c) => c.conf !== null && c.conf !== undefined && c.conf !== '').map((c) => ({ conf: Number(c.conf), ok: Number(c.correct) === 1 }));
  const cal = calibration(rated);
  const brier = rated.length ? mean(rated.map((c) => (confProb(c.conf) - (c.ok ? 1 : 0)) ** 2)) : null;
  return { n: cal.n, meanConf: round(cal.meanConf), accuracy: round(cal.accuracy), bias: round(cal.bias), absError: round(cal.absError), brier: round(brier) };
}

/** Things that weaken the data and should be looked at before analysis. */
export function quality({ participants, decisions }) {
  const shifted = participants.filter((p) => p.clockShifted).map((p) => p.learner);
  const oldFormat = participants.filter((p) => p.dataVersion < 2).map((p) => p.learner);
  const withOutcome = decisions.filter((d) => d.proximal !== null && d.proximal !== undefined && d.proximal !== '');
  return {
    participantsWithShiftedClock: shifted,
    participantsWithOldDataFormat: oldFormat,
    decisionsWithoutProximal: decisions.length - withOutcome.length,
    proximalNotFromHelpcheck: withOutcome.filter((d) => d.proximalRole && d.proximalRole !== 'helpcheck').length,
    decisionsWithoutPropensities: decisions.filter((d) => !d.probs || !Object.keys(d.probs).length).length,
  };
}

/** Descriptive summary per condition. */
export function summarise(data) {
  const conds = [...new Set(data.participants.map((p) => p.cond || 'none'))].sort();
  const per = {};
  for (const c of conds) {
    const ps = data.participants.filter((p) => (p.cond || 'none') === c);
    const ids = new Set(ps.map((p) => p.learner));
    const ds = data.decisions.filter((d) => ids.has(d.learner));
    const cs = data.checks.filter((x) => ids.has(x.learner));
    const calByLearner = ps.map((p) => calibrationOf(cs.filter((x) => x.learner === p.learner))).filter((x) => x.n >= 5);
    per[c] = {
      participants: ps.length,
      decisions: ds.length,
      unaidedChecks: cs.length,
      armShare: Object.fromEntries(ARMS.map((a) => [a, round(ds.length ? ds.filter((d) => d.arm === a).length / ds.length : null)])),
      proximal: armValues(ds, 'proximal'),
      nextDay: armValues(ds, 'nextDay'),
      week: armValues(ds, 'week'),
      retention: retention(cs),
      calibration: calibrationOf(cs),
      calibrationByLearner: { learners: calByLearner.length, meanBias: round(mean(calByLearner.map((x) => x.bias))), meanBrier: round(mean(calByLearner.map((x) => x.brier))) },
    };
  }
  return { conditions: per, quality: quality(data) };
}

const f = (x) => (x === null || x === undefined ? 'n/a' : String(x));

export function reportMarkdown(summary, data) {
  const out = ['# Pooled results (descriptive)', '', `Participants: ${data.participants.length}. Help decisions: ${data.decisions.length}. Unaided checks: ${data.checks.length}.`, '',
    'These numbers monitor a pilot. For inference use the pooled CSV files with a mixed model (random intercept per learner).', ''];
  for (const [c, s] of Object.entries(summary.conditions)) {
    out.push(`## Condition: ${c}`, '', `${s.participants} participants, ${s.decisions} help decisions, ${s.unaidedChecks} unaided checks.`, '');
    out.push('| Help type | share of decisions | chosen (proximal outcome known) | pass rate on next solo check | IPW value | pass rate next day | pass rate one week |', '|---|---|---|---|---|---|---|');
    for (const a of ARMS) {
      out.push(`| ${a} | ${f(s.armShare[a])} | ${s.proximal.arms[a].chosen} | ${f(s.proximal.arms[a].value)} | ${f(s.proximal.arms[a].ipw)} | ${f(s.nextDay.arms[a].value)} (n=${s.nextDay.arms[a].chosen}) | ${f(s.week.arms[a].value)} (n=${s.week.arms[a].chosen}) |`);
    }
    out.push('', '**Retention of unaided memory checks:** ' + (Object.entries(s.retention).map(([k, v]) => `${k}: ${f(v.rate)} (n=${v.n})`).join('; ') || 'no memory checks yet'), '');
    const cal = s.calibration;
    out.push(`**Calibration (all rated checks):** n=${cal.n}, mean confidence ${f(cal.meanConf)}, accuracy ${f(cal.accuracy)}, bias ${f(cal.bias)} (positive = overconfident), Brier ${f(cal.brier)}. Learners with 5 or more rated checks: ${s.calibrationByLearner.learners}, mean bias ${f(s.calibrationByLearner.meanBias)}, mean Brier ${f(s.calibrationByLearner.meanBrier)}.`, '');
  }
  const q = summary.quality;
  out.push('## Data quality', '',
    `- Participants whose clock was moved with the testing tool: ${q.participantsWithShiftedClock.length ? q.participantsWithShiftedClock.join(', ') : 'none'}`,
    `- Participants with an older data format (fewer logged fields): ${q.participantsWithOldDataFormat.length ? q.participantsWithOldDataFormat.join(', ') : 'none'}`,
    `- Help decisions without a proximal outcome: ${q.decisionsWithoutProximal}`,
    `- Proximal outcomes that came from a later check than the one right after the help: ${q.proximalNotFromHelpcheck}`,
    `- Decisions without logged probabilities: ${q.decisionsWithoutPropensities}`, '');
  return out.join('\n');
}

export const pooledDecisionsCsv = (data) => toCsv(data.decisions, DECISION_COLUMNS);
export const pooledChecksCsv = (data) => toCsv(data.checks, CHECK_COLUMNS);
export const participantsCsv = (data) => toCsv(data.participants, ['learner', 'study', 'pid', 'cond', 'decisions', 'checks', 'lessonsDone', 'xp', 'clockShifted', 'dataVersion']);
