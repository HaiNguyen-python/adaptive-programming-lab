/**
 * Analyses for the four research questions of "The Cost of Easy Answers" (pure functions, no file access).
 *
 *   RQ1  help-seeking patterns     helpSeekingFeatures()  per-learner features from the event log, related to
 *                                  later unaided performance and calibration by helpSeekingReport()
 *   RQ2  types of help             causal contrasts of help types from the randomised decisions: excursions()
 *   RQ3  proxy reward              learningEpisodes() + proxyReport(): which short-term signal predicts the
 *                                  unaided one-week check best (AUC)
 *   RQ4  fair adaptive policy      policyEvaluation(): doubly robust off-policy value of the fixed tutor and of a
 *                                  learned cost-aware policy, overall and for the lowest tertile of prior
 *                                  performance, with cluster-bootstrap confidence intervals and a
 *                                  non-inferiority check
 *   Paper III secondary outcomes  carryOver() (lagged effects) and laterRequests()
 *
 * Every number here is meant to monitor a pilot and to check the pipeline end to end. Pre-registered
 * inference belongs in a proper statistics package (mixed models, WCLS for causal excursion effects); the
 * pooled CSV files carry everything needed for that. Definitions are documented in docs/RESEARCH_DATA.md.
 */
import { makeRng } from '../js/engine/rng.js';

export const ARMS = ['hint', 'explain', 'worked'];
export const COST = { hint: 1, explain: 1, worked: 2 };
const RAPID_MS = 8000;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x, d = 3) => (x === null || x === undefined || Number.isNaN(x) ? null : Math.round(x * 10 ** d) / 10 ** d);
const has = (v) => v !== null && v !== undefined && v !== '';
const num = (v) => (has(v) ? Number(v) : null);

// ---------------------------------------------------------------- RQ1: help-seeking features

/**
 * Per-learner help-seeking features from one learner's events (sorted by time inside).
 *   requests        help requests (help_decision events)
 *   helpRate        requests per practice item answered (item_result, not solo)
 *   rapidShare      share of requests made less than 8 s after the learner's previous answer on that item
 *   repeatShare     share of requests that were the second or later on the same item
 *   specificShare   share of requests answered with the most specific help (a worked example)
 *   walkthroughRate walkthroughs (the solution shown after all help) per practice item
 *   attemptsBetween mean number of answer attempts between two requests on the same item
 *   priorPerformance first-try rate on the learner's first 15 practice items (the RQ4 tertile variable)
 * and the outcomes the features are related to: weekRate (unaided checks at stage 2 or later), nextDayRate,
 * calibrationBias (mean confidence minus accuracy on rated unaided checks).
 */
export function helpSeekingFeatures(learner, events) {
  const ev = [...events].sort((a, b) => a.t - b.t);
  const lastAttempt = new Map();
  const requestsOnItem = new Map();
  const attemptsSinceRequest = new Map();
  let requests = 0; let rapid = 0; let repeat = 0; let specific = 0;
  const between = [];
  const practice = [];
  let walkthroughs = 0;
  const week = []; const nextDay = []; const rated = [];
  for (const e of ev) {
    const key = `${e.session}|${e.itemId}`;
    if (e.type === 'attempt' && !e.solo) {
      lastAttempt.set(key, e.t);
      attemptsSinceRequest.set(key, (attemptsSinceRequest.get(key) || 0) + 1);
    } else if (e.type === 'help_decision') {
      const k = `${e.sessionId}|${e.itemId}`;
      requests++;
      const prev = lastAttempt.get(k);
      if (prev !== undefined && e.t - prev < RAPID_MS) rapid++;
      const n = requestsOnItem.get(k) || 0;
      if (n > 0) { repeat++; between.push(attemptsSinceRequest.get(k) || 0); }
      requestsOnItem.set(k, n + 1);
      attemptsSinceRequest.set(k, 0);
      if (e.arm === 'worked') specific++;
    } else if (e.type === 'walkthrough') walkthroughs++;
    else if (e.type === 'item_result') {
      if (!e.solo) practice.push(e.firstTry ? 1 : 0);
      else if (e.role !== 'placement' && !String(e.role || '').startsWith('test')) {
        const stage = e.memory ? e.memory.stageBefore : null;
        if (stage === 1) nextDay.push(e.firstTry ? 1 : 0);
        if (stage >= 2) week.push(e.firstTry ? 1 : 0);
        if (has(e.conf)) rated.push((Number(e.conf) - 1) / 4 - (e.firstTry ? 1 : 0));
      }
    }
  }
  const items = practice.length;
  return {
    learner,
    requests,
    practiceItems: items,
    helpRate: round(items ? requests / items : null),
    rapidShare: round(requests ? rapid / requests : null),
    repeatShare: round(requests ? repeat / requests : null),
    specificShare: round(requests ? specific / requests : null),
    walkthroughRate: round(items ? walkthroughs / items : null),
    attemptsBetween: round(mean(between)),
    priorPerformance: round(mean(practice.slice(0, 15))),
    weekRate: round(mean(week)),
    weekChecks: week.length,
    nextDayRate: round(mean(nextDay)),
    calibrationBias: round(mean(rated)),
    ratedChecks: rated.length,
    pattern: patternOf({ requests, items, rapid, repeat }),
  };
}

