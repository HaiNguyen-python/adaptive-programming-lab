import u1 from "./u1-asking.js";
import u2 from "./u2-patterns.js";
import u3 from "./u3-summaries.js";
import u4 from "./u4-joins-changes.js";
import { DB_SQL, DB_TABLES } from "./db.js";

export default {
  about: "SQL is the language for asking questions of data stored in tables. Almost every app, shop and game keeps its data in a database you can query with SQL.",
  db: DB_SQL,
  tables: DB_TABLES,
  units: [u1, u2, u3, u4],
};
