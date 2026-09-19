import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readImageFile, readImagePreview } from "./image.ts";

describe("readImageFile", () => {
  it("resizes preview-only consumers without computing upload metadata", async () => {
    const original = new Blob(["avatar"], { type: "image/png" });
    const preview = new Blob(["preview"], { type: "image/jpeg" });
    const result = await readImagePreview(original, async () => ({
      blob: preview,
      dataUrl: "data:image/jpeg;base64,cHJldmlldw==",
    }));

    assert.deepEqual(result, {
      blob: preview,
      dataUrl: "data:image/jpeg;base64,cHJldmlldw==",
    });
    assert.equal("originalSha256" in result, false);
  });

  it("returns original and preview blobs, a preview data URL, and lowercase SHA-256 hashes", async () => {
    const original = new Blob([new TextEncoder().encode("original-image")], { type: "image/png" });
    const preview = new Blob([new TextEncoder().encode("preview-image")], { type: "image/jpeg" });

    const result = await readImageFile(original, async () => ({
      blob: preview,
      dataUrl: "data:image/jpeg;base64,cHJldmlldy1pbWFnZQ==",
    }));

    assert.equal(result.original, original);
    assert.equal(result.preview, preview);
    assert.equal(result.previewDataUrl, "data:image/jpeg;base64,cHJldmlldy1pbWFnZQ==");
    assert.match(result.originalSha256, /^[0-9a-f]{64}$/);
    assert.match(result.previewSha256, /^[0-9a-f]{64}$/);
    assert.equal(result.originalSha256, "27f0c6997c0fc4780eb0d9a0e8a1f5f02418196494e213a91911b54bea2816cb");
    assert.equal(result.previewSha256, "3bf65d5a9314800a1856b5357a5f7ef65fc348b65f53335267925f8d09023e35");
  });
});
