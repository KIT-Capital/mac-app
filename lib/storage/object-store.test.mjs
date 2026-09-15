import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memoryObjectStore, sha256Hex } from "./object-store.mjs";

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
});
