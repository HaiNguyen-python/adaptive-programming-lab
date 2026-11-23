# Using Adaptive Programming Lab as a research tool

This document is for the researcher. It covers how to run a study with the app, what is recorded, how to
analyse it, and what the data can and cannot support. Data format version: **2** (`dataVersion` in exports). Sections 7 and 8 describe the unit tests and the
research-question analyses added in app version 1.1.

## 1. Running a study

1. **Host the app** on any static web server (for example GitHub Pages). Participants use their own device.
   Study participants' devices **send their data automatically to the research database** (section 10).
   Add `upload=0` to a link to keep that participant's data on the device only (they then send the file).
2. **Prepare documents**: `docs/CONSENT_TEMPLATE.md` (information sheet and consent) and
   `docs/PARTICIPANT_GUIDE.md` are templates to adapt and get approved.
   **Fill in `STUDY_INFO` in `js/config.js`** (contact and ethics statement). The consent page shows this text.
   Adapt the wording in `js/ui/welcome.js` to your approved information sheet and consent form: the text
   in the app is a plain-language starting point, not an approved form.
3. **Give each participant a link**:
   `https://your.host/app/?study=AALTO-2026&pid=P014&cond=random`
   - `study`: study code (letters, digits, `-`, `_`, up to 40).
   - `pid`: participant code you choose. Use codes, never names.
   - `cond`: `random` (default; fair coin from the browser's secure random source, logged with its
     probability 0.5), or `adaptive` / `fixed` to assign the condition yourself (for example from a
     blocked randomisation list; logged as `assignment: given`).
   - `arms` (optional): the help types the policy may use, set with the teachers, for example
     `arms=hint,explain`. Unknown names are ignored. Default: all three.
   - `ai=1` (optional): Nova's AI tutor writes the content of the help (section 9). Leave it out to use the
     written hints only. With `ai=1` the researcher enters a Claude API key on each participant device.
   - `floor` (optional): the minimum probability of each allowed help type in the adaptive condition,
     0 to 1/3 (capped). Default 0.2.
   - A link without a valid `pid` does not enrol anyone: the participant is asked for their personal link.
   - Someone who already uses the app on that device is offered to join as a **new learner**; their
     existing progress is kept separately and is never mixed with the study data.
4. On first start the participant reads the information, ticks the consent box and is enrolled. The
   condition is set and **locked**: the help mode, the allowed help types, the confidence mode, the
   probability floor, the cost weight and the clock testing tool are hidden, and "Add a learner" and
   "Start over" are not offered. The query string is removed from the address bar after enrolment. A
   participant who declines can still use the app, with nothing recorded as a study.
5. **Collect data**: ask participants to open Settings and press *Download (JSON)* (and optionally the CSV
   files) and send you the file. When the same participant sends several files, the pooling tools use the
   latest (`exportedAt`) and report the older ones as skipped. Ask for a download at fixed times (for example after the one-week check),
   not only at the end, because browser data can be lost (see Limitations).
6. **Pool and analyse**:
   `node tools/merge-exports.mjs path/to/exports --out results` writes `participants.csv`,
   `decisions.csv`, `checks.csv`, `help-seeking.csv`, `episodes.csv`, `unit-tests.csv`, `report.md`,
   `research-questions.md` and `summary.json` (section 8).
   The same pooling is available in the app: Settings > For researchers and teachers > Researcher
   dashboard (`#/researcher`), which also shows data health for the learner on that device.
7. **Plan**: `node tools/simulate.mjs --learners 60 --decisions 40 --effect 0.15` shows how the policy
   behaves under assumed effects (see section 5).

One device per participant is assumed. A second browser or device would create a second, un-enrolled
learner; ask participants to use one browser.

## 2. What is recorded

Everything is stored on the participant's device: progress in local storage, the event log in IndexedDB.
Exports identify the learner by `learner` (random code such as `L-7KQ2MD`) and, in a study, `study`, `pid`
and `cond`. Names are not exported. What the learner typed when explaining a hint (`explain` events) is.

### Event log (`events`, CSV `events`)

