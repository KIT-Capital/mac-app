import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "./env/database-mapping.mjs";
import { liveUnavailability, unavailableResponse } from "./unavailable-response.mjs";

/** Copy of `record` without `key`, so tests drop one prerequisite at a time. */
function without(record, key) {
  const copy = { ...record };
  delete copy[key];
  return copy;
}

const productionPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}-pooler.us-east-2.aws.neon.tech/neondb`;

const liveReady = {
  APP_ENV: "production",
  NEON_BRANCH: "production",
  DATABASE_URL: productionPooled,
  MAC_LIVE_BOOK: "1",
  COLLECTOR_SESSION_SECRET: "unavailable-test-session-secret-0123456789",
  COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
  RESEND_API_KEY: "re_unavailable_test",
  DESK_SESSION_KEYS: "k1:unavailable-test-desk-key-0123456789",
  R2_ACCOUNT_ID: "unavailable-account",
  R2_BUCKET: "mac-app",
  R2_ACCESS_KEY_ID: "unavailable-access-key",
  R2_SECRET_ACCESS_KEY: "unavailable-r2-secret-0123456789",
};

describe("unavailableResponse", () => {
  it("is a 503 unavailable body that is never cached", async () => {
    const response = unavailableResponse("COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED");
    assert.equal(response.status, 503);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.deepEqual(await response.json(), {
      mode: "unavailable",
      error: "COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED",
    });
  });
});

describe("liveUnavailability", () => {
  it("is null in development regardless of the flag or prerequisites", () => {
    assert.equal(liveUnavailability({ APP_ENV: "development" }), null);
    assert.equal(liveUnavailability({ APP_ENV: "development", MAC_LIVE_BOOK: "1" }), null);
    assert.equal(liveUnavailability({}), null);
  });

  it("is null for a fully configured production or staging live book", () => {
    assert.equal(liveUnavailability(liveReady), null);
  });

  it("names the first missing prerequisite in production", () => {
    assert.equal(
      liveUnavailability(without(liveReady, "COLLECTOR_SESSION_SECRET")),
      "COLLECTOR_SESSION_SECRET_REQUIRED",
    );
  });

  it("names PRODUCTION_REQUIRES_LIVE_BOOK if production is somehow serving with the flag off", () => {
    assert.equal(liveUnavailability(without(liveReady, "MAC_LIVE_BOOK")), "PRODUCTION_REQUIRES_LIVE_BOOK");
  });
});
