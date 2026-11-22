/**
 * Drawings made for PhD Programming Lab: Kip the spark (the mascot), confidence faces, badges and scenery.
 * Everything is inline SVG text, so it scales cleanly and needs no image files.
 */
import { iconSvg } from './icons.js';

let serial = 0;
const r1 = (n) => Math.round(n * 10) / 10;

/** A four-point spark shape: points at radius R, waist at radius r. */
function sparkPath(cx, cy, R, r, rot = 0) {
  let d = '';
  for (let i = 0; i < 4; i++) {
    const a0 = rot + (i * Math.PI) / 2 - Math.PI / 2;
    const a1 = a0 + Math.PI / 4;
    const a2 = a0 + Math.PI / 2;
    const p0 = `${r1(cx + R * Math.cos(a0))} ${r1(cy + R * Math.sin(a0))}`;
    const c = `${r1(cx + r * Math.cos(a1))} ${r1(cy + r * Math.sin(a1))}`;
    const p1 = `${r1(cx + R * Math.cos(a2))} ${r1(cy + R * Math.sin(a2))}`;
    d += `${i === 0 ? `M${p0}` : ''}Q${c} ${p1}`;
  }
  return `${d}Z`;
}

export const KIP_COLORS = {
  ember: { name: 'Ember', hi: '#fff3c4', mid: '#ffc24b', edge: '#ff8a3d', ray: '#f0701f' },
  flame: { name: 'Sunny', hi: '#fffbe0', mid: '#ffe38a', edge: '#ffc24b', ray: '#e9a21a' },
  aurora: { name: 'Aurora', hi: '#eafff6', mid: '#93f0cd', edge: '#45d3a0', ray: '#27a87c' },
  sky: { name: 'Sky', hi: '#eaf8ff', mid: '#a3dcfb', edge: '#56b7ef', ray: '#2a8fcb' },
  lingon: { name: 'Berry', hi: '#fff0f3', mid: '#fbb0c0', edge: '#f2698a', ray: '#cf3f62' },
};

const INK = '#3a1a05';
const line = (d, w = 3) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const eye = (x, y, dx = 0, dy = 0) => `<ellipse cx="${x}" cy="${y}" rx="4.4" ry="5.6" fill="${INK}"/><circle cx="${x + 1.4 + dx}" cy="${y - 2 + dy}" r="1.6" fill="#fff"/>`;
const arc = (x, y) => line(`M${x - 5} ${y + 1}q5 -7 10 0`);
const CHEEKS = '<circle cx="42" cy="69" r="5" fill="#f0577a" opacity=".3"/><circle cx="78" cy="69" r="5" fill="#f0577a" opacity=".3"/>';
const SMILE = line('M52 70q8 7 16 0');
const OPEN = `<path d="M51 69q9 13 18 0z" fill="#7a2a10"/>${`<path d="M55.5 75.5q4.5 3 9 0" fill="none" stroke="#f58ba3" stroke-width="3" stroke-linecap="round"/>`}`;

function face(mood) {
  switch (mood) {
    case 'cheer': return arc(49, 58) + arc(71, 58) + CHEEKS + OPEN;
    case 'proud': return arc(49, 58) + arc(71, 58) + CHEEKS + SMILE;
    case 'think': return eye(49, 57, 0.8, -1) + eye(71, 57, 0.8, -1) + line('M65 47l10 -3', 2.6) + line('M55 73h10');
    case 'oops': return eye(49, 59) + eye(71, 59) + line('M43 50l9 -3M77 50l-9 -3', 2.6) + CHEEKS + line('M54 72q6 4 12 0');
    case 'wow': return eye(49, 57) + eye(71, 57) + CHEEKS + '<ellipse cx="60" cy="73" rx="4.5" ry="5.5" fill="#7a2a10"/>';
    case 'wink': return eye(49, 58) + arc(71, 59) + CHEEKS + SMILE;
    case 'sleep': return line('M44 59h10M66 59h10') + CHEEKS + '<ellipse cx="60" cy="72" rx="3" ry="3.5" fill="#7a2a10"/>';
    default: return eye(49, 58) + eye(71, 58) + CHEEKS + SMILE;
  }
}

