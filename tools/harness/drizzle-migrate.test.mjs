import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "../../lib/env/database-mapping.mjs";

const migrate = fileURLToPath(new URL("./drizzle-migrate.mjs", import.meta.url));
const productionUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`;
const stagingUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}.us-east-2.aws.neon.tech/neondb`;

function runMigrate(env) {
  return spawnSync(process.execPath, [migrate], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("drizzle-migrate CLI", () => {
  it("exits before connecting when APP_ENV is production", () => {
    const result = runMigrate({
      APP_ENV: "production",
      NEON_BRANCH: "production",
      DATABASE_URL_UNPOOLED: productionUnpooled,
    });
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr);
    assert.ok(body.errors.includes("PRODUCTION_MIGRATION_NOT_ALLOWED"));
    assert.ok(body.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });

  it("exits before connecting when APP_ENV is staging", () => {
    const result = runMigrate({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL_UNPOOLED: stagingUnpooled,
    });
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr);
    assert.ok(body.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });
});
