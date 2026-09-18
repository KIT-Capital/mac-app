import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  REQUEST_ORIGIN_FORBIDDEN,
  evaluateRequestOrigin,
  refuseCrossSiteMutation,
} from "./request-origin.mjs";

describe("request origin", () => {
  it("allows same-origin and the configured app Origin", () => {
    assert.equal(evaluateRequestOrigin({
      env: {},
      headers: { "sec-fetch-site": "same-origin" },
    }).ok, true);
    assert.equal(evaluateRequestOrigin({
      env: { COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app" },
      headers: { origin: "https://mechart.app" },
    }).ok, true);
  });

  it("refuses a cross-site POST before the body is read", async () => {
    const missing = evaluateRequestOrigin({ env: {}, headers: {} });
    assert.equal(missing.ok, false);
    assert.equal(missing.status, 403);
    assert.equal(missing.code, REQUEST_ORIGIN_FORBIDDEN);

    const hostSpoof = evaluateRequestOrigin({
      env: { COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app" },
      headers: { host: "mechart.app", "x-forwarded-host": "mechart.app", origin: "https://evil.example" },
    });
    assert.equal(hostSpoof.ok, false);

    const request = new Request("https://mechart.app/api/live-book", {
      method: "POST",
      headers: { cookie: "mac_desk=valid-looking", origin: "https://evil.example" },
      body: '{"action":"wipe"}',
    });
    const refusal = refuseCrossSiteMutation(request, {
      COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
    });
    assert.ok(refusal);
    assert.equal(refusal.status, 403);
    const body = await refusal.json();
    assert.equal(body.code, REQUEST_ORIGIN_FORBIDDEN);
    assert.equal(await request.text(), '{"action":"wipe"}');
  });

  it("does not refuse a same-origin mutation", () => {
    const request = new Request("https://mechart.app/api/live-book", {
      method: "POST",
      headers: { "sec-fetch-site": "same-origin" },
      body: "{}",
    });
    assert.equal(refuseCrossSiteMutation(request), null);
  });
});
