import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sha256Hex } from "./object-store.mjs";
import {
  base64ChecksumToHex,
  createObjectStore,
  mapConditionalPut,
  r2Configured,
  r2Endpoint,
  r2ObjectStore,
} from "./r2-object-store.mjs";

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

  it("converts R2 checksum metadata to lowercase hex", () => {
    const hex = "AABBCCDDEEFF00112233445566778899AABBCCDDEEFF00112233445566778899";
    assert.equal(base64ChecksumToHex(Buffer.from(hex, "hex").toString("base64")), hex.toLowerCase());
    assert.equal(base64ChecksumToHex(null), null);
    assert.equal(base64ChecksumToHex("not base64!"), null);
  });

  it("signs bounded PUT metadata and every required header", async () => {
    const store = r2ObjectStore({
      R2_S3_ENDPOINT: "https://example.r2.cloudflarestorage.com",
      R2_BUCKET: "mac-app",
      R2_ACCESS_KEY_ID: "test-key",
      R2_SECRET_ACCESS_KEY: "test-secret",
      R2_REGION: "auto",
    });
    const signed = await store.presignPut("development/originals/customer/photo", {
      contentLength: 42,
      contentType: "image/jpeg",
      sha256: "ab".repeat(32),
      expiresSeconds: 999,
    });
    const url = new URL(signed.url);
    assert.equal(url.searchParams.get("X-Amz-Expires"), "600");
    assert.equal(url.toString().includes("test-secret"), false);
    assert.deepEqual(signed.headers, {
      "content-length": "42",
      "content-type": "image/jpeg",
      "x-amz-checksum-sha256": Buffer.from("ab".repeat(32), "hex").toString("base64"),
      "if-none-match": "*",
    });
    const headers = url.searchParams.get("X-Amz-SignedHeaders")?.split(";") ?? [];
    assert.deepEqual(
      ["content-length", "content-type", "host", "if-none-match", "x-amz-checksum-sha256"]
        .filter((header) => !headers.includes(header)),
      [],
    );
  });
});
