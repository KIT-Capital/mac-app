import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseLiveBookOperation } from "./live-book-operation.mjs";

describe("live-book operation validation", () => {
  it("accepts a narrow timepiece create without browser photo payloads", () => {
    assert.deepEqual(
      parseLiveBookOperation({
        action: "timepiece.create",
        timepiece: {
          id: "piece-1",
          brand: "Cartier",
          model: "Tank",
          status: "not_evaluated",
          images: ["data:image/jpeg;base64,large"],
          valueLow: 50000,
        },
      }),
      {
        action: "timepiece.create",
        timepiece: {
          id: "piece-1",
          brand: "Cartier",
          model: "Tank",
          status: "not_evaluated",
        },
      },
    );
  });

  it("preserves a bounded generated asset code", () => {
    const parsed = parseLiveBookOperation({
      action: "timepiece.create",
      timepiece: { id: "piece-1", brand: "Cartier", model: "Tank", assetCode: "20260917-CTANK" },
    });
    assert.equal(parsed.timepiece.assetCode, "20260917-CTANK");
    assert.throws(
      () => parseLiveBookOperation({
        action: "timepiece.create",
        timepiece: { id: "piece-1", brand: "Cartier", model: "Tank", assetCode: "x".repeat(65) },
      }),
      /ASSET_CODE_INVALID/,
    );
  });

  it("accepts stable agreement and end operations", () => {
    assert.equal(
      parseLiveBookOperation({
        action: "agreement.recordEnd",
        id: "repo-1",
        end: { kind: "bought_back", date: "2026-09-17", amount: 125000 },
      }).action,
      "agreement.recordEnd",
    );
    assert.equal(
      parseLiveBookOperation({
        action: "agreement.renew",
        id: "repo-1",
        closeDate: "2026-09-17",
        successorId: "repo-2",
        agreementCode: "MAC-2",
        scale: { purchaseShare: 0.6 },
      }).action,
      "agreement.renew",
    );
  });

  it("rejects whole-book replacement and malformed operations", () => {
    assert.throws(
      () => parseLiveBookOperation({ action: "book.replace", book: { agreements: [] } }),
      /LIVE_BOOK_ACTION_INVALID/,
    );
    assert.throws(
      () => parseLiveBookOperation({ action: "timepiece.update", id: "", patch: {} }),
      /LIVE_BOOK_ID_REQUIRED/,
    );
    assert.throws(
      () => parseLiveBookOperation({ action: "preview.upsert", id: "p", url: "data:image/jpeg;base64,x" }),
      /PREVIEW_URL_INVALID/,
    );
    assert.throws(
      () => parseLiveBookOperation({ action: "preview.upsert", id: "p", timepieceId: "piece", kind: "front", url: "//evil.test/x" }),
      /PREVIEW_URL_INVALID/,
    );
  });

  it("accepts explicit desk removal and customer operations", () => {
    for (const operation of [
      { action: "agreement.remove", id: "repo-1" },
      { action: "preview.remove", id: "preview-1" },
      { action: "customer.update", id: "customer-1", patch: { status: "suspended" } },
      { action: "customer.remove", id: "customer-1" },
    ]) {
      assert.equal(parseLiveBookOperation(operation).action, operation.action);
    }
  });

  it("bounds preview kinds and agreement terms, dates, amounts, and scale", () => {
    assert.throws(
      () => parseLiveBookOperation({
        action: "preview.upsert",
        id: "p",
        timepieceId: "piece-1",
        kind: "x".repeat(41),
        url: "/preview.jpg",
      }),
      /PREVIEW_KIND_INVALID/,
    );
    const base = {
      action: "agreement.create",
      agreement: {
        id: "repo-1",
        watchIds: ["piece-1"],
        amount: 100,
        termMonths: 12,
        delivery: "",
        ownerName: "A",
        email: "a@example.com",
        createdAt: "2026-09-17",
        scale: { purchaseShare: 0.6, setupFee: 0.01 },
      },
    };
    assert.equal(parseLiveBookOperation(base).agreement.scale.purchaseShare, 0.6);
    for (const agreement of [
      { ...base.agreement, scale: { purchaseShare: 0 } },
      { ...base.agreement, scale: { purchaseShare: 1.01 } },
      { ...base.agreement, scale: { purchaseShare: 0.61, setupFee: 0.01, annualAdjustment: 0.185, earlyRepurchaseAmount: 0.035, brokerFee: 0.035 } },
      { ...base.agreement, scale: { purchaseShare: 0.6, setupFee: -1 } },
      { ...base.agreement, scale: { purchaseShare: 0.6, setupFee: 0, annualAdjustment: 0.185, earlyRepurchaseAmount: 0.035, brokerFee: 0.035 } },
      { ...base.agreement, scale: { purchaseShare: 0.6, brokerFee: Number.NaN } },
      { ...base.agreement, amount: Number.POSITIVE_INFINITY },
      { ...base.agreement, termMonths: 0 },
      { ...base.agreement, createdAt: "not-a-date" },
    ]) {
      assert.throws(
        () => parseLiveBookOperation({ ...base, agreement }),
        /AGREEMENT_(SCALE|AMOUNT|TERM|DATE)_INVALID/,
      );
    }
  });
});
