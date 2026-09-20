import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PDFDocument } from "pdf-lib";
import { SCENARIO_60 } from "./repo-scale.mjs";
import { repurchaseSchedule } from "./repo-scale.mjs";
import { buildContractCopy } from "./repo-contract.mjs";
import {
  DOCUMENT_PROCESSING_STATUS,
  INSPECTION_CONDITION,
  TEMPLATE_LEGAL_STATUS,
  buildAgreementSnapshot,
  latin1PdfText,
  projectAgreementHtml,
  renderAgreementSnapshotPdf,
} from "./repo-agreement-snapshot.mjs";

const frozenScale = {
  purchaseShare: SCENARIO_60.purchaseShare,
  setupFee: SCENARIO_60.setupFee,
  annualAdjustment: SCENARIO_60.annualAdjustment,
  earlyRepurchaseAmount: SCENARIO_60.earlyRepurchaseAmount,
  brokerFee: SCENARIO_60.brokerFee,
};

const ada = {
  sellerName: "Ada Locke",
  sellerEmail: "ada.locke@example.com",
  saleAmount: 400000,
  termMonths: 12,
  startDate: "2026-09-15",
  delivery: "Insured courier",
  agreementCode: "MAC-400K-12",
  scale: frozenScale,
  timepieces: [
    { name: "Timepiece 1", brand: "Timepiece", model: "1", reference: "TP-1" },
    { name: "Timepiece 2", brand: "Timepiece", model: "2", reference: "TP-2" },
  ],
};

describe("agreement snapshot", () => {
  it("keeps identical schedule rows in snapshot, HTML, and PDF text", async () => {
    const snapshot = buildAgreementSnapshot(ada);
    assert.equal(snapshot.ok, true);
    const expected = repurchaseSchedule({ ...ada, ...frozenScale, termMonths: 12 });
    assert.equal(snapshot.value.schedule.rows.length, expected.rows.length);
    assert.deepEqual(
      snapshot.value.schedule.rows.map((row) => [row.month, row.date, row.price, row.note]),
      expected.rows.map((row) => [row.month, row.date, row.price, row.note]),
    );
    const html = projectAgreementHtml(snapshot.value);
    assert.match(html, /MAC-400K-12/);
    assert.match(html, /Insured courier/);
    assert.match(snapshot.value.text, /MAC-400K-12/);
    assert.match(snapshot.value.text, /Insured courier/);
    for (const row of expected.rows) {
      assert.match(html, new RegExp(row.date));
      assert.match(snapshot.value.text, new RegExp(row.date.replaceAll("-", "\\-")));
    }
    const pdf = await renderAgreementSnapshotPdf(snapshot.value);
    assert.equal(pdf.ok, true);
    const loaded = await PDFDocument.load(pdf.bytes);
    assert.ok(loaded.getPageCount() >= 1);
    assert.match(snapshot.value.text, /\$400,000\.00/);
    assert.doesNotMatch(snapshot.value.text, /\$100,000\.00/);
  });

  it("marks snapshot, HTML, and PDF as pending counsel, not for signature", async () => {
    const snapshot = buildAgreementSnapshot(ada);
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.value.templateLegalStatus, TEMPLATE_LEGAL_STATUS.pending_counsel);
    assert.match(snapshot.value.text, /Draft/);
    assert.match(snapshot.value.text, /pending legal approval/);
    assert.match(snapshot.value.text, /not for signature/i);
    const html = projectAgreementHtml(snapshot.value);
    assert.match(html, /pending legal approval/);
    assert.match(html, /not for signature/i);
    const pdf = await renderAgreementSnapshotPdf(snapshot.value);
    assert.equal(pdf.ok, true);
    assert.equal(snapshot.value.label, "Draft — pending legal approval — for review, not for signature");
    assert.match(latin1PdfText(snapshot.value.label), /Draft/);
    assert.match(latin1PdfText(snapshot.value.label), /pending legal approval/);
    assert.doesNotMatch(latin1PdfText(snapshot.value.label), /\?/);
    assert.ok(pdf.bytes && pdf.bytes.length > 0);
  });

  it("carries the inspection condition verbatim in facts, text, HTML, and PDF input (R44)", async () => {
    assert.equal(
      INSPECTION_CONDITION,
      "MAC accepts this request only after physical inspection of each timepiece and other checks, will re-appraise each timepiece on inspection, and reserves the right not to execute this agreement.",
    );
    const snapshot = buildAgreementSnapshot(ada);
    assert.equal(snapshot.ok, true);
    assert.ok(snapshot.value.facts.includes(INSPECTION_CONDITION));
    assert.ok(snapshot.value.text.includes(INSPECTION_CONDITION));
    assert.ok(projectAgreementHtml(snapshot.value).includes(INSPECTION_CONDITION));
    // The PDF draws every fact line, so the sentence reaches the PDF through
    // the same array; it must survive the Helvetica character map unchanged.
    assert.equal(latin1PdfText(INSPECTION_CONDITION), INSPECTION_CONDITION);
    const pdf = await renderAgreementSnapshotPdf(snapshot.value);
    assert.equal(pdf.ok, true);
    assert.doesNotMatch(
      INSPECTION_CONDITION,
      /\b(loan|lender|interest|debt|financing|vesting|paid off|originated|advance|principal|balance|collateral|borrower)\b/i,
    );
  });

  it("includes nineteen clause headings and no loan words", () => {
    const snapshot = buildAgreementSnapshot(ada);
    assert.equal(snapshot.ok, true);
    assert.equal(snapshot.value.clauses.length, 19);
    assert.match(snapshot.value.text, /Sale of the named collection/);
    assert.doesNotMatch(snapshot.value.text.replaceAll("not a loan", ""), /\b(loan|interest|APR|lender|financing)\b/i);
    assert.equal(Object.hasOwn(DOCUMENT_PROCESSING_STATUS, "building"), true);
    assert.equal(TEMPLATE_LEGAL_STATUS.pending_counsel, "pending_counsel");
  });

  it("refuses a null or missing scale", () => {
    const missing = buildAgreementSnapshot({ ...ada, scale: undefined });
    assert.equal(missing.ok, false);
    assert.ok(missing.errors.includes("SCALE_UNFROZEN"));
    const empty = buildAgreementSnapshot({ ...ada, scale: null });
    assert.equal(empty.ok, false);
    assert.ok(empty.errors.includes("SCALE_UNFROZEN"));
  });

  it("names missing seller and empty collection", () => {
    const result = buildAgreementSnapshot({
      scale: frozenScale,
      saleAmount: 1000,
      termMonths: 12,
      startDate: "2026-09-15",
      timepieces: [],
    });
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes("SELLER_NAME_REQUIRED"));
    assert.ok(result.errors.includes("TIMEPIECES_REQUIRED"));
  });
});

describe("existing contract path", () => {
  it("still builds the short browser copy without a stored-document claim", () => {
    const copy = buildContractCopy({
      sellerName: "Ada Locke",
      saleAmount: 400000,
      termMonths: 12,
      startDate: "2026-09-15",
      timepieces: [{ name: "Timepiece 1" }],
    });
    assert.equal(copy.ok, true);
    assert.doesNotMatch(copy.text, /stored document/i);
    assert.doesNotMatch(copy.text.replaceAll("not a loan", ""), /\b(loan|interest|APR|lender)\b/i);
  });
});
