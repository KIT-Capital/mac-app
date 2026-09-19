import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalogAppraisalPatch, catalogValuation } from "./catalog";

describe("catalogValuation", () => {
  it("uses the matched desk catalog eligibility", () => {
    const valuation = catalogValuation(
      { brand: "Audemars Piguet", model: "Royal Oak Selfwinding" },
      [{
        brand: "Audemars Piguet",
        model: "Royal Oak Selfwinding",
        reference: "",
        typicalLow: 50000,
        typicalHigh: 65000,
        financeable: false,
      }],
    );

    assert.equal(valuation.financeable, false);
  });

  it("defaults known tier-one brands to eligible without a catalog match", () => {
    const valuation = catalogValuation(
      { brand: "Audemars Piguet", model: "Royal Oak Selfwinding" },
      [],
    );

    assert.equal(valuation.financeable, true);
  });

  it("keeps unmatched non-tier brands ineligible", () => {
    const valuation = catalogValuation(
      { brand: "Cartier", model: "Crash" },
      [],
    );

    assert.equal(valuation.financeable, false);
  });

  it("does not match another brand that shares a reference", () => {
    const valuation = catalogValuation(
      { brand: "Cartier", model: "Crash", reference: "5711/1A" },
      [{
        brand: "Patek Philippe",
        model: "Nautilus",
        reference: "5711/1A",
        typicalLow: 100000,
        typicalHigh: 120000,
        financeable: true,
      }],
    );

    assert.deepEqual(valuation, {
      valueLow: 40000,
      valueHigh: 55000,
      financeable: false,
    });
  });

  it("builds one current appraisal snapshot for the desk update", () => {
    const patch = catalogAppraisalPatch(
      {
        brand: "Audemars Piguet",
        model: "Royal Oak Selfwinding",
        valueLow: 90000,
        valueHigh: 100000,
      },
      [{
        brand: "Audemars Piguet",
        model: "Royal Oak Selfwinding",
        reference: "",
        typicalLow: 50000,
        typicalHigh: 65000,
        financeable: true,
      }],
      "2026-09-19",
    );

    assert.deepEqual(patch, {
      status: "appraised",
      evaluatedAt: "2026-09-19",
      valueLow: 50000,
      valueHigh: 65000,
      financeable: true,
    });
  });
});