`t` is the real time in milliseconds since 1970 (UTC), always set by the logger. When the data carries its
own app-clock time (help decisions), that is kept as `clockT`. `shift` is present and non-zero when the clock
testing tool was in use (not possible in a study). `session` links events of one lesson or review.

| type | fields | meaning |
|---|---|---|
| `onboarded` | course, knows, goal, helpMode, tzOffsetMin, dataVersion | first run finished. `tzOffsetMin` is the device offset from UTC (day boundaries use local time) |
| `study_enrolled` | study, pid, cond, assignment (`random`/`given`), pAssign, requested, consentVersion | enrolment and consent |
| `session_start` / `session_end` / `session_left` | kind (`lesson`, `review`, `practice`, `placement`), lesson, course, xp, items, ms, at | session boundaries; `session_left` means the learner closed it early |
| `item_shown` | itemId, lessonId, kind, role, solo | an item appeared |
| `confidence` | itemId, role, conf (1 to 5) | rating given before an item |
| `attempt` | itemId, kind, role, solo, attempt, correct, helps, ms | every answer attempt; `ms` since the item appeared |
| `nudge` | itemId, helps, ms | the "one more look first?" prompt after rapid help requests |
| `help_decision` | the full decision record (section 3) | one per help request |
| `help_outcome` | decision, kind (`proximal`, `nextDay`, `week`), value (0/1), role, itemId, arm, sinceMs or gapDays | an outcome attached to a decision, logged when it happens |
| `explain` | decision, chars, text, ms | what the learner wrote when explaining a hint |
| `walkthrough` | itemId, fails, helps | last-resort solution shown (logged separately from the three help types) |
| `item_result` | itemId, lessonId, kind, role, solo, firstTry, correct, attempts, helps, walkthrough, skipped, conf, ms, xp, memory, pL, stage | the final record of an item |
| `setting` | name, value | changes to help mode, probability floor, cost weight, confidence mode, allowed help types |
| `lab_run` | lang, ok, chars | a run in the free playground |
| `ai_help` | decision, itemId, arm, model, ms, inputTokens, outputTokens, hint, question, worked | the AI tutor wrote the content of a help decision (section 9) |
| `ai_fallback` | decision, itemId, arm, reason, message, kind | the AI tutor was not used for a decision and the written help was shown (`reason`: `leak`, `invalid_example`, `refusal`, `max_tokens`, `format`, or an error status) |
| `ai_explain_feedback` | decision, itemId, model, text | the AI tutor answered what the learner wrote when explaining a hint |
| `lab_ai_hint` | lang, chars, hadError, model, text | a hint about the learner's own code in the Playground |
| `test_skipped` | test, unit, course | the learner skipped a unit's starting check (not possible in a study) |
| `notes_opened` | lessonId, course, shown, lock | the learner opened a lesson's notes after finishing it. `shown: false` means the notes stayed closed because an unaided measure was due first: `lock: memory` (the lesson's memory check) or `lock: unit-test` (its unit's one-week test). While locked, the lesson cannot be practised either, and free practice leaves those ideas out |
| `quickfire_start` | course, pool | a Quick fire round started (60 seconds of "what does this print?" from finished lessons; not offered in a study) |
| `quickfire_round` | course, score, right, total, bestCombo, record, ms | a Quick fire round ended. It never changes mastery or memory checks, so it does not touch the outcome measures |

Unit tests are sessions with `kind: 'test'` (`session_start` also has `test`: `pre`, `post` or `delayed`, and
`unit`). Their questions are `item_result` rows with `role` `test-pre`, `test-post` or `test-delayed`.

`role` values: `practice` (lesson step, help allowed), `helpcheck` (unaided check right after help),
`retry`, `final` (unaided check that ends a lesson), `warmup` and `memory` (memory checks), `extra`
(free practice), `placement`, and `test-pre`, `test-post`, `test-delayed` (unit tests, section 7). Solo items (`solo: true`) have one try and no help.

`item_result.memory` (memory checks only): `{ before, after, gapDays, nextInDays, stageBefore }`. Stages:
1 learned, 2 next-day check passed, 3 one-week check passed, then 21, 60 and 120 days. `gapDays` counts
from the previous memory check of that concept (or from first learning); practising a lesson again does
not reset it.

### Help decisions (`decisions`, CSV `help-decisions`)

One row per help request.

| field | meaning |
|---|---|
| `id`, `sessionId`, `lessonId`, `itemId`, `t` | identifiers; `t` is the app's clock (equals real time unless `shift` is set) |
| `policy` | `thompson-floor-1` (adaptive) or `fixed-ladder` |
| `pk`, `pL` | prior knowledge of the concept (`low` < 0.35 <= `mid` < 0.7 <= `high`) and the underlying estimate |
| `errors`, `helpsBefore` | failed attempts on the item and help already given on it (the decision context) |
| `arms`, `probs` | help types that could be chosen and the probability of each: the **propensities** |
| `posterior` | Beta(a, b) beliefs of each available arm at decision time |
| `u` | the uniform draw that selected the arm: `sampleFrom(() => 0, probs, u)` reproduces `arm` |
| `floor`, `costWeight`, `allow` | the settings in force |
| `arm`, `cost` | help type given (`hint`, `explain`, `worked`) and its cost (worked 2, others 1) |
| `source`, `model`, `aiMs`, `aiError` | who wrote the help: `authored` (the written hints) or `ai`; the model and the time it took; why the AI was not used when it was on |
| `proximal`, `proximalRole`, `proximalItemId`, `proximalAt` | 1/0 on the first unaided check after the help (same session, same lesson) and which check it was |
| `nextDay`, `nextDayGap` | 1/0 on the first stage-1 memory check after the day of the decision, and days elapsed |
| `week`, `weekGap` | the same for the stage-2 (one-week) check |
| `cond`, `shift` | study condition and clock shift |

`null` means the outcome has not happened (yet). Use `help_outcome` events as the complete record: the
`decisions` list in the saved state keeps the latest 1000 decisions only.

### Unaided checks (CSV `unaided-checks`, built from the full event log)

One row per solo item that is not a placement question: `conf`, `correct` (first try), `attempts`, `ms`,
`role`, `stageBefore`, `stageAfter`, `gapDays` (days since the previous check of that concept, memory
checks only), `afterHelp` (the learner asked for help on this lesson earlier in the same session). This is
the table for durable learning (retention by stage and gap) and calibration (confidence against `correct`).

## 3. How the design maps to the data

- **Micro-randomised trial.** In adaptive mode every available help type has probability at least `floor`
  (default 0.2, capped at 1/k). The decision point is each help request; the context is `pk` and
  `errors`; the proximal outcome is `proximal`; delayed outcomes are `nextDay` and `week`. Because
  `probs` are logged for every decision, you can estimate causal excursion effects with weights
  `1/probs[arm]` and evaluate other policies off-policy (`armValues` in `tools/analysis.mjs` does the
  simple inverse-probability-weighted version).
- **Fixed-ladder comparison.** The `fixed` condition gives a hint while hints remain, then a worked
  example. Its probabilities are 1 for the arm given, so the *comparison between conditions* rests on the
  random assignment of learners (`study.assignment`, `pAssign`), not on within-learner randomisation.
- **Calibration.** Confidence (1 to 5, mapped to 0, 0.25, ..., 1) is rated before solo checks. `bias` is
  mean confidence minus accuracy (positive = overconfident). The analysis tool also reports the Brier score.
- **Durable learning.** The main delayed outcome is the unaided one-week check (`week`, stage-2 checks).
  The check is on the same concept but with a different item from the lesson's pool of five.

## 4. Known limitations (read before analysing)

1. **Browser storage can be lost.** Clearing site data, private windows or some browser cleanups remove
   progress and the event log. Ask for exports at fixed times; the Settings backup also restores a learner.
2. **Proximal outcome is not always the check right after the help.** (A walkthrough on its own, with no
   help decision, does not insert a check, so the inserted checks are kept for real help decisions.) It is the first unaided check of
   that lesson in the same session. Normally that is the `helpcheck` inserted right after the item, but
   if the limit of inserted checks was reached it is the `final` check. Filter on `proximalRole`. If the
   learner leaves the session first, it stays `null`.
3. **Several decisions can share one outcome.** Two help requests on one item, or two items before the
   next check, receive the same `proximal` value. Treat decisions as clustered within learner and lesson.
4. **Delayed outcomes are labelled by stage, not elapsed time.** `nextDay` is the first stage-1 memory
   check on a later calendar day, however late; use `nextDayGap` and `weekGap`. A missed next-day check
   delays the week check, which also shows up in `weekGap`.
5. **Policy learning is per learner and small.** Beliefs start from theory-based priors (`PRIORS` in
   `js/engine/help-policy.js`) and are updated only from that learner's outcomes. Posteriors are logged,
   so you can see how much any learner's policy moved from the prior.
6. **Propensities are estimated by simulation inside the policy.** Each probability comes from 400
   Thompson draws, then the floor is applied. The logged probabilities are exactly those used for the
   random choice, so inverse-probability weights are valid for this policy.
7. **Knowledge tracing uses fixed parameters** (`BKT` in `js/engine/mastery.js`), not parameters fitted to
   data. `pL` is a rough context variable, not a calibrated measure of knowledge.
8. **Item difficulty is not equated.** Check items come from pools of five written to the same concept;
   the verifier proves each answer is unambiguous but not that items are equally hard. Include `itemId`
   as a random effect.
9. **Outside study mode learners choose the condition themselves**, so comparisons there are
   observational. In study mode the condition is assigned and locked.
10. **Content is not fixed forever.** If you change lessons mid-study, record the app `version` from the
    export and keep the lesson files for that version.
11. **Consent wording is a placeholder.** The app's text is plain-language and generic. It must be
    replaced with what your ethics approval requires.

## 5. What the simulator says about power

`tools/simulate.mjs` uses the app's own policy code on synthetic learners (default: expertise-reversal
effects of 0.15 on the pass probability of the next solo check, base 0.55). With the default floor of
0.2, the adaptive policy beats the fixed ladder by only about 0.005 to 0.02 in pass rate even after 150
decisions per learner, because a floor of 0.2 with three help types keeps at least 60% of the probability
on exploration. With floor 0.1 the gap is about 0.02, and about 0.05 with floor 0.05 and a larger effect
(0.25). Plan accordingly: the main analysis power comes from the **within-learner contrasts between help
types** (randomised at every decision), not from the overall adaptive versus fixed difference. Re-run the
simulator with your own assumed effects before fixing the floor and the sample size.

