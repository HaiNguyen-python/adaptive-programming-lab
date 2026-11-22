# Using PhD Programming Lab as a research tool

This document is for the researcher. It covers how to run a study with the app, what is recorded, how to
analyse it, and what the data can and cannot support. Data format version: **2** (`dataVersion` in exports).

## 1. Running a study

1. **Host the app** on any static web server (for example GitHub Pages). Participants use their own device;
   there is no server, so nothing is sent anywhere automatically.
2. **Fill in `STUDY_INFO` in `js/config.js`** (contact and ethics statement). The consent page shows this text.
   Adapt the wording in `js/ui/welcome.js` to your approved information sheet and consent form: the text
   in the app is a plain-language starting point, not an approved form.
3. **Give each participant a link**:
   `https://your.host/app/?study=AALTO-2026&pid=P014&cond=random`
   - `study`: study code (letters, digits, `-`, `_`, up to 40).
   - `pid`: participant code you choose. Use codes, never names.
   - `cond`: `random` (default; fair coin from the browser's secure random source, logged with its
     probability 0.5), or `adaptive` / `fixed` to assign the condition yourself (for example from a
     blocked randomisation list; logged as `assignment: given`).
4. On first start the participant reads the information, ticks the consent box and is enrolled. The
   condition is set and **locked**: the help mode, the allowed help types, the confidence mode, the
   probability floor, the cost weight and the clock testing tool are hidden, and "Add a learner" and
   "Start over" are not offered. The query string is removed from the address bar after enrolment. A
   participant who declines can still use the app, with nothing recorded as a study.
5. **Collect data**: ask participants to open Settings and press *Download (JSON)* (and optionally the CSV
   files) and send you the file. Ask for a download at fixed times (for example after the one-week check),
   not only at the end, because browser data can be lost (see Limitations).
6. **Pool and analyse**:
   `node tools/merge-exports.mjs path/to/exports --out results` writes `participants.csv`,
   `decisions.csv`, `checks.csv`, `report.md` and `summary.json`.
7. **Plan**: `node tools/simulate.mjs --learners 60 --decisions 40 --effect 0.15` shows how the policy
   behaves under assumed effects (see section 5).

One device per participant is assumed. A second browser or device would create a second, un-enrolled
learner; ask participants to use one browser.

## 2. What is recorded

Everything is stored on the participant's device: progress in local storage, the event log in IndexedDB.
Exports identify the learner by `learner` (random code such as `L-7KQ2MD`) and, in a study, `study`, `pid`
and `cond`. Names are not exported. What the learner typed when explaining a hint (`explain` events) is.

### Event log (`events`, CSV `events`)

`t` is the real time in milliseconds since 1970 (UTC). `shift` is present and non-zero when the clock
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

`role` values: `practice` (lesson step, help allowed), `helpcheck` (unaided check right after help),
`retry`, `final` (unaided check that ends a lesson), `warmup` and `memory` (memory checks), `extra`
(free practice), `placement`. Solo items (`solo: true`) have one try and no help.

`item_result.memory` (memory checks only): `{ before, after, gapDays, nextInDays, stageBefore }`. Stages:
1 learned, 2 next-day check passed, 3 one-week check passed, then 21, 60 and 120 days.

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
2. **Proximal outcome is not always the check right after the help.** It is the first unaided check of
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
