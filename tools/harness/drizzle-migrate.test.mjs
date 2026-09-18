import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "../../lib/env/database-mapping.mjs";

const migrate = fileURLToPath(new URL("./drizzle-migrate.mjs", import.meta.url));
const developmentUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}.us-east-2.aws.neon.tech/neondb`;
const productionUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`;
const stagingUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}.us-east-2.aws.neon.tech/neondb`;

function runMigrate(env, args = []) {
  return spawnSync(process.execPath, [migrate, ...args], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function stderrBody(result) {
  return JSON.parse(result.stderr.trim().split("\n").at(-1));
}

describe("drizzle-migrate CLI", () => {
  it("exits before connecting when APP_ENV is production", () => {
    const result = runMigrate({
      APP_ENV: "production",
      NEON_BRANCH: "production",
      DATABASE_URL_UNPOOLED: productionUnpooled,
    });
    assert.notEqual(result.status, 0);
    const body = stderrBody(result);
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
    const body = stderrBody(result);
    assert.ok(body.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });

  it("AE3: --target staging without an unpooled URL is refused", () => {
    const result = runMigrate(
      { APP_ENV: "staging", NEON_BRANCH: "staging" },
      ["--target", "staging"],
    );
    assert.notEqual(result.status, 0);
    assert.ok(stderrBody(result).errors.includes("MIGRATE_REQUIRES_UNPOOLED"));
  });

  it("AE3: --target production without --confirm-production is refused", () => {
    const result = runMigrate(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL_UNPOOLED: productionUnpooled,
      },
      ["--target", "production"],
    );
    assert.notEqual(result.status, 0);
    assert.ok(stderrBody(result).errors.includes("PRODUCTION_MIGRATION_NOT_CONFIRMED"));
  });

  it("refuses --target production against a development URL", () => {
    const result = runMigrate(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL_UNPOOLED: developmentUnpooled,
      },
      ["--target", "production", "--confirm-production"],
    );
    assert.notEqual(result.status, 0);
    assert.ok(stderrBody(result).errors.includes("PRODUCTION_ENV_WRONG_ENDPOINT"));
  });

  it("refuses an unknown target", () => {
    const result = runMigrate(
      {
        APP_ENV: "development",
        NEON_BRANCH: "development",
        DATABASE_URL_UNPOOLED: developmentUnpooled,
      },
      ["--target", "lab"],
    );
    assert.notEqual(result.status, 0);
    assert.ok(stderrBody(result).errors.includes("MIGRATION_TARGET_INVALID"));
  });
});