/** A transparent rule-based label for the H1 pattern (rapid, repeated requests). */
function patternOf({ requests, items, rapid, repeat }) {
  if (!items) return 'no data';
  if (requests / items < 0.1) return 'rarely asks';
  if (requests >= 3 && rapid / requests >= 0.5 && repeat / requests >= 0.3) return 'rapid and repeated';
  return 'asks after trying';
}

/** Pearson correlation of two columns over rows where both are present. */
export function correlation(rows, x, y) {
  const pairs = rows.filter((r) => has(r[x]) && has(r[y])).map((r) => [Number(r[x]), Number(r[y])]);
  if (pairs.length < 3) return { n: pairs.length, r: null };
  const mx = mean(pairs.map((p) => p[0]));
  const my = mean(pairs.map((p) => p[1]));
  let sxy = 0; let sxx = 0; let syy = 0;
  for (const [a, b] of pairs) { sxy += (a - mx) * (b - my); sxx += (a - mx) ** 2; syy += (b - my) ** 2; }
  return { n: pairs.length, r: sxx && syy ? round(sxy / Math.sqrt(sxx * syy)) : null };
}

/**
 * H1 check: do rapid, repeated requests for the most specific help go with weaker later performance and
 * overconfidence? Reports correlations and outcomes by pattern. Control for prior performance in the
 * mixed model; here priorPerformance is reported alongside.
 */
export function helpSeekingReport(features) {
  const feats = ['helpRate', 'rapidShare', 'repeatShare', 'specificShare', 'walkthroughRate'];
  const byPattern = {};
  for (const f of features) {
    const g = byPattern[f.pattern] || (byPattern[f.pattern] = []);
    g.push(f);
  }
  return {
    learners: features.length,
    correlations: Object.fromEntries(feats.map((k) => [k, {
      weekRate: correlation(features, k, 'weekRate'),
      calibrationBias: correlation(features, k, 'calibrationBias'),
      priorPerformance: correlation(features, k, 'priorPerformance'),
    }])),
    byPattern: Object.fromEntries(Object.entries(byPattern).map(([p, g]) => [p, {
      learners: g.length,
      weekRate: round(mean(g.map((x) => x.weekRate).filter(has))),
      calibrationBias: round(mean(g.map((x) => x.calibrationBias).filter(has))),
      priorPerformance: round(mean(g.map((x) => x.priorPerformance).filter(has))),
    }])),
  };
}

// ---------------------------------------------------------------- RQ3: learning episodes and proxies

/**
 * One row per learner and lesson ("episode"): short-term signals from the first lesson session and the
 * delayed unaided outcomes for that concept.
 *   immediateSuccess  share of practice items finally solved (assisted task success, the usual tutor metric)
 *   firstTryRate      share of practice items right on the first try
 *   helpRequests      help requests in the lesson; helpSpecificity: their summed cost (worked 2, hints 1)
 *   checkAfterHelp    unaided check right after help (role helpcheck), 1/0, or null if no help was given
 *   lessonCheck       the unaided check that ends the lesson (role final)
 *   confidenceGap     |confidence - result| on that final check (0 = perfectly calibrated)
 *   nextDay, week     first unaided memory check at stage 1 and at stage 2 for this concept
 */
