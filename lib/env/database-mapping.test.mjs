import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ENDPOINT_BY_APP_ENV,
  evaluateDatabaseMapping,
} from "./database-mapping.mjs";

const developmentPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech/neondb`;
const developmentUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}.us-east-2.aws.neon.tech/neondb`;
const stagingPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}-pooler.us-east-2.aws.neon.tech/neondb`;
const stagingUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}.us-east-2.aws.neon.tech/neondb`;
const productionPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}-pooler.us-east-2.aws.neon.tech/neondb`;
const productionUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`;
const ciPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.ci}-pooler.us-east-2.aws.neon.tech/neondb`;
const ciUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.ci}.us-east-2.aws.neon.tech/neondb`;

describe("evaluateDatabaseMapping", () => {
  it("pins staging to the current Neon compute endpoint", () => {
    assert.equal(ENDPOINT_BY_APP_ENV.staging, "ep-calm-heart-a5ttpc4d");
  });

  it("pins ci to the dedicated GitHub Actions compute endpoint", () => {
    assert.equal(ENDPOINT_BY_APP_ENV.ci, "ep-tiny-poetry-a59fn11f");
  });

  it("allows an idle process with no database URLs", () => {
    const result = evaluateDatabaseMapping({});
    assert.equal(result.ok, true);
    assert.equal(result.idle, true);
  });

  it("rejects a database URL without APP_ENV", () => {
    const result = evaluateDatabaseMapping({ DATABASE_URL: developmentPooled });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("APP_ENV_REQUIRED"));
  });

  it("does not treat NODE_ENV as the database selector", () => {
    const missing = evaluateDatabaseMapping({
      NODE_ENV: "production",
      DATABASE_URL: productionPooled,
    });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.includes("APP_ENV_REQUIRED"));

    const ok = evaluateDatabaseMapping({
      NODE_ENV: "production",
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentPooled,
      DATABASE_URL_UNPOOLED: developmentUnpooled,
    });
    assert.equal(ok.ok, true);
  });

  it("rejects development APP_ENV pointed at the production endpoint", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: productionPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("DEVELOPMENT_ENV_WRONG_ENDPOINT"));
  });

  it("rejects an unknown endpoint and an unknown APP_ENV", () => {
    const unknownHost = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: "postgresql://u:p@ep-unknown-host-xxxx-pooler.us-east-2.aws.neon.tech/neondb",
    });
    assert.equal(unknownHost.ok, false);
    assert.ok(unknownHost.errors.includes("UNKNOWN_ENDPOINT"));

    const unknownEnv = evaluateDatabaseMapping({
      APP_ENV: "qa",
      DATABASE_URL: developmentPooled,
    });
    assert.equal(unknownEnv.ok, false);
    assert.ok(unknownEnv.errors.includes("APP_ENV_INVALID"));
  });

  it("rejects an allowed endpoint id on a non-Neon hostname", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL: `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}-pooler.attacker.example/neondb`,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("UNKNOWN_ENDPOINT"));
  });

  it("accepts the verified production pair for startup", () => {
    const result = evaluateDatabaseMapping(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL: productionPooled,
        DATABASE_URL_UNPOOLED: productionUnpooled,
      },
      { role: "startup" },
    );
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.production);
  });

  it("rejects production APP_ENV pointed at the development endpoint", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "production",
      NEON_BRANCH: "production",
      DATABASE_URL: developmentPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("PRODUCTION_ENV_WRONG_ENDPOINT"));
  });

  it("rejects preview when a database URL is present", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "preview",
      DATABASE_URL: developmentPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("UNMAPPED_APP_ENV_HAS_DATABASE_URL"));
  });

  it("rejects staging APP_ENV pointed at the development endpoint", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL: developmentPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("STAGING_ENV_WRONG_ENDPOINT"));
  });

  it("accepts the verified staging pair for the guard role", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL: stagingPooled,
      DATABASE_URL_UNPOOLED: stagingUnpooled,
    });
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.staging);
  });

  it("rejects pooled and unpooled URLs that target different endpoints", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentPooled,
      DATABASE_URL_UNPOOLED: productionUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("POOLED_UNPOOLED_ENDPOINT_MISMATCH"));
    assert.ok(result.errors.includes("POOLED_UNPOOLED_BRANCH_MISMATCH"));
  });

  it("rejects pooled and unpooled URLs that disagree on database name", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentPooled,
      DATABASE_URL_UNPOOLED: developmentUnpooled.replace("/neondb", "/otherdb"),
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("POOLED_UNPOOLED_DATABASE_MISMATCH"));
  });

  it("rejects swapped pooler shapes and the wrong database name", () => {
    const swapped = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentUnpooled,
      DATABASE_URL_UNPOOLED: developmentPooled,
    });
    assert.ok(swapped.errors.includes("DATABASE_URL_NOT_POOLED"));
    assert.ok(swapped.errors.includes("DATABASE_URL_UNPOOLED_IS_POOLED"));

    const named = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentPooled.replace("/neondb", "/otherdb"),
    });
    assert.ok(named.errors.includes("DATABASE_NAME_MISMATCH"));
  });

  it("rejects a production NEON_BRANCH on a non-production APP_ENV", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "production",
      DATABASE_URL: developmentPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("NON_PRODUCTION_NEON_BRANCH_PRODUCTION"));
  });

  it("rejects migration credentials on the app role", () => {
    const result = evaluateDatabaseMapping(
      {
        APP_ENV: "development",
        NEON_BRANCH: "development",
        DATABASE_URL: developmentPooled,
        DATABASE_URL_UNPOOLED: developmentUnpooled,
      },
      { role: "app" },
    );
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("MIGRATION_CREDENTIALS_ON_APP"));
  });

  it("rejects migrate without unpooled credentials and rejects production migrate by default", () => {
    const missing = evaluateDatabaseMapping({ APP_ENV: "development" }, { role: "migrate" });
    assert.ok(missing.errors.includes("MIGRATE_REQUIRES_UNPOOLED"));

    const production = evaluateDatabaseMapping(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL_UNPOOLED: productionUnpooled,
      },
      { role: "migrate" },
    );
    assert.ok(production.errors.includes("PRODUCTION_MIGRATION_NOT_ALLOWED"));
  });

  it("accepts the verified development pair for the guard role", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentPooled,
      DATABASE_URL_UNPOOLED: developmentUnpooled,
    });
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.development);
  });

  it("accepts the verified ci pair for the guard role", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: ciPooled,
      DATABASE_URL_UNPOOLED: ciUnpooled,
    });
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.ci);
  });

  it("rejects ci APP_ENV pointed at the development endpoint", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: developmentPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("CI_ENV_WRONG_ENDPOINT"));
  });

  it("rejects ci APP_ENV pointed at the production endpoint", () => {
    const result = evaluateDatabaseMapping({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: productionPooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("CI_ENV_WRONG_ENDPOINT"));
  });
});
