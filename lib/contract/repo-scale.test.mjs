import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applicationPurchaseShare,
  applicationPurchaseShares,
  agreementScaleFromDesk,
  liquidationDollars,
  liquidationNetDollars,
  purchaseShareForTerm,
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

  it("lets an open shell LTV and rate beat desk settings", () => {
    const scale = agreementScaleFromDesk(
      { maxLtv: 0.6, startingRate: 0.185, setupFee: 0, annualAdjustment: 0.185, earlyRepurchaseAmount: 0, brokerFee: 0 },
      { rate: 0, ltv: 0.5, setupFee: 0, earlyRepurchaseAmount: 0, brokerFee: 0 },
      12,
    );
    assert.equal(scale.purchaseShare, 0.5);
    assert.equal(scale.annualAdjustment, 0);
  });

  it("uses open-shell LTV only for the selected term", () => {
    const settings = { maxLtv: 0.55 };
    const shell = { termMonths: 9, ltv: 0.45 };
    assert.equal(purchaseShareForTerm(settings, shell, 9), 0.45);
    assert.equal(purchaseShareForTerm(settings, shell, 12), 0.55);
    const disclosed = applicationPurchaseShares(settings, shell);
    assert.deepEqual(disclosed, {
      3: 0.55,
      6: 0.55,
      8: 0.55,
      9: 0.45,
      12: 0.55,
    });
    assert.equal(applicationPurchaseShare(disclosed, settings, shell, 9), 0.45);
    assert.equal(applicationPurchaseShare(undefined, settings, shell, 9), 0.45);
  });

  it("ignores negative fee inputs", () => {
    const scale = resolveScale({ purchaseShare: -1, setupFee: -0.2 }, 12);
    assert.equal(scale.purchaseShare, 0.6);
    assert.equal(scale.setupFee, 0.01);
  });

  it("lets desk terms override the default purchase share", () => {
    const scale = resolveScale({ maxLtv: 0.5, setupFee: 0, annualAdjustment: 0, earlyRepurchaseAmount: 0, brokerFee: 0 }, 12);
    assert.equal(liquidationDollars(400000, scale), 800000);
    assert.equal(repurchaseDollars(400000, 12, scale), 400000);
  });

  it("keeps calendar dates across month-end and DST", () => {
    const late = repurchaseSchedule({
      saleAmount: 400000,
      termMonths: 12,
      startDate: "2026-01-31",
    });
    assert.equal(late.ok, true);
    assert.equal(late.rows[0].date, "2026-02-28");
    assert.equal(late.rows[1].date, "2026-03-31");
    const dst = repurchaseSchedule({
      saleAmount: 400000,
      termMonths: 12,
      startDate: "2026-03-08",
    });
    assert.equal(dst.rows[0].date, "2026-04-08");
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
