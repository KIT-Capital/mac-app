import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { centsToDollars, dollarsToCents } from "./money.mjs";

describe("dollar-cent conversion", () => {
  it("rounds half cents and passes null through", () => {
    assert.equal(dollarsToCents(10), 1000);
    assert.equal(dollarsToCents(10.555), 1056);
    assert.equal(dollarsToCents(null), null);
    assert.equal(centsToDollars(1050), 10.5);
    assert.equal(centsToDollars(null), undefined);
  });

  it("rejects non-finite dollar amounts", () => {
    assert.throws(() => dollarsToCents(Number.NaN), /INVALID_DOLLAR_AMOUNT/);
  });
});
