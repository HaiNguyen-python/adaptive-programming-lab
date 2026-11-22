/**
 * The Me screen: what the learner has built up, shown the way the research measures it.
 *  - Does it last? Unaided checks right after learning, the next day and a week later.
 *  - How well do you judge yourself? Confidence before a check against the result.
 *  - Help that works for you: what happened on the solo check after each kind of help.
 */
import { h, md, plural, relDay } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { kipSvg, medalSvg, confFaceSvg, svgEl } from '../lib/art.js';
import { store } from '../store.js';
import { now } from '../app.js';
import * as catalog from '../catalog.js';
import { levelInfo, streak, BADGES } from '../engine/rewards.js';
import { calibration, allChecks, CONF_LEVELS } from '../engine/calibration.js';
import { helpOutcomes, HELP_NAME, ARMS } from '../engine/help-policy.js';
import { dayKey, daysLater, daysBetween, flames, strength, isDue } from '../engine/mastery.js';
import { courseProgress, isDone } from '../engine/tutor.js';
import { bar, flamesEl } from './common.js';

const pct = (x) => `${Math.round(x * 100)}%`;

/** A labelled meter row: name, share as a bar, and the count behind it. */
function meterRow(label, right, total, emptyText) {
  const has = total > 0;
  return h('div.meter', { role: 'img', 'aria-label': has ? `${label}: ${right} of ${total}, ${pct(right / total)}` : `${label}: ${emptyText}` },
    h('div.meter-top', h('span', label), h('b', has ? pct(right / total) : ''), h('span.small.muted', has ? `${right} of ${total}` : emptyText)),
    h('div.meter-track', h('i', { style: { width: has ? `${Math.max(2, Math.round((right / total) * 100))}%` : '0%' } })));
}

/** Column chart as SVG text. bars: [{ value, label, title, mark, show }], max: top of the scale. */
function columns({ bars, max, ticks, unit = '', refs = null, goal = null, height = 150, bottom = 34, label, solid = false }) {
  const W = 320;
  const left = 30;
  const top = 14;
  const plotH = height - top - bottom;
  const band = (W - left - 6) / bars.length;
  const bw = Math.min(24, band - 4);
  const y = (v) => top + plotH - (Math.min(v, max) / max) * plotH;
  let s = `<svg class="chart${solid ? ' chart--solid' : ''}" viewBox="0 0 ${W} ${height}" role="img" aria-label="${label}">`;
  for (const t of ticks) {
    s += `<line class="gridline" x1="${left}" x2="${W - 4}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`;
    s += `<text x="${left - 6}" y="${(y(t) + 3.5).toFixed(1)}" text-anchor="end">${t}${unit}</text>`;
  }
  if (goal !== null && goal <= max) {
    s += `<line class="goal" x1="${left}" x2="${W - 4}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/>`;
    s += `<text x="${left + 4}" y="${(y(goal) - 4).toFixed(1)}">daily goal</text>`;
  }
  bars.forEach((b, i) => {
    const cx = left + band * i + band / 2;
    const x = cx - bw / 2;
    if (b.value !== null && b.value > 0) {
      const yy = y(b.value);
      const hgt = top + plotH - yy;
      const r = Math.min(4, hgt);
      s += `<path class="col${b.mark ? ' is-mark' : ''}" d="M${x.toFixed(1)} ${top + plotH}V${(yy + r).toFixed(1)}q0 ${-r} ${r} ${-r}h${(bw - 2 * r).toFixed(1)}q${r} 0 ${r} ${r}V${top + plotH}z"><title>${b.title}</title></path>`;
      if (b.show) s += `<text class="v" x="${cx.toFixed(1)}" y="${(yy - 4).toFixed(1)}" text-anchor="middle">${b.show}</text>`;
    } else if (b.value === 0) {
      s += `<rect class="col is-zero" x="${x.toFixed(1)}" y="${top + plotH - 2}" width="${bw}" height="2"><title>${b.title}</title></rect>`;
    }
    if (refs) {
      const ry = y(refs[i]);
      s += `<line class="ref" x1="${(cx - band * 0.38).toFixed(1)}" x2="${(cx + band * 0.38).toFixed(1)}" y1="${ry.toFixed(1)}" y2="${ry.toFixed(1)}"/>`;
    }
    if (b.icon) s += `<svg x="${(cx - 10).toFixed(1)}" y="${top + plotH + 6}" width="20" height="20" viewBox="0 0 40 40">${b.icon}</svg>`;
    else s += `<text class="${b.mark ? 'v' : ''}" x="${cx.toFixed(1)}" y="${top + plotH + 14}" text-anchor="middle">${b.label}</text>`;
    if (b.sub) s += `<text x="${cx.toFixed(1)}" y="${top + plotH + (b.icon ? 38 : 27)}" text-anchor="middle">${b.sub}</text>`;
  });
  s += `<line class="axis" x1="${left}" x2="${W - 4}" y1="${top + plotH}" y2="${top + plotH}"/>`;
  return `${s}</svg>`;
}

