import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { memberIdForEmail, ownedCounts, pieceInActivatedRepo, retailMembers } from "./owners";
import type { Agreement, Timepiece } from "./types";

function agreement(overrides: Partial<Agreement> = {}): Agreement {
  return {
    id: "agr-1",
    watchIds: ["w1"],
    amount: 1000,
    termMonths: 12,
    delivery: "Insured courier",
    ownerName: "A",
    email: "a@example.com",
    status: "executed",
    createdAt: "2026-09-01",
    executedOn: "2026-09-01",
    ...overrides,
  };
}

describe("retail members", () => {
  it("shows member IDs only for collectors and dealers", () => {
    const users = [
      { email: "admin@mechartcap.com", role: "admin", memberId: "MAC00099-26" },
      { email: "jonathan.hale@mechartcap.com", role: "collector", memberId: "MAC00001-21" },
      { email: "books@example.com", role: "dealer", memberId: "MAC00002-26" },
    ];
    assert.deepEqual(
      retailMembers(users).map((row) => row.email),
      ["jonathan.hale@mechartcap.com", "books@example.com"],
    );
    assert.equal(memberIdForEmail(users, "jonathan.hale@mechartcap.com"), "MAC00001-21");
    assert.equal(memberIdForEmail(users, "admin@mechartcap.com"), null);
  });

  it("counts pieces and repos without regard to email casing", () => {
    const counts = ownedCounts(
      "Jonathan.Hale@mechartcap.com",
      [{ ownerEmail: "jonathan.hale@mechartcap.com" } as Timepiece],
      [agreement({ email: "JONATHAN.HALE@MECHARTCAP.COM" })],
    );
    assert.equal(counts.pieces, 1);
    assert.equal(counts.agreements, 1);
  });
});

describe("pieceInActivatedRepo", () => {
  it("flags only executed, open pieces that list the watch", () => {
    assert.equal(pieceInActivatedRepo([agreement()], "w1"), true);
    assert.equal(pieceInActivatedRepo([agreement({ executedOn: undefined })], "w1"), false);
    assert.equal(pieceInActivatedRepo([agreement({ status: "submitted" })], "w1"), false);
    assert.equal(
      pieceInActivatedRepo(
        [agreement({ bookEnd: { kind: "bought_back", date: "2026-09-20", amount: 1 } })],
        "w1",
      ),
      false,
    );
    assert.equal(pieceInActivatedRepo([agreement({ watchIds: ["other"] })], "w1"), false);
  });
});