export function learningEpisodes(learner, events, cond = '') {
  const ev = [...events].sort((a, b) => a.t - b.t);
  const firstSession = new Map();
  for (const e of ev) {
    if (e.type === 'session_start' && e.kind === 'lesson' && e.lesson && !firstSession.has(e.lesson)) firstSession.set(e.lesson, e.session);
  }
  const ep = new Map();
  const get = (id) => {
    if (!ep.has(id)) ep.set(id, { learner, cond, lessonId: id, practice: [], solved: [], helps: 0, cost: 0, checkAfterHelp: null, lessonCheck: null, confidenceGap: null, nextDay: null, week: null });
    return ep.get(id);
  };
  for (const e of ev) {
    if (e.type === 'help_decision' && firstSession.get(e.lessonId) === e.sessionId) {
      const x = get(e.lessonId); x.helps++; x.cost += COST[e.arm] || 0;
    }
    if (e.type !== 'item_result' || !e.lessonId) continue;
    const inFirst = firstSession.get(e.lessonId) === e.session;
    if (!e.solo && inFirst) { const x = get(e.lessonId); x.practice.push(e.firstTry ? 1 : 0); x.solved.push(e.correct ? 1 : 0); }
    if (e.solo && inFirst && e.role === 'helpcheck' && get(e.lessonId).checkAfterHelp === null) get(e.lessonId).checkAfterHelp = e.firstTry ? 1 : 0;
    if (e.solo && inFirst && e.role === 'final') {
      const x = get(e.lessonId);
      x.lessonCheck = e.firstTry ? 1 : 0;
      if (has(e.conf)) x.confidenceGap = round(Math.abs((Number(e.conf) - 1) / 4 - x.lessonCheck));
    }
    if (e.solo && e.memory) {
      const x = get(e.lessonId);
      if (e.memory.stageBefore === 1 && x.nextDay === null) x.nextDay = e.firstTry ? 1 : 0;
      if (e.memory.stageBefore === 2 && x.week === null) x.week = e.firstTry ? 1 : 0;
    }
  }
  return [...ep.values()].filter((x) => x.practice.length).map((x) => ({
    learner: x.learner, cond: x.cond, lessonId: x.lessonId,
    immediateSuccess: round(mean(x.solved)), firstTryRate: round(mean(x.practice)),
    helpRequests: x.helps, helpSpecificity: x.cost,
    checkAfterHelp: x.checkAfterHelp, lessonCheck: x.lessonCheck, confidenceGap: x.confidenceGap,
    nextDay: x.nextDay, week: x.week,
  }));
}

/** Area under the ROC curve of a score for a binary outcome (Mann-Whitney, ties count half). */
export function auc(rows, score, outcome) {
  const pos = rows.filter((r) => has(r[score]) && Number(r[outcome]) === 1).map((r) => Number(r[score]));
  const neg = rows.filter((r) => has(r[score]) && has(r[outcome]) && Number(r[outcome]) === 0).map((r) => Number(r[score]));
  if (!pos.length || !neg.length) return null;
  let s = 0;
  for (const p of pos) for (const n of neg) s += p > n ? 1 : p === n ? 0.5 : 0;
  return s / (pos.length * neg.length);
}

/**
 * H3 check: which short-term signal predicts the unaided one-week check best? For signals where more means
 * worse (help requests, specificity, confidence gap) the score is negated, so an AUC above 0.5 always
 * means "higher signal, better week outcome". Signals compared on the same episodes where possible.
 */
export function proxyReport(episodes, outcome = 'week') {
  const signals = [
    { key: 'immediateSuccess', label: 'Immediate task success (with help)', sign: 1 },
    { key: 'firstTryRate', label: 'First-try success in the lesson', sign: 1 },
    { key: 'checkAfterHelp', label: 'Unaided check right after help', sign: 1 },
    { key: 'lessonCheck', label: 'Unaided check at the end of the lesson', sign: 1 },
    { key: 'helpRequests', label: 'Number of help requests (fewer is better)', sign: -1 },
    { key: 'helpSpecificity', label: 'Specificity of help received (less is better)', sign: -1 },
    { key: 'confidenceGap', label: 'Calibration gap on the lesson check (smaller is better)', sign: -1 },
  ];
  const withOutcome = episodes.filter((e) => has(e[outcome]));
  return {
    outcome,
    episodes: withOutcome.length,
    baseRate: round(mean(withOutcome.map((e) => Number(e[outcome])))),
    signals: signals.map((s) => {
      const rows = withOutcome.filter((e) => has(e[s.key])).map((e) => ({ y: e[outcome], x: s.sign * Number(e[s.key]) }));
      return { key: s.key, label: s.label, n: rows.length, auc: round(auc(rows, 'x', 'y')) };
    }),
  };
}