function lastingCard(state) {
  const checks = allChecks(state);
  const sameDay = checks.filter((c) => ['final', 'helpcheck', 'retry'].includes(c.role));
  const nextDay = checks.filter((c) => ['memory', 'warmup'].includes(c.role) && c.stage === 1);
  const week = checks.filter((c) => ['memory', 'warmup'].includes(c.role) && c.stage >= 2);
  const count = (list) => [list.filter((c) => c.ok).length, list.length];
  const [w1, wn] = count(week);
  const text = wn
    ? `You kept **${pct(w1 / wn)}** of what Kip checked a week or more later. These checks have no help, so the number shows what you can really do.`
    : 'Getting a question right in a lesson is the easy part. The real test is whether you can still do it **a week later, without help**. Your first result appears here when a lesson is a week old.';
  return h('div.card.stack',
    h('h3', 'Does it last?'),
    meterRow('Right after learning', ...count(sameDay), 'no checks yet'),
    meterRow('The next day', ...count(nextDay), 'no checks yet'),
    meterRow('One week later or more', w1, wn, 'no checks yet'),
    md(text, 'small.muted'));
}

function calibrationCard(state) {
  const cal = calibration(allChecks(state));
  const card = h('div.card.stack', h('h3', 'How well do you judge yourself?'));
  if (!cal.n) {
    card.append(h('div.empty', { html: confFaceSvg(3) }, h('p', 'Before each solo check, Kip asks how sure you are. After a few checks, you will see here how well your feeling matches your results.')));
    return card;
  }
  const bars = cal.byLevel.map((l) => ({
    value: l.n ? l.acc * 100 : null,
    show: l.n ? pct(l.acc) : '',
    title: l.n ? `${l.label}: right ${Math.round(l.acc * l.n)} of ${l.n}` : `${l.label}: no checks yet`,
    icon: confFaceSvg(l.level).replace(/^<svg[^>]*>|<\/svg>$/g, ''),
    sub: l.n ? `${l.n}x` : '',
  }));
  const summary = cal.byLevel.filter((l) => l.n).map((l) => `${l.label}: right ${pct(l.acc)} of ${l.n}`).join('; ');
  card.append(
    h('div', { html: columns({ bars, max: 100, ticks: [0, 50, 100], unit: '%', refs: cal.byLevel.map((l) => l.expected * 100), height: 172, bottom: 56, solid: true, label: `How often you were right, for each confidence level. ${summary}` }) }),
    h('div.legend', h('span', h('i', { style: { background: 'var(--chart)' } }), 'How often you were right'), h('span', h('i.ref-key'), 'Where the bar would end if your feeling were exactly right')));
  const sure = pct(cal.meanConf);
  const right = pct(cal.accuracy);
  const text = {
    early: `So far you felt ${sure} sure on average and got ${right} right. A few more checks will make this picture clearer.`,
    good: `You felt ${sure} sure on average and got ${right} right. Your judgement is well matched to your results, and that is a real skill.`,
    over: `You felt ${sure} sure on average but got ${right} right. When something feels finished, try one more question before moving on.`,
    under: `You felt ${sure} sure on average but got ${right} right. You know more than you think.`,
  }[cal.verdict];
  card.append(md(text, 'small.muted'));
  return card;
}

function helpCard(state) {
  const table = helpOutcomes(state.decisions);
  const used = ARMS.reduce((n, a) => n + table[a].used, 0);
  const card = h('div.card.stack', h('h3', 'Help that works for you'));
  if (!used) {
    card.append(h('div.empty', { html: iconSvg('bulb') }, h('p', 'When you get stuck after a first try, Kip can help. Here you will see which kind of help leads to you solving the next question on your own.')));
    return card;
  }
  for (const a of ARMS) {
    const o = table[a];
    card.append(h('div.stack', { style: { gap: '4px' } },
      meterRow(HELP_NAME[a], o.passed, o.checked, o.used ? 'not checked yet' : 'not used yet'),
      h('div.tiny.muted', o.used ? `Used ${o.used === 1 ? 'once' : `${o.used} times`}${o.weekChecked ? `. One week later: ${o.weekPassed} of ${o.weekChecked} remembered.` : '.'}` : '')));
  }
  card.append(md(`The bars show how often you passed the solo check that follows the help. ${state.settings.helpMode === 'adaptive' ? 'Kip uses exactly this to choose your help, and still tries each kind now and then.' : 'Your help comes in a fixed order. You can let Kip adapt it in Settings.'}`, 'small.muted'));
  if (state.counters.helps.walkthrough) card.append(h('div.tiny.muted', `Walkthroughs used: ${state.counters.helps.walkthrough}.`));
  return card;
}

