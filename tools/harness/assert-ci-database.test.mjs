import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "../../lib/env/database-mapping.mjs";
import { evaluateCiDatabase } from "./assert-ci-database.mjs";

const ciPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.ci}-pooler.us-east-2.aws.neon.tech/neondb`;
const ciUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.ci}.us-east-2.aws.neon.tech/neondb`;
const developmentPooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech/neondb`;
const developmentUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}.us-east-2.aws.neon.tech/neondb`;
const productionUnpooled = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`;
const cli = fileURLToPath(new URL("./assert-ci-database.mjs", import.meta.url));

function runAssert(env) {
  return spawnSync(process.execPath, [cli], {
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

describe("evaluateCiDatabase", () => {
  it("accepts the dedicated ci endpoint pair", () => {
    const result = evaluateCiDatabase({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: ciPooled,
      DATABASE_URL_UNPOOLED: ciUnpooled,
    });
    assert.equal(result.ok, true);
    assert.equal(result.endpointId, ENDPOINT_BY_APP_ENV.ci);
  });

  it("fails closed when GitHub secrets are missing", () => {
    const result = evaluateCiDatabase({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("CI_DATABASE_SECRETS_REQUIRED"));
  });

  it("refuses the development endpoint even when APP_ENV is ci", () => {
    const result = evaluateCiDatabase({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: developmentPooled,
      DATABASE_URL_UNPOOLED: developmentUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("CI_ENV_WRONG_ENDPOINT"));
  });

  it("refuses a production unpooled URL under APP_ENV=ci", () => {
    const result = evaluateCiDatabase({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: ciPooled,
      DATABASE_URL_UNPOOLED: productionUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("CI_ENV_WRONG_ENDPOINT"));
  });

  it("refuses when APP_ENV is not ci", () => {
    const result = evaluateCiDatabase({
      APP_ENV: "development",
      NEON_BRANCH: "ci",
      DATABASE_URL: ciPooled,
      DATABASE_URL_UNPOOLED: ciUnpooled,
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("CI_APP_ENV_REQUIRED"));
  });
});

describe("assert-ci-database CLI", () => {
  it("prints codes only and exits 0 for the ci pair", () => {
    const result = runAssert({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: ciPooled,
      DATABASE_URL_UNPOOLED: ciUnpooled,
    });
    assert.equal(result.status, 0, result.stderr);
    const body = JSON.parse(result.stdout);
    assert.equal(body.ok, true);
    assert.equal(body.endpointId, ENDPOINT_BY_APP_ENV.ci);
    assert.equal(JSON.stringify(body).includes("postgresql"), false);
  });

  it("exits 1 when secrets are empty", () => {
    const result = runAssert({
      APP_ENV: "ci",
      NEON_BRANCH: "ci",
      DATABASE_URL: "",
      DATABASE_URL_UNPOOLED: "",
    });
    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr);
    assert.ok(body.errors.includes("CI_DATABASE_SECRETS_REQUIRED"));
  });
});
