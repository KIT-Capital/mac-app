import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  liquidationDollars,
  liquidationNetDollars,
  repurchaseDollars,
  repurchaseMarkup,
  repurchaseSchedule,
  resolveScale,
} from "./repo-scale.mjs";

describe("Scenario 60 repurchase scale", () => {
  it("matches the 12-month first-repo table", () => {
    assert.equal(repurchaseDollars(400000, 1, 12), 422500);
    assert.equal(repurchaseDollars(400000, 3, 12), 422500);
    assert.equal(repurchaseDollars(400000, 4, 12), 442666.67);
    assert.equal(repurchaseDollars(400000, 7, 12), 461166.67);
    assert.equal(repurchaseDollars(400000, 8, 12), 453333.33);
    assert.equal(repurchaseDollars(400000, 12, 12), 478000);
    assert.ok(repurchaseMarkup(8, 12) < repurchaseMarkup(7, 12));
  });

  it("derives liquidation from the 60% purchase share", () => {
    assert.equal(liquidationDollars(400000), 666666.67);
    assert.equal(liquidationNetDollars(400000), 643333.34);
  });

  it("lets desk terms override the default purchase share", () => {
    const scale = resolveScale({ maxLtv: 0.5, setupFee: 0, annualAdjustment: 0, earlyRepurchaseAmount: 0, brokerFee: 0 }, 12);
    assert.equal(liquidationDollars(400000, scale), 800000);
    assert.equal(repurchaseDollars(400000, 12, scale), 400000);
  });

  it("builds a 12-row dollar schedule without a rate label", () => {
    const schedule = repurchaseSchedule({
      saleAmount: 400000,
      termMonths: 12,
      startDate: "2026-09-15",
    });
    assert.equal(schedule.ok, true);
    assert.equal(schedule.rows.length, 12);
    assert.equal(schedule.rows[11].date, "2027-09-15");
    assert.equal(schedule.rows[11].price, 478000);
    assert.ok(!JSON.stringify(schedule).match(/interest|loan|APR/i));
  });
});
