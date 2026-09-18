import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_SESSION_KEYS_INVALID,
  issueDeskToken,
  parseDeskSessionKeys,
  readDeskToken,
} from "./desk-session";

const NOW = 1_800_000_000_000;
const K1 = "a".repeat(32);
const K2 = "b".repeat(32);

describe("desk session key rotation", () => {
  it("fails closed on missing, short, duplicate, or malformed key sets", () => {
    for (const value of [
      "",
      "k1:short",
      `k1:${K1},k1:${K2}`,
      `bad:kid:${K1}`,
      `bad,kid:${K1}`,
    ]) {
      assert.deepEqual(
        parseDeskSessionKeys({ APP_ENV: "production", DESK_SESSION_KEYS: value }),
        { ok: false, error: DESK_SESSION_KEYS_INVALID },
      );
    }
  });

  it("uses the development secret alias only in development", () => {
    assert.equal(parseDeskSessionKeys({
      APP_ENV: "development",
      DESK_SESSION_SECRET: K1,
    }).ok, true);
    assert.equal(parseDeskSessionKeys({
      APP_ENV: "staging",
      DESK_SESSION_SECRET: K1,
    }).ok, false);
    assert.equal(parseDeskSessionKeys({
      APP_ENV: "development",
      MAC_LIVE_BOOK: "1",
    }).ok, false);
    assert.equal(parseDeskSessionKeys({
      APP_ENV: "development",
      MAC_LIVE_BOOK: "1",
      DESK_SESSION_SECRET: K1,
    }).ok, true);
  });

  it("signs with the first key and verifies retained keys", () => {
    const oldEnv = { APP_ENV: "production", DESK_SESSION_KEYS: `k1:${K1}` };
    const rotatedEnv = {
      APP_ENV: "production",
      DESK_SESSION_KEYS: `k2:${K2},k1:${K1}`,
    };
    const old = issueDeskToken("admin@mechartcap.com", "admin", {
      env: oldEnv,
      now: NOW,
      mustRotate: true,
    });
    assert.deepEqual(readDeskToken(old, { env: rotatedEnv, now: NOW + 1 }), {
      email: "admin@mechartcap.com",
      role: "admin",
      kid: "k1",
      rot: true,
      iat: NOW,
      exp: NOW + 12 * 60 * 60_000,
    });

    const current = issueDeskToken("desk@mechartcap.com", "staff", {
      env: rotatedEnv,
      now: NOW,
      mustRotate: false,
    });
    assert.equal(readDeskToken(current, { env: rotatedEnv, now: NOW + 1 })?.kid, "k2");
    assert.equal(readDeskToken(old, {
      env: { APP_ENV: "production", DESK_SESSION_KEYS: `k2:${K2}` },
      now: NOW + 1,
    }), null);
  });

  it("refuses expired and overlong tokens", () => {
    const env = { APP_ENV: "production", DESK_SESSION_KEYS: `k1:${K1}` };
    const token = issueDeskToken("admin@mechartcap.com", "admin", {
      env,
      now: NOW,
      mustRotate: false,
    });
    assert.equal(readDeskToken(token, { env, now: NOW + 12 * 60 * 60_000 }), null);
    assert.equal(readDeskToken(`${token}${"x".repeat(5000)}`, { env, now: NOW }), null);
  });
});