function activityCard(state) {
  const t = now();
  const goal = state.settings.dailyGoal;
  const days = Array.from({ length: 14 }, (_, i) => daysLater(t, i - 13));
  const values = days.map((d) => state.days[dayKey(d)] || 0);
  const top = Math.max(goal, ...values);
  const max = Math.ceil(top / 50) * 50 || 50;
  const best = Math.max(...values);
  const letters = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const bars = days.map((d, i) => ({
    value: values[i],
    label: letters[new Date(d).getDay()],
    mark: i === 13,
    show: values[i] > 0 && (i === 13 || values[i] === best) ? String(values[i]) : '',
    title: `${new Date(d).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' })}: ${values[i]} XP`,
  }));
  const active = values.filter((v) => v > 0).length;
  return h('div.card.stack', h('h3', 'Your last 14 days'),
    h('div', { html: columns({ bars, max, ticks: [0, max / 2, max], goal, label: `XP per day for the last 14 days. Active on ${active} days. Today: ${values[13]} XP.` }) }),
    md(active ? `You learned on **${plural(active, 'day')}** out of the last 14. Short and often beats long and rare.` : 'Your daily XP will show up here.', 'small.muted'));
}

function skillsCard(state, course) {
  const t = now();
  const done = course.lessons.filter((l) => isDone(state, l.id));
  if (!done.length) return null;
  const p = courseProgress(state, course);
  return h('div.card.stack.span-2', { 'data-accent': course.accent },
    h('div.row', h('span.glyph', course.glyph), h('div.grow', h('h3', course.title), h('div.small.muted', `${p.done} of ${p.total} lessons`)), h('div', { style: { width: '120px' } }, bar(p.ratio, 'bar--thin'))),
    h('div', done.map((l) => {
      const c = state.concepts[l.id];
      const due = isDue(c, t);
      const days = c && c.due !== null ? daysBetween(t, c.due) : null;
      const st = strength(c, t);
      return h('div.skill',
        h('b', l.title), flamesEl(flames(c)),
        h('div', { style: { gridColumn: '1 / -1' } }, bar(st, 'bar--thin')),
        h('span.when', due ? 'Memory check ready' : days !== null ? `Next check ${relDay(days)}` : ''), h('span.when', `${pct(st)} strength`));
    })));
}

export function mePage(root) {
  const state = store.state;
  const t = now();
  const lv = levelInfo(state.xp);
  const st = streak(state, t);
  const lessons = Object.values(state.lessons).filter((l) => l.done).length;
  const lasting = Object.values(state.concepts).filter((c) => c.best >= 3).length;
  const earned = BADGES.filter((b) => state.badges[b.id]).length;
  const tile = (value, label) => h('div.tile', h('b', value), h('span', label));
  const page = h('div.page.page--wide.stack-l',
    h('div.profile-head', svgEl(kipSvg(st.count >= 3 ? 'proud' : 'happy', state.profile.color)),
      h('div.grow.stack', { style: { gap: '6px' } }, h('h1', state.profile.name),
        h('div.row-wrap', h('span.tag', `Level ${lv.level}`), h('span.tag', `${state.xp} XP`), h('span.tag', `${lv.to - state.xp} XP to level ${lv.level + 1}`)),
        bar(lv.progress, 'bar--thin'))),
    h('div.stat-row', tile(String(st.count), st.count === 1 ? 'day streak' : 'day streak'), tile(String(lessons), lessons === 1 ? 'lesson done' : 'lessons done'), tile(String(lasting), 'ideas kept for a week'), tile(String(state.counters.firstTry), 'right first try, no help')),
    h('div.insight-grid', lastingCard(state), calibrationCard(state), helpCard(state), activityCard(state),
      ...catalog.courses().map((c) => skillsCard(state, c)).filter(Boolean),
      h('div.card.stack.span-2', h('div.row', h('h3.grow', 'Badges'), h('span.small.muted', `${earned} of ${BADGES.length}`)),
        h('div.badge-grid', BADGES.map((b) => h(`div.badge${state.badges[b.id] ? '.is-earned' : ''}`, { html: medalSvg(b.icon) }, h('b', b.name), h('span', b.how)))))));
  root.append(page);
}
