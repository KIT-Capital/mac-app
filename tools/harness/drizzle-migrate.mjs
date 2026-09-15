import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { assertDevelopmentMigration } from "../../lib/env/development-migration.mjs";

const mapping = assertDevelopmentMigration(process.env);
const drizzleKit = join(process.cwd(), "node_modules", "drizzle-kit", "bin.cjs");

const result = spawnSync(process.execPath, [drizzleKit, "migrate"], {
  stdio: "inherit",
  env: process.env,
});

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(
  JSON.stringify({
    ok: true,
    role: "migrate",
    appEnv: mapping.appEnv,
    endpointId: mapping.endpointId,
    errors: [],
  }),
);
