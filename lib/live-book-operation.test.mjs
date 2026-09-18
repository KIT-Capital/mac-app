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

  it("parses narrow desk settings, catalog, and shell operations", () => {
    assert.deepEqual(
      parseLiveBookOperation({
        action: "settings.update",
        patch: {
          maxLtv: 0.6,
          startingRate: 0.185,
          setupFee: 0.01,
          earlyRepurchaseAmount: 0.035,
          brokerFee: 0.035,
          minMonths: 3,
          earlyStartMonth: 4,
          earlyUntilMonth: 8,
          typicalTerm: 12,
          membershipMonthly: 4.99,
          vaultLocation: "MAC Vault",
          appearance: "light",
          companyName: "Not server state",
        },
      }),
      {
        action: "settings.update",
        patch: {
          maxLtv: 0.6,
          startingRate: 0.185,
          setupFee: 0.01,
          earlyRepurchaseAmount: 0.035,
          brokerFee: 0.035,
          minMonths: 3,
          earlyStartMonth: 4,
          earlyUntilMonth: 8,
          typicalTerm: 12,
          membershipMonthly: 4.99,
          vaultLocation: "MAC Vault",
        },
      },
    );
    assert.equal(
      parseLiveBookOperation({
        action: "catalog.upsert",
        entry: {
          id: "cat-1",
          brand: "Cartier",
          model: "Tank",
          reference: "WSTA",
          caseMetal: "Steel",
          caseDiameter: "33mm",
          typicalLow: 10_000,
          typicalHigh: 20_000,
          financeable: true,
          notes: "Desk reference",
        },
      }).action,
      "catalog.upsert",
    );
    assert.deepEqual(
      parseLiveBookOperation({ action: "catalog.remove", id: "cat-1" }),
      { action: "catalog.remove", id: "cat-1" },
    );
    assert.equal(
      parseLiveBookOperation({
        action: "shell.upsert",
        shell: {
          id: "shell-1",
          code: "MAC-OPEN-12",
          title: "Open 12-month shell",
          termMonths: 12,
          rate: 0.185,
          ltv: 0.6,
          setupFee: 0.01,
          earlyRepurchaseAmount: 0.035,
          brokerFee: 0.035,
          minMonths: 3,
          earlyStartMonth: 4,
          earlyUntilMonth: 8,
          status: "open",
          createdAt: "2026-09-18",
        },
      }).action,
      "shell.upsert",
    );
    assert.deepEqual(
      parseLiveBookOperation({ action: "shell.remove", id: "shell-1" }),
      { action: "shell.remove", id: "shell-1" },
    );
  });

  it("rejects below-floor settings and shells with the scale error", () => {
    assert.throws(
      () => parseLiveBookOperation({
        action: "settings.update",
        patch: { maxLtv: 0.61, startingRate: 0.185, setupFee: 0.01, earlyRepurchaseAmount: 0.035, brokerFee: 0.035 },
      }),
      /AGREEMENT_SCALE_INVALID/,
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "shell.upsert",
        shell: {
          id: "shell-1",
          code: "MAC-1",
          title: "Unsafe",
          termMonths: 12,
          rate: 0.18,
          ltv: 0.6,
          status: "open",
          createdAt: "2026-09-18",
        },
      }),
      /AGREEMENT_SCALE_INVALID/,
    );
  });

  it("rejects incoherent settings and shell schedules", () => {
    assert.deepEqual(
      parseLiveBookOperation({
        action: "settings.update",
        patch: { typicalTerm: 7 },
      }),
      { action: "settings.update", patch: { typicalTerm: 7 } },
    );
    for (const patch of [
      { minMonths: 13, typicalTerm: 12 },
      { earlyStartMonth: 9, earlyUntilMonth: 8, typicalTerm: 12 },
      { earlyStartMonth: 8, earlyUntilMonth: 8 },
      { earlyStartMonth: 4, earlyUntilMonth: 13, typicalTerm: 12 },
    ]) {
      assert.throws(
        () => parseLiveBookOperation({ action: "settings.update", patch }),
        /AGREEMENT_SCALE_INVALID/,
      );
    }
    for (const schedule of [
      { minMonths: 13, earlyStartMonth: 4, earlyUntilMonth: 8 },
      { minMonths: 3, earlyStartMonth: 9, earlyUntilMonth: 8 },
      { minMonths: 3, earlyStartMonth: 8, earlyUntilMonth: 8 },
      { minMonths: 3, earlyStartMonth: 4, earlyUntilMonth: 13 },
    ]) {
      assert.throws(
        () => parseLiveBookOperation({
          action: "shell.upsert",
          shell: {
            id: "shell-1",
            code: "MAC-1",
            title: "Malformed",
            termMonths: 12,
            rate: 0.185,
            ltv: 0.6,
            status: "open",
            createdAt: "2026-09-18",
            ...schedule,
          },
        }),
        /AGREEMENT_SCALE_INVALID/,
      );
    }
  });

  it("bounds ratios and integer-backed money before persistence", () => {
    const maximumDollars = 21_474_836.47;
    assert.equal(
      parseLiveBookOperation({
        action: "settings.update",
        patch: { membershipMonthly: maximumDollars },
      }).patch.membershipMonthly,
      maximumDollars,
    );
    for (const patch of [
      { membershipMonthly: maximumDollars + 0.01 },
      { startingRate: 1.0001 },
      { setupFee: 1.0001 },
      { earlyRepurchaseAmount: 1.0001 },
      { brokerFee: 1.0001 },
    ]) {
      assert.throws(
        () => parseLiveBookOperation({ action: "settings.update", patch }),
        /(?:SETTINGS_UPDATE_INVALID|AGREEMENT_SCALE_INVALID)/,
      );
    }
    assert.throws(
      () => parseLiveBookOperation({
        action: "catalog.upsert",
        entry: {
          id: "cat-too-large",
          brand: "Cartier",
          model: "Tank",
          reference: "",
          caseMetal: "",
          caseDiameter: "",
          typicalLow: 0,
          typicalHigh: maximumDollars + 0.01,
          financeable: true,
          notes: "",
        },
      }),
      /CATALOG_ENTRY_INVALID/,
    );
  });

  it("strips client scales from create and renewal operations", () => {
    const created = parseLiveBookOperation({
      action: "agreement.create",
      agreement: {
        id: "repo-1",
        watchIds: ["piece-1"],
        amount: 100,
        termMonths: 12,
        delivery: "",
        ownerName: "A",
        email: "a@example.com",
        createdAt: "2026-09-18",
        scale: { purchaseShare: 0.01 },
      },
    });
    assert.equal("scale" in created.agreement, false);
    const renewed = parseLiveBookOperation({
      action: "agreement.renew",
      id: "repo-1",
      closeDate: "2026-09-18",
      successorId: "repo-2",
      agreementCode: "MAC-2",
      scale: { purchaseShare: 0.01 },
    });
    assert.equal("scale" in renewed, false);
  });

  it("bounds preview kinds and agreement terms, dates, amounts, and editable scale", () => {
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
      },
    };
    for (const agreement of [
      { ...base.agreement, amount: Number.POSITIVE_INFINITY },
      { ...base.agreement, termMonths: 0 },
      { ...base.agreement, createdAt: "not-a-date" },
    ]) {
      assert.throws(
        () => parseLiveBookOperation({ ...base, agreement }),
        /AGREEMENT_(SCALE|AMOUNT|TERM|DATE)_INVALID/,
      );
    }
    for (const unsafeScale of [
      { purchaseShare: 0 },
      { purchaseShare: 1.01 },
      { purchaseShare: 0.61, setupFee: 0.01, annualAdjustment: 0.185, earlyRepurchaseAmount: 0.035, brokerFee: 0.035 },
      { purchaseShare: 0.6, setupFee: -1 },
      { purchaseShare: 0.6, setupFee: 0, annualAdjustment: 0.185, earlyRepurchaseAmount: 0.035, brokerFee: 0.035 },
      { purchaseShare: 0.6, brokerFee: Number.NaN },
    ]) {
      assert.throws(
        () => parseLiveBookOperation({
          action: "agreement.updateScale",
          id: "repo-1",
          termMonths: 12,
          scale: unsafeScale,
        }),
        /AGREEMENT_SCALE_INVALID/,
      );
    }
  });
});
