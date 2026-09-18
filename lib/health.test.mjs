import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "./env/database-mapping.mjs";
import { buildHealthReport, healthResponse } from "./health.mjs";

/** Copy of `record` without `key`, so tests drop one prerequisite at a time. */
function without(record, key) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

const productionPooled = `postgresql://user:very-secret-password@${ENDPOINT_BY_APP_ENV.production}-pooler.us-east-2.aws.neon.tech/neondb`;
const developmentPooled = `postgresql://user:very-secret-password@${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech/neondb`;

const liveReady = {
  MAC_LIVE_BOOK: "1",
  COLLECTOR_SESSION_SECRET: "health-test-session-secret-0123456789",
  COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
  RESEND_API_KEY: "re_health_test",
  DESK_SESSION_SECRET: "health-test-desk-secret-0123456789",
  R2_ACCOUNT_ID: "health-account",
  R2_BUCKET: "mac-app",
  R2_ACCESS_KEY_ID: "health-access-key",
  R2_SECRET_ACCESS_KEY: "health-r2-secret-0123456789",
};

describe("buildHealthReport", () => {
  it("reports browser mode and an unconfigured database in development", async () => {
    let probes = 0;
    const report = await buildHealthReport(
      { APP_ENV: "development" },
      { probeDatabase: async () => { probes += 1; } },
    );
    assert.deepEqual(report, {
      ok: true,
      appEnv: "development",
      checks: { database: "NOT_CONFIGURED", liveBook: "browser" },
    });
    assert.equal(probes, 0);
  });

  it("AE2: names the failing prerequisite only and keeps the database check green", async () => {
    const report = await buildHealthReport(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL: productionPooled,
        ...without(liveReady, "COLLECTOR_MAGIC_LINK_ORIGIN"),
      },
      { probeDatabase: async () => undefined },
    );
    assert.equal(report.ok, false);
    assert.equal(report.appEnv, "production");
    assert.deepEqual(report.checks, { database: "ok", liveBook: "COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED" });
  });

  it("is green for a fully configured production live book", async () => {
    const report = await buildHealthReport(
      { APP_ENV: "production", NEON_BRANCH: "production", DATABASE_URL: productionPooled, ...liveReady },
      { probeDatabase: async () => undefined },
    );
    assert.deepEqual(report, {
      ok: true,
      appEnv: "production",
      checks: { database: "ok", liveBook: "ok" },
    });
  });

  it("maps a driver failure to DATABASE_UNREACHABLE without leaking the message or host", async () => {
    const report = await buildHealthReport(
      { APP_ENV: "development", NEON_BRANCH: "development", DATABASE_URL: developmentPooled },
      {
        probeDatabase: async () => {
          throw new Error(`connect ECONNREFUSED ${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech:5432`);
        },
      },
    );
    assert.equal(report.ok, false);
    assert.equal(report.checks.database, "DATABASE_UNREACHABLE");
    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes("neon.tech"), false);
    assert.equal(serialized.includes("ECONNREFUSED"), false);
    assert.equal(serialized.includes("very-secret-password"), false);
    assert.equal(serialized.includes(ENDPOINT_BY_APP_ENV.development), false);
  });

  it("reports a mapping failure by code and skips the probe", async () => {
    let probes = 0;
    const report = await buildHealthReport(
      { APP_ENV: "production", NEON_BRANCH: "production", DATABASE_URL: developmentPooled, ...liveReady },
      { probeDatabase: async () => { probes += 1; } },
    );
    assert.equal(probes, 0);
    assert.equal(report.ok, false);
    assert.equal(report.checks.database, "PRODUCTION_ENV_WRONG_ENDPOINT");
    assert.equal(report.checks.liveBook, "ok");
  });

  it("names PRODUCTION_REQUIRES_LIVE_BOOK when production has the flag off", async () => {
    const report = await buildHealthReport(
      {
        APP_ENV: "production",
        NEON_BRANCH: "production",
        DATABASE_URL: productionPooled,
        ...without(liveReady, "MAC_LIVE_BOOK"),
      },
      { probeDatabase: async () => undefined },
    );
    assert.equal(report.checks.liveBook, "PRODUCTION_REQUIRES_LIVE_BOOK");
    assert.equal(report.ok, false);
  });

  it("reports null appEnv when APP_ENV is unset", async () => {
    const report = await buildHealthReport({}, { probeDatabase: async () => undefined });
    assert.equal(report.appEnv, null);
  });
});

describe("healthResponse", () => {
  it("returns 200 when ok, 503 otherwise, always no-store", async () => {
    const green = healthResponse({ ok: true, appEnv: "development", checks: { database: "NOT_CONFIGURED", liveBook: "browser" } });
    assert.equal(green.status, 200);
    assert.equal(green.headers.get("cache-control"), "no-store");
    const red = healthResponse({ ok: false, appEnv: "production", checks: { database: "DATABASE_UNREACHABLE", liveBook: "ok" } });
    assert.equal(red.status, 503);
    assert.equal(red.headers.get("cache-control"), "no-store");
    assert.deepEqual(await red.json(), {
      ok: false,
      appEnv: "production",
      checks: { database: "DATABASE_UNREACHABLE", liveBook: "ok" },
    });
  });
});
