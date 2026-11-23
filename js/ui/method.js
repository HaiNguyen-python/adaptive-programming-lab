/**
 * "How Nova teaches, and why" (#/method): each teaching practice in the app, what the learner does, why it
 * helps, and the research it rests on. For learners, teachers, and reviewers of the research.
 */
import { h, md } from '../lib/dom.js';
import { iconSvg } from '../lib/icons.js';
import { RESEARCH } from '../config.js';

const PRACTICES = [
  {
    icon: 'target', title: 'You try first',
    does: 'Help opens only after your first attempt.',
    why: 'Struggling a little before getting help makes you think harder about the problem, and that thinking is what you remember. Help that comes too early does the thinking for you.',
    refs: ['Kapur (2008). Productive failure. Cognition and Instruction, 26(3).', 'Koedinger & Aleven (2007). Exploring the assistance dilemma in experiments with cognitive tutors. Educational Psychology Review, 19(3).'],
  },
  {
    icon: 'bulb', title: 'Help that leaves the thinking to you',
    does: 'Nova gives a hint, a hint with a question to explain it in your own words, or a worked example of a similar problem. Never the answer to your task.',
    why: 'Help works best when you still have to do the last step yourself. Explaining an idea in your own words is one of the most reliable ways to understand it.',
    refs: ['Aleven, Roll, McLaren & Koedinger (2016). Help helps, but only so much. International Journal of Artificial Intelligence in Education, 26(1).', 'Chi, Bassok, Lewis, Reimann & Glaser (1989). Self-explanations. Cognitive Science, 13(2).'],
  },
  {
    icon: 'steps', title: 'Worked examples with named steps',
    does: 'When you see a worked example, each part has a short label that says what it does.',
    why: 'Studying a solved example is faster than solving from scratch when an idea is new. Labels for the steps help you use the same plan on new problems.',
    refs: ['Sweller & Cooper (1985). The use of worked examples as a substitute for problem solving in learning algebra. Cognition and Instruction, 2(1).', 'Margulieux, Guzdial & Catrambone (2012). Subgoal-labeled instructional material improves performance and transfer in learning to develop mobile applications. ICER 2012.'],
  },
  {
    icon: 'eye', title: 'Predict, then check',
    does: 'Before writing code, you read code and predict what it prints.',
    why: 'Reading and predicting comes before writing. It builds a picture of what the computer does, step by step.',
    refs: ['Sentance, Waite & Kallia (2019). Teaching computer programming with PRIMM: a sociocultural perspective. Computer Science Education, 29(2-3).'],
  },
  {
    icon: 'layout', title: 'From completing to building',
    does: 'You put lines in order, fill in gaps, find the bug, and then write whole programs.',
    why: 'Each task takes away a little more support, so you can focus on one new thing at a time.',
    refs: ['Parsons & Haden (2006). Parson\'s programming puzzles: a fun and effective learning tool for first programming courses. ACE 2006.', 'Van Merriënboer (1990). Strategies for programming instruction in high school: program completion vs. program generation. Journal of Educational Computing Research, 6(3).'],
  },
  {
    icon: 'solo', title: 'Prove it on your own',
    does: 'After help, the next question is one you answer alone.',
    why: 'Getting a task right with help is not the same as knowing it. Answering on your own shows what you really know, and recalling an idea makes it stronger.',
    refs: ['Roediger & Karpicke (2006). Test-enhanced learning: taking memory tests improves long-term retention. Psychological Science, 17(3).'],
  },
  {
    icon: 'calendar', title: 'Checks the next day and a week later',
    does: 'Nova asks about each idea again one day and one week after the lesson, without help.',
    why: 'Practice spread out over days is remembered much longer than the same practice in one go.',
    refs: ['Cepeda, Pashler, Vul, Wixted & Rohrer (2006). Distributed practice in verbal recall tasks. Psychological Bulletin, 132(3).'],
  },
  {
    icon: 'scale', title: 'How sure are you?',
    does: 'Before a check on your own, you say how sure you are. The Me page shows how well your feeling matches your results.',
    why: 'Learners who think they know more than they do stop practising too early. Seeing the gap helps you decide what to practise.',
    refs: ['Dunlosky & Rawson (2012). Overconfidence produces underachievement. Learning and Instruction, 22(4).'],
  },
  {
    icon: 'chart', title: 'Lessons that adapt to you',
    does: 'Nova estimates what you know after every answer and skips questions you clearly know.',
    why: 'Practice is most useful just beyond what you can already do.',
    refs: ['Corbett & Anderson (1995). Knowledge tracing: modeling the acquisition of procedural knowledge. User Modeling and User-Adapted Interaction, 4(4).'],
  },
  {
    icon: 'info', title: 'Error messages in plain words',
    does: 'When your code stops with an error, Nova says what the message means and what to check, but not the fix.',
    why: 'Error messages are hard to read for beginners, and reading them is a skill worth learning.',
    refs: ['Becker et al. (2019). Compiler error messages considered unhelpful. ITiCSE Working Group Reports 2019.'],
  },
];

export function methodPage(root) {
  const page = h('div.page.method');
  page.append(
    h('div.page-head', h('h1', 'How Nova teaches, and why'),
      h('p.method-lead', 'Every part of a lesson follows research on how people learn programming and how they remember it. Here is what you do, why it helps, and where the idea comes from.')),
    h('ol.method-list', PRACTICES.map((p, i) => h('li.method-item',
      h('span.method-n', { 'aria-hidden': 'true' }, String(i + 1).padStart(2, '0')),
      h('div.method-body',
        h('h2', { html: iconSvg(p.icon) }, h('span', p.title)),
        h('p.method-does', p.does),
        h('p', p.why),
        h('details.method-refs', h('summary', p.refs.length === 1 ? 'Source' : 'Sources'), h('ul', p.refs.map((r) => h('li', r)))))))),
    h('section.method-research',
      h('h2', 'The research behind this app'),
      md(`This app is part of the doctoral research **${RESEARCH.title}**: ${RESEARCH.subtitle.charAt(0).toLowerCase()}${RESEARCH.subtitle.slice(1)} (${RESEARCH.author}, ${RESEARCH.place}).`),
      md('The question is which kind of help leaves the thinking to the learner and leads to learning that lasts. In a study, the kind of help is chosen in a controlled way and every choice is recorded with its probability, so the kinds can be compared fairly. What counts is not whether you finish a task with help, but whether you can do it **on your own**, the next day and a week later.'),
      md('Outside a study, your progress stays on this device. The one exception is the optional AI tutor, which a teacher can switch on in Settings.', 'small.muted')));
  root.append(page);
}
