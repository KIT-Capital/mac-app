import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  addCalendarMonths,
  applyAgreementEnd,
  bookLabel,
  clearAgreementEnd,
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
  status: "pending_signature",
  createdAt: "2021-03-14",
};

describe("addCalendarMonths", () => {
  it("adds whole calendar months on the same day of month", () => {
    assert.equal(addCalendarMonths("2021-03-14", 12), "2022-03-14");
    assert.equal(addCalendarMonths("2025-09-16", 12), "2026-09-16");
  });

  it("clamps March 31 instead of using Date.setMonth overflow", () => {
    assert.equal(addCalendarMonths("2021-03-31", 12), "2022-03-31");
    assert.equal(addCalendarMonths("2021-03-31", 1), "2021-04-30");
    assert.equal(addCalendarMonths("2021-01-31", 1), "2021-02-28");
    assert.equal(addCalendarMonths("2020-01-31", 1), "2020-02-29");
  });
});

describe("bookLabel", () => {
  it("reads Hale with no end as past due while signature stays pending", () => {
    assert.equal(bookLabel(HALE, "2026-09-16"), "past due");
    assert.equal(HALE.status, "pending_signature");
  });

  it("reads a new agreement created today with no end as open", () => {
    const today = "2026-09-16";
    const fresh = { ...HALE, id: "agr-new", createdAt: today, termMonths: 12 };
    assert.equal(bookLabel(fresh, today), "open");
  });

  it("lets a recorded end win: bought back, in liquidation, liquidated", () => {
    const bought = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    assert.equal(bought.ok, true);
    assert.equal(bookLabel(bought.agreement, "2026-09-16"), "bought back");

    const liquidating = applyAgreementEnd(
      HALE,
      { kind: "in_liquidation", date: "2023-01-02", amount: 180000 },
      "2026-09-16",
    );
    assert.equal(bookLabel(liquidating.agreement, "2026-09-16"), "in liquidation");

    const liquidated = applyAgreementEnd(
      HALE,
      { kind: "liquidated", date: "2023-06-01", amount: 150000 },
      "2026-09-16",
    );
    assert.equal(bookLabel(liquidated.agreement, "2026-09-16"), "liquidated");
  });

  it("keeps the book label when signature is marked signed", () => {
    const ended = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const signed = {
      ...ended.agreement,
      status: "signed",
      signedAt: "2026-09-16",
    };
    assert.equal(bookLabel(signed, "2026-09-16"), "bought back");
    assert.equal(signed.status, "signed");
    assert.deepEqual(signed.bookEnd, ended.agreement.bookEnd);
    assert.equal(bookLabel(HALE, "2026-09-16"), "past due");
  });

  it("treats the term date as inclusive last open day", () => {
    const fixture = { ...HALE, createdAt: "2025-09-16", termMonths: 12 };
    assert.equal(bookLabel(fixture, "2026-09-16"), "open");
    assert.equal(bookLabel(fixture, "2026-09-17"), "past due");
  });

  it("returns past due after staff clears Hale's end", () => {
    const ended = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const cleared = clearAgreementEnd(ended.agreement);
    assert.equal(bookLabel(cleared, "2026-09-16"), "past due");
    assert.equal(cleared.status, "pending_signature");
    assert.equal(cleared.bookEnd, undefined);
  });

  it("never auto-toggles in liquidation from modeled liquidation dollars", () => {
    const modeled = { ...HALE, modeledLiquidation: 88000 };
    assert.equal(bookLabel(modeled, "2026-09-16"), "past due");
  });
});

describe("applyAgreementEnd", () => {
  it("rejects missing date, date before createdAt, date after today, or non-finite amount", () => {
    const today = "2026-09-16";
    const cases = [
      { kind: "bought_back", date: "", amount: 100 },
      { kind: "bought_back", date: "2021-03-13", amount: 100 },
      { kind: "bought_back", date: "2026-09-17", amount: 100 },
      { kind: "bought_back", date: "2022-03-14", amount: Number.NaN },
      { kind: "bought_back", date: "2022-03-14", amount: Number.POSITIVE_INFINITY },
      { kind: "bought_back", date: "2022-03-14", amount: -1 },
    ];

    for (const input of cases) {
      const result = applyAgreementEnd(HALE, input, today);
      assert.equal(result.ok, false, `expected reject for ${JSON.stringify(input)}`);
      assert.deepEqual(result.agreement, HALE);
    }
  });

  it("overwrites an existing end without changing signature status", () => {
    const first = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const next = applyAgreementEnd(
      first.agreement,
      { kind: "liquidated", date: "2023-06-01", amount: 150000 },
      "2026-09-16",
    );
    assert.equal(next.ok, true);
    assert.equal(bookLabel(next.agreement, "2026-09-16"), "liquidated");
    assert.equal(next.agreement.status, "pending_signature");
  });
});
