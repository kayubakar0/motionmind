import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { DB_CONNECTION_STRING } from "../lib/env";
import * as schema from "./schema";

export const pool = postgres(DB_CONNECTION_STRING, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
});

export const db = drizzle(pool, { schema });

export { schema };
