import "server-only";
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { assertDatabaseMapping } from "../env/database-mapping.mjs";
import * as schema from "./schema";

/**
 * WebSocket pool so writes can use interactive transactions.
 * neon-http cannot BEGIN/COMMIT a multi-statement prepare.
 */
export function createDb(env: NodeJS.ProcessEnv = process.env) {
  const mapping = assertDatabaseMapping(env, { role: "guard" });
  if (mapping.idle || !env.DATABASE_URL) {
    throw new Error("DATABASE_URL_REQUIRED");
  }
  if (typeof WebSocket === "undefined") {
    throw new Error("WEBSOCKET_REQUIRED");
  }
  neonConfig.webSocketConstructor = WebSocket;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  return drizzle({ client: pool, schema });
}

export type Database = ReturnType<typeof createDb>;

let sharedDb: Database | undefined;

/** Reuse one pool per Node process; tests may keep using createDb for isolated fixtures. */
export function getDb() {
  sharedDb ??= createDb();
  return sharedDb;
}
