import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { assertDatabaseMapping } from "../env/database-mapping.mjs";
import * as schema from "./schema";

export function createDb(env: NodeJS.ProcessEnv = process.env) {
  const mapping = assertDatabaseMapping(env, { role: "guard" });
  if (mapping.idle || !env.DATABASE_URL) {
    throw new Error("DATABASE_URL_REQUIRED");
  }
  return drizzle({ client: neon(env.DATABASE_URL), schema });
}

export type Database = ReturnType<typeof createDb>;