## 6. Tests and checks

- `npm test` includes tests for the audit fields, outcome events, enrolment, exports and the analysis.
- `npm run verify` runs every lesson snippet in real CPython, Node and SQLite.
- `#/selftest` runs the lesson checks, including HTML and CSS checks, in the browser with the learner's
  own runtimes.
- `npm run build:sw` refreshes the offline cache list after files change.

## 7. Unit tests: pre-, post- and delayed post-tests

Paper III describes overall learning with pre-, post- and delayed post-tests. The app gives every unit:

- a **starting check** (`pre`) before the unit's first lesson, offered only while no lesson of the unit is done;
- a **unit test** (`post`) once every lesson of the unit is done;
- a **one-week test** (`delayed`), due 7 calendar days after the unit test.

Each test has one question per lesson, from the lesson's pool of five check items. The three tests use three
different items per lesson; the starting item is rotated by a hash of the learner code and the lesson
(`testItem` in `js/engine/unit-tests.js`), which counterbalances item difficulty across learners. Questions
are unaided, confidence is rated before each one, and no feedback on correctness is shown until the end.
Test answers do not change the memory-check schedule and give the same small XP for right and wrong answers.
In a study the tests are always on and the starting check cannot be skipped; outside a study learners can
turn them off in Settings or skip a starting check (`test_skipped`).

