import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  clientAddress,
  hashRateLimitKey,
  rateWindowStart,
} from "./access-rate-limit.mjs";

describe("access rate-limit keys", () => {
  it("uses the last forwarded hop and ignores a spoofable real-ip header", () => {
    assert.equal(
      clientAddress(new Headers({
        "x-forwarded-for": "198.51.100.8, 10.0.0.4",
        "x-real-ip": "203.0.113.9",
      })),
      "10.0.0.4",
    );
    assert.equal(clientAddress(new Headers({ "x-real-ip": "203.0.113.9" })), "unknown");
  });

  it("hashes normalized keys without retaining the address or email", () => {
    const first = hashRateLimitKey("  Person@Example.COM ");
    const second = hashRateLimitKey("person@example.com");
    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
    assert.doesNotMatch(first, /person|example/);
  });

  it("places attempts in fixed UTC windows", () => {
    assert.equal(
      rateWindowStart(new Date("2026-09-18T13:47:59.999Z"), 60 * 60_000).toISOString(),
      "2026-09-18T13:00:00.000Z",
    );
  });
});
