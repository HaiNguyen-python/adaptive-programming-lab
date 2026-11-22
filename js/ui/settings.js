/** Settings: look, learning, help from Kip, learners on this device, research data, about. */
import { h, md } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { kipSvg, KIP_COLORS } from '../lib/art.js';
import { store, save, saveNow, updateProfile, switchProfile, deleteProfile, resetProgress, importProfile } from '../store.js';
import { parseBackup } from '../backup.js';
import { applyLook, emitChange, clockShift, setClockShift, log } from '../app.js';
import { setEffects, play } from '../lib/effects.js';
import { APP, RESEARCH } from '../config.js';
import { GOALS } from '../engine/rewards.js';
import { HELP_NAME, POLICY_VERSION } from '../engine/help-policy.js';
import { exportJson, exportCsv, exportBackup, addEvents, clearEvents } from '../log.js';
import { segmented, switchEl, confirmSheet, toast } from './common.js';
import { openWelcome } from './welcome.js';

const row = (title, sub, control) => h('div.set-row', h('div.grow', h('b', title), sub ? h('span', sub) : null), control);
const group = (title, ...rows) => h('section.set-group', h('h2', title), rows);

export function settingsPage(root) {
  const state = store.state;
  const s = state.settings;
  const study = state.study; // in a study the settings that define the condition are fixed
  const set = (fn) => { fn(); save(); applyLook(); setEffects({ sound: s.sound, motion: !s.reduceMotion }); };
  const page = h('div.page', h('div.page-head', h('h1', 'Settings')));

  // ---- look and sound
  page.append(group('Look and sound',
    row('Theme', 'Night is easy on the eyes. Day is brighter.', segmented([{ value: 'auto', label: 'Auto' }, { value: 'night', label: 'Night' }, { value: 'day', label: 'Day' }], s.theme, (v) => set(() => { s.theme = v; }), 'Theme')),
    row('Text size', '', segmented([{ value: 's', label: 'Small' }, { value: 'm', label: 'Medium' }, { value: 'l', label: 'Large' }], s.textSize, (v) => set(() => { s.textSize = v; }), 'Text size')),
    row('Sounds', 'Short sounds for right and wrong answers.', switchEl(s.sound, (v) => { set(() => { s.sound = v; }); if (v) play('right'); }, 'Sounds')),
    row('Less motion', 'Turn off animations and confetti.', switchEl(s.reduceMotion, (v) => set(() => { s.reduceMotion = v; }), 'Less motion'))));

  // ---- learning
  page.append(group('Learning',
    row('Daily goal', 'How much XP you aim for each day.', segmented(GOALS.map((g) => ({ value: g.xp, label: `${g.xp} XP` })), s.dailyGoal, (v) => set(() => { s.dailyGoal = Number(v); }), 'Daily goal')),
    study ? null : row('Confidence rating', 'Before a question, Kip asks how sure you are. Afterwards you see how well you judged yourself.',
      segmented([{ value: 'checks', label: 'Solo checks' }, { value: 'all', label: 'Every question' }, { value: 'off', label: 'Off' }], s.confidence, (v) => { set(() => { s.confidence = v; }); log('setting', { name: 'confidence', value: v }); }, 'Confidence rating'))));

  // ---- study (fixed settings)
  if (study) {
    page.append(group('Study',
      h('div.set-row.set-row--col', h('div.grow', h('b', `You are taking part in ${study.id}`),
        h('span', `Your code is ${study.pid || state.profile.code}. How Kip chooses help, the confidence ratings and the other settings that belong to the study are fixed, so everyone's results can be compared. You can stop at any time: delete this learner below.`)))));
  }

  // ---- help
  const kinds = ['hint', 'explain', 'worked'];
  const helpRows = kinds.map((k) => {
    const sub = { hint: 'A nudge in the right direction.', explain: 'A hint that you then put in your own words.', worked: 'A similar problem solved step by step.' }[k];
    const sw = switchEl(s.allow[k], (v) => {
      if (!v && kinds.filter((x) => s.allow[x]).length === 1) {
        toast('Keep at least one kind of help switched on.', 'info');
        sw.querySelector('input').checked = true;
        return;
      }
      set(() => { s.allow[k] = v; });
      log('setting', { name: `allow.${k}`, value: v });
    }, HELP_NAME[k]);
    return row(HELP_NAME[k], sub, sw);
  });
  if (!study) page.append(group('Help from Kip',
    h('div.set-row.set-row--col',
      h('div.grow', h('b', 'How Kip chooses the help'), h('span', 'Help always comes after you have tried, and it is never the answer.')),
      segmented([{ value: 'adaptive', label: 'Adapts to me' }, { value: 'fixed', label: 'Same order every time' }], s.helpMode, (v) => { set(() => { s.helpMode = v; }); log('setting', { name: 'helpMode', value: v }); note.replaceChildren(md(modeNote(v), 'small.muted')); }, 'How Kip chooses the help'),
      (() => { note = h('div', md(modeNote(s.helpMode), 'small.muted')); return note; })()),
    ...helpRows,
    row('Walkthrough as a last step', 'When every hint is used and you are still stuck, Kip can show the solution, and you then build it yourself.', switchEl(s.allow.walkthrough, (v) => { set(() => { s.allow.walkthrough = v; }); log('setting', { name: 'allow.walkthrough', value: v }); }, 'Walkthrough'))));

  // ---- learners
  const nameInput = h('input.input', { type: 'text', maxlength: '24', value: state.profile.name, 'aria-label': 'Your name' });
  nameInput.addEventListener('change', () => { updateProfile({ name: nameInput.value }); emitChange(); });
  const swatches = h('div.swatches', Object.entries(KIP_COLORS).map(([id, c]) => h(`button.swatch${id === state.profile.color ? '.is-on' : ''}`, {
    type: 'button', 'aria-label': c.name, 'aria-pressed': id === state.profile.color ? 'true' : 'false', style: { '--c': c.edge },
    onclick: () => { updateProfile({ color: id }); emitChange(); },
  })));
  const others = store.profiles.list.filter((p) => p.id !== state.profile.id);
  page.append(group('Learners on this device',
    h('div.set-row', h('div', { style: { width: '56px', flex: 'none' }, html: kipSvg('happy', state.profile.color) }), h('div.grow.stack', nameInput, swatches)),
    ...others.map((p) => h('div.set-row', h('div', { style: { width: '40px', flex: 'none' }, html: kipSvg('happy', p.color) }), h('div.grow', h('b', p.name)),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => { switchProfile(p.id); location.hash = '#/learn'; emitChange(); } }, 'Switch'))),
    study ? null : h('div.set-row', h('div.grow', h('b', 'Add a learner'), h('span', 'Each learner has their own progress.')),
      h('button.btn.btn--ghost.btn--sm', { type: 'button', html: iconSvg('plus'), onclick: () => {
        saveNow();
        openWelcome({ onDone: () => { location.hash = '#/learn'; emitChange(); }, onCancel: () => {} });
      } }, 'Add'))));

  // ---- backup and restore
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true, 'aria-label': 'Choose a backup file' });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    try {
      const { state: restored, events } = parseBackup(await file.text());
      if (!await confirmSheet({ title: 'Restore this learner?', text: `This adds **${restored.profile.name}** from the backup as a new learner on this device. Your current learners are not changed.`, yes: 'Restore' })) return;
      const next = importProfile(restored);
      await addEvents(next.profile.id, events);
      toast(`Restored ${next.profile.name}.`, 'info');
      location.hash = '#/learn';
      emitChange();
    } catch (err) { toast(err.message || 'The backup could not be restored.', 'info'); }
  });
  page.append(group('Backup',
    h('div.set-row.set-row--col', h('div.grow', h('b', 'Keep your progress safe'),
      h('span', 'Progress lives only in this browser. Download a backup to move it to another device, or to keep it if the browser data is cleared. Restoring adds the backup as a new learner.')),
      h('div.row-wrap',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', html: iconSvg('download'), onclick: async () => { await exportBackup(state); toast(`Backup of ${state.profile.name} downloaded.`, 'download'); } }, 'Download backup'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => fileInput.click() }, 'Restore from file'),
        fileInput))));

  // ---- research and data
  const floorInput = h('input.input', { type: 'number', min: '0', max: '0.33', step: '0.05', value: String(s.floor), 'aria-label': 'Minimum chance of each kind of help', style: { width: '110px' } });
  floorInput.addEventListener('change', () => { const v = Math.max(0, Math.min(0.33, Number(floorInput.value) || 0)); floorInput.value = String(v); set(() => { s.floor = v; }); log('setting', { name: 'floor', value: v }); });
  const costInput = h('input.input', { type: 'number', min: '0', max: '0.3', step: '0.01', value: String(s.costWeight), 'aria-label': 'Cost of more specific help', style: { width: '110px' } });
  costInput.addEventListener('change', () => { const v = Math.max(0, Math.min(0.3, Number(costInput.value) || 0)); costInput.value = String(v); set(() => { s.costWeight = v; }); log('setting', { name: 'costWeight', value: v }); });
  const shiftLabel = h('span.small.muted', clockShift() ? `The app thinks it is ${clockShift()} day${clockShift() === 1 ? '' : 's'} later than it is.` : 'The clock is normal.');
  const shift = (d) => { setClockShift(d === 0 ? 0 : clockShift() + d); emitChange(); };
  page.append(group('Research and data',
    h('div.set-row.set-row--col', h('div.grow', h('b', 'Your data stays with you'),
      h('span', 'Progress, answers, help requests and confidence ratings are saved on this device only. Nothing is sent anywhere. You can download a copy, for example to share with a teacher or a researcher.')),
      h('div.row-wrap',
        h('button.btn.btn--ghost.btn--sm', { type: 'button', html: iconSvg('download'), onclick: async () => { const n = await exportJson(state); toast(`Downloaded ${n} events as JSON.`, 'download'); } }, 'Download (JSON)'),
        h('button.btn.btn--ghost.btn--sm', { type: 'button', html: iconSvg('table'), onclick: async () => { const n = await exportCsv(state); toast(`Downloaded ${n} events as three CSV files.`, 'download'); } }, 'Download (CSV)')),
      h('span.small.muted', `Downloads use the code ${state.profile.code} instead of your name. They include what you wrote when explaining hints.`)),
    h('details.set-row.set-row--col', h('summary', { style: { fontWeight: '600', cursor: 'pointer' } }, study ? 'How help is chosen' : 'For researchers and teachers'),
      h('div.stack', { style: { marginTop: '10px' } },
        md(`Help policy **${POLICY_VERSION}**: a contextual bandit (Thompson sampling) chooses between a hint, a hint with a self-explanation prompt and a worked example. The context is prior knowledge of the concept and the number of failed attempts. The reward is unaided success on the check item after the help, minus a cost for more specific help (worked example 2, hints 1). Next-day and one-week unaided checks update the same beliefs. Every decision is logged with the probability of each option.`, 'small'),
        study ? null : h('div.row', h('span.grow.small', 'Minimum chance of each kind of help (0.2 keeps every option in play, as in a micro-randomised trial)'), floorInput),
        study ? null : h('div.row', h('span.grow.small', 'How much the cost of more specific help counts'), costInput),
        study ? null : h('div.callout.callout--warn.stack', h('b', 'Testing tool: move the clock'), h('span.small', 'Memory checks open the next day and after a week. Use this to try them without waiting. It only lasts until you close this tab.'),
          h('div.row-wrap', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => shift(1) }, 'One day later'), h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: () => shift(7) }, 'One week later'), h('button.btn.btn--quiet.btn--sm', { type: 'button', onclick: () => shift(0) }, 'Reset the clock')), shiftLabel))),
    study ? null : row('Start over', 'Remove all progress for this learner. Settings are kept.', h('button.btn.btn--ghost.btn--sm', { type: 'button', onclick: async () => {
      if (!await confirmSheet({ title: 'Start over?', text: `This removes all lessons, flames, XP and badges for **${state.profile.name}** on this device. It cannot be undone.`, yes: 'Remove my progress', danger: true })) return;
      await clearEvents(state.profile.id);
      resetProgress();
      location.hash = '#/learn';
      emitChange();
    } }, 'Start over')),
    row('Delete this learner', 'Remove this learner and everything saved for them.', h('button.btn.btn--ghost.btn--sm', { type: 'button', html: iconSvg('trash'), onclick: async () => {
      if (!await confirmSheet({ title: 'Delete this learner?', text: `This removes **${state.profile.name}** and all their progress from this device. It cannot be undone.`, yes: 'Delete', danger: true })) return;
      const id = state.profile.id;
      await clearEvents(id);
      deleteProfile(id);
      location.hash = '#/learn';
      emitChange();
    } }, 'Delete'))));

  // ---- about
  page.append(group('About',
    h('div.set-row.set-row--col',
      h('div.grow', h('b', `${APP.name} ${APP.version}`), h('span', APP.tagline)),
      md(`The way ${APP.name} teaches follows the doctoral research plan **${RESEARCH.title}** by ${RESEARCH.author} (${RESEARCH.place}): help that keeps the thinking with the learner, unaided checks right after help and one week later, and honest feedback on how well you judge your own knowledge.`, 'small'),
      h('ul.refs',
        h('li', 'Bastani, H., et al. (2025). Generative AI without guardrails can harm learning: Evidence from high school mathematics. PNAS, 122.'),
        h('li', 'Bjork, R. A. (1994). Memory and metamemory considerations in the training of human beings. In Metacognition: Knowing about knowing. MIT Press.'),
        h('li', 'Chi, M. T. H., et al. (1994). Eliciting self-explanations improves understanding. Cognitive Science, 18(3).'),
        h('li', 'Kalyuga, S., Ayres, P., Chandler, P., & Sweller, J. (2003). The expertise reversal effect. Educational Psychologist, 38(1).'),
        h('li', 'Dunlosky, J., & Rawson, K. A. (2012). Overconfidence produces underachievement. Learning and Instruction, 22(4).'),
        h('li', 'Prather, J., et al. (2024). The widening gap: The benefits and harms of generative AI for novice programmers. ICER 2024.'),
        h('li', 'Klasnja, P., et al. (2015). Microrandomized trials: An experimental design for developing just-in-time adaptive interventions. Health Psychology, 34.'),
        h('li', 'Corbett, A. T., & Anderson, J. R. (1994). Knowledge tracing: Modeling the acquisition of procedural knowledge. User Modeling and User-Adapted Interaction, 4(4).')),
      md('Python runs on Pyodide and SQL on sql.js (SQLite). Both are open-source and are fetched from public content networks the first time you run code, as are the Lexend and JetBrains Mono fonts. No learning data is sent with those requests.', 'small.muted'))));

  root.append(page);
}

let note = null;
function modeNote(mode) {
  return mode === 'adaptive'
    ? 'Kip looks at how well you know the idea and how many tries you have had, and picks the kind of help most likely to let you solve the next question on your own. Now and then it tries a different kind, to keep learning what works for you. You can always see why in the help window.'
    : 'You always get a hint first, then a more specific hint, then a worked example.';
}
