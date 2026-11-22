/** The loaded courses and quick lookups into them. */
import { COURSES } from '../content/index.js';
import { normalizeCourse } from './engine/content.js';

const cache = new Map();
const lessonIndex = new Map();

async function loadCourse(meta) {
  if (cache.has(meta.id)) return;
  try {
    const raw = (await meta.load()).default;
    const course = normalizeCourse(meta, raw);
    course.units = course.units.filter((u) => u.lessons.length);
    cache.set(meta.id, course);
    for (const lesson of course.lessons) lessonIndex.set(lesson.id, { lesson, course });
  } catch (e) {
    console.error(`Could not load the ${meta.title} course`, e);
  }
}

/** Load every course. A course that fails to load, or has no lessons, is simply not offered. */
export async function loadCatalog() {
  await Promise.all(COURSES.map(loadCourse));
  return courses();
}

export const courses = () => COURSES.map((m) => cache.get(m.id)).filter((c) => c && c.lessons.length);
export const getCourse = (id) => { const c = cache.get(id); return c && c.lessons.length ? c : null; };
export const findLesson = (id) => (lessonIndex.get(id) ? lessonIndex.get(id).lesson : null);
export const courseOf = (lessonId) => (lessonIndex.get(lessonId) ? lessonIndex.get(lessonId).course : null);
export const allLessonIds = () => [...lessonIndex.keys()];
