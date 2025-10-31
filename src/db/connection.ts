import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgres://postgres:123456@localhost:5432/sellio",
});

export const db = drizzle(pool);
