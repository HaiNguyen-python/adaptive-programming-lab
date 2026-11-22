/**
 * Small seeded random number tools. A seed makes the adaptive engine reproducible in tests,
 * and lets a logged help decision be replayed exactly.
 */

/** mulberry32: returns a function that gives numbers in [0, 1). */
export function makeRng(seed) {
  let a = (seed >>> 0) || 0x9e3779b9;
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const randomSeed = () => (Math.random() * 4294967296) >>> 0;

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function shuffle(rng, list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Shuffle, but never return the original order when another order exists. */
export function shuffleChanged(rng, list) {
  if (list.length < 2 || new Set(list).size < 2) return [...list];
  for (let tries = 0; tries < 12; tries++) {
    const s = shuffle(rng, list);
    if (s.some((x, i) => x !== list[i])) return s;
  }
  return [...list.slice(1), list[0]];
}

function normal(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

/** Gamma(shape, 1) by Marsaglia and Tsang. */
function gamma(rng, shape) {
  if (shape < 1) {
    let u = 0;
    while (u === 0) u = rng();
    return gamma(rng, shape + 1) * Math.pow(u, 1 / shape);
  }
  const d = shape - 1 / 3;
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x;
    let v;
    do { x = normal(rng); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = rng();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** One draw from a Beta(a, b) distribution. */
export function sampleBeta(rng, a, b) {
  const x = gamma(rng, a);
  const y = gamma(rng, b);
  return x / (x + y);
}

/** Pick a key of probs ({ key: probability }) in proportion to its probability. */
export function sampleFrom(rng, probs) {
  const keys = Object.keys(probs);
  let r = rng();
  for (const k of keys) {
    r -= probs[k];
    if (r < 0) return k;
  }
  return keys[keys.length - 1];
}
