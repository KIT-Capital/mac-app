import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  fetchPhotoPreview,
  setBoundedPreviewCache,
  shouldRefetchExpiredPreview,
} from "./photo-preview.mjs";

describe("fetchPhotoPreview", () => {
  it("returns a parsed presigned preview", async () => {
    const preview = await fetchPhotoPreview("photo-1", async (_url, init) => {
      assert.equal(JSON.parse(init.body).photoId, "photo-1");
      assert.equal(init.signal.aborted, false);
      return {
        ok: true,
        json: async () => ({ url: "https://preview.test/photo-1", expiresAt: "2030-01-01T00:00:00.000Z" }),
      };
    });
    assert.equal(preview.url, "https://preview.test/photo-1");
    assert.equal(preview.expiresAt, Date.parse("2030-01-01T00:00:00.000Z"));
  });

  it("preserves a named server failure", async () => {
    await assert.rejects(
      fetchPhotoPreview("missing", async () => ({
        ok: false,
        json: async () => ({ error: "PHOTO_NOT_FOUND" }),
      })),
      { message: "PHOTO_NOT_FOUND" },
    );
  });

  it("aborts a stalled preview request", async () => {
    await assert.rejects(
      fetchPhotoPreview("photo-1", async (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }), 5),
      { name: "AbortError" },
    );
  });
});

describe("shouldRefetchExpiredPreview", () => {
  it("refetches once only after the current URL expires", () => {
    const now = Date.parse("2026-09-18T20:00:00Z");
    assert.equal(shouldRefetchExpiredPreview(now + 1, 0, now), false);
    assert.equal(shouldRefetchExpiredPreview(now, 0, now), true);
    assert.equal(shouldRefetchExpiredPreview(now - 1, 0, now), true);
    assert.equal(shouldRefetchExpiredPreview(now - 1, 1, now), false);
  });

  it("evicts expired entries and then the oldest entry at the cap", () => {
    const cache = new Map([
      ["expired", { expiresAt: 9 }],
      ["oldest", { expiresAt: 20 }],
      ["newer", { expiresAt: 30 }],
    ]);
    setBoundedPreviewCache(cache, "latest", { expiresAt: 40 }, 10, 2);
    assert.deepEqual([...cache.keys()], ["newer", "latest"]);
  });
});
