/**
 * Calibration: does the learner's confidence match their results?
 *
 * As in the research plan, confidence is rated immediately before an unaided item, and calibration is
 * confidence minus the actual result. Overconfident learners stop practising too early, so the app
 * shows this gap back to the learner.
 */

export const CONF_LEVELS = [
  { level: 1, label: 'No idea', face: 'lost' },
  { level: 2, label: 'Unsure', face: 'unsure' },
  { level: 3, label: 'Maybe', face: 'maybe' },
  { level: 4, label: 'Pretty sure', face: 'sure' },
  { level: 5, label: 'Certain', face: 'certain' },
];

/** Map a 1 to 5 rating to a probability of being right. */
export const confProb = (level) => (level - 1) / 4;

/**
 * checks: [{ conf: 1..5 or null, ok: boolean }]
 * Returns counts, mean confidence, accuracy, bias (positive = overconfident), mean absolute error,
 * a row per confidence level, and a verdict: 'early' (too little data), 'over', 'under' or 'good'.
 */
export function calibration(checks) {
  const rated = checks.filter((c) => c.conf);
  const n = rated.length;
  const byLevel = CONF_LEVELS.map((l) => {
    const rows = rated.filter((c) => c.conf === l.level);
    const right = rows.filter((c) => c.ok).length;
    return { level: l.level, label: l.label, n: rows.length, acc: rows.length ? right / rows.length : null, expected: confProb(l.level) };
  });
  if (!n) return { n: 0, meanConf: null, accuracy: null, bias: null, absError: null, byLevel, verdict: 'early' };
  const meanConf = rated.reduce((s, c) => s + confProb(c.conf), 0) / n;
  const accuracy = rated.filter((c) => c.ok).length / n;
  const absError = rated.reduce((s, c) => s + Math.abs(confProb(c.conf) - (c.ok ? 1 : 0)), 0) / n;
  const bias = meanConf - accuracy;
  const verdict = n < 5 ? 'early' : bias > 0.12 ? 'over' : bias < -0.12 ? 'under' : 'good';
  return { n, meanConf, accuracy, bias, absError, byLevel, verdict };
}

/** All rated checks of a learner, oldest first. */
export function allChecks(state) {
  return Object.values(state.concepts)
    .flatMap((c) => c.checks || [])
    .sort((a, b) => a.t - b.t);
}

/** One-line feedback after a single check. */
export function checkFeedback(conf, ok) {
  if (!conf) return '';
  const p = confProb(conf);
  if (ok && p >= 0.75) return 'You felt sure, and you were right. Good judgement.';
  if (ok && p <= 0.25) return 'You know more than you thought. Trust yourself a little more here.';
  if (!ok && p >= 0.75) return 'You felt sure, but this one slipped. Nova will bring it back soon.';
  if (!ok && p <= 0.25) return 'You saw this coming. Knowing what you do not know yet is a skill too.';
  return ok ? 'Your "maybe" turned into a yes.' : 'It was a "maybe", and this time it was a miss.';
}
