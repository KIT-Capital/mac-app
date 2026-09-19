import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agreementDocumentStore, memoryObjectStore, sha256Hex } from "./object-store.mjs";

describe("object store checksum", () => {
  it("rejects a put whose checksum does not match the bytes", async () => {
    const store = memoryObjectStore();
    const bytes = new TextEncoder().encode("watch-original");
    await assert.rejects(() => store.put("k", bytes, "deadbeef"), { message: "CHECKSUM_MISMATCH" });
  });

  it("stores bytes when the checksum matches", async () => {
    const store = memoryObjectStore();
    const bytes = new TextEncoder().encode("watch-original");
    const checksum = sha256Hex(bytes);
    await store.put("k", bytes, checksum);
    assert.equal(store.objects.get("k")?.byteLength, bytes.byteLength);
  });

  it("presigns bounded uploads and exposes checksum metadata after landing", async () => {
    const store = memoryObjectStore();
    const bytes = new TextEncoder().encode("watch-original");
    const checksum = sha256Hex(bytes);
    const minted = await store.presignPut("original", {
      contentLength: bytes.byteLength,
      contentType: "image/jpeg",
      sha256: checksum,
      expiresSeconds: 999,
    });
    assert.match(minted.url, /^memory:\/\/original\?/);
    assert.ok(Date.parse(minted.expiresAt) <= Date.now() + 600_000);
    assert.deepEqual(minted.headers, {
      "content-length": String(bytes.byteLength),
      "content-type": "image/jpeg",
      "x-amz-checksum-sha256": Buffer.from(checksum, "hex").toString("base64"),
      "if-none-match": "*",
    });
    assert.equal(await store.headMetadata("original"), null);

    await store.put("original", bytes, checksum);
    assert.deepEqual(await store.headMetadata("original"), {
      bytes: bytes.byteLength,
      sha256: checksum,
    });
  });

  it("putIfAbsent keeps the first bytes when the key already exists", async () => {
    const store = memoryObjectStore();
    const first = new TextEncoder().encode("first-pdf");
    const second = new TextEncoder().encode("second-pdf");
    await store.putIfAbsent("doc.pdf", first, sha256Hex(first));
    await assert.rejects(() => store.putIfAbsent("doc.pdf", second, sha256Hex(second)), {
      message: "OBJECT_EXISTS",
    });
    assert.equal(Buffer.from(store.objects.get("doc.pdf")).toString(), "first-pdf");
  });

  it("document adapter exposes putIfAbsent, head, get, and presign only", async () => {
    const store = agreementDocumentStore(memoryObjectStore());
    const bytes = new TextEncoder().encode("stored-pdf");
    await store.putIfAbsent("k", bytes, sha256Hex(bytes));
    assert.equal(await store.head("k"), true);
    assert.equal(Buffer.from(await store.get("k")).toString(), "stored-pdf");
    const minted = await store.presignGet("k", 300);
    assert.equal(typeof minted.url, "string");
    assert.ok(minted.expiresAt);
    assert.equal(Object.hasOwn(store, "remove") || typeof store.remove === "function", false);
  });
});
