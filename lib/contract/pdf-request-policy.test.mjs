import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { SCENARIO_60 } from "./repo-scale.mjs";
import {
  PREVIEW_WATERMARK,
  evaluatePdfMintPolicy,
  handleContractsPdf,
  previewClientIp,
} from "./pdf-request-policy.mjs";

const ada = {
  sellerName: "Ada Locke",
  saleAmount: 400000,
  termMonths: 12,
  startDate: "2026-09-15",
  timepieces: [{ name: "Timepiece 1" }],
};

describe("PDF mint policy", () => {
  it("refuses JSON mint when the live-book flag is on", async () => {
    const policy = evaluatePdfMintPolicy({
      env: { MAC_LIVE_BOOK: "1" },
      headers: { origin: "https://mechart.app", "sec-fetch-site": "same-origin" },
    });
    assert.equal(policy.ok, false);
    assert.equal(policy.code, "LIVE_PDF_JSON_REFUSED");
    const response = await handleContractsPdf(new Request("https://mechart.app/api/contracts/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://mechart.app", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(ada),
    }), { MAC_LIVE_BOOK: "1" });
    assert.equal(response.status, 403);
    assert.notEqual(response.headers.get("content-type"), "application/pdf");
    const body = await response.json();
    assert.equal(body.code, "LIVE_PDF_JSON_REFUSED");
  });

  it("refuses JSON mint in production regardless of the flag and before reading the body", async () => {
    for (const env of [{ APP_ENV: "production" }, { APP_ENV: "production", MAC_LIVE_BOOK: "0" }]) {
      const policy = evaluatePdfMintPolicy({
        env,
        headers: { origin: "https://mechart.app", "sec-fetch-site": "same-origin" },
      });
      assert.equal(policy.ok, false);
      assert.equal(policy.status, 403);
      assert.equal(policy.code, "LIVE_PDF_JSON_REFUSED");
    }
    const response = await handleContractsPdf(new Request("https://mechart.app/api/contracts/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: "{ this is not json",
    }), { APP_ENV: "production" });
    assert.equal(response.status, 403);
    const body = await response.json();
    assert.equal(body.code, "LIVE_PDF_JSON_REFUSED");

    const staging = evaluatePdfMintPolicy({
      env: { APP_ENV: "staging" },
      headers: { "sec-fetch-site": "same-origin" },
    });
    assert.equal(staging.ok, true);
  });

  it("rejects a browser-mode caller without same-origin or an allowlisted Origin", async () => {
    const missing = evaluatePdfMintPolicy({ env: {}, headers: {} });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 403);
    const hostSpoof = evaluatePdfMintPolicy({
      env: { COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app" },
      headers: { host: "mechart.app", "x-forwarded-host": "mechart.app", origin: "https://evil.example" },
    });
    assert.equal(hostSpoof.ok, false);
    assert.equal(hostSpoof.status, 403);
    const cross = await handleContractsPdf(new Request("https://mechart.app/api/contracts/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example" },
      body: JSON.stringify(ada),
    }), { COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app" });
    assert.equal(cross.status, 403);
  });

  it("watermarks a same-origin browser preview and refuses a scale below Scenario 60 floors", async () => {
    const sameOrigin = await handleContractsPdf(new Request("https://localhost.test/api/contracts/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify(ada),
    }), {});
    assert.equal(sameOrigin.status, 200);
    assert.equal(sameOrigin.headers.get("content-type"), "application/pdf");
    const bytes = new Uint8Array(await sameOrigin.arrayBuffer());
    const loaded = await PDFDocument.load(bytes);
    assert.ok(loaded.getPageCount() >= 1);
    assert.match(PREVIEW_WATERMARK, /not stored/i);
    assert.match(PREVIEW_WATERMARK, /pending legal approval/);

    const cheapScale = await handleContractsPdf(new Request("https://localhost.test/api/contracts/pdf", {
      method: "POST",
      headers: { "content-type": "application/json", "sec-fetch-site": "same-origin" },
      body: JSON.stringify({
        ...ada,
        scale: { ...SCENARIO_60, setupFee: 0 },
      }),
    }), {});
    assert.equal(cheapScale.status, 400);
    const body = await cheapScale.json();
    assert.equal(body.code, "AGREEMENT_SCALE_INVALID");
  });

  it("keys the preview limiter on the proxy-set IP, not a spoofed first X-Forwarded-For hop", () => {
    assert.equal(
      previewClientIp(new Headers({ "x-forwarded-for": "1.1.1.1, 10.0.0.5", "x-real-ip": "10.0.0.5" })),
      "10.0.0.5",
    );
    assert.equal(previewClientIp(new Headers({ "x-forwarded-for": "9.9.9.9, 10.0.0.8" })), "10.0.0.8");
  });
});
