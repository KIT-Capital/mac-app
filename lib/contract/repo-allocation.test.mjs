import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAgreementEnd } from "./repo-book.mjs";
import {
  conflictingHeldWatchIds,
  isEligibleLiveAddWatch,
  validateSaleAmountLower,
} from "./repo-book.mjs";

/** Hale demo fixture: 2021-03-14, 12 months, pending signature. Matches lib/seed.ts. */
const HALE = {
  id: "agr-31419",
  watchIds: ["rm-011", "pp-nautilus"],
  amount: 200000,
  termMonths: 12,
  delivery: "Desk arranges intake",
  ownerName: "Jonathan Hale",
  email: "jonathan.hale@mechartcap.com",
  status: "executed",
  createdAt: "2021-03-14",
  executedOn: "2021-03-14",
};

describe("conflictingHeldWatchIds", () => {
  it("rejects a second live repo that lists Hale's rm-011 while Hale is past due", () => {
    assert.deepEqual(conflictingHeldWatchIds(["rm-011"], [HALE], "2026-09-17"), ["rm-011"]);
    assert.deepEqual(conflictingHeldWatchIds(["pp-nautilus"], [HALE], "2026-09-17"), ["pp-nautilus"]);
    assert.deepEqual(conflictingHeldWatchIds(["other-watch"], [HALE], "2026-09-17"), []);
  });

  it("treats the term date as still exclusive while the first repo stays open", () => {
    const open = { ...HALE, createdAt: "2025-09-17", executedOn: "2025-09-17", termMonths: 12 };
    assert.deepEqual(conflictingHeldWatchIds(["rm-011"], [open], "2026-09-17"), ["rm-011"]);
  });

  it("frees rm-011 after bought back so it may join a new repo", () => {
    const bought = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-17",
    );
    assert.equal(bought.ok, true);
    assert.deepEqual(conflictingHeldWatchIds(["rm-011"], [bought.agreement], "2026-09-17"), []);
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
    assert.deepEqual(conflictingHeldWatchIds(["rm-011"], [liquidated.agreement], "2026-09-17"), []);
    assert.deepEqual(conflictingHeldWatchIds(["rm-011"], [renewed.agreement], "2026-09-17"), []);
    assert.deepEqual(conflictingHeldWatchIds(["rm-011"], [liquidating.agreement], "2026-09-17"), [
      "rm-011",
    ]);
  });

  it("rejects recording in liquidation on a renewed repo while the successor still holds the pieces", () => {
    const renewed = applyAgreementEnd(
      HALE,
      { kind: "renewed", date: "2022-03-14", amount: 245000 },
      "2026-09-17",
    );
    const successor = {
      ...HALE,
      id: "agr-renewed-successor",
      createdAt: "2022-03-14",
      amount: 245000,
    };
    const reopened = applyAgreementEnd(
      renewed.agreement,
      { kind: "in_liquidation", date: "2023-01-02", amount: 180000 },
      "2026-09-17",
    );
    assert.equal(reopened.ok, true);
    assert.deepEqual(conflictingHeldWatchIds(reopened.agreement.watchIds, [successor], "2026-09-17"), [
      "rm-011",
      "pp-nautilus",
    ]);
  });
});

describe("validateSaleAmountLower", () => {
  it("allows the same amount or less, and refuses a raise", () => {
    assert.deepEqual(validateSaleAmountLower(200000, 200000), { ok: true });
    assert.deepEqual(validateSaleAmountLower(200000, 199999), { ok: true });
    assert.deepEqual(validateSaleAmountLower(200000, 210000), {
      ok: false,
      error: "AMOUNT_RAISE_FORBIDDEN",
    });
    assert.deepEqual(validateSaleAmountLower(200000, 0), { ok: false, error: "INVALID_AMOUNT" });
  });
});

describe("isEligibleLiveAddWatch", () => {
  const haleWatch = {
    id: "pp-5711",
    status: "appraised",
    financeable: true,
    ownerEmail: "jonathan.hale@mechartcap.com",
  };

  it("accepts the owner's appraised purchaseable piece and rejects stale or foreign pieces", () => {
    assert.equal(isEligibleLiveAddWatch(haleWatch, "jonathan.hale@mechartcap.com"), true);
    assert.equal(isEligibleLiveAddWatch({ ...haleWatch, status: "reviewing" }, haleWatch.ownerEmail), false);
    assert.equal(isEligibleLiveAddWatch({ ...haleWatch, financeable: false }, haleWatch.ownerEmail), false);
    assert.equal(isEligibleLiveAddWatch(haleWatch, "other.collector@mechartcap.com"), false);
    assert.equal(isEligibleLiveAddWatch(null, haleWatch.ownerEmail), false);
  });
});
