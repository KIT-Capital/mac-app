import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAgreementEnd } from "./repo-book.mjs";
import { conflictingLiveWatchIds } from "./repo-book.mjs";

/** Hale demo fixture: 2021-03-14, 12 months, pending signature. Matches lib/seed.ts. */
const HALE = {
  id: "agr-31419",
  watchIds: ["rm-011", "pp-nautilus"],
  amount: 200000,
  termMonths: 12,
  delivery: "Desk arranges intake",
  ownerName: "Jonathan Hale",
  email: "jonathan.hale@mechartcap.com",
  status: "pending_signature",
  createdAt: "2021-03-14",
};

describe("conflictingLiveWatchIds", () => {
  it("rejects a second live repo that lists Hale's rm-011 while Hale is past due", () => {
    assert.deepEqual(conflictingLiveWatchIds(["rm-011"], [HALE], "2026-09-17"), ["rm-011"]);
    assert.deepEqual(conflictingLiveWatchIds(["pp-nautilus"], [HALE], "2026-09-17"), ["pp-nautilus"]);
    assert.deepEqual(conflictingLiveWatchIds(["other-watch"], [HALE], "2026-09-17"), []);
  });

  it("treats the term date as still exclusive while the first repo stays open", () => {
    const open = { ...HALE, createdAt: "2025-09-17", termMonths: 12 };
    assert.deepEqual(conflictingLiveWatchIds(["rm-011"], [open], "2026-09-17"), ["rm-011"]);
  });

  it("frees rm-011 after bought back so it may join a new repo", () => {
    const bought = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-17",
    );
    assert.equal(bought.ok, true);
    assert.deepEqual(conflictingLiveWatchIds(["rm-011"], [bought.agreement], "2026-09-17"), []);
  });

  it("frees pieces after liquidated or renewed, but not while in liquidation", () => {
    const liquidated = applyAgreementEnd(
      HALE,
      { kind: "liquidated", date: "2023-06-01", amount: 150000 },
      "2026-09-17",
    );
    const renewed = applyAgreementEnd(
      HALE,
      { kind: "renewed", date: "2022-03-14", amount: 245000 },
      "2026-09-17",
    );
    const liquidating = applyAgreementEnd(
      HALE,
      { kind: "in_liquidation", date: "2023-01-02", amount: 180000 },
      "2026-09-17",
    );
    assert.deepEqual(conflictingLiveWatchIds(["rm-011"], [liquidated.agreement], "2026-09-17"), []);
    assert.deepEqual(conflictingLiveWatchIds(["rm-011"], [renewed.agreement], "2026-09-17"), []);
    assert.deepEqual(conflictingLiveWatchIds(["rm-011"], [liquidating.agreement], "2026-09-17"), [
      "rm-011",
    ]);
  });
});