Results are saved in the export as `tests` (`unitId -> { pre, post, delayed: { t, right, total, items } }`)
and pooled into `unit-tests.csv` (one row per learner and unit). `research-questions.md` reports, per
condition, mean pre, post and one-week scores, the paired gain, the normalised gain (post - pre) / (1 - pre),
and the share of the post-test level kept after a week.

## 8. Research-question analyses (`tools/research-questions.mjs`)

These are monitoring analyses that check the whole pipeline and give a first look at a pilot. The
pre-registered analyses belong in a statistics package (mixed models; WCLS for causal excursion effects),
using the pooled CSV files.

| Research question | Function | Output |
|---|---|---|
| RQ1 help-seeking patterns | `helpSeekingFeatures`, `helpSeekingReport` | `help-seeking.csv`: per learner `helpRate`, `rapidShare` (requests less than 8 s after the previous answer), `repeatShare`, `specificShare` (worked examples), `walkthroughRate`, `attemptsBetween`, `priorPerformance` (first-try rate on the first 15 practice items), later `weekRate`, `nextDayRate`, `calibrationBias`, and a rule-based `pattern`. The report gives correlations and outcomes by pattern (H1). |
| RQ2 types of help | `excursions` | inverse-probability-weighted contrasts between help types on randomised decisions, overall and by prior knowledge (H2a, H2b), for the proximal and the one-week outcome |
| RQ3 proxy reward | `learningEpisodes`, `proxyReport` | `episodes.csv`: per learner and lesson the short-term signals (immediate task success with help, first-try rate, help requests and their specificity, the unaided check after help, the lesson check, the confidence gap) and the next-day and one-week outcomes. The report ranks the signals by AUC for the one-week check (H3). |
| RQ4 fair adaptive policy | `policyEvaluation` | doubly robust off-policy values of the fixed tutor and of a learned cost-aware policy (best modelled outcome minus a help cost), overall and for the lowest tertile of prior performance, with 95% cluster-bootstrap intervals (learners resampled, model refit each time) and the non-inferiority check with a margin (default 0.05) (H4a, H4b) |
| Paper III secondary | `carryOver`, `laterRequests` | proximal pass rate by previous and current help type in a session (lagged effects), and help requests on other items in the next 30 minutes by help type |

