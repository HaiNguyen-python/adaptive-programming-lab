/**
 * The practice database for the SQL course: Nova's Camp Shop.
 * Every lesson, check item and playground run starts from a fresh copy of this database.
 * All people and products are invented. Do not change rows without re-running the verifier:
 * lesson answers depend on this data.
 */
export const DB_TABLES = [
  { name: 'products', about: 'Things the camp shop sells.' },
  { name: 'campers', about: 'People who shop at the camp shop.' },
  { name: 'orders', about: 'One row for each product a camper ordered.' },
];

export const DB_SQL = `
CREATE TABLE products (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price INTEGER NOT NULL,
  stock INTEGER NOT NULL,
  rating REAL
);
INSERT INTO products (id, name, category, price, stock, rating) VALUES
  (1, 'Tent', 'Shelter', 120, 5, 4.6),
  (2, 'Sleeping bag', 'Shelter', 60, 12, 4.3),
  (3, 'Lantern', 'Light', 25, 30, 4.8),
  (4, 'Flashlight', 'Light', 15, 40, 4.1),
  (5, 'Camp stove', 'Cooking', 45, 8, 4.5),
  (6, 'Cooking pot', 'Cooking', 20, 15, NULL),
  (7, 'Hot chocolate', 'Food', 4, 100, 4.9),
  (8, 'Marshmallows', 'Food', 3, 80, 4.7),
  (9, 'Trail mix', 'Food', 5, 0, 3.9),
  (10, 'Compass', 'Tools', 18, 25, NULL),
  (11, 'Water bottle', 'Tools', 12, 50, 4.2),
  (12, 'Rope', 'Tools', 9, 35, 3.8);

CREATE TABLE campers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  town TEXT NOT NULL,
  age INTEGER NOT NULL,
  email TEXT
);
INSERT INTO campers (id, name, town, age, email) VALUES
  (1, 'Aino', 'Helsinki', 12, 'aino@example.com'),
  (2, 'Mateo', 'Turku', 34, NULL),
  (3, 'Linh', 'Tampere', 27, 'linh@example.com'),
  (4, 'Noah', 'Helsinki', 9, NULL),
  (5, 'Zara', 'Oulu', 41, 'zara@example.com'),
  (6, 'Kofi', 'Turku', 16, 'kofi@example.com'),
  (7, 'Yuki', 'Espoo', 30, NULL),
  (8, 'Elsa', 'Helsinki', 58, 'elsa@example.com');

CREATE TABLE orders (
  id INTEGER PRIMARY KEY,
  camper_id INTEGER NOT NULL REFERENCES campers(id),
  product_id INTEGER NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  order_date TEXT NOT NULL
);
INSERT INTO orders (id, camper_id, product_id, quantity, order_date) VALUES
  (1, 1, 3, 2, '2026-06-01'),
  (2, 1, 7, 4, '2026-06-01'),
  (3, 2, 1, 1, '2026-06-03'),
  (4, 2, 2, 2, '2026-06-03'),
  (5, 3, 8, 5, '2026-06-04'),
  (6, 3, 7, 2, '2026-06-04'),
  (7, 4, 4, 1, '2026-06-05'),
  (8, 5, 5, 1, '2026-06-07'),
  (9, 5, 6, 1, '2026-06-07'),
  (10, 6, 11, 3, '2026-06-08'),
  (11, 6, 8, 2, '2026-06-08'),
  (12, 7, 3, 1, '2026-06-10'),
  (13, 1, 8, 3, '2026-06-12'),
  (14, 3, 12, 2, '2026-06-12');
`;
