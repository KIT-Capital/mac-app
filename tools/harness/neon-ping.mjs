import { neon } from "@neondatabase/serverless";
import { assertDatabaseMapping } from "../../lib/env/database-mapping.mjs";

const mapping = assertDatabaseMapping(process.env, { role: "guard" });

if (mapping.idle) {
  console.log(JSON.stringify({ ok: true, idle: true, errors: [] }));
  process.exit(0);
}

const url = process.env.DATABASE_URL;
const sql = neon(url);
const rows = await sql`
  select
    current_database() as database,
    current_setting('neon.branch_name', true) as neon_branch,
    split_part(version(), ' ', 2) as pg_version
`;

const row = rows[0];

console.log(
  JSON.stringify({
    ok: true,
    appEnv: mapping.appEnv,
    expectedBranch: mapping.neonBranch,
    reportedBranch: row.neon_branch ?? "",
    endpointId: mapping.endpointId,
    database: row.database,
    pgVersion: row.pg_version,
    errors: [],
  }),
);
