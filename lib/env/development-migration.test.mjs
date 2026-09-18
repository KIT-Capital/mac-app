import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "./database-mapping.mjs";
import {
  evaluateDevelopmentMigration,
  evaluateMigrationTarget,
  parseMigrationArgs,
} from "./development-migration.mjs";

const developmentUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}.us-east-2.aws.neon.tech/neondb`;
const stagingUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}.us-east-2.aws.neon.tech/neondb`;
const productionUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`;

describe("parseMigrationArgs", () => {
  it("defaults to development with no flags", () => {
    assert.deepEqual(parseMigrationArgs([]), {
      target: "development",
      confirmProduction: false,
      generate: false,
      schemaCheck: false,
    });
  });

  it("reads --target and --confirm-production", () => {
    const parsed = parseMigrationArgs(["--target", "production", "--confirm-production"]);
    assert.equal(parsed.target, "production");
    assert.equal(parsed.confirmProduction, true);
  });
});

describe("evaluateDevelopmentMigration", () => {
  it("accepts the verified development unpooled pair", () => {
    const result = evaluateDevelopmentMigration({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL_UNPOOLED: developmentUnpooled,
    });
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.development);
  });

  it("rejects production migrations", () => {
    const result = evaluateDevelopmentMigration({
      APP_ENV: "production",
      NEON_BRANCH: "production",
      DATABASE_URL_UNPOOLED: productionUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("PRODUCTION_MIGRATION_NOT_ALLOWED"));
    assert.ok(result.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });

  it("rejects staging migrations in this stage", () => {
    const result = evaluateDevelopmentMigration({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL_UNPOOLED: stagingUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });

  it("rejects migrate without unpooled credentials", () => {
    const result = evaluateDevelopmentMigration({
      APP_ENV: "development",
      NEON_BRANCH: "development",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("MIGRATE_REQUIRES_UNPOOLED"));
  });
});

describe("evaluateMigrationTarget", () => {
  it("AE3: no target stays development-only", () => {
    const result = evaluateMigrationTarget({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL_UNPOOLED: stagingUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });

  it("AE3: --target staging without an unpooled URL is refused", () => {
    const result = evaluateMigrationTarget(
      { APP_ENV: "staging", NEON_BRANCH: "staging" },
      { target: "staging" },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("MIGRATE_REQUIRES_UNPOOLED"));
  });

  it("AE3: --target production without --confirm-production is refused", () => {
    const result = evaluateMigrationTarget(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL_UNPOOLED: productionUnpooled,
      },
      { target: "production" },
    );
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, ["PRODUCTION_MIGRATION_NOT_CONFIRMED"]);
  });

  it("allows --target staging with the staging unpooled URL", () => {
    const result = evaluateMigrationTarget(
      {
        APP_ENV: "staging",
        NEON_BRANCH: "staging",
        DATABASE_URL_UNPOOLED: stagingUnpooled,
      },
      { target: "staging" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.staging);
  });

  it("refuses --target production with a development URL", () => {
    const result = evaluateMigrationTarget(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL_UNPOOLED: developmentUnpooled,
      },
      { target: "production", confirmProduction: true },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("PRODUCTION_ENV_WRONG_ENDPOINT"));
  });

  it("refuses an unknown target", () => {
    const result = evaluateMigrationTarget(
      {
        APP_ENV: "development",
        DATABASE_URL_UNPOOLED: developmentUnpooled,
      },
      { target: "preview" },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("MIGRATION_TARGET_INVALID"));
  });
});
