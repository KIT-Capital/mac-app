import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TENANT_CODE,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  formatMemberId,
  nextMemberSequence,
  parseMemberId,
} from "./tenant.mjs";

describe("default MAC tenant", () => {
  it("keeps Mechanical Art Capital as the seeded tenant", () => {
    assert.equal(DEFAULT_TENANT_ID, "tenant-mac");
    assert.equal(DEFAULT_TENANT_CODE, "MAC");
    assert.equal(DEFAULT_TENANT_NAME, "Mechanical Art Capital");
  });
});

describe("member ID format", () => {
  it("formats PREFIX plus five digits and the UTC year", () => {
    assert.equal(formatMemberId("MAC", 1, new Date("2026-09-20T00:00:00Z")), "MAC00001-26");
    assert.equal(formatMemberId("MAC", 12345, new Date("2022-01-01T00:00:00Z")), "MAC12345-22");
    assert.equal(formatMemberId("PTK", 9, new Date("2027-12-31T23:00:00Z")), "PTK00009-27");
  });

  it("rejects a reused or exhausted sequence and a bad prefix", () => {
    assert.throws(() => formatMemberId("MAC", 0, new Date("2026-01-01Z")), /MEMBER_SEQUENCE_INVALID/);
    assert.throws(() => formatMemberId("MAC", 100000, new Date("2026-01-01Z")), /MEMBER_SEQUENCE_INVALID/);
    assert.throws(() => formatMemberId("mac", 1, new Date("2026-01-01Z")), /TENANT_PREFIX_INVALID/);
    assert.throws(() => formatMemberId("M", 1, new Date("2026-01-01Z")), /TENANT_PREFIX_INVALID/);
  });

  it("parses a well-formed member ID and refuses junk", () => {
    assert.deepEqual(parseMemberId("MAC00001-26"), { prefix: "MAC", sequence: 1, year: 26 });
    assert.equal(parseMemberId("MAC-1-26"), null);
    assert.equal(parseMemberId("mac00001-26"), null);
  });

  it("never reuses a sequence number on the same tenant", () => {
    assert.equal(nextMemberSequence(1), 2);
    assert.equal(nextMemberSequence(12345), 12346);
    assert.throws(() => nextMemberSequence(99999), /MEMBER_SEQUENCE_EXHAUSTED/);
  });
});
