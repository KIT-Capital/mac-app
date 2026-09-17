import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { applyAgreementEnd } from "./repo-book.mjs";
import { repurchaseDollars } from "./repo-scale.mjs";
import { monthsHeldForRenewal, planRenewal } from "./repo-renewal.mjs";

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

describe("monthsHeldForRenewal", () => {
  it("uses month 12 when the close date is the term date", () => {
    assert.equal(monthsHeldForRenewal(HALE, "2022-03-14"), 12);
  });

  it("uses the last term month when the repo is past due", () => {
    assert.equal(monthsHeldForRenewal(HALE, "2026-09-17"), 12);
  });

  it("counts whole calendar months before the term date", () => {
    const open = { ...HALE, createdAt: "2025-09-17", termMonths: 12 };
    assert.equal(monthsHeldForRenewal(open, "2026-03-17"), 6);
  });
});

describe("planRenewal", () => {
  it("prices a term-date renew at month-12 repurchase dollars and opens a 12-month successor", () => {
    const planned = planRenewal(HALE, "2022-03-14", "2026-09-17");
    assert.equal(planned.ok, true);
    assert.equal(planned.end.kind, "renewed");
    assert.equal(planned.end.date, "2022-03-14");
    assert.equal(planned.end.amount, repurchaseDollars(200000, 12, 12));
    assert.equal(planned.successor.amount, planned.end.amount);
    assert.equal(planned.successor.termMonths, 12);
    assert.deepEqual(planned.successor.watchIds, ["rm-011", "pp-nautilus"]);
    assert.equal(planned.successor.status, "pending_signature");
    assert.equal(planned.successor.createdAt, "2022-03-14");
  });

  it("prices a past-due renew at the last term month", () => {
    const planned = planRenewal(HALE, "2026-09-17", "2026-09-17");
    assert.equal(planned.ok, true);
    assert.equal(planned.end.amount, repurchaseDollars(200000, 12, 12));
  });

  it("rejects renewing a repo that is not live", () => {
    const bought = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-17",
    );
    const planned = planRenewal(bought.agreement, "2026-09-17", "2026-09-17");
    assert.equal(planned.ok, false);
    assert.equal(planned.error, "NOT_LIVE");
  });

  it("rejects a close date that fails end validation", () => {
    const planned = planRenewal(HALE, "2021-03-13", "2026-09-17");
    assert.equal(planned.ok, false);
  });
});
