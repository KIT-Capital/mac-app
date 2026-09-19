import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { photoObjectKeys } from "./photo-object-key.mjs";

describe("photo object keys", () => {
  it("uses server-owned environment, customer, and photo ids", () => {
    assert.deepEqual(
      photoObjectKeys({ appEnv: "staging", customerId: "customer-1", photoId: "photo-1" }),
      {
        originalKey: "staging/originals/customer-1/photo-1",
        previewKey: "staging/previews/customer-1/photo-1",
      },
    );
  });

  it("rejects path separators in key segments", () => {
    assert.throws(
      () => photoObjectKeys({ appEnv: "production", customerId: "../other", photoId: "photo-1" }),
      { message: "PHOTO_KEY_INVALID" },
    );
  });
});