// ---------------------------------------------------------------- RQ2: causal contrasts between help types

/**
 * Inverse-probability-weighted contrasts between pairs of help types on randomised decisions (adaptive
 * policy only, where every offered arm had a probability between 0 and 1). For a pair (a, b) and decisions
 * where both were offered: effect = mean(1[A=a] Y / p(a)) - mean(1[A=b] Y / p(b)). Moderation by prior
 * knowledge (H2b) is reported per `pk` level. Use WCLS in a statistics package for the reported analysis.
 */
export function excursions(decisions, outcome = 'proximal') {
  const rows = decisions.filter((d) => has(d[outcome]) && d.probs && d.policy !== 'fixed-ladder');
  const pairs = [['explain', 'hint'], ['explain', 'worked'], ['worked', 'hint']];
  const contrast = (set, a, b) => {
    const both = set.filter((d) => (d.arms || []).includes(a) && (d.arms || []).includes(b) && d.probs[a] > 0 && d.probs[b] > 0);
    if (!both.length) return { n: 0, effect: null };
    const va = mean(both.map((d) => (d.arm === a ? Number(d[outcome]) / d.probs[a] : 0)));
    const vb = mean(both.map((d) => (d.arm === b ? Number(d[outcome]) / d.probs[b] : 0)));
    return { n: both.length, effect: round(va - vb) };
  };
  const out = { outcome, decisions: rows.length, overall: {}, byPriorKnowledge: {} };
  for (const [a, b] of pairs) out.overall[`${a} vs ${b}`] = contrast(rows, a, b);
  for (const pk of ['low', 'mid', 'high']) {
    const sub = rows.filter((d) => d.pk === pk);
    out.byPriorKnowledge[pk] = Object.fromEntries(pairs.map(([a, b]) => [`${a} vs ${b}`, contrast(sub, a, b)]));
  }
  return out;
}

// ---------------------------------------------------------------- RQ4: off-policy evaluation with fairness

/** The course's fixed guardrail tutor: a hint while hints remain, then a worked example. */
export const fixedLadder = (d) => {
  const arms = d.arms || [];
  const a = arms.includes('hint') ? 'hint' : arms.includes('explain') ? 'explain' : 'worked';
  return Object.fromEntries(arms.map((x) => [x, x === a ? 1 : 0]));
};

/** Outcome model q(x, a): mean outcome by (prior knowledge, arm), shrunk towards the arm mean (k = 5). */
export function fitOutcomeModel(rows, outcome) {
  const all = mean(rows.map((d) => Number(d[outcome]))) ?? 0.5;
  const armMean = {}; const cell = {};
  for (const a of ARMS) {
    const ra = rows.filter((d) => d.arm === a).map((d) => Number(d[outcome]));
    armMean[a] = ra.length ? (ra.reduce((s, y) => s + y, 0) + 5 * all) / (ra.length + 5) : all;
    for (const pk of ['low', 'mid', 'high']) {
      const rc = rows.filter((d) => d.arm === a && d.pk === pk).map((d) => Number(d[outcome]));
      cell[`${pk}|${a}`] = rc.length ? (rc.reduce((s, y) => s + y, 0) + 5 * armMean[a]) / (rc.length + 5) : armMean[a];
    }
  }
  return (d, a) => cell[`${d.pk}|${a}`] ?? armMean[a] ?? all;
}

/** A learned cost-aware policy: in each context, the arm with the best modelled outcome minus lambda * cost. */
export const greedyPolicy = (q, lambda) => (d) => {
  const arms = d.arms || [];
  let best = arms[0]; let bestV = -Infinity;
  for (const a of arms) { const v = q(d, a) - lambda * (COST[a] || 0); if (v > bestV) { bestV = v; best = a; } }
  return Object.fromEntries(arms.map((x) => [x, x === best ? 1 : 0]));
};

