/** Line icons drawn for PhD Programming Lab (24 x 24, stroke = current colour). */

const S = (d) => `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${d}</g>`;
const P = (d) => `<path d="${d}"/>`;
const F = (d) => `<path fill="currentColor" d="${d}"/>`;

const ICONS = {
  trail: S(P('M6 21c0-4 7-3 7-7s-6-3-6-6 2-3 4-3') + P('M15 3v7') + P('M15 3.5l5 2-5 2')),
  memory: S(P('M4 12a8 8 0 1 0 2.6-5.9') + P('M4 4v4h4') + P('M12 8v4l3 2')),
  code: S(P('M8 7l-5 5 5 5') + P('M16 7l5 5-5 5') + P('M13.5 5l-3 14')),
  user: S('<circle cx="12" cy="8" r="4"/>' + P('M4 21a8 8 0 0 1 16 0')),
  users: S('<circle cx="9" cy="8" r="3.5"/>' + P('M2.5 20a6.5 6.5 0 0 1 13 0') + P('M16 4.6a3.5 3.5 0 0 1 0 6.8') + P('M18 14.3a6.5 6.5 0 0 1 3.5 5.7')),
  settings: S(P('M4 6h9') + P('M19 6h1') + P('M4 12h3') + P('M13 12h7') + P('M4 18h11') + '<circle cx="16" cy="6" r="2.5"/><circle cx="10" cy="12" r="2.5"/><circle cx="18" cy="18" r="2.5"/>'),
  flame: F('M12.4 2.2c.5 3.3 5.4 5.6 5.4 11.2a5.8 5.8 0 0 1-11.6 0c0-2.3 1-4 2.3-5.3.2 1.7.9 2.8 1.9 3.2.2-3.5-.3-6.5 2-9.1z'),
  bolt: F('M13.5 2 4.5 13.5h6l-1 8.5 9-11.5h-6z'),
  star: F('M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6.1L12 16.9 6.6 19.8l1.1-6.1L3.2 9.4l6.1-.8z'),
  lock: S('<rect x="5.5" y="11" width="13" height="9.5" rx="2.5"/>' + P('M8.5 11V8a3.5 3.5 0 0 1 7 0v3')),
  check: S(P('M5 12.5l4.5 4.5L19 7.5')),
  x: S(P('M6 6l12 12') + P('M18 6L6 18')),
  bulb: S(P('M9 18h6') + P('M10 21h4') + P('M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z')),
  book: S(P('M12 6.5C10 5 7.5 4.5 4 4.5v14c3.5 0 6 .5 8 2 2-1.5 4.5-2 8-2v-14c-3.5 0-6 .5-8 2z') + P('M12 6.5v14')),
  pencil: S(P('M4 20l1-4.2L16.3 4.5a2.2 2.2 0 0 1 3.2 3.2L8.2 19z') + P('M14.2 6.6l3.2 3.2')),
  play: F('M8 4.8v14.4a1 1 0 0 0 1.5.9l11-7.2a1 1 0 0 0 0-1.8l-11-7.2a1 1 0 0 0-1.5.9z'),
  reset: S(P('M4 12a8 8 0 1 0 2.6-5.9') + P('M4 4v4h4')),
  down: S(P('M6 9l6 6 6-6')),
  up: S(P('M6 15l6-6 6 6')),
  right: S(P('M9 6l6 6-6 6')),
  left: S(P('M15 6l-6 6 6 6')),
  arrowUp: S(P('M12 19V5') + P('M6 11l6-6 6 6')),
  arrowDown: S(P('M12 5v14') + P('M6 13l6 6 6-6')),
  trophy: S(P('M8 4h8v5a4 4 0 0 1-8 0z') + P('M8 6H5a3 3 0 0 0 3 4') + P('M16 6h3a3 3 0 0 1-3 4') + P('M12 13v4') + P('M8.5 20.5h7') + P('M10 17h4')),
  clock: S('<circle cx="12" cy="12" r="9"/>' + P('M12 7v5l3 2')),
  target: S('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>'),
  chart: S(P('M4 20V4') + P('M4 20h16') + P('M8 16v-4') + P('M12 16V8') + P('M16 16v-6')),
  download: S(P('M12 4v10') + P('M7 10l5 5 5-5') + P('M5 20h14')),
  trash: S(P('M4 7h16') + P('M9 7V4h6v3') + P('M6 7l1 13h10l1-13') + P('M10 11v6') + P('M14 11v6')),
  volume: S(P('M4 10v4h3l5 4V6L7 10z') + P('M16 9a4 4 0 0 1 0 6') + P('M18.5 6.5a8 8 0 0 1 0 11')),
  moon: S(P('M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z')),
  sun: S('<circle cx="12" cy="12" r="4"/>' + P('M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4')),
  info: S('<circle cx="12" cy="12" r="9"/>' + P('M12 11v6') + P('M12 7.5v.5')),
  plus: S(P('M12 5v14') + P('M5 12h14')),
  eye: S(P('M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z') + '<circle cx="12" cy="12" r="3"/>'),
  skip: S(P('M5 5l9 7-9 7z') + P('M18 5v14')),
  shield: S(P('M12 3l7 3v5c0 5-3.5 8.5-7 10-3.5-1.5-7-5-7-10V6z')),
  scale: S(P('M12 4v16') + P('M7 20h10') + P('M5 8h14') + P('M5 8l-2.5 6a3 3 0 0 0 5 0z') + P('M19 8l-2.5 6a3 3 0 0 0 5 0z')),
  wrench: S(P('M15 5.5a4.5 4.5 0 0 0-5.6 5.6L4 16.5a2 2 0 1 0 3.5 3.5l5.4-5.4A4.5 4.5 0 0 0 18.5 9l-2.8 2.8-2.6-.9-.9-2.6z')),
  paths: S(P('M5 21c0-6 6-6 6-12V3') + P('M13 21c0-4 6-4 6-10V3')),
  bounce: S(P('M3 17l5-5 4 4 8-9') + P('M15 7h5v5')),
  solo: S('<circle cx="10" cy="8" r="4"/>' + P('M2 21a8 8 0 0 1 12.5-6.6') + P('M15 18l2.5 2.5L22 16')),
  calendar: S('<rect x="4" y="5.5" width="16" height="15" rx="2.5"/>' + P('M4 10h16') + P('M8 3v4') + P('M16 3v4')),
  printer: S(P('M7 8V4h10v4') + P('M7 17H5a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2') + '<rect x="7" y="14" width="10" height="6.5" rx="1"/>'),
  award: S('<circle cx="12" cy="9" r="5.5"/>' + P('M8.6 13.5L7 21l5-3 5 3-1.6-7.5')),
  table: S('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/>' + P('M3.5 10h17') + P('M9.5 10v9') + P('M15 10v9')),
  layout: S('<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/>' + P('M3.5 9.5h17') + P('M9.5 9.5v10')),
  steps: S(P('M4 19h4v-4h4v-4h4V7h4')),
  heart: S(P('M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z')),
  spark: F('M12 2.5c.7 5 4.5 8.8 9.5 9.5-5 .7-8.8 4.5-9.5 9.5-.7-5-4.5-8.8-9.5-9.5 5-.7 8.8-4.5 9.5-9.5z'),
  tent: S(P('M3 20L12 4l9 16z') + P('M12 4v3') + P('M9 20l3-6 3 6')),
  lantern: S(P('M9 3.5a3 3 0 0 1 6 0') + P('M9.5 6h5') + P('M7.5 9a3 3 0 0 1 3-3h3a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z') + P('M12 10.5c1.1 1.3 2 2.3 2 3.5a2 2 0 0 1-4 0c0-1.2.9-2.2 2-3.5z')),
  campfire: S(P('M4 20.5l16-4') + P('M4 16.5l16 4') + P('M12 3.5c2 2.5 4 4.3 4 7a4 4 0 0 1-8 0c0-1.5.7-2.6 1.6-3.6.3 1 .8 1.6 1.4 1.8-.1-2 .1-3.6 1-5.2z')),
  streak: F('M12.4 2.2c.5 3.3 5.4 5.6 5.4 11.2a5.8 5.8 0 0 1-11.6 0c0-2.3 1-4 2.3-5.3.2 1.7.9 2.8 1.9 3.2.2-3.5-.3-6.5 2-9.1z'),
};

/** SVG markup for an icon, sized by CSS. */
export function iconSvg(name, cls = '') {
  return `<svg viewBox="0 0 24 24" aria-hidden="true"${cls ? ` class="${cls}"` : ''}>${ICONS[name] || ICONS.info}</svg>`;
}

/** An icon as an element. */
export function icon(name, cls = '') {
  const t = document.createElement('template');
  t.innerHTML = iconSvg(name, cls);
  return t.content.firstChild;
}

export const hasIcon = (name) => name in ICONS;
