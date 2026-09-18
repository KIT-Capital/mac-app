import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "./database-mapping.mjs";
import {
  assertProductionReadiness,
  evaluateProductionReadiness,
} from "./production-readiness.mjs";

/** Copy of `record` without `key`, so tests drop one prerequisite at a time. */
function without(record, key) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

const productionPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}-pooler.us-east-2.aws.neon.tech/neondb`;
const developmentPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech/neondb`;
const stagingPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}-pooler.us-east-2.aws.neon.tech/neondb`;

const SESSION_SECRET = "readiness-test-session-secret-0123456789";
const R2_SECRET = "readiness-test-r2-secret-0123456789";
const DESK_SECRET = "readiness-test-desk-secret-material-0123456789";

const livePrerequisites = {
  COLLECTOR_SESSION_SECRET: SESSION_SECRET,
  COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
  RESEND_API_KEY: "re_readiness_test",
  DESK_SESSION_KEYS: `k1:${DESK_SECRET}`,
  R2_ACCOUNT_ID: "readiness-account",
  R2_BUCKET: "mac-app",
  R2_ACCESS_KEY_ID: "readiness-access-key",
  R2_SECRET_ACCESS_KEY: R2_SECRET,
};

const productionDatabase = {
  APP_ENV: "production",
  NEON_BRANCH: "production",
  DATABASE_URL: productionPooled,
};

describe("evaluateProductionReadiness", () => {
  it("AE1: production with the flag unset is an exit-class failure", () => {
    const result = evaluateProductionReadiness({ ...productionDatabase, ...livePrerequisites });
    assert.equal(result.ok, false);
    assert.equal(result.exit, true);
    assert.deepEqual(result.errors, ["PRODUCTION_REQUIRES_LIVE_BOOK"]);
    assert.equal(result.appEnv, "production");
  });

  it("exits when the production database mapping fails", () => {
    const result = evaluateProductionReadiness({
      ...productionDatabase,
      DATABASE_URL: developmentPooled,
      MAC_LIVE_BOOK: "1",
      ...livePrerequisites,
    });
    assert.equal(result.ok, false);
    assert.equal(result.exit, true);
    assert.ok(result.errors.includes("PRODUCTION_ENV_WRONG_ENDPOINT"));
    assert.equal(result.errors.includes("PRODUCTION_REQUIRES_LIVE_BOOK"), false);
  });

  it("AE2: production with the flag on and no origin stays up as unavailable", () => {
    const result = evaluateProductionReadiness({
      ...productionDatabase,
      MAC_LIVE_BOOK: "on",
      ...without(livePrerequisites, "COLLECTOR_MAGIC_LINK_ORIGIN"),
    });
    assert.equal(result.ok, false);
    assert.equal(result.exit, false);
    assert.deepEqual(result.errors, ["COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED"]);
    assert.deepEqual(result.unavailable, ["COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED"]);
  });

  it("reports malformed desk keys, R2 names, and database URL as unavailable, not exit", () => {
    const result = evaluateProductionReadiness({
      APP_ENV: "production",
      MAC_LIVE_BOOK: "true",
      COLLECTOR_SESSION_SECRET: SESSION_SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
      RESEND_API_KEY: "re_readiness_test",
      DESK_SESSION_KEYS: "k1:short",
    });
    assert.equal(result.ok, false);
    assert.equal(result.exit, false);
    assert.ok(result.unavailable.includes("DESK_SESSION_KEYS_INVALID"));
    assert.ok(result.unavailable.includes("R2_REQUIRED"));
    assert.ok(result.unavailable.includes("DATABASE_URL_REQUIRED"));
  });

  it("refuses an HTTP origin outside development as unavailable", () => {
    const result = evaluateProductionReadiness({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL: stagingPooled,
      MAC_LIVE_BOOK: "1",
      ...livePrerequisites,
      COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
    });
    assert.equal(result.exit, false);
    assert.deepEqual(result.unavailable, ["COLLECTOR_MAGIC_LINK_ORIGIN_INVALID"]);
  });

  it("happy path: staging with every prerequisite is ok", () => {
    const result = evaluateProductionReadiness({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL: stagingPooled,
      MAC_LIVE_BOOK: "1",
      ...livePrerequisites,
      COLLECTOR_MAGIC_LINK_ORIGIN: "https://mac-app-staging.up.railway.app",
    });
    assert.deepEqual(result, {
      ok: true,
      exit: false,
      errors: [],
      unavailable: [],
      appEnv: "staging",
    });
  });

  it("staging with the flag off is browser mode, not a failure", () => {
    const result = evaluateProductionReadiness({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL: stagingPooled,
    });
    assert.equal(result.ok, true);
    assert.equal(result.exit, false);
  });

  it("development is never governed: flag off and flag on both pass", () => {
    assert.equal(evaluateProductionReadiness({ APP_ENV: "development" }).ok, true);
    assert.equal(evaluateProductionReadiness({}).ok, true);
    const misconfigured = evaluateProductionReadiness({
      APP_ENV: "development",
      MAC_LIVE_BOOK: "1",
    });
    assert.equal(misconfigured.ok, true);
    assert.deepEqual(misconfigured.errors, []);
  });

  it("never includes a secret, key, or connection string in its output", () => {
    const result = evaluateProductionReadiness({
      ...productionDatabase,
      MAC_LIVE_BOOK: "1",
      ...without(livePrerequisites, "COLLECTOR_MAGIC_LINK_ORIGIN"),
    });
    const serialized = JSON.stringify(result);
    for (const value of [SESSION_SECRET, R2_SECRET, DESK_SECRET, productionPooled, "neon.tech", "re_readiness_test"]) {
      assert.equal(serialized.includes(value), false, `output leaked ${value.slice(0, 8)}`);
    }
  });
});

describe("assertProductionReadiness", () => {
  it("exits with code 1 only for the exit class and logs JSON codes only", () => {
    const exits = [];
    const logs = [];
    const deps = {
      exit: (code) => exits.push(code),
      log: (line) => logs.push(line),
    };

    assertProductionReadiness({ ...productionDatabase, ...livePrerequisites }, deps);
    assert.deepEqual(exits, [1]);
    assert.deepEqual(JSON.parse(logs[0]), { ok: false, errors: ["PRODUCTION_REQUIRES_LIVE_BOOK"] });

    exits.length = 0;
    logs.length = 0;
    const unavailable = assertProductionReadiness(
      { ...productionDatabase, MAC_LIVE_BOOK: "1", ...without(livePrerequisites, "COLLECTOR_MAGIC_LINK_ORIGIN") },
      deps,
    );
    assert.deepEqual(exits, []);
    assert.equal(unavailable.ok, false);
    assert.deepEqual(JSON.parse(logs[0]), {
      ok: false,
      unavailable: ["COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED"],
    });

    exits.length = 0;
    logs.length = 0;
    const ok = assertProductionReadiness({ APP_ENV: "development" }, deps);
    assert.equal(ok.ok, true);
    assert.deepEqual(exits, []);
    assert.deepEqual(logs, []);
  });
});
