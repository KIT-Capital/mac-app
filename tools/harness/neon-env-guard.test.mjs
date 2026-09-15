import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "../../lib/env/database-mapping.mjs";

const guard = fileURLToPath(new URL("./neon-env-guard.mjs", import.meta.url));
const start = fileURLToPath(new URL("./start-mac-app.mjs", import.meta.url));

const developmentPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech/neondb`;
const developmentUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}.us-east-2.aws.neon.tech/neondb`;
const productionPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}-pooler.us-east-2.aws.neon.tech/neondb`;

function runGuard(env, extraArgs = []) {
  return spawnSync(process.execPath, [guard, ...extraArgs], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function runStart(env) {
  return spawnSync(process.execPath, [start, "start"], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("isolated guard CLI", () => {
  it("accepts the verified development mapping", () => {
    const result = runGuard({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: developmentPooled,
      DATABASE_URL_UNPOOLED: developmentUnpooled,
    });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.endpointId, ENDPOINT_BY_APP_ENV.development);
  });

  it("rejects a production URL under development without touching Railway", () => {
    const result = runGuard({
      APP_ENV: "development",
      NEON_BRANCH: "development",
      DATABASE_URL: productionPooled,
    });
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr);
    assert.equal(body.ok, false);
    assert.ok(body.errors.includes("DEVELOPMENT_ENV_WRONG_ENDPOINT"));
  });

  it("rejects startup when APP_ENV is missing and a URL is present", () => {
    const result = runStart({
      DATABASE_URL: developmentPooled,
    });
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr);
    assert.ok(body.errors.includes("APP_ENV_REQUIRED"));
  });
});