The outcome model in the doubly robust estimator is deliberately simple (pass rate by prior knowledge and
help type, shrunk towards the help type's mean). Because the propensities are logged, the estimate stays
unbiased even when that model is wrong; the tests check this on simulated data with a known truth.

## 9. Nova's AI tutor (optional)

The plan studies LLM tutors. Nova can use one: a teacher or researcher switches it on in Settings with their
own Claude API key (kept in that browser only, never exported or backed up). Off by default; in a study it is
used only when the study link has `ai=1`.

- **The design is unchanged.** The help policy still chooses the kind of help (hint, hint with a
  self-explanation question, worked example) with the same logged probabilities. The AI only writes the
  content for the chosen kind, for the learner's actual answer. `source` on each decision says who wrote it.
- **What is sent.** The lesson, the task, the code or pieces offered, the learner's current answer and the
  feedback they saw, and help already given on that item. The answer key is never sent; names are never sent.
- **Guards before anything is shown.** Every response is checked for the answer (the solution lines, the
  filled-in line, the right order, the corrected line, the expected output); a response that contains it is
  discarded (`ai_fallback`, `reason: leak`). An AI worked example is run in the learner's runtime and the
  real output is shown; if it does not run, it is discarded (`invalid_example`). On any problem the written
  help is shown, so a decision always gets help.
- **Requests.** Anthropic's JavaScript SDK (`RUNTIME.anthropicSdk` in `js/config.js`), structured JSON output,
  effort `low` for hints and `medium` for worked examples, and Anthropic's server-side refusal fallback
  (`fallbacks: "default"`), retried once without it if the model does not accept it. Default model Claude Opus
  5.5; Sonnet 5.5 and Haiku 5.5 can be chosen in Settings. What the AI wrote is in `ai_help` events.
- **Self-explanation feedback.** When a learner explains a hint in their own words, Nova answers in one or two
  sentences: what is right, and one question if something is missing (`ai_explain_feedback`).
- **Ethics.** Learners' answers and explanations go to Anthropic while it is on. The app says so in Settings.
  Make sure participants (and parents) are told and that the ethics approval covers it.

Nova also explains error messages without any AI: `js/engine/errors.js` gives a plain-language reading of the
common Python, JavaScript and SQL errors (what it means and what to check, never the fixed code). It is shown
under error output in coding tasks and the Playground, in both conditions. Its patterns are tested against the
real messages of CPython, Node and SQLite (`tests/errors.test.mjs`).

## 10. The research database (automatic collection)

Study participants' devices send their data to a Supabase project (`adaptive-programming-lab`, region
eu-north-1, Stockholm; free plan). Address and publishable key: `RESEARCH_DB` in `js/config.js`.

