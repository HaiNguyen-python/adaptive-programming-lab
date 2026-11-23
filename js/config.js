/** App-wide settings. Change the name here and it changes everywhere. */
export const APP = {
  name: 'Adaptive Programming Lab',
  short: 'Adaptive',
  rest: 'Programming Lab',
  version: '1.5.0',
  tagline: 'Learn to code. Make it stick.',
  mascot: 'Nova',
};

/**
 * Where the code runtimes come from. They are open-source projects loaded on demand:
 * Pyodide runs real Python in the browser, sql.js runs real SQLite.
 * To host them yourself, copy the files next to the app and change these addresses.
 */
export const RUNTIME = {
  pyodide: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  sqljs: 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/',
  // Anthropic's official JavaScript SDK, loaded only when the optional AI tutor is switched on.
  anthropicSdk: 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@1.6.0/+esm',
  runTimeoutMs: 6000,
  loadTimeoutMs: 60000,
};

/**
 * Shown to participants who open a study link (see js/study.js). Fill in your own details and make sure the
 * wording matches your ethics approval. If `contact` is empty that line is left out.
 */
/**
 * The research database (Supabase, region eu-north-1). The key is a publishable key: with it a participant's
 * device can only call the two "submit" functions, which add rows to a study the researcher has opened. It
 * cannot read anything. Reading needs a researcher account (see docs/RESEARCH_DATA.md, section 10).
 */
export const RESEARCH_DB = {
  url: 'https://bvnufhwtwhozcbrpdxdf.supabase.co',
  key: 'sb_publishable_xojAuZVv_6HS478QzEgvbw_FyZPvmPI',
};

export const STUDY_INFO = {
  version: 2,  // 2: data is sent to the research database automatically (1: kept on the device only)
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
