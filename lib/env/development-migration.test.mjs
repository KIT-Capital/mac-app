import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "./database-mapping.mjs";
import { evaluateDevelopmentMigration } from "./development-migration.mjs";

const developmentUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}.us-east-2.aws.neon.tech/neondb`;
const stagingUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}.us-east-2.aws.neon.tech/neondb`;
const productionUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`;

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