**Who can do what**

| | Participant devices (no account) | Researcher (signed in, listed in `researchers`) |
|---|---|---|
| Send data | only through `submit_events` and `submit_snapshot`, only to an **open** study | yes |
| Read data | no (no table access at all) | everything |
| Open, close studies | no | yes |

The first account that signs in on the dashboard becomes the researcher (`claim_researcher`). Create yours
before sharing any study link. To add a colleague later, add their account id to `public.researchers` in the
Supabase dashboard (SQL editor).

**What is stored**

- `events`: every event of the event log (section 2), one row each: `study_id`, `pid`, `learner`, time, type and
  the event's fields in `data`. A repeat of the same event is skipped, so sending is safe to retry.
- `snapshots`: every few minutes, and when the tab is hidden, the same JSON as "Download my data" but without
  the events (progress, help decisions with probabilities and outcomes, unit tests, concepts, bandit state).
  The dashboard uses the newest one per learner.
- Never stored: names, the Claude API key.

**Running a study with it**

1. Researcher dashboard > Research database > sign in (or create the account the first time).
2. **Open a study** with a code (for example `pilot-2027`).
3. **Links**: enter participant codes (`P01-P30`), choose the condition, and download the links as CSV. Each
   participant gets their own link.
4. During the study the table shows participants, events and when data last arrived. **Analyse** also opens the
   **participant monitor**: per participant the condition, last activity, lessons done, help moments, pass rate on
   the question done alone after help, memory checks, unit test scores and notes opened, with flags for
   participants inactive for 3 days or more; and the balance of the conditions. It downloads as a CSV.
5. **Analyse** loads everything and shows the monitoring and research-question reports with the same CSV files
   as pooled exports (`decisions.csv`, `checks.csv`, `help-seeking.csv`, `episodes.csv`, `unit-tests.csv`, ...).
   **All data (JSON)** downloads one export per participant, which `node tools/merge-exports.mjs` and
   `node tools/research-questions.mjs` also read.
6. **Close** the study when collection ends: devices stop sending; nothing already sent is lost.

**Consent.** Sending needs consent version 2 (`STUDY_INFO.version` in `js/config.js`), whose text says that
data is sent to the research database. Participants who enrolled under version 1 ("kept on this device") are
never sent. Adapt `docs/CONSENT_TEMPLATE.md` and check with Aalto's data protection guidance that the storage
location is acceptable and a data processing agreement is in place.

**Free-plan limits.** 500 MB database (roughly a few hundred participants with full event logs). A free project
is paused after about a week with no requests at all; while devices send data it stays active. A paused
project keeps its data and is restored from the Supabase dashboard. Download the data regularly as a backup.

**Abuse.** The publishable key is public by design. Someone who knows an open study code could send fake rows
for made-up learner codes; they cannot read or change anything. Use study codes that are not easy to guess,
close studies when collection ends, and check the participant codes against your list when analysing.

**Reliability of sending.** Each send repeats the last 10 minutes of events (the database skips repeats), so an
event written late is not lost; a sending mark set by a wrong device clock is ignored. A row the database refuses
is set aside after the batch is narrowed down to it, so it cannot block later data. After a failure the device
waits longer each time (up to 15 minutes); the send when the tab is hidden always runs, with `keepalive` when the
data is small enough to survive the tab closing. The participant monitor flags a participant code that appears on
more than one device (two devices, or a reinstall), so a person is not counted twice.