/** Doubly robust value of a target policy on logged decisions: mean of sum_a pi(a) q(x,a) + pi(A)/p(A) (Y - q(x,A)). */
export function drValue(rows, policy, q, outcome) {
  if (!rows.length) return null;
  return mean(rows.map((d) => {
    const pi = policy(d);
    const direct = Object.entries(pi).reduce((s, [a, w]) => s + w * q(d, a), 0);
    const p = d.probs[d.arm];
    const correction = p > 0 ? ((pi[d.arm] || 0) / p) * (Number(d[outcome]) - q(d, d.arm)) : 0;
    return direct + correction;
  }));
}

/**
 * RQ4 / H4: doubly robust off-policy values of the fixed tutor and of a learned cost-aware policy, with
 * 95% cluster-bootstrap intervals (resampling learners; the outcome model and the learned policy are refit
 * in every resample). The fairness check follows the plan: for the lowest tertile of prior performance,
 * the lower bound of the difference (learned minus fixed) must not fall below -margin.
 * learners: { learner -> priorPerformance } (from helpSeekingFeatures).
 */
export function policyEvaluation(decisions, learners, { outcome = 'proximal', lambda = 0.05, margin = 0.05, boot = 400, seed = 1 } = {}) {
  const rows = decisions.filter((d) => has(d[outcome]) && d.probs && d.policy !== 'fixed-ladder' && d.probs[d.arm] > 0);
  const prior = Object.entries(learners).filter(([, v]) => has(v)).sort((a, b) => a[1] - b[1]);
  // Lowest tertile: the first third of learners by prior performance (rounded up), at least 3 learners needed.
  const k = prior.length >= 3 ? Math.ceil(prior.length / 3) : 0;
  const lowest = new Set(prior.slice(0, k).map(([id]) => id));
  const cut = k ? prior[k - 1][1] : null;
  const estimate = (set) => {
    const q = fitOutcomeModel(set, outcome);
    const learned = greedyPolicy(q, lambda);
    const v = (sub) => ({ fixed: drValue(sub, fixedLadder, q, outcome), learned: drValue(sub, learned, q, outcome), logged: mean(sub.map((d) => Number(d[outcome]))) });
    return { all: v(set), lowest: v(set.filter((d) => lowest.has(d.learner))) };
  };
  const point = estimate(rows);
  const byLearner = new Map();
  for (const d of rows) { if (!byLearner.has(d.learner)) byLearner.set(d.learner, []); byLearner.get(d.learner).push(d); }
  const ids = [...byLearner.keys()];
  const rng = makeRng(seed);
  const diffs = { all: [], lowest: [] };
  if (ids.length >= 2) {
    for (let b = 0; b < boot; b++) {
      const sample = [];
      for (let i = 0; i < ids.length; i++) sample.push(...byLearner.get(ids[Math.floor(rng() * ids.length)]));
      const e = estimate(sample);
      for (const g of ['all', 'lowest']) if (e[g].fixed !== null && e[g].learned !== null) diffs[g].push(e[g].learned - e[g].fixed);
    }
  }
  const ci = (xs) => {
    if (xs.length < 20) return null;
    const s = [...xs].sort((a, b) => a - b);
    return [round(s[Math.floor(0.025 * s.length)]), round(s[Math.ceil(0.975 * s.length) - 1])];
  };
  const group = (g) => ({
    decisions: g === 'all' ? rows.length : rows.filter((d) => lowest.has(d.learner)).length,
    fixed: round(point[g].fixed), learned: round(point[g].learned), logged: round(point[g].logged),
    difference: point[g].fixed !== null && point[g].learned !== null ? round(point[g].learned - point[g].fixed) : null,
    ci95: ci(diffs[g]),
  });
  const low = group('lowest');
  return {
    outcome, lambda, margin, learners: ids.length, lowestTertileLearners: lowest.size, lowestTertileCut: round(cut),
    all: group('all'), lowestTertile: low,
    nonInferiorForLowest: low.ci95 ? low.ci95[0] >= -margin : null,
  };
}

// ---------------------------------------------------------------- Paper III secondary outcomes

