/**
 * Drawings made for Adaptive Programming Lab: Nova's mark, confidence scale, badges and the brand mark.
 * Flat geometric shapes in a few solid colours: clear at any size, inline SVG, no image files.
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

/** Colours a learner can pick for Nova. `edge` is the main colour; `hi` a pale tint for backgrounds. */
export const NOVA_COLORS = {
  ember: { name: 'Coral', hi: '#fde9df', mid: '#f48a5c', edge: '#e5602c', ray: '#b8461b' },
  flame: { name: 'Amber', hi: '#fbf0d2', mid: '#efbd3f', edge: '#d79b00', ray: '#a87700' },
  aurora: { name: 'Teal', hi: '#d9f2ec', mid: '#3fbfa1', edge: '#0f957c', ray: '#0a6e5b' },
  sky: { name: 'Cobalt', hi: '#e1e9fd', mid: '#6b93f2', edge: '#2f63e0', ray: '#1f47aa' },
  lingon: { name: 'Rose', hi: '#fbe2e8', mid: '#ec7d97', edge: '#d1436a', ray: '#a12e4f' },
};

/**
 * Nova's mark as SVG text: a spark on a soft tile. The mood changes the shape a little, never a cartoon face.
 * mood: happy, cheer, proud, think, oops, wow, wink, sleep. color: a key of NOVA_COLORS.
 */
export function novaSvg(mood = 'happy', color = 'ember', cls = 'nova') {
  const c = NOVA_COLORS[color] || NOVA_COLORS.ember;
  let mark;
  switch (mood) {
    case 'cheer':
    case 'proud':
    case 'wow':
      mark = `<path d="${sparkPath(60, 60, mood === 'wow' ? 40 : 34, 9)}" fill="${c.edge}"/>`
        + [0, 1, 2, 3].map((i) => {
          const a = Math.PI / 4 + (i * Math.PI) / 2;
          return `<circle cx="${r1(60 + 38 * Math.cos(a))}" cy="${r1(60 + 38 * Math.sin(a))}" r="4.5" fill="${c.mid}"/>`;
        }).join('');
      break;
    case 'think':
      mark = `<path d="${sparkPath(60, 56, 30, 9)}" fill="none" stroke="${c.edge}" stroke-width="6" stroke-linejoin="round"/>`
        + `<circle cx="47" cy="96" r="4" fill="${c.mid}"/><circle cx="60" cy="96" r="4" fill="${c.mid}"/><circle cx="73" cy="96" r="4" fill="${c.mid}"/>`;
      break;
    case 'oops':
      mark = `<path d="${sparkPath(60, 60, 32, 10, 0.26)}" fill="${c.mid}"/>`;
      break;
    case 'sleep':
      mark = `<path d="${sparkPath(60, 60, 30, 9)}" fill="${c.edge}" opacity=".45"/>`;
      break;
    default:
      mark = `<path d="${sparkPath(60, 60, 36, 9)}" fill="${c.edge}"/><circle cx="60" cy="60" r="7" fill="${c.hi}"/>`;
  }
  return `<svg class="${cls}" viewBox="0 0 120 120" role="img" aria-label="Nova">`
    + `<rect x="4" y="4" width="112" height="112" rx="32" fill="${c.hi}"/>${mark}</svg>`;
}

function el(svg) {
  const t = document.createElement('template');
  t.innerHTML = svg;
  return t.content.firstChild;
}

export const nova = (mood, color, cls) => el(novaSvg(mood, color, cls));

/** The brand mark: a prompt chevron and a spark, the moment a program runs. */
export function logoSvg() {
  return '<svg viewBox="0 0 48 48" aria-hidden="true">'
    + '<rect width="48" height="48" rx="12" fill="currentColor"/>'
    + '<path d="M12 16l8 8-8 8" fill="none" stroke="var(--logo-ink, #fff)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>'
    + `<path d="${sparkPath(32, 30, 9, 2.6)}" fill="#f2a516"/>`
    + '</svg>';
}

/** A confidence level from 1 (no idea) to 5 (certain), drawn as a five-step meter. */
export function confFaceSvg(level) {
  const n = Math.max(1, Math.min(5, level));
  let bars = '';
  for (let i = 0; i < 5; i++) {
    const hgt = 8 + i * 5;
    bars += `<rect x="${4 + i * 7}" y="${34 - hgt}" width="5" height="${hgt}" rx="1.5" fill="${i < n ? 'currentColor' : 'var(--line, #ccd)'}"/>`;
  }
  return `<svg viewBox="0 0 40 40" aria-hidden="true">${bars}</svg>`;
}

/** A badge: an icon in a hexagon. Earned badges are coloured by CSS. */
export function medalSvg(iconName) {
  const id = `medal${serial++}`;
  return `<svg class="medal" viewBox="0 0 64 64" aria-hidden="true">`
    + `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--medal-a, #f6b73c)"/><stop offset="1" stop-color="var(--medal-b, #e5602c)"/></linearGradient></defs>`
    + `<path d="M32 3l25 14.5v29L32 61 7 46.5v-29z" fill="url(#${id})"/>`
    + '<path d="M32 9l20 11.6v22.8L32 55 12 43.4V20.6z" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/>'
    + `<svg x="20" y="20" width="24" height="24" viewBox="0 0 24 24" style="color:#fff">${iconSvg(iconName).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`
    + '</svg>';
}

export const svgEl = el;

/** The memory-check mark: a clock-arrow on a soft violet tile. */
export function lanternSvg(lit = true, cls = 'art') {
  return `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true">`
    + `<rect width="48" height="48" rx="13" fill="${lit ? 'var(--memory-soft, #ebe6fb)' : 'var(--surface-2)'}"/>`
    + `<g fill="none" stroke="${lit ? 'var(--grape, #6b4fd8)' : 'var(--text-3)'}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">`
    + '<path d="M13.5 24a10.5 10.5 0 1 0 3.1-7.4"/><path d="M15.5 11.5v5.6h5.6"/><path d="M24 18.5V24l3.8 2.6"/></g></svg>';
}
