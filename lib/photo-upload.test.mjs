import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { putPhotoParts, storePhoto } from "./photo-upload.mjs";

describe("putPhotoParts", () => {
  it("preserves every signed header and treats 412 as ready to confirm", async () => {
    const calls = [];
    const originalHeaders = { "Content-Type": "image/png", "Content-Length": "8", "X-Test": "original" };
    const previewHeaders = { "Content-Type": "image/jpeg", "If-None-Match": "*", "X-Test": "preview" };
    await putPhotoParts({
      original: { url: "https://upload.test/original", headers: originalHeaders },
      preview: { url: "https://upload.test/preview", headers: previewHeaders },
    }, {
      original: new Blob(["original"]),
      preview: new Blob(["preview"]),
    }, async (url, init) => {
      calls.push({ url, init });
      return { ok: false, status: 412 };
    });

    assert.equal(calls[0].init.headers, originalHeaders);
    assert.equal(calls[1].init.headers, previewHeaders);
    assert.deepEqual(calls.map((call) => call.url), [
      "https://upload.test/original",
      "https://upload.test/preview",
    ]);
  });

  it("fails once on a non-412 PUT response", async () => {
    let calls = 0;
    await assert.rejects(
      putPhotoParts({
        original: { url: "https://upload.test/original", headers: {} },
        preview: { url: "https://upload.test/preview", headers: {} },
      }, {
        original: new Blob(["original"]),
        preview: new Blob(["preview"]),
      }, async () => {
        calls += 1;
        return { ok: false, status: 403 };
      }),
      { message: "PHOTO_UPLOAD_FAILED" },
    );
    assert.equal(calls, 2);
  });

  it("aborts stalled PUT requests", async () => {
    await assert.rejects(
      putPhotoParts({
        original: { url: "https://upload.test/original", headers: {} },
        preview: { url: "https://upload.test/preview", headers: {} },
      }, {
        original: new Blob(["original"]),
        preview: new Blob(["preview"]),
      }, async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }), 5),
      { name: "AbortError" },
    );
  });
});

describe("storePhoto", () => {
  it("requests, uploads, confirms, and returns the stored photo id", async () => {
    const calls = [];
    const photoId = await storePhoto({
      requestUpload: async () => ({
        photoId: "photo-1",
        status: "pending",
        original: { url: "original", headers: {} },
        preview: { url: "preview", headers: {} },
      }),
      confirmUpload: async (id) => {
        calls.push(`confirm:${id}`);
        return { status: "stored" };
      },
      parts: { original: new Blob(["original"]), preview: new Blob(["preview"]) },
      putter: async () => {
        calls.push("put");
      },
    });
    assert.equal(photoId, "photo-1");
    assert.deepEqual(calls, ["put", "confirm:photo-1"]);
  });

  it("skips PUT when the requested photo is already stored", async () => {
    let puts = 0;
    const photoId = await storePhoto({
      requestUpload: async () => ({ photoId: "photo-1", status: "stored" }),
      confirmUpload: async () => ({ status: "stored" }),
      parts: { original: new Blob(), preview: new Blob() },
      putter: async () => {
        puts += 1;
      },
    });
    assert.equal(photoId, "photo-1");
    assert.equal(puts, 0);
  });

  it("fails when confirmation does not store the photo", async () => {
    await assert.rejects(
      storePhoto({
        requestUpload: async () => ({ photoId: "photo-1", status: "stored" }),
        confirmUpload: async () => ({ status: "pending" }),
        parts: { original: new Blob(), preview: new Blob() },
      }),
      { message: "PHOTO_UPLOAD_FAILED" },
    );
  });
});