/** Lagged effects: pass rate of the proximal check by (previous help type in the session, this help type). */
export function carryOver(decisions, outcome = 'proximal') {
  const bySession = new Map();
  for (const d of [...decisions].sort((a, b) => a.t - b.t)) {
    const k = `${d.learner}|${d.sessionId}`;
    if (!bySession.has(k)) bySession.set(k, []);
    bySession.get(k).push(d);
  }
  const cells = {};
  for (const list of bySession.values()) {
    for (let i = 1; i < list.length; i++) {
      const d = list[i];
      if (!has(d[outcome])) continue;
      const k = `${list[i - 1].arm} then ${d.arm}`;
      (cells[k] = cells[k] || []).push(Number(d[outcome]));
    }
  }
  return Object.fromEntries(Object.entries(cells).sort().map(([k, v]) => [k, { n: v.length, rate: round(mean(v)) }]));
}

/**
 * Later help requests (a secondary outcome, because learners decide when to ask): for each decision, the
 * number of help requests on other items in the same session in the next 30 minutes, averaged per help type.
 */
export function laterRequests(decisions, windowMs = 30 * 60000) {
  const sorted = [...decisions].sort((a, b) => a.t - b.t);
  const per = Object.fromEntries(ARMS.map((a) => [a, []]));
  sorted.forEach((d, i) => {
    let n = 0;
    for (let j = i + 1; j < sorted.length; j++) {
      const x = sorted[j];
      if (x.t - d.t > windowMs) break;
      if (x.learner === d.learner && x.sessionId === d.sessionId && x.itemId !== d.itemId) n++;
    }
    if (per[d.arm]) per[d.arm].push(n);
  });
  return Object.fromEntries(ARMS.map((a) => [a, { n: per[a].length, meanLaterRequests: round(mean(per[a])) }]));
}

// ---------------------------------------------------------------- overall learning (pre, post, delayed tests)

/**
 * Pre-, post- and delayed post-test scores per condition (Paper III). Means are over learner-unit rows that
 * have the scores involved; the normalised gain (post - pre) / (1 - pre) is averaged over rows with pre < 1.
 */
export function learningGains(rows) {
  const conds = [...new Set(rows.map((r) => r.cond || 'none'))].sort();
  const out = {};
  for (const c of conds) {
    const rs = rows.filter((r) => (r.cond || 'none') === c);
    const pick = (k) => rs.map((r) => r[k]).filter(has).map(Number);
    const paired = rs.filter((r) => has(r.pre) && has(r.post));
    const kept = rs.filter((r) => has(r.post) && has(r.delayed) && Number(r.post) > 0);
    out[c] = {
      learners: new Set(rs.map((r) => r.learner)).size, units: rs.length,
      pre: round(mean(pick('pre'))), post: round(mean(pick('post'))), delayed: round(mean(pick('delayed'))),
      gain: round(mean(paired.map((r) => r.post - r.pre))), pairedUnits: paired.length,
      normalisedGain: round(mean(paired.filter((r) => r.pre < 1).map((r) => (r.post - r.pre) / (1 - r.pre)))),
      kept: round(mean(kept.map((r) => r.delayed / r.post))), keptUnits: kept.length,
    };
  }
  return out;
}

// ---------------------------------------------------------------- report

const f = (x) => (x === null || x === undefined ? 'n/a' : String(x));

