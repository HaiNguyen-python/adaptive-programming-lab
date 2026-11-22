#!/usr/bin/env node
/**
 * Simulate synthetic learners to see how the adaptive help policy behaves under assumed effects,
 * for example when planning sample sizes. Uses the app's own policy code.
 *
 *   node tools/simulate.mjs [--learners 60] [--decisions 40] [--effect 0.15] [--seed 1] [--floor 0.2]
 *
 * Assumption (expertise reversal, edit TRUTH to try others): the chance of passing the next solo check
 * after help depends on prior knowledge. With low prior knowledge a worked example is best, with high
 * prior knowledge a hint is best. `effect` is the gap between the best and the other kinds of help.
 * Both arms (adaptive and fixed ladder) see the same learners.
 */
import { makeRng } from '../js/engine/rng.js';
import { chooseHelp, updateBandit, contextKey, ARMS } from '../js/engine/help-policy.js';

const arg = (name, dflt) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? Number(process.argv[i + 1]) : dflt; };
const N = arg('learners', 60);
const K = arg('decisions', 40);
const EFFECT = arg('effect', 0.15);
const SEED = arg('seed', 1);
const FLOOR = arg('floor', 0.2);
const BASE = 0.55;

const TRUTH = {
  low: { hint: BASE, explain: BASE, worked: BASE + EFFECT },
  mid: { hint: BASE, explain: BASE + EFFECT, worked: BASE },
  high: { hint: BASE + EFFECT, explain: BASE, worked: BASE },
};
const PKS = ['low', 'mid', 'high'];

function run(mode, rng) {
  const bandit = {};
  let wins = 0;
  let minProb = 1;
  const share = { hint: 0, explain: 0, worked: 0 };
  for (let i = 0; i < K; i++) {
    const pk = PKS[Math.floor(rng() * 3)];
    const key = contextKey(pk, rng() < 0.5 ? 1 : 2);
    const c = chooseHelp({ mode, arms: [...ARMS], bandit, key, floor: FLOOR, costWeight: 0.05, rng });
    for (const a of ARMS) if (mode === 'adaptive') minProb = Math.min(minProb, c.probs[a]);
    share[c.arm]++;
    const ok = rng() < TRUTH[pk][c.arm] ? 1 : 0;
    wins += ok;
    updateBandit(bandit, key, c.arm, ok, 1);
  }
  return { rate: wins / K, minProb, share };
}

const rng = makeRng(SEED);
const res = { adaptive: [], fixed: [] };
for (let n = 0; n < N; n++) {
  for (const mode of ['adaptive', 'fixed']) res[mode].push(run(mode, rng));
}
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
const sd = (xs) => { const m = mean(xs); return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };
console.log(`Simulated ${N} learners x ${K} help decisions, effect ${EFFECT}, floor ${FLOOR}, seed ${SEED}\n`);
for (const mode of ['adaptive', 'fixed']) {
  const r = res[mode].map((x) => x.rate);
  const shares = ARMS.map((a) => `${a} ${(mean(res[mode].map((x) => x.share[a])) / K).toFixed(2)}`).join(', ');
  console.log(`${mode.padEnd(9)} pass rate on the next solo check: ${mean(r).toFixed(3)} (SD between learners ${sd(r).toFixed(3)}); share of help: ${shares}`);
}
const diff = res.adaptive.map((x, i) => x.rate - res.fixed[i].rate);
const se = sd(diff) / Math.sqrt(N);
console.log(`\nAdaptive minus fixed: ${mean(diff).toFixed(3)} (SE ${se.toFixed(3)}, paired learners)`);
console.log(`Smallest probability of any kind of help in adaptive mode: ${Math.min(...res.adaptive.map((x) => x.minProb)).toFixed(3)} (floor ${FLOOR})`);
