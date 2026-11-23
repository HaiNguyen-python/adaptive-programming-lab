# PhD Programming Lab

Learn to code. Make it stick.

PhD Programming Lab is an adaptive programming-learning app for all ages: short, game-like lessons in
**Python, JavaScript, SQL, and HTML & CSS**, with a guide called Kip. It runs entirely in the browser.
Real Python (Pyodide), real SQLite (sql.js) and sandboxed JavaScript run the learner's code, so every
output is exactly what the real language produces.

Its teaching design follows the doctoral research plan **"The Cost of Easy Answers: adaptive help from
LLM tutors for durable learning and accurate self-assessment in programming education"**
(Hai Nguyen, Aalto University, Computing Education Research).

## Run it

Requires Node 18 or later (no other dependencies).

```
node tools/serve.mjs
```

Then open http://localhost:8140. Any static web server works too (for example GitHub Pages): the app
is plain HTML, CSS and JavaScript modules. Python and SQL runtimes and two web fonts are fetched from
public CDNs the first time they are needed (addresses in `js/config.js`).

## How the research shows up in the app

| Research idea | In the app |
|---|---|
| Assisted performance is not unaided learning (Bastani et al., 2025) | Help unlocks only after a real attempt, and never shows the answer. XP rewards solving alone more than solving with help. |
| Three types of help (RQ2) | A **hint**, a **hint with a self-explanation prompt** (the learner writes the idea in their own words), or a **worked example of a similar problem** (never the task itself). A walkthrough is a last resort and is logged separately. |
| Proximal outcome | After any help, the next item is a **solo check** on the same concept: one try, no help. |
| Delayed outcome (main) | Every finished lesson gets unaided **memory checks the next day and one week later**, then at 21, 60 and 120 days. Flames on the trail show learned / next day / one week. |
| Calibration | Before every solo check the learner rates confidence (1 to 5). The app shows confidence against results, per check and over time. |
| Help-seeking patterns (RQ1, H1) | Rapid, repeated help requests trigger a gentle "one more look first?" nudge. Every request is logged with timing. |
| Adaptive, cost-aware help policy (RQ4) | A contextual bandit (Thompson sampling) chooses the help type from prior knowledge (Bayesian knowledge tracing on unaided attempts only) and recent errors. Reward: unaided success on the solo check after help (and, at lower weight, the next-day and one-week checks), minus a cost for more specific help (worked example 2, hints 1). |
| Micro-randomised trial logging | Every help option keeps a minimum probability (default 0.2), and each decision is logged with the probability of every option, so the data supports causal excursion effects and off-policy evaluation. |
| Expertise reversal (H2b) | Priors favour worked examples at low prior knowledge and hints at high prior knowledge; the bandit then learns per learner. |
| Fairness / not worse than the fixed tutor | A "same order every time" mode is the fixed guardrail tutor (hint, more specific hint, worked example). In adaptive mode every help type stays reachable. |
| Transparency (EU AI Act) | Each help window explains, in plain words, why that kind of help was chosen and shows the probabilities. Learners can switch help types on or off. |
| Overall learning (Paper III pre-, post- and delayed tests) | Every unit has a **starting check** before its first lesson, a **unit test** after its last lesson and a **one-week test** a week later: one unaided question per lesson, three different counterbalanced items, confidence rated, no feedback until the end. Me shows before / after / one week per unit. |
| Teacher-set bounds (human in the loop) | Study links can set the help types the policy may use and the minimum probability (`arms=hint,explain&floor=0.25`); they are logged and locked. |
| Durable learning over speed | Fast track skips easier items only after three clean first-try answers; misses bring the idea back as a solo check a few items later. |

Settings has a **testing tool that moves the clock** forward a day or a week, so memory checks can be
tried without waiting.

## Using it as a research tool

Study links (`?study=CODE&pid=P01&cond=random`) enrol a participant with consent, assign the help condition
at random (or as given) and lock the settings that define it. Every help decision logs its probabilities,
posterior beliefs and random draw; every outcome (next solo check, next day, one week) is logged as its own
event. `node tools/merge-exports.mjs <folder>` pools participants' exports into analysis-ready CSV files, a
descriptive report and a **research-questions report**: help-seeking patterns against one-week results (RQ1),
causal contrasts between help types by prior knowledge (RQ2), which short-term signal best predicts the
one-week check (RQ3), doubly robust off-policy values of the fixed tutor and a learned policy with a fairness
check for the lowest tertile (RQ4), learning gains from the unit tests, carry-over and later help requests, and `node tools/simulate.mjs` simulates the help policy for planning. Settings has a
**researcher dashboard** (`#/researcher`, hidden for enrolled participants) that shows data health and help
decisions and pools several participants' exports in the browser. Read `docs/RESEARCH_DATA.md` first: it has
the study workflow, the data dictionary and the known limitations. `docs/PARTICIPANT_GUIDE.md` and
`docs/CONSENT_TEMPLATE.md` are fill-in templates (not approved documents).

## Data

Everything is stored on the learner's device (local storage and IndexedDB). Nothing is sent anywhere.
Settings > Research and data can download:

- **JSON**: all events, help decisions with outcomes, mastery records and bandit state.
- **CSV**: three files: events, help decisions (with probabilities, posterior, outcomes and gaps) and unaided
  checks (confidence, result, memory stage), ready for mixed models or off-policy evaluation.

**Backup and restore** (Settings > Backup) saves one learner's name, progress, settings and events to a
JSON file and restores it as a new learner, on this or another device.

**Offline use**: a service worker (`sw.js`) caches the app and, after first use, the Python and SQL runtimes
and fonts, so lessons work without a network (on https or localhost).

Exports identify the learner by a random code (for example `L-7KQ2MD`), not by name. They include the
text learners wrote when explaining hints.

## Content and its accuracy

104 lessons in 26 units (see `docs/SYLLABUS.md`). Each lesson has teach cards, step-through code
tracing, six kinds of practice (choose, predict the output, fill the gap, put lines in order, find
the bug, write code), a worked example and a pool of check items for solo and memory checks.

Content accuracy is enforced by machine, not by eye:

- `node tools/verify-content.mjs` runs **every** code snippet in every lesson with real CPython, Node
  and SQLite, compares every stated output, trace and query result, tries every wrong combination of
  fill-in chips and every wrong line order to make sure no item has two right answers, checks that
  every write task's solution passes and its starter fails, and checks text rules (length, quotes,
  formatting).
- `#/selftest` (open http://localhost:8140/#/selftest) repeats those checks inside the browser with the
  same runtimes learners use.
- `node --test tests/` runs the unit tests for the adaptive engine and the output formatter.

How to write lessons: `docs/CONTENT_GUIDE.md`.

## Project layout

```
index.html, css/app.css      page and styles
js/engine/                   adaptive engine (no DOM): tutor, mastery, help policy, calibration, rewards, grading
js/run/                      code runners: Pyodide worker, JavaScript worker, sql.js, HTML checker
js/ui/                       screens: learn trail, lesson player, memory, playground, me, settings, welcome
content/                     courses, one file per unit; content/sql/db.js is the practice database
sw.js, js/backup.js          offline cache; backup file format
tools/                       dev server, content verifier and its runners
tests/                       unit tests
docs/                        syllabus and content guide
```

## Licence

MIT. Pyodide (MPL 2.0) and sql.js (MIT) are loaded from their public CDNs.