/**
 * Kip as SVG text. mood: happy, cheer, proud, think, oops, wow, wink, sleep.
 * color: a key of KIP_COLORS.
 */
export function kipSvg(mood = 'happy', color = 'ember', cls = 'kip') {
  const c = KIP_COLORS[color] || KIP_COLORS.ember;
  const id = `kip${serial++}`;
  const arms = mood === 'cheer'
    ? `<path d="M33 54q-12 -8 -9 -22M87 54q12 -8 9 -22" fill="none" stroke="${c.edge}" stroke-width="7" stroke-linecap="round"/>`
    : '';
  const extra = mood === 'sleep' ? `<path d="M88 26h9l-9 10h9M100 12h6l-6 7h6" fill="none" stroke="${c.ray}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>` : '';
  return `<svg class="${cls}" viewBox="0 0 120 120" role="img" aria-label="Kip the spark">`
    + `<defs><radialGradient id="${id}" cx="42%" cy="34%" r="75%"><stop offset="0" stop-color="${c.hi}"/><stop offset=".55" stop-color="${c.mid}"/><stop offset="1" stop-color="${c.edge}"/></radialGradient></defs>`
    + `<path d="${sparkPath(60, 62, 57, 19)}" fill="${c.ray}"/>`
    + `<path d="${sparkPath(60, 62, 42, 24, Math.PI / 4)}" fill="${c.edge}"/>`
    + arms
    + `<circle cx="60" cy="62" r="31" fill="url(#${id})"/>`
    + face(mood) + extra
    + '</svg>';
}

function el(svg) {
  const t = document.createElement('template');
  t.innerHTML = svg;
  return t.content.firstChild;
}

export const kip = (mood, color, cls) => el(kipSvg(mood, color, cls));

/** The brand mark: a spark between code brackets. */
export function logoSvg() {
  return '<svg viewBox="0 0 48 48" aria-hidden="true">'
    + '<rect width="48" height="48" rx="13" fill="#0b2126"/>'
    + `<path d="${sparkPath(24, 24, 15, 5)}" fill="#ff8a3d"/>`
    + `<path d="${sparkPath(24, 24, 10.5, 6, Math.PI / 4)}" fill="#ffc24b"/>`
    + '<circle cx="24" cy="24" r="5.2" fill="#fff3c4"/>'
    + '<path d="M11 15l-5 9 5 9M37 15l5 9-5 9" fill="none" stroke="#5fe3b3" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
    + '</svg>';
}

const FACE_FILL = ['#8fb8c9', '#9fd6d0', '#ffe08a', '#ffc24b', '#ff8a3d'];
const FACE_INK = '#17333a';
const fl = (d) => `<path d="${d}" fill="none" stroke="${FACE_INK}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`;
const FACE_MOUTH = [
  fl('M12.5 27.5q2.5 -3 5 0t5 0t5 0'),
  fl('M14 28l12 -2.5'),
  fl('M14 27h12'),
  fl('M13 25q7 6 14 0'),
  `<path d="M12 23.5q8 11 16 0z" fill="${FACE_INK}"/>`,
];
const FACE_BROW = [fl('M11 12l5 -2M29 12l-5 -2'), fl('M11 12l5 -1'), '', '', fl('M11 11.5q2.5 -2.5 5 0M24 11.5q2.5 -2.5 5 0')];

/** A face for a confidence level from 1 (no idea) to 5 (certain). */
export function confFaceSvg(level) {
  const i = Math.max(1, Math.min(5, level)) - 1;
  return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="${FACE_FILL[i]}"/>`
    + `<circle cx="14" cy="17.5" r="2.3" fill="${FACE_INK}"/><circle cx="26" cy="17.5" r="2.3" fill="${FACE_INK}"/>`
    + FACE_BROW[i] + FACE_MOUTH[i] + '</svg>';
}

/** A round badge with an icon in the middle. */
export function medalSvg(iconName) {
  const id = `medal${serial++}`;
  return `<svg class="medal" viewBox="0 0 64 64" aria-hidden="true">`
    + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe38a"/><stop offset="1" stop-color="#ff8a3d"/></linearGradient></defs>`
    + `<path d="${sparkPath(32, 32, 32, 22)}" fill="#f0701f"/>`
    + `<path d="${sparkPath(32, 32, 30, 23, Math.PI / 4)}" fill="#ffc24b"/>`
    + `<circle cx="32" cy="32" r="21" fill="url(#${id})"/><circle cx="32" cy="32" r="21" fill="none" stroke="#fff3c4" stroke-width="2" opacity=".7"/>`
    + `<svg x="19" y="19" width="26" height="26" viewBox="0 0 24 24" style="color:#3a1a05">${iconSvg(iconName).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`
    + '</svg>';
}

