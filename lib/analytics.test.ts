import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  OPERATIONS_LEDGER_DISCLAIMER,
  analyticsCsv,
  deriveOperationsAnalytics,
} from "./analytics";
import { DEMO_AGREEMENTS, DEMO_TIMEPIECES } from "./seed";
import { DEMO_USERS } from "./admin-seed";
import type { Agreement } from "./types";

const TODAY = "2026-09-21";

describe("operations analytics", () => {
  it("counts Hale's executed repo as outstanding active dollars, not a draft", () => {
    const facts = deriveOperationsAnalytics(
      { agreements: DEMO_AGREEMENTS, users: DEMO_USERS, timepieces: DEMO_TIMEPIECES },
      TODAY,
    );
    assert.equal(facts.activeCount, 1);
    assert.equal(facts.activeAmount, 200000);
    assert.equal(facts.draftCount, 0);
    assert.equal(facts.bookMix.find((row) => row.label === "past due")?.count, 1);
    assert.equal(facts.pieces.locked, 2);
    assert.equal(facts.pieces.free, 2);
    assert.equal(facts.members.total, 1);
    assert.equal(facts.members.collectors, 1);
    assert.equal(facts.members.vintage[0]?.label, "21");
    assert.equal(facts.members.newThisYear, 0);
    assert.match(analyticsCsv(facts.tables.active), new RegExp(OPERATIONS_LEDGER_DISCLAIMER));
    assert.doesNotMatch(analyticsCsv(facts.tables.active), /paid off/i);
  });

  it("keeps drafts out of outstanding USD and counts in-liquidation as active", () => {
    const draft: Agreement = {
      id: "agr-draft",
      watchIds: ["ap-royal-oak"],
      amount: 50000,
      termMonths: 12,
      delivery: "",
      ownerName: "Jonathan Hale",
      email: "jonathan.hale@mechartcap.com",
      status: "submitted",
      createdAt: TODAY,
    };
    const liquidating: Agreement = {
      ...DEMO_AGREEMENTS[0],
      id: "agr-liq",
      bookEnd: { kind: "in_liquidation", date: "2026-09-01", amount: 200000 },
    };
    const bought: Agreement = {
      ...DEMO_AGREEMENTS[0],
      id: "agr-bb",
      executedOn: "2026-01-10",
      createdAt: "2026-01-10",
      amount: 80000,
      bookEnd: { kind: "bought_back", date: "2026-08-10", amount: 90000 },
    };
    const facts = deriveOperationsAnalytics(
      { agreements: [liquidating, draft, bought], users: DEMO_USERS, timepieces: DEMO_TIMEPIECES },
      TODAY,
    );
    assert.equal(facts.activeCount, 1);
    assert.equal(facts.activeAmount, 200000);
    assert.equal(facts.draftCount, 1);
    assert.equal(facts.draftAmount, 50000);
    assert.equal(facts.trailing.boughtBack.count, 1);
    assert.equal(facts.trailing.boughtBack.amount, 80000);
    assert.equal(facts.bookMix.find((row) => row.label === "in liquidation")?.count, 1);
  });
});
