import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import { sql } from "drizzle-orm";
import { assertDatabaseMapping } from "../../lib/env/database-mapping.mjs";

const mapping = assertDatabaseMapping(process.env, { role: "guard" });

if (mapping.idle) {
  console.log(JSON.stringify({ ok: true, idle: true, errors: [] }));
  process.exit(0);
}

const db = drizzle({ client: neon(process.env.DATABASE_URL) });
const result = await db.execute(sql`
  select id, label
  from mac_schema_probe
  where id = 'probe'
`);
const rows = Array.isArray(result) ? result : result.rows;
const row = rows?.[0];
if (!row || row.id !== "probe" || row.label !== "ok") {
  console.error(JSON.stringify({ ok: false, errors: ["SCHEMA_PROBE_MISSING"] }));
  process.exit(1);
}

console.log(
  JSON.stringify({
    ok: true,
    appEnv: mapping.appEnv,
    endpointId: mapping.endpointId,
    probe: "ok",
    errors: [],
  }),
);
