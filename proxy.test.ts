import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { NextRequest } from "next/server";
import { issueDeskToken } from "./lib/desk-session";
import { proxy } from "./proxy";

const SECRET = "desk-proxy-test-secret-material-0123456789";
const original = {
  APP_ENV: process.env.APP_ENV,
  DESK_SESSION_KEYS: process.env.DESK_SESSION_KEYS,
};

afterEach(() => {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("desk proxy", () => {
  it("allows only the password page for a forced-rotation token", () => {
    Object.assign(process.env, {
      APP_ENV: "production",
      DESK_SESSION_KEYS: `k1:${SECRET}`,
    });
    const token = issueDeskToken("admin@mechartcap.com", "admin", {
      mustRotate: true,
    });
    const admin = proxy(request("/admin", token));
    assert.equal(admin.status, 307);
    assert.equal(admin.headers.get("location"), "https://mechart.app/admin/password");

    const password = proxy(request("/admin/password", token));
    assert.equal(password.status, 200);
  });

  it("refuses an expired token", () => {
    Object.assign(process.env, {
      APP_ENV: "production",
      DESK_SESSION_KEYS: `k1:${SECRET}`,
    });
    const token = issueDeskToken("admin@mechartcap.com", "admin", {
      now: Date.now() - 13 * 60 * 60_000,
    });
    assert.equal(proxy(request("/admin", token)).status, 403);
  });
});

function request(pathname: string, token: string) {
  return new NextRequest(`https://mechart.app${pathname}`, {
    headers: { cookie: `mac_desk=${token}` },
  });
}
