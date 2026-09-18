import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Hex } from "./object-store.mjs";
import { createObjectStore, mapConditionalPut, r2Configured, r2Endpoint, r2ObjectStore } from "./r2-object-store.mjs";

describe("R2 object store adapter", () => {
  it("does not treat missing R2 env as configured", () => {
    assert.equal(r2Endpoint({}), "");
    assert.equal(r2Configured({}), false);
    assert.throws(() => r2ObjectStore({}), { message: "R2_NOT_CONFIGURED" });
    assert.throws(() => createObjectStore({ APP_ENV: "production" }), { message: "R2_REQUIRED" });
  });

  it("rejects a checksum mismatch before calling fetch", async () => {
    const store = r2ObjectStore({
      R2_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      R2_BUCKET: "mac-app",
      R2_ACCESS_KEY_ID: "test-key",
      R2_SECRET_ACCESS_KEY: "test-secret",
      R2_REGION: "auto",
    });
    const bytes = new TextEncoder().encode("original");
    await assert.rejects(() => store.put("k", bytes, "deadbeef"), { message: "CHECKSUM_MISMATCH" });
    assert.equal(sha256Hex(bytes).length, 64);
  });

  it("maps a conditional put collision without treating it as success", () => {
    assert.equal(mapConditionalPut(412), "OBJECT_EXISTS");
    assert.equal(mapConditionalPut(409), "OBJECT_EXISTS");
    assert.equal(mapConditionalPut(200), "ok");
    assert.equal(mapConditionalPut(500), "R2_PUT_FAILED");
  });
});