/** A spruce tree for the trail scenery. Colours follow the theme. */
export function treeSvg(size = 60, tone = 1) {
  const fill = tone === 1 ? 'var(--tree)' : 'var(--tree-2)';
  return `<svg viewBox="0 0 40 60" width="${size * 0.67}" height="${size}" aria-hidden="true">`
    + `<path d="M20 2l11 17h-6l9 15h-7l10 16H3l10-16H6l9-15H9z" fill="${fill}"/><rect x="17.5" y="50" width="5" height="9" rx="1.5" fill="${fill}"/></svg>`;
}

/** The camp at the start of each unit: a tent and a fire that burns once the unit is under way. */
export function campSvg(lit) {
  const fire = lit
    ? '<path d="M44 37c1.5 3 5 4.6 5 8.6a5 5 0 0 1-10 0c0-1.8.8-3.2 1.8-4.2.2 1.2.7 2 1.4 2.3-.1-2.4.2-4.5 1.8-6.7z" fill="#ff8a3d"/><path d="M44 43.5c.8 1.3 2.2 2 2.2 3.6a2.2 2.2 0 0 1-4.4 0c0-1.3 1.1-2.2 2.2-3.6z" fill="#ffc24b"/>'
    : '<path d="M44 45v-3M42 46l-1.5 -2M46 46l1.5 -2" stroke="var(--text-3)" stroke-width="1.6" stroke-linecap="round"/>';
  return '<svg class="camp-art" viewBox="0 0 56 56" aria-hidden="true">'
    + '<ellipse cx="28" cy="50" rx="24" ry="4" fill="var(--surface-2)"/>'
    + '<path d="M6 48L21 16l15 32z" fill="#ff8a3d"/><path d="M21 16l15 32H24z" fill="#d9631a"/>'
    + '<path d="M21 30l5 18h-9z" fill="#3a1a05" opacity=".75"/><path d="M21 16V9" stroke="var(--text-2)" stroke-width="2" stroke-linecap="round"/><path d="M21 9l7 2.5-7 2.5z" fill="#5fe3b3"/>'
    + '<path d="M38 50l12-3M38 47l12 3" stroke="#8a5a2b" stroke-width="3" stroke-linecap="round"/>'
    + fire + '</svg>';
}

/** A lantern, lit or dark. Used on the memory-check card. */
export function lanternSvg(lit = true, cls = 'art') {
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">`
    + '<path d="M17 8a7 7 0 0 1 14 0" fill="none" stroke="var(--text-2)" stroke-width="2.4" stroke-linecap="round"/>'
    + '<rect x="16" y="8" width="16" height="5" rx="2" fill="#8a5a2b"/>'
    + `<rect x="13" y="13" width="22" height="24" rx="6" fill="${lit ? '#ffe9a8' : 'var(--surface-2)'}" stroke="#8a5a2b" stroke-width="2.4"/>`
    + (lit ? '<path d="M24 18c2 2.8 5 4.6 5 8.4a5 5 0 0 1-10 0c0-1.7.8-3.1 1.8-4.1.2 1.2.8 1.9 1.5 2.2-.1-2.3.2-4.3 1.7-6.5z" fill="#ff8a3d"/><path d="M24 25c.9 1.3 2.2 2 2.2 3.6a2.2 2.2 0 0 1-4.4 0c0-1.3 1.2-2.2 2.2-3.6z" fill="#ffc24b"/>' : '')
    + '<rect x="15" y="37" width="18" height="5" rx="2" fill="#8a5a2b"/></svg>';
}

export const svgEl = el;
