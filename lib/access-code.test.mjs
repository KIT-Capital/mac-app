import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  generateAccessCode,
  hashAccessCode,
  normalizeAccessCode,
} from "./access-code.mjs";

const SECRET = "test-secret-with-enough-entropy-for-hmac";

describe("one-time access codes", () => {
  it("issues a six-digit code and never puts it in the hash", () => {
    const code = generateAccessCode();
    assert.match(code, /^\d{6}$/);
    const digest = hashAccessCode(SECRET, "owner@example.com", code);
    assert.equal(digest.length, 64);
    assert.doesNotMatch(digest, new RegExp(code));
    assert.doesNotMatch(digest, /owner@example.com/i);
  });

  it("binds the hash to the email so two people can share a digit string", () => {
    const code = "123456";
    const first = hashAccessCode(SECRET, "a@example.com", code);
    const second = hashAccessCode(SECRET, "b@example.com", code);
    assert.notEqual(first, second);
    assert.equal(hashAccessCode(SECRET, "A@EXAMPLE.COM", "123 456"), first);
  });

  it("rejects a code that is not six digits", () => {
    assert.throws(() => normalizeAccessCode("12"), /ACCESS_CODE_INVALID/);
    assert.throws(() => hashAccessCode(SECRET, "a@example.com", "abcdef"), /ACCESS_CODE_INVALID/);
  });
});
