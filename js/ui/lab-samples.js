/** Starter programs for the playground. Every sample is run by the test suite. */
export const LAB_LANGS = [
  { id: 'python', title: 'Python', glyph: 'Py', accent: 'sky' },
  { id: 'javascript', title: 'JavaScript', glyph: 'JS', accent: 'flame' },
  { id: 'sql', title: 'SQL', glyph: 'SQL', accent: 'aurora' },
  { id: 'web', title: 'HTML & CSS', glyph: '</>', accent: 'lingon' },
];

export const SAMPLES = {
  python: [
    { name: 'Hello loop', code: ['# Change this code, then press Run', 'name = "Nova"', 'for i in range(3):', '    print(f"Hello, {name}! Round {i + 1}")'] },
    { name: 'Times table', code: ['n = 7', 'for i in range(1, 11):', '    print(f"{n} x {i} = {n * i}")'] },
    { name: 'Shopping total', code: ['prices = [4, 3, 12, 25]', 'total = 0', 'for price in prices:', '    total += price', 'print(f"Items: {len(prices)}")', 'print(f"Total: {total}")'] },
    { name: 'A function', code: ['def area(width, height):', '    return width * height', '', 'print(area(3, 4))', 'print(area(10, 2))'] },
  ],
  javascript: [
    { name: 'Hello loop', code: ['// Change this code, then press Run', 'const name = "Nova";', 'for (let i = 1; i <= 3; i++) {', '  console.log(`Hello, ${name}! Round ${i}`);', '}'] },
    { name: 'Times table', code: ['const n = 7;', 'for (let i = 1; i <= 10; i++) {', '  console.log(`${n} x ${i} = ${n * i}`);', '}'] },
    { name: 'Shopping total', code: ['const prices = [4, 3, 12, 25];', 'let total = 0;', 'for (const price of prices) {', '  total += price;', '}', 'console.log(`Items: ${prices.length}`);', 'console.log(`Total: ${total}`);'] },
    { name: 'An object', code: ['const pet = { name: "Bolt", age: 4 };', 'pet.age += 1;', 'console.log(pet);', 'console.log(`${pet.name} is ${pet.age} years old`);'] },
  ],
  sql: [
    { name: 'Cheap products', code: ['-- The camp shop has three tables:', '-- products, campers and orders', 'SELECT name, price', 'FROM products', 'WHERE price < 20', 'ORDER BY price;'] },
    { name: 'Campers by town', code: ['SELECT town, COUNT(*) AS campers', 'FROM campers', 'GROUP BY town', 'ORDER BY campers DESC, town;'] },
    { name: 'Best sellers', code: ['SELECT p.name, SUM(o.quantity) AS sold', 'FROM orders AS o', 'JOIN products AS p ON p.id = o.product_id', 'GROUP BY p.name', 'ORDER BY sold DESC, p.name', 'LIMIT 5;'] },
  ],
  web: [
    { name: 'Hello page', code: ['<style>', '  h1 { color: teal; }', '  .card {', '    padding: 12px;', '    border: 2px solid orange;', '    border-radius: 12px;', '  }', '</style>', '<h1>Hello from the lab</h1>', '<div class="card">', '  <p>Change this page and watch it update.</p>', '</div>'] },
    { name: 'A list', code: ['<h2>Packing list</h2>', '<ul>', '  <li>Tent</li>', '  <li>Lantern</li>', '  <li>Marshmallows</li>', '</ul>'] },
    { name: 'Cards in a row', code: ['<style>', '  .row { display: flex; gap: 12px; }', '  .card {', '    padding: 16px;', '    border-radius: 12px;', '    background-color: gold;', '  }', '</style>', '<div class="row">', '  <div class="card">Tent</div>', '  <div class="card">Lantern</div>', '  <div class="card">Rope</div>', '</div>'] },
  ],
};

export const sampleCode = (lang, index = 0) => SAMPLES[lang][index].code.join('\n');
