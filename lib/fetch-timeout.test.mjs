import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fetchWithTimeout } from "./fetch-timeout.mjs";

describe("fetchWithTimeout", () => {
  it("passes an abort signal and returns the response", async () => {
    const response = { ok: true };
    const result = await fetchWithTimeout("/test", { method: "POST" }, 1_000, async (input, init) => {
      assert.equal(input, "/test");
      assert.equal(init.method, "POST");
      assert.equal(init.signal.aborted, false);
      return response;
    });
    assert.equal(result, response);
  });

  it("aborts a stalled request", async () => {
    await assert.rejects(
      fetchWithTimeout("/test", {}, 5, async (_input, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        })),
      { name: "AbortError" },
    );
  });
});