export function researchQuestionsMarkdown(rq) {
  const out = ['# Research questions (monitoring report)', '',
    'Descriptive and pipeline-checking numbers for the four research questions. They are not the pre-registered analyses.', ''];
  const hs = rq.helpSeeking;
  out.push('## RQ1: help-seeking patterns and later outcomes', '', `Learners: ${hs.learners}.`, '',
    '| Feature | r with one-week pass rate | r with calibration bias | r with prior performance |', '|---|---|---|---|');
  for (const [k, v] of Object.entries(hs.correlations)) out.push(`| ${k} | ${f(v.weekRate.r)} (n=${v.weekRate.n}) | ${f(v.calibrationBias.r)} (n=${v.calibrationBias.n}) | ${f(v.priorPerformance.r)} |`);
  out.push('', '| Pattern | learners | one-week pass rate | calibration bias | prior performance |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(hs.byPattern)) out.push(`| ${k} | ${v.learners} | ${f(v.weekRate)} | ${f(v.calibrationBias)} | ${f(v.priorPerformance)} |`);
  out.push('', 'H1 expects rapid, repeated requests for the most specific help to go with lower one-week pass rates and positive bias (overconfidence), after controlling for prior performance.', '');

  for (const [label, ex] of [['proximal check', rq.excursions.proximal], ['one-week check', rq.excursions.week]]) {
    out.push(`## RQ2: contrasts between help types (${label})`, '', `Randomised decisions with a known outcome: ${ex.decisions}. Inverse-probability-weighted differences in pass rate.`, '',
      '| Contrast | all | low prior knowledge | mid | high |', '|---|---|---|---|---|');
    for (const k of Object.keys(ex.overall)) {
      const c = (o) => `${f(o.effect)} (n=${o.n})`;
      out.push(`| ${k} | ${c(ex.overall[k])} | ${c(ex.byPriorKnowledge.low[k])} | ${c(ex.byPriorKnowledge.mid[k])} | ${c(ex.byPriorKnowledge.high[k])} |`);
    }
    out.push('');
  }
  out.push('H2a expects explain (hint with self-explanation) to beat hint and worked example one week later. H2b expects worked examples to help low prior knowledge more than high.', '');

  const px = rq.proxy;
  out.push('## RQ3: which short-term signal predicts the unaided one-week check?', '', `Episodes (learner x lesson) with a one-week outcome: ${px.episodes}. Base pass rate: ${f(px.baseRate)}.`, '',
    '| Signal | episodes | AUC for the one-week check |', '|---|---|---|');
  for (const s of px.signals) out.push(`| ${s.label} | ${s.n} | ${f(s.auc)} |`);
  out.push('', 'H3 expects the unaided check after help to predict better (higher AUC) than immediate task success. 0.5 means no better than chance.', '');

  for (const [label, pe] of [['proximal check', rq.policy.proximal], ['one-week check', rq.policy.week]]) {
    out.push(`## RQ4: off-policy evaluation (${label})`, '', `Learners: ${pe.learners}; lowest tertile of prior performance: ${pe.lowestTertileLearners} (prior performance <= ${f(pe.lowestTertileCut)}). Help cost weight ${pe.lambda}; non-inferiority margin ${pe.margin}.`, '',
      '| Group | decisions | logged pass rate | fixed tutor (DR) | learned policy (DR) | difference | 95% CI |', '|---|---|---|---|---|---|---|');
    for (const [g, v] of [['all learners', pe.all], ['lowest tertile', pe.lowestTertile]]) out.push(`| ${g} | ${v.decisions} | ${f(v.logged)} | ${f(v.fixed)} | ${f(v.learned)} | ${f(v.difference)} | ${v.ci95 ? `${v.ci95[0]} to ${v.ci95[1]}` : 'n/a'} |`);
    out.push('', `Non-inferior for the lowest tertile: ${pe.nonInferiorForLowest === null ? 'not enough data' : pe.nonInferiorForLowest ? 'yes' : 'no'}.`, '');
  }

  out.push('## Overall learning: unit pre-, post- and one-week tests', '',
    '| Condition | learners | units | pre | post | one week | gain (paired) | normalised gain | kept after a week |', '|---|---|---|---|---|---|---|---|---|');
  const lg = Object.entries(rq.learningGains || {});
  for (const [c, v] of lg) out.push(`| ${c} | ${v.learners} | ${v.units} | ${f(v.pre)} | ${f(v.post)} | ${f(v.delayed)} | ${f(v.gain)} (n=${v.pairedUnits}) | ${f(v.normalisedGain)} | ${f(v.kept)} (n=${v.keptUnits}) |`);
  if (!lg.length) out.push('| no unit tests yet | | | | | | | | |');
  out.push('');
  out.push('## Paper III secondary outcomes', '', '**Carry-over** (proximal pass rate by previous and current help type in a session):', '');
  const co = Object.entries(rq.carryOver);
  out.push(co.length ? co.map(([k, v]) => `- ${k}: ${f(v.rate)} (n=${v.n})`).join('\n') : '- no sessions with two or more decisions yet', '',
    '**Later help requests** in the same session within 30 minutes, by help type: ' + ARMS.map((a) => `${a} ${f(rq.laterRequests[a].meanLaterRequests)} (n=${rq.laterRequests[a].n})`).join('; '), '');
  return out.join('\n');
}
