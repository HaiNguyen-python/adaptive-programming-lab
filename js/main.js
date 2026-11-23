/** App start-up, navigation and the frame around every screen. */
import { initStore, store } from './store.js';
import { loadCatalog } from './catalog.js';
import { applyLook, onAppChange } from './app.js';
import { setEffects } from './lib/effects.js';
import { h, md } from './lib/dom.js';
import { iconSvg } from './lib/icons.js';
import { logoSvg } from './lib/art.js';
import { APP } from './config.js';
import { learnPage, dueCount, launchPlacement, courseIntro, currentCourse } from './ui/learn.js';
import { reviewPage } from './ui/review.js';
import { labPage } from './ui/lab.js';
import { mePage } from './ui/me.js';
import { settingsPage } from './ui/settings.js';
import { openWelcome } from './ui/welcome.js';
import { readStudyParams, setPendingStudy } from './study.js';
import { startSync } from './sync.js';
import { confirmSheet, openSheet } from './ui/common.js';

const ROUTES = [
  { id: 'learn', label: 'Learn', icon: 'trail', page: learnPage },
  { id: 'review', label: 'Memory', icon: 'memory', page: reviewPage },
  { id: 'code', label: 'Code', icon: 'code', page: labPage },
  { id: 'me', label: 'Me', icon: 'user', page: mePage },
  { id: 'settings', label: 'Settings', icon: 'settings', page: settingsPage },
];

const app = document.getElementById('app');
let mainEl = null;
let shown = null;
let welcomeOpen = false;

function routeId() {
  const id = location.hash.replace(/^#\/?/, '').split('/')[0];
  if (id === 'selftest' || id === 'researcher' || id === 'method') return id;
  return ROUTES.some((r) => r.id === id) ? id : 'learn';
}

function render() {
  const state = store.state;
  applyLook();
  setEffects({ sound: state ? state.settings.sound : true, motion: state ? !state.settings.reduceMotion : true });
  document.title = `${APP.name}: learn to code and make it stick`;

  if (!state || !state.onboarded) {
    app.className = '';
    app.replaceChildren();
    mainEl = null;
    shown = null;
    if (!welcomeOpen) {
      welcomeOpen = true;
      openWelcome({
        onDone: ({ placement }) => {
          welcomeOpen = false;
          if (location.hash !== '#/learn') history.replaceState(null, '', '#/learn');
          render();
          const course = currentCourse();
          if (course && placement) launchPlacement(course);
        },
      });
    }
    return;
  }

  const id = routeId();
  const scroll = id === shown && mainEl ? mainEl.scrollTop : 0;
  shown = id;
  const due = dueCount();
  mainEl = h('main.main', { id: 'main' });
  const rail = h('nav.rail', { 'aria-label': 'Main' },
    h('a.brand', { href: '#/learn', 'aria-label': `${APP.name} home`, html: logoSvg() }, h('b', APP.short, h('span', APP.rest))),
    ROUTES.map((r) => h(`a.rail-link${r.id === id ? '.is-on' : ''}`, { href: `#/${r.id}`, 'aria-current': r.id === id ? 'page' : null, html: iconSvg(r.icon) },
      h('span', r.label),
      r.id === 'review' && due ? h('span.dot', { 'aria-label': `${due} memory checks ready` }, String(due)) : null)),
    h('div.rail-foot', `${APP.name} ${APP.version}`));
  app.className = 'shell';
  app.replaceChildren(rail, mainEl);
  if (id === 'selftest') import('./ui/selftest.js').then((m) => m.selftestPage(mainEl));
  else if (id === 'researcher') import('./ui/researcher.js').then((m) => m.researcherPage(mainEl));
  else if (id === 'method') import('./ui/method.js').then((m) => m.methodPage(mainEl));
  else ROUTES.find((r) => r.id === id).page(mainEl);
  mainEl.scrollTop = scroll;
}

async function boot() {
  initStore();
  // A study link only enrols someone who has not started yet.
  const study = readStudyParams(location.search);
  let lateStudy = null;
  if (study && !(store.state && store.state.onboarded)) setPendingStudy(study);
  else if (study) {
    history.replaceState(null, '', location.pathname + location.hash);
    // Someone who already uses the app opened a study link: offer to join as a new learner (never silently).
    const st = store.state.study;
    if (!(st && st.id === study.id && st.pid === study.pid)) lateStudy = study;
  }
  applyLook();
  await loadCatalog();
  window.addEventListener('hashchange', render);
  // Another tab of the app saved progress for this learner: two tabs would overwrite each other's data.
  let warned = false;
  window.addEventListener('storage', (e) => {
    if (warned || !store.state || e.key !== `hcl.state.${store.state.profile.id}`) return;
    warned = true;
    openSheet({
      title: 'Open in another tab',
      body: md('This app is also open in another tab or window, and your progress was saved there. Use one tab at a time so nothing gets overwritten. Reload this tab to continue with the latest progress.'),
      dismissable: false,
      foot: [h('button.btn.btn--primary', { type: 'button', onclick: () => location.reload() }, 'Reload this tab')],
    });
  });
  onAppChange(render);
  startSync();
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyLook());
  render();
  if (lateStudy) {
    const join = await confirmSheet({
      title: 'A study link',
      text: `This link is for the research study **${lateStudy.id}**. You already use the app on this device as **${store.state.profile.name}**. To take part, join as a new learner: your current progress stays as it is, and you can switch between learners in Settings.`,
      yes: 'Join as a new learner',
      no: 'Not now',
    });
    if (join) {
      setPendingStudy(lateStudy);
      openWelcome({ onDone: () => { location.hash = '#/learn'; render(); }, onCancel: () => setPendingStudy(null) });
    }
  }
}

// Offline support: only where service workers are allowed (https or localhost).
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

boot().catch((err) => {
  console.error(err);
  app.className = 'boot';
  app.replaceChildren(h('p.boot-text', `${APP.name} could not start. Reload the page to try again.`));
});
