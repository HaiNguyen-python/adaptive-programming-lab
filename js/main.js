/** App start-up, navigation and the frame around every screen. */
import { initStore, store } from './store.js';
import { loadCatalog } from './catalog.js';
import { applyLook, onAppChange } from './app.js';
import { setEffects } from './lib/effects.js';
import { h } from './lib/dom.js';
import { iconSvg } from './lib/icons.js';
import { logoSvg } from './lib/art.js';
import { APP } from './config.js';
import { learnPage, dueCount, launchPlacement, courseIntro, currentCourse } from './ui/learn.js';
import { reviewPage } from './ui/review.js';
import { labPage } from './ui/lab.js';
import { mePage } from './ui/me.js';
import { settingsPage } from './ui/settings.js';
import { openWelcome } from './ui/welcome.js';

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
  if (id === 'selftest') return id;
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
  else ROUTES.find((r) => r.id === id).page(mainEl);
  mainEl.scrollTop = scroll;
}

async function boot() {
  initStore();
  applyLook();
  await loadCatalog();
  window.addEventListener('hashchange', render);
  onAppChange(render);
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => applyLook());
  render();
}

// Offline support: only where service workers are allowed (https or localhost).
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));

boot().catch((err) => {
  console.error(err);
  app.className = 'boot';
  app.replaceChildren(h('p.boot-text', `${APP.name} could not start. Reload the page to try again.`));
});
