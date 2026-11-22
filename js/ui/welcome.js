/** First-run welcome: who you are, what to learn, how much, and how Kip helps. Also used to add a learner. */
import { h, md } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { kipSvg, KIP_COLORS, svgEl } from '../lib/art.js';
import { store, save, createProfile } from '../store.js';
import { applyLook, log } from '../app.js';
import * as catalog from '../catalog.js';
import { APP, STUDY_INFO } from '../config.js';
import { enrol, getPendingStudy, setPendingStudy } from '../study.js';
import { DATA_VERSION } from '../engine/help-policy.js';
import { GOALS } from '../engine/rewards.js';

const HOW = [
  ['target', 'You try first', 'Thinking before you get help is what makes new ideas stick.'],
  ['bulb', 'Kip nudges, but never tells', 'You get a hint, a hint to explain back, or a similar worked example. Not the answer.'],
  ['solo', 'You prove it on your own', 'After help comes one question with no help, to show what you can really do.'],
  ['memory', 'Kip checks again later', 'The next day and one week later. That is how you know it lasted.'],
];

export function openWelcome({ onDone, onCancel }) {
  const list = catalog.courses();
  const data = { name: '', color: 'ember', course: list[0] ? list[0].id : null, knows: false, goal: 50, helpMode: 'adaptive', study: getPendingStudy(), agreed: false };
  // A study link adds an information-and-consent step and takes the help choice out of the learner's hands.
  const stepNames = () => (data.study ? ['hero', 'consent', 'name', 'course', 'goal', 'how'] : ['hero', 'name', 'course', 'goal', 'how']);
  const last = () => stepNames().length - 1;
  let step = 0;
  const root = h('div.welcome', { role: 'dialog', 'aria-modal': 'true', 'aria-label': `Welcome to ${APP.name}` });
  document.body.append(root);

  const choice = (on, onclick, title, sub, left) => h(`button.choice${on ? '.is-on' : ''}`, { type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick },
    left || null, h('span.grow', h('b', title), sub ? h('span.sub', sub) : null));

  function body() {
    const which = stepNames()[step];
    if (which === 'consent') {
      const s = data.study;
      const box = h('input', { type: 'checkbox', id: 'consent-box', checked: data.agreed, onchange: () => { data.agreed = box.checked; render(); } });
      return h('div.welcome-body',
        h('h2', STUDY_INFO.title),
        md(`This app is used in the study **${s.id}**. Your code is **${s.pid || 'not set'}**. It is used instead of your name.`),
        md('**What is recorded:** your answers, when you ask for help and which kind, the confidence you rate, what you write when you explain a hint, and your results on later memory checks.'),
        md('**Where it is kept:** only on this device. Nothing is sent anywhere. At the end you may send the file you download in Settings to the researcher.'),
        md('**Your choice:** taking part is voluntary. You can stop at any time and remove everything in Settings.'),
        STUDY_INFO.contact ? md(`**Contact:** ${STUDY_INFO.contact}`) : null,
        STUDY_INFO.ethics ? md(STUDY_INFO.ethics, 'small.muted') : null,
        h('label.row', { for: 'consent-box', style: { gap: '10px', alignItems: 'flex-start' } }, box, h('span', 'I have read this and I agree to take part.')),
        h('button.btn.btn--quiet', { type: 'button', onclick: () => { data.study = null; data.agreed = false; step = 1; render(); } }, 'No thanks, I only want to use the app'));
    }
    if (which === 'hero') {
      const names = list.map((c) => c.title);
      const langs = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names[0] || 'code';
      return h('div.welcome-body',
        svgEl(kipSvg('cheer', data.color)),
        h('h1.hero-title', 'Learn to code.', h('br'), 'Make it stick.'),
        h('p.hero-sub', `Short lessons in ${langs} that adapt to you. Kip, your guide, gives you a nudge when you are stuck, then checks later that it really stuck.`));
    }
    if (which === 'name') {
      const input = h('input.input', { type: 'text', maxlength: '24', autocomplete: 'off', placeholder: 'A first name or a nickname', value: data.name, 'aria-label': 'Your name', 'data-autofocus': '' });
      input.addEventListener('input', () => { data.name = input.value; });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.repeat) { e.preventDefault(); e.stopPropagation(); setTimeout(() => go(1), 0); } });
      const preview = h('div', { html: kipSvg('happy', data.color) });
      const swatches = h('div.swatches', { role: 'group', 'aria-label': 'Colour for Kip' }, Object.entries(KIP_COLORS).map(([id, c]) => h(`button.swatch${id === data.color ? '.is-on' : ''}`, {
        type: 'button', 'aria-label': c.name, 'aria-pressed': id === data.color ? 'true' : 'false', style: { '--c': c.edge },
        onclick: (e) => {
          data.color = id;
          preview.innerHTML = kipSvg('happy', id);
          for (const b of e.currentTarget.parentElement.children) { b.classList.toggle('is-on', b === e.currentTarget); b.setAttribute('aria-pressed', b === e.currentTarget ? 'true' : 'false'); }
        },
      })));
      return h('div.welcome-body', preview,
        h('div.field', h('label', { style: { fontSize: '1.3rem', fontWeight: '700' } }, 'What should Kip call you?'), input, h('span.small.muted', 'Your name stays on this device.')),
        h('div.field', h('label', 'Pick a colour for Kip'), swatches));
    }
    if (which === 'course') {
      return h('div.welcome-body',
        h('h2', 'What do you want to learn first?'),
        h('div.choices', list.map((c) => choice(c.id === data.course, () => { data.course = c.id; render(); }, c.title, c.tagline, h('span.glyph', { 'data-accent': c.accent, style: { background: 'var(--accent)', color: 'var(--accent-ink)' } }, c.glyph)))),
        h('h3', { style: { marginTop: '8px' } }, 'Have you done this before?'),
        h('div.choices',
          choice(!data.knows, () => { data.knows = false; render(); }, 'I am new to this', 'Start with the very first lesson.'),
          choice(data.knows, () => { data.knows = true; render(); }, 'I know some already', 'Kip asks a few questions and skips what you know.')),
        h('p.small.muted', 'You can switch courses any time.'));
    }
    if (which === 'goal') {
      return h('div.welcome-body',
        h('h2', 'How much do you want to learn each day?'),
        h('div.choices', GOALS.map((g) => choice(g.xp === data.goal, () => { data.goal = g.xp; render(); }, g.label, `${g.xp} XP, ${g.note}`, h('span', { html: iconSvg('target', 'ic') })))),
        h('p.small.muted', 'A little every day beats a lot once a week. You can change this later.'));
    }
    return h('div.welcome-body',
      h('h2', 'How Kip helps you learn'),
      h('div.how', HOW.map(([ic, title, text]) => h('div.how-row', h('div.ic', { html: iconSvg(ic) }), h('div', h('b', title), h('span', text))))),
      data.study ? h('p.small.muted', 'In this study Kip sets how help is chosen for you. Everything you do here is saved on this device only.') : [
        h('h3', { style: { marginTop: '6px' } }, 'How should Kip choose the help?'),
        h('div.choices',
          choice(data.helpMode === 'adaptive', () => { data.helpMode = 'adaptive'; render(); }, 'Adapt it to me (recommended)', 'Kip tries each kind of help now and then, and learns which one works best for you.'),
          choice(data.helpMode === 'fixed', () => { data.helpMode = 'fixed'; render(); }, 'Always the same order', 'A hint, then a more specific hint, then a worked example.')),
        h('p.small.muted', 'Everything you do here is saved on this device only. You can change all of this in Settings.')]);
  }

  function finish() {
    const state = createProfile({ name: data.name, color: data.color });
    state.settings.dailyGoal = data.goal;
    state.settings.helpMode = data.helpMode;
    let study = null;
    if (data.study) study = enrol(state, data.study, { consentAt: Date.now(), consentVersion: STUDY_INFO.version });
    state.course = data.course;
    state.onboarded = true;
    save();
    applyLook();
    if (study) {
      log('study_enrolled', { study: study.id, pid: study.pid, cond: study.cond, assignment: study.assignment, pAssign: study.pAssign, requested: study.requested, consentVersion: study.consentVersion });
      setPendingStudy(null);
      if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    }
    log('onboarded', { course: data.course, knows: data.knows, goal: data.goal, helpMode: state.settings.helpMode, tzOffsetMin: new Date().getTimezoneOffset(), dataVersion: DATA_VERSION });
    root.remove();
    onDone({ placement: data.knows });
  }

  function go(d) {
    if (d > 0 && stepNames()[step] === 'consent' && !data.agreed) return;
    if (d > 0 && step === last()) { finish(); return; }
    if (d < 0 && step === 0) { if (onCancel) { root.remove(); onCancel(); } return; }
    step += d;
    render();
  }

  function render() {
    const back = step > 0 || onCancel ? h('button.btn.btn--ghost', { type: 'button', onclick: () => go(-1) }, step === 0 ? 'Cancel' : 'Back') : null;
    const nextLabel = step === 0 ? 'Get started' : step === last() ? 'Start learning' : 'Continue';
    const nextBtn = h('button.btn.btn--primary.btn--lg', { type: 'button', style: { flex: '1' }, disabled: stepNames()[step] === 'consent' && !data.agreed, onclick: () => go(1) }, nextLabel);
    root.replaceChildren(h('div.welcome-in',
      h('div.welcome-dots', { 'aria-hidden': 'true' }, Array.from({ length: last() + 1 }, (_, i) => h(`i${i <= step ? '.is-on' : ''}`))),
      body(),
      h('div.row', back, nextBtn)));
    const focus = root.querySelector('[data-autofocus]');
    if (focus) focus.focus(); else nextBtn.focus({ preventScroll: true });
    root.scrollTop = 0;
  }

  render();
}
