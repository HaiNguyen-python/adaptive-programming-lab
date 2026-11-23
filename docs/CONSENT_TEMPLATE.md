# Information sheet and consent: template

> **This is a template, not an approved document.** It lists the points a study of this app usually
> needs to cover. Replace every [placeholder], remove what does not apply, and use the wording and format
> your ethics committee and data-protection office require (for example a privacy notice under the GDPR).
> The in-app consent page (`js/ui/welcome.js`, `STUDY_INFO` in `js/config.js`) is a short version of this
> text and must match whatever you get approved.

## 1. The study

**Title:** [study title]
**Researcher:** [name, role, organisation, email]
**Supervisor / responsible person:** [name, email]
**Approval:** [committee name and reference number, if applicable]

**Purpose.** [One or two plain sentences: for example, to learn which kinds of help from a learning app help
people remember programming a week later, and how well people judge what they know.]

**What you will do.** Use the app Adaptive Programming Lab for about [time] over [period]. You will do short
lessons, ask for help when you want it, do memory checks the next day and a week later, and sometimes rate
how sure you are before answering.

**Different versions of the app.** Participants may be given different versions of how the app chooses
help. Which version you get is decided [randomly / by the researcher]. All versions give hints or
examples, never the answer.

## 2. What data is recorded

- Your answers and whether they were right, with times.
- When you ask for help, which kind you got, and how you did afterwards.
- Your confidence ratings.
- Text you write when asked to explain a hint in your own words.
- Your progress and memory-check results.
- A participant code [and, if used, your age group / prior experience / course: list exactly what you collect].
- Your device's time zone offset. **Not recorded:** your name, email, IP address or location. [Edit to match
  what you really collect.]

Your nickname stays on your device. Exported files use a code instead of your name.

## 3. Where the data goes and how long it is kept

- While you use the app, your answers and help requests are saved on your device and **sent automatically**
  to the study's research database (Supabase, servers in the EU, Stockholm), under your participant code
  only. Your nickname is never sent. Only the researcher can read the database.
  [If the study uses `upload=0` links instead: "Everything is saved only on your device. At [dates] you send
  the exported file to [researcher/email/upload service]."]
- The researcher stores the files at [location, access, encryption]. Files are kept until [date/event] and
  then deleted [or anonymised and archived at ...].
- Results will be reported in [thesis, articles] without identifying anyone. [Say whether anonymised data
  will be shared openly.]
- Legal basis and rights under the GDPR: [controller, legal basis, right to access, correct, withdraw,
  complain to the data protection ombudsman].

## 4. Your choices

- Taking part is **voluntary**. You may stop at any time without giving a reason and without any
  consequence [for grades, employment or anything else relevant].
- To stop: tell [contact] and delete the data on your device (Settings > Delete this learner).
- If you have already sent data, you can ask to have it removed until [date after which it is anonymised and
  cannot be traced back].

## 5. Possible risks and benefits

[Examples: no known risks beyond everyday computer use; you may find some questions hard; you may learn some
programming. State any compensation or credit.]

## 6. Questions

Contact [name, email, phone]. For concerns about how the study is run: [ethics committee contact].

## 7. Consent

☐ I have read the information above and had the chance to ask questions.
☐ I understand taking part is voluntary and I can stop at any time.
☐ I agree to the data described above being recorded and sent to the researcher.

Participant code: ______   Date: ______
[Signature if on paper. In the app, ticking the box on the consent page is recorded as `study_enrolled`
with the consent version and time.]
