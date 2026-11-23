/**
 * The help policy: which kind of help to give, and when.
 *
 * It follows the doctoral research plan "The Cost of Easy Answers" (Hai Nguyen, Aalto University):
 *
 *  - Help is never the answer. The three kinds of help are a hint, a hint the learner then explains
 *    in their own words, and a worked example of a similar problem.
 *  - The kind of help is chosen from the learner's state (prior knowledge of the concept and recent
 *    errors) by a contextual bandit. Its reward is unaided success on the check item that follows
 *    the help, minus a cost for more specific help (worked example 2, hint 1).
 *  - Every option keeps a minimum probability (0.2 by default), and the probabilities are logged with
 *    each decision, so decisions can be analysed like a micro-randomised trial and evaluated off-policy.
 *  - Priors encode theory: worked examples help most when prior knowledge is low (expertise reversal),
 *    and explaining a hint helps later performance.
 *  - A fixed ladder (hint, more specific hint, worked example) is the alternative "guardrail tutor".
 *    Either way every kind of help stays reachable, so no learner gets less support than the fixed tutor.
 */
import { sampleBeta, sampleFrom } from './rng.js';

export const POLICY_VERSION = 'thompson-floor-1';
/** Version of the logged data format (see docs/RESEARCH_DATA.md). Raise it when a field changes meaning. */
export const DATA_VERSION = 2;
export const ARMS = ['hint', 'explain', 'worked'];
export const HELP_COST = { hint: 1, explain: 1, worked: 2 };
export const HELP_NAME = { hint: 'Hint', explain: 'Hint to explain', worked: 'Worked example', walkthrough: 'Walkthrough' };

/** Beta(a, b) starting beliefs about "the learner passes the solo check after this help". */
const PRIORS = {
  low: { hint: [2, 2], explain: [2, 2], worked: [3, 2] },
  mid: { hint: [2, 2], explain: [3, 2], worked: [2, 2] },
  high: { hint: [3, 2], explain: [3, 2], worked: [2, 3] },
};

export const priorKnowledge = (pL) => (pL < 0.35 ? 'low' : pL < 0.7 ? 'mid' : 'high');
export const contextKey = (pk, errors) => `${pk}|${errors >= 2 ? 'many' : 'one'}`;

export function armState(bandit, key) {
  if (!bandit[key]) {
    const prior = PRIORS[key.split('|')[0]] || PRIORS.mid;
    bandit[key] = { hint: [...prior.hint], explain: [...prior.explain], worked: [...prior.worked] };
  }
  return bandit[key];
}

/** Which kinds of help can still be given on this item, within the limits set in Settings. */
export function availableArms(item, lesson, used, allow) {
  const hintsLeft = (item.hints || []).length - used.hints;
  const arms = [];
  if (hintsLeft > 0 && allow.hint) arms.push('hint');
  if (hintsLeft > 0 && allow.explain) arms.push('explain');
  if (lesson.worked && !used.worked && allow.worked) arms.push('worked');
  return arms;
}

const round4 = (x) => Math.round(x * 10000) / 10000;

/**
 * Choose one kind of help. Returns { arm, probs, policy } where probs holds the probability
 * with which each available kind could have been chosen.
 */
export function chooseHelp({ mode, arms, bandit, key, floor = 0.2, costWeight = 0.05, rng, draws = 400 }) {
  if (!arms.length) return null;
  const policy = mode === 'adaptive' ? POLICY_VERSION : 'fixed-ladder';
  if (arms.length === 1) return { arm: arms[0], probs: { [arms[0]]: 1 }, policy };
  if (mode !== 'adaptive') {
    const arm = arms.includes('hint') ? 'hint' : arms.includes('explain') ? 'explain' : 'worked';
    return { arm, probs: Object.fromEntries(arms.map((a) => [a, a === arm ? 1 : 0])), policy };
  }
  const st = armState(bandit, key);
  const wins = Object.fromEntries(arms.map((a) => [a, 0]));
  for (let i = 0; i < draws; i++) {
    let best = arms[0];
    let bestValue = -Infinity;
    for (const a of arms) {
      const value = sampleBeta(rng, st[a][0], st[a][1]) - costWeight * HELP_COST[a];
      if (value > bestValue) { bestValue = value; best = a; }
    }
    wins[best]++;
  }
  const k = arms.length;
  const f = Math.max(0, Math.min(floor, 1 / k));
  const probs = {};
  for (const a of arms) probs[a] = round4(f + (1 - f * k) * (wins[a] / draws));
  // The posterior beliefs and the uniform draw are returned so each decision can be audited and replayed.
  const posterior = Object.fromEntries(arms.map((a) => [a, [round4(st[a][0]), round4(st[a][1])]]));
  const u = round4(rng());
  return { arm: sampleFrom(rng, probs, u), probs, policy, posterior, u };
}

/** Learn from an outcome: reward is 1 (passed the unaided check) or 0. */
export function updateBandit(bandit, key, arm, reward, weight = 1) {
  const st = armState(bandit, key);
  st[arm][0] += reward * weight;
  st[arm][1] += (1 - reward) * weight;
}

/**
 * Help-seeking check (research question 1): rapid, repeated requests for the most specific help
 * go with weaker later performance. When that pattern shows, the app suggests another look first.
 * recent: summaries of the last few items, newest last: [{ helps: n }].
 */
export function helpSeekingFlags(recent, { msSinceFeedback, helpsOnItem }) {
  const last = recent.slice(-5);
  const helped = last.filter((r) => r.helps > 0).length;
  const rapidNow = msSinceFeedback < 8000;
  return {
    rapid: rapidNow && (helpsOnItem >= 1 || helped >= 3),
    heavy: last.length >= 5 && helped >= 4,
  };
}

/** Plain-language reason for a help choice, shown to the learner (transparency). */
export function explainChoice(decision) {
  if (decision.policy === 'fixed-ladder') {
    return 'Help comes in a fixed order here: a hint, then a more specific hint, then a worked example.';
  }
  if (decision.arms.length === 1) return 'This was the only kind of help left for this question.';
  const lead = {
    low: 'This idea is still new for you, so Nova leans towards showing how a similar problem is solved.',
    mid: 'You know part of this idea, so Nova leans towards a hint that you put into your own words.',
    high: 'You know this idea quite well, so Nova leans towards a short hint and leaves the rest to you.',
  }[decision.pk];
  return `${lead} Nova also tries the other kinds of help now and then, to learn which one works best for you.`;
}

/** Per kind of help: how often it was used and how often the solo check after it was passed. */
export function helpOutcomes(decisions) {
  const out = {};
  for (const arm of ARMS) out[arm] = { used: 0, checked: 0, passed: 0, weekChecked: 0, weekPassed: 0 };
  for (const d of decisions) {
    const o = out[d.arm];
    if (!o) continue;
    o.used++;
    if (d.proximal !== null && d.proximal !== undefined) { o.checked++; o.passed += d.proximal; }
    if (d.week !== null && d.week !== undefined) { o.weekChecked++; o.weekPassed += d.week; }
  }
  return out;
}
