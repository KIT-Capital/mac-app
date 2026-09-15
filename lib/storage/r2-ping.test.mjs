import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { evaluateR2Ping } from "./r2-ping.mjs";
import { r2Configured, r2Endpoint } from "./r2-object-store.mjs";

const ping = fileURLToPath(new URL("./r2-ping.mjs", import.meta.url));

describe("R2 ping evaluation", () => {
  it("accepts an account id when the S3 endpoint is omitted", () => {
    const env = {
      APP_ENV: "development",
      R2_ACCOUNT_ID: "acct",
      R2_BUCKET: "mac-app",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "secret",
    };
    assert.equal(r2Endpoint(env), "https://acct.r2.cloudflarestorage.com");
    assert.equal(r2Configured(env), true);
    assert.equal(evaluateR2Ping(env).ok, true);
  });

  it("refuses anything except development and lists missing names without values", () => {
    const missing = evaluateR2Ping({ APP_ENV: "development" });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.includes("R2_NOT_CONFIGURED"));
    assert.ok(missing.errors.includes("R2_S3_ENDPOINT"));
    assert.ok(!missing.errors.some((error) => /sk_|AKIA|super-secret/i.test(error)));

    const configured = {
      R2_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      R2_BUCKET: "mac-app",
      R2_ACCESS_KEY_ID: "key",
      R2_SECRET_ACCESS_KEY: "super-secret-value",
    };
    assert.equal(evaluateR2Ping({ APP_ENV: "production", ...configured }).ok, false);
    assert.ok(evaluateR2Ping({ APP_ENV: "production", ...configured }).errors.includes("R2_PING_DEVELOPMENT_ONLY"));
    assert.ok(evaluateR2Ping({ APP_ENV: " staging ", ...configured }).errors.includes("R2_PING_DEVELOPMENT_ONLY"));
    assert.ok(evaluateR2Ping(configured).errors.includes("R2_PING_DEVELOPMENT_ONLY"));
  });
});

describe("R2 ping CLI", () => {
  it("exits before contacting R2 when APP_ENV is production", () => {
    const result = spawnSync(process.execPath, [ping], {
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENV: "production",
        R2_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
        R2_BUCKET: "mac-app",
        R2_ACCESS_KEY_ID: "key",
        R2_SECRET_ACCESS_KEY: "super-secret-value",
      },
    });
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr);
    assert.ok(body.errors.includes("R2_PING_DEVELOPMENT_ONLY"));
    assert.ok(!result.stderr.includes("super-secret-value"));
    assert.ok(!result.stdout.includes("super-secret-value"));
  });
});
