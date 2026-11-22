/**
 * Course registry. Each course is loaded on demand so the app starts fast.
 * To add a course: create content/<id>/index.js and list it here.
 */
export const COURSES = [
  {
    id: 'python',
    title: 'Python',
    lang: 'python',
    glyph: 'Py',
    accent: 'sky',
    tagline: 'Clear and friendly. A great first language.',
    load: () => import('./python/index.js'),
  },
  {
    id: 'javascript',
    title: 'JavaScript',
    lang: 'javascript',
    glyph: 'JS',
    accent: 'flame',
    tagline: 'The language of the web. Make pages come alive.',
    load: () => import('./javascript/index.js'),
  },
  {
    id: 'sql',
    title: 'SQL',
    lang: 'sql',
    glyph: 'SQL',
    accent: 'aurora',
    tagline: 'Ask questions of data and get answers back.',
    load: () => import('./sql/index.js'),
  },
  {
    id: 'web',
    title: 'HTML & CSS',
    lang: 'web',
    glyph: '</>',
    accent: 'lingon',
    tagline: 'Build and style your own web pages.',
    load: () => import('./web/index.js'),
  },
];
