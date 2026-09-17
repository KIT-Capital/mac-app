import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { markMailFailed } from "./mail-delivery.mjs";

describe("markMailFailed", () => {
  it("records the Resend error and does not throw", () => {
    const item = { status: "preview" };
    const returned = markMailFailed(item, { message: "API key is invalid" });
    assert.equal(returned.status, "failed");
    assert.equal(returned.error, "API key is invalid");
    assert.equal(returned, item);
  });

  it("uses a fallback when Resend returns an empty error", () => {
    const item = markMailFailed({ status: "preview" }, null);
    assert.equal(item.status, "failed");
    assert.equal(item.error, "Resend could not send.");
  });
});
