/** App-wide settings. Change the name here and it changes everywhere. */
export const APP = {
  name: 'PhD Programming Lab',
  short: 'PhD',
  rest: 'Programming Lab',
  version: '1.0.0',
  tagline: 'Learn to code. Make it stick.',
  mascot: 'Kip',
};

/**
 * Where the code runtimes come from. They are open-source projects loaded on demand:
 * Pyodide runs real Python in the browser, sql.js runs real SQLite.
 * To host them yourself, copy the files next to the app and change these addresses.
 */
export const RUNTIME = {
  pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  sqljs: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/',
  runTimeoutMs: 6000,
  loadTimeoutMs: 60000,
};

/**
 * Shown to participants who open a study link (see js/study.js). Fill in your own details and make sure the
 * wording matches your ethics approval. If `contact` is empty that line is left out.
 */
export const STUDY_INFO = {
  version: 1,
  title: 'Taking part in a research study',
  contact: '',   // for example: 'Name, email address'
  ethics: '',    // for example: 'Approved by the university research ethics committee, statement number'
};

export const RESEARCH = {
  title: 'The Cost of Easy Answers',
  subtitle: 'Adaptive help from large language model tutors for durable learning and accurate self-assessment in programming education',
  author: 'Hai Nguyen',
  place: 'Aalto University, Computing Education Research',
};
