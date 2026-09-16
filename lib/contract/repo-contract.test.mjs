import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { buildContractCopy, parseContractInput } from "./repo-contract.mjs";
import { renderRepoContractPdf } from "./repo-contract-pdf.mjs";

const firstRepo = {
  sellerName: "Ada Locke",
  sellerEmail: "ada.locke@example.com",
  sellerPhone: "+1 (212) 555-0199",
  saleAmount: 400000,
  termMonths: 12,
  startDate: "2026-09-15",
  delivery: "Insured courier",
  agreementCode: "MAC-400K-12",
  timepieces: [
    { name: "Timepiece 1", brand: "Timepiece", model: "1", reference: "TP-1" },
    { name: "Timepiece 2", brand: "Timepiece", model: "2", reference: "TP-2" },
  ],
};

describe("repo contract copy", () => {
  it("names the customer, both pieces, and the 12-month buyback", () => {
    const copy = buildContractCopy(firstRepo);
    assert.equal(copy.ok, true);
    assert.match(copy.text, /Ada Locke/);
    assert.match(copy.text, /Timepiece 1/);
    assert.match(copy.text, /Timepiece 2/);
    assert.match(copy.text, /\$478,000\.00/);
    assert.match(copy.text, /sale and repurchase, not a loan/i);
    assert.doesNotMatch(copy.text.replaceAll("not a loan", ""), /\b(loan|interest|APR|lender)\b/i);
  });

  it("accepts seller names that contain April or Sloan", () => {
    const copy = buildContractCopy({ ...firstRepo, sellerName: "April Sloan" });
    assert.equal(copy.ok, true);
    assert.match(copy.text, /April Sloan/);
  });

  it("uses a nested custom scale for term price and liquidation", () => {
    const copy = buildContractCopy({
      ...firstRepo,
      scale: {
        purchaseShare: 0.5,
        setupFee: 0,
        annualAdjustment: 0,
        earlyRepurchaseAmount: 0,
        brokerFee: 0,
      },
    });
    assert.equal(copy.ok, true);
    assert.match(copy.text, /\$400,000\.00/);
    assert.doesNotMatch(copy.text, /\$478,000\.00/);
    assert.match(copy.text, /\$800,000\.00/);
  });

  it("rejects missing seller, amount, date, and timepieces", () => {
    const parsed = parseContractInput({});
    assert.equal(parsed.ok, false);
    assert.ok(parsed.errors.includes("SELLER_NAME_REQUIRED"));
    assert.ok(parsed.errors.includes("SALE_AMOUNT_REQUIRED"));
    assert.ok(parsed.errors.includes("START_DATE_INVALID"));
    assert.ok(parsed.errors.includes("TIMEPIECES_REQUIRED"));
  });

  it("rejects more than 24 timepieces", () => {
    const parsed = parseContractInput({
      ...firstRepo,
      timepieces: Array.from({ length: 25 }, (_, i) => ({ name: `Piece ${i}` })),
    });
    assert.equal(parsed.ok, false);
    assert.ok(parsed.errors.includes("TIMEPIECES_LIMIT"));
  });
});

describe("repo contract PDF", () => {
  it("writes a PDF that keeps the same facts", async () => {
    const result = await renderRepoContractPdf(firstRepo);
    assert.equal(result.ok, true);
    assert.ok(result.bytes);
    const header = new TextDecoder("latin1").decode(result.bytes.slice(0, 5));
    assert.equal(header, "%PDF-");
    const loaded = await PDFDocument.load(result.bytes);
    assert.ok(loaded.getPageCount() >= 1);
    const copy = buildContractCopy(firstRepo);
    assert.match(copy.text, /Ada Locke/);
    assert.match(copy.text, /Timepiece 1/);
    assert.doesNotMatch(copy.text.replaceAll("not a loan", ""), /\b(interest|APR|lender)\b/i);
  });
});
