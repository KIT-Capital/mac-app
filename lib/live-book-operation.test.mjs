import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { REQUEST_DELIVERY_METHODS, parseLiveBookOperation } from "./live-book-operation.mjs";

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
    assert.equal(
      parseLiveBookOperation({
        action: "appraisal.submit",
        id: "attempt-2",
        timepieceId: "piece-1",
        note: "Line one\u0000line two",
      }).note,
      "Line one line two",
    );
  });

  it("preserves a bounded generated asset code", () => {
    const parsed = parseLiveBookOperation({
      action: "timepiece.create",
      timepiece: { id: "piece-1", brand: "Cartier", model: "Tank", assetCode: "20260917-CTANK" },
    });
    assert.equal(parsed.timepiece.assetCode, "20260917-CTANK");
    const withCatalog = parseLiveBookOperation({
      action: "timepiece.create",
      timepiece: {
        id: "piece-1",
        brand: "Cartier",
        model: "Tank",
        catalogId: "cat-tank",
        videoName: "clip.mp4",
        videoDurationSeconds: 12,
      },
    });
    assert.equal(withCatalog.timepiece.catalogId, "cat-tank");
    assert.equal(withCatalog.timepiece.videoName, "clip.mp4");
    assert.equal(withCatalog.timepiece.videoDurationSeconds, 12);
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

  it("accepts a collector or dealer tag and refuses a desk role on the person", () => {
    assert.equal(
      parseLiveBookOperation({ action: "profile.update", patch: { role: "dealer" } }).patch.role,
      "dealer",
    );
    assert.throws(
      () => parseLiveBookOperation({ action: "profile.update", patch: { role: "admin" } }),
      /PROFILE_ROLE_INVALID/,
    );
    assert.equal(
      parseLiveBookOperation({
        action: "customer.invite",
        customer: {
          id: "cust-dealer",
          name: "47th Street Books",
          email: "books@example.com",
          role: "dealer",
        },
      }).customer.role,
      "dealer",
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

  it("parses bounded appraisal attempt operations", () => {
    assert.deepEqual(
      parseLiveBookOperation({
        action: "appraisal.submit",
        id: "attempt-1",
        timepieceId: "piece-1",
        note: "Please check the replacement bracelet.",
      }),
      {
        action: "appraisal.submit",
        id: "attempt-1",
        timepieceId: "piece-1",
        note: "Please check the replacement bracelet.",
      },
    );
    assert.deepEqual(
      parseLiveBookOperation({
        action: "appraisal.return",
        id: "attempt-1",
        note: "Please add a clearer caseback photo.",
      }),
      {
        action: "appraisal.return",
        id: "attempt-1",
        note: "Please add a clearer caseback photo.",
      },
    );
    assert.deepEqual(
      parseLiveBookOperation({
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "accept",
        value: 125000,
        rangeLow: 100000,
        rangeHigh: 140000,
      }),
      {
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "accept",
        value: 125000,
        rangeLow: 100000,
        rangeHigh: 140000,
      },
    );
    assert.deepEqual(
      parseLiveBookOperation({
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "refuse",
      }),
      {
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "refuse",
      },
    );
    assert.deepEqual(
      parseLiveBookOperation({
        action: "appraisal.reopen",
        id: "attempt-1",
        reason: "New manufacturer evidence.",
      }),
      {
        action: "appraisal.reopen",
        id: "attempt-1",
        reason: "New manufacturer evidence.",
      },
    );

    assert.throws(
      () => parseLiveBookOperation({
        action: "appraisal.submit",
        id: "attempt-1",
        timepieceId: "piece-1",
        note: "x".repeat(257),
      }),
      /NOTE_TOO_LONG/,
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "accept",
        value: 125000,
      }),
      /RANGE_REQUIRED/,
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "accept",
        value: -1,
        rangeLow: 100000,
        rangeHigh: 140000,
      }),
      /APPRAISAL_DECISION_INVALID/,
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "accept",
        value: 125000,
        rangeLow: 140000,
        rangeHigh: 100000,
      }),
      /APPRAISAL_DECISION_INVALID/,
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "appraisal.decide",
        id: "attempt-1",
        decision: "refuse",
        value: 1,
      }),
      /APPRAISAL_DECISION_INVALID/,
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "appraisal.reopen",
        id: "attempt-1",
        reason: "",
      }),
      /APPRAISAL_REOPEN_INVALID/,
    );
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
    assert.equal(
      parseLiveBookOperation({
        action: "brand.upsert",
        brand: { id: "brand-1", name: "Rolex", tier: 1, slug: "rolex", retailVisible: false, sortOrder: 1 },
      }).action,
      "brand.upsert",
    );
    assert.equal(
      parseLiveBookOperation({ action: "catalog.sparkle", kind: "brand", id: "brand-1" }).action,
      "catalog.sparkle",
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "catalog.upsert",
        entry: {
          id: "cat-1",
          brand: "Rolex",
          model: "Daytona",
          reference: "",
          caseMetal: "",
          caseDiameter: "",
          typicalLow: 0,
          typicalHigh: 0,
          financeable: false,
          notes: "",
          retailVisible: true,
        },
      }),
      /PHOTO_REQUIRED/,
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
    assert.deepEqual(
      parseLiveBookOperation({ action: "tenant.create", code: "DEMO", name: "Desk Demo" }),
      { action: "tenant.create", code: "DEMO", name: "Desk Demo" },
    );
    assert.throws(
      () => parseLiveBookOperation({ action: "tenant.create", code: "MAC", name: "Other" }),
      /MAC_BRAND_LOCKED/,
    );
    assert.deepEqual(
      parseLiveBookOperation({
        action: "tenant.update",
        id: "tenant-mac",
        patch: { fromName: "MAC Desk" },
      }),
      { action: "tenant.update", id: "tenant-mac", patch: { fromName: "MAC Desk" } },
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "tenant.update",
        id: "tenant-mac",
        patch: { code: "OTH" },
      }),
      /TENANT_CODE_IMMUTABLE/,
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
    assert.deepEqual(
      parseLiveBookOperation({
        action: "settings.update",
        patch: { brandPreset: "mbf" },
      }),
      { action: "settings.update", patch: { brandPreset: "mbf" } },
    );
    assert.throws(
      () => parseLiveBookOperation({
        action: "settings.update",
        patch: { brandPreset: "other" },
      }),
      /SETTINGS_UPDATE_INVALID/,
    );
    const five = ["front", "back", "left", "right", "clasp"];
    assert.deepEqual(
      parseLiveBookOperation({
        action: "settings.update",
        patch: { requiredPhotoKinds: ["box", ...five] },
      }).patch.requiredPhotoKinds,
      [...five, "box"],
    );
    for (const kinds of [
      ["front", "back", "left", "right"],
      [...five, "not-a-kind"],
      [...five, "box", "box"],
      "front",
      [...five, "more"],
    ]) {
      assert.throws(
        () => parseLiveBookOperation({
          action: "settings.update",
          patch: { requiredPhotoKinds: kinds },
        }),
        /SETTINGS_UPDATE_INVALID/,
        `rejects ${JSON.stringify(kinds)}`,
      );
    }
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

  it("strips client scales from renewal operations", () => {
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

  it("bounds preview kinds and editable scale", () => {
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

  describe("request operations", () => {
    const submit = {
      action: "request.submit",
      id: "req-1",
      agreementCode: "MAC-2026-0001",
      watchIds: ["piece-1", "piece-2"],
      termMonths: 12,
      amount: 120000,
      delivery: "Insured courier",
      note: "Ship after the 1st.",
    };
    const versioned = { expectedStatus: "submitted", expectedVersion: 1 };

    it("parses a submission the collector composed", () => {
      assert.deepEqual(parseLiveBookOperation(submit), submit);
      // Whole-dollar and cap checks belong to the server, which knows the LTV.
      assert.equal(parseLiveBookOperation({ ...submit, amount: 120000.5 }).amount, 120000.5);
      const bare = parseLiveBookOperation({
        action: "request.submit",
        id: "req-1",
        watchIds: ["piece-1"],
        termMonths: 6,
        amount: 1,
        delivery: "Desk arranges intake",
      });
      assert.deepEqual(bare, {
        action: "request.submit",
        id: "req-1",
        watchIds: ["piece-1"],
        termMonths: 6,
        amount: 1,
        delivery: "Desk arranges intake",
        note: "",
      });
      assert.equal(
        parseLiveBookOperation({ ...submit, note: "Line one\u0000line two" }).note,
        "Line one line two",
      );
    });

    it("bounds the pieces, money, term, delivery, and note on a submission", () => {
      assert.deepEqual(
        parseLiveBookOperation({ ...submit, watchIds: ["piece-1", "piece-1", " piece-2 "] }).watchIds,
        ["piece-1", "piece-2"],
      );
      assert.equal(
        parseLiveBookOperation({
          ...submit,
          watchIds: Array.from({ length: 200 }, (_, index) => `piece-${index}`),
        }).watchIds.length,
        200,
      );
      for (const watchIds of [
        [],
        Array.from({ length: 201 }, (_, index) => `piece-${index}`),
        "piece-1",
        undefined,
      ]) {
        assert.throws(
          () => parseLiveBookOperation({ ...submit, watchIds }),
          /WATCH_IDS_REQUIRED/,
          `rejects ${JSON.stringify(watchIds)}`,
        );
      }
      assert.throws(
        () => parseLiveBookOperation({ ...submit, watchIds: ["piece-1", ""] }),
        /LIVE_BOOK_ID_REQUIRED/,
      );
      for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1_000_000_001, "abc", undefined]) {
        assert.throws(
          () => parseLiveBookOperation({ ...submit, amount }),
          /AGREEMENT_AMOUNT_INVALID/,
          `rejects amount ${String(amount)}`,
        );
      }
      assert.throws(() => parseLiveBookOperation({ ...submit, termMonths: 0 }), /AGREEMENT_TERM_INVALID/);
      assert.throws(() => parseLiveBookOperation({ ...submit, termMonths: 25 }), /AGREEMENT_TERM_INVALID/);
      assert.deepEqual(REQUEST_DELIVERY_METHODS, [
        "Insured courier",
        "Desk arranges intake",
        "Private appointment",
      ]);
      for (const delivery of ["", "Carrier pigeon", undefined, "insured courier"]) {
        assert.throws(
          () => parseLiveBookOperation({ ...submit, delivery }),
          /DELIVERY_METHOD_INVALID/,
          `rejects delivery ${String(delivery)}`,
        );
      }
      assert.throws(() => parseLiveBookOperation({ ...submit, note: "x".repeat(1001) }), /NOTE_TOO_LONG/);
      assert.throws(
        () => parseLiveBookOperation({ ...submit, agreementCode: "x".repeat(41) }),
        /LIVE_BOOK_OPERATION_INVALID/,
      );
    });

    it("parses the Desk's answer as confirm or decline, never lower", () => {
      assert.deepEqual(
        parseLiveBookOperation({ action: "request.deskReturn", id: "req-1", decision: "confirm", ...versioned }),
        { action: "request.deskReturn", id: "req-1", decision: "confirm", note: "", ...versioned },
      );
      assert.deepEqual(
        parseLiveBookOperation({
          action: "request.deskReturn",
          id: "req-1",
          decision: "decline",
          note: "Not a fit.",
          ...versioned,
        }),
        { action: "request.deskReturn", id: "req-1", decision: "decline", note: "Not a fit.", ...versioned },
      );
      for (const decision of ["lower", "", undefined, "accept"]) {
        assert.throws(
          () => parseLiveBookOperation({ action: "request.deskReturn", id: "req-1", decision, ...versioned }),
          /REQUEST_DECISION_INVALID/,
          `rejects decision ${String(decision)}`,
        );
      }
    });

    it("requires the row the caller saw on every versioned move", () => {
      for (const action of ["request.deskReturn", "request.decline", "request.withdraw"]) {
        const base = { action, id: "req-1", decision: "confirm" };
        for (const patch of [
          { expectedStatus: "submitted" },
          { expectedVersion: 1 },
          { expectedStatus: "", expectedVersion: 1 },
          { expectedStatus: "x".repeat(33), expectedVersion: 1 },
          { expectedStatus: "submitted", expectedVersion: -1 },
          { expectedStatus: "submitted", expectedVersion: 1.5 },
          { expectedStatus: "submitted", expectedVersion: "1" },
        ]) {
          assert.throws(
            () => parseLiveBookOperation({ ...base, ...patch }),
            /LIVE_BOOK_OPERATION_INVALID/,
            `${action} rejects ${JSON.stringify(patch)}`,
          );
        }
      }
      assert.deepEqual(
        parseLiveBookOperation({ action: "request.decline", id: "req-1", ...versioned }),
        { action: "request.decline", id: "req-1", note: "", ...versioned },
      );
      assert.deepEqual(
        parseLiveBookOperation({ action: "request.withdraw", id: "req-1", note: "Changed my mind.", ...versioned }),
        { action: "request.withdraw", id: "req-1", note: "Changed my mind.", ...versioned },
      );
      assert.deepEqual(
        parseLiveBookOperation({ action: "request.withdraw", id: "req-1", expectedStatus: "returned", expectedVersion: 0 }),
        { action: "request.withdraw", id: "req-1", note: "", expectedStatus: "returned", expectedVersion: 0 },
      );
    });

    it("parses the internal customer-success flag as a boolean", () => {
      assert.deepEqual(
        parseLiveBookOperation({ action: "request.flagCustomerSuccess", id: "req-1", flag: true, note: "Call back." }),
        { action: "request.flagCustomerSuccess", id: "req-1", flag: true, note: "Call back." },
      );
      assert.deepEqual(
        parseLiveBookOperation({ action: "request.flagCustomerSuccess", id: "req-1", flag: false }),
        { action: "request.flagCustomerSuccess", id: "req-1", flag: false, note: "" },
      );
      for (const flag of ["true", 1, undefined, null]) {
        assert.throws(
          () => parseLiveBookOperation({ action: "request.flagCustomerSuccess", id: "req-1", flag }),
          /LIVE_BOOK_OPERATION_INVALID/,
          `rejects flag ${String(flag)}`,
        );
      }
    });

    it("no longer accepts the pre-request agreement writes", () => {
      for (const operation of [
        {
          action: "agreement.create",
          agreement: { id: "repo-1", watchIds: ["piece-1"], amount: 100, termMonths: 12, createdAt: "2026-09-18" },
        },
        { action: "agreement.addWatches", id: "repo-1", watchIds: ["piece-2"] },
        { action: "agreement.setAmount", id: "repo-1", amount: 90 },
        { action: "agreement.signCollector", id: "repo-1" },
        { action: "agreement.markSigned", id: "repo-1" },
      ]) {
        assert.throws(() => parseLiveBookOperation(operation), /LIVE_BOOK_ACTION_INVALID/, operation.action);
      }
    });

    it("parses collector sign, delivery, inspect, MAC execute, and return", () => {
      const hash = "a".repeat(64);
      assert.deepEqual(
        parseLiveBookOperation({
          action: "request.signCollector",
          id: "req-1",
          typedName: "Ada Locke",
          snapshotHash: hash,
          expectedStatus: "returned",
          expectedVersion: 1,
        }),
        {
          action: "request.signCollector",
          id: "req-1",
          typedName: "Ada Locke",
          snapshotHash: hash,
          note: "",
          expectedStatus: "returned",
          expectedVersion: 1,
        },
      );
      assert.throws(
        () => parseLiveBookOperation({
          action: "request.signCollector",
          id: "req-1",
          typedName: "",
          snapshotHash: hash,
          expectedStatus: "returned",
          expectedVersion: 1,
        }),
        /TYPED_NAME_REQUIRED/,
      );
      assert.deepEqual(
        parseLiveBookOperation({
          action: "request.inspect",
          id: "req-1",
          outcome: "proceed",
          pieces: [{ timepieceId: "piece-1", decision: "confirm", inspectedValueCents: 22500_00 }],
          expectedStatus: "inspecting",
          expectedVersion: 1,
        }).pieces,
        [{ timepieceId: "piece-1", decision: "confirm", inspectedValueCents: 2_250_000 }],
      );
      assert.throws(
        () => parseLiveBookOperation({
          action: "request.inspect",
          id: "req-1",
          outcome: "proceed",
          pieces: [{ timepieceId: "piece-1", decision: "confirm" }],
          expectedStatus: "inspecting",
          expectedVersion: 1,
        }),
        /INSPECTED_VALUE_REQUIRED/,
      );
      assert.deepEqual(
        parseLiveBookOperation({
          action: "request.executeMac",
          id: "req-1",
          typedName: "Dov Tuzman",
          snapshotHash: hash,
          paymentReference: "ABC-1",
          checklist: {
            identityVerified: true,
            serialsMatch: true,
            conditionMatches: true,
            termAgreed: true,
            inCustody: true,
          },
          expectedStatus: "inspecting",
          expectedVersion: 1,
        }).paymentReference,
        "ABC-1",
      );
      assert.throws(
        () => parseLiveBookOperation({
          action: "request.executeMac",
          id: "req-1",
          typedName: "Dov Tuzman",
          snapshotHash: hash,
          paymentReference: "ABC-1",
          checklist: {
            identityVerified: true,
            serialsMatch: true,
            conditionMatches: true,
            termAgreed: true,
            inCustody: false,
          },
          expectedStatus: "inspecting",
          expectedVersion: 1,
        }),
        /CHECKLIST_INCOMPLETE/,
      );
      assert.equal(
        parseLiveBookOperation({
          action: "request.resendExecuted",
          id: "req-1",
          expectedStatus: "executed",
          expectedVersion: 2,
        }).action,
        "request.resendExecuted",
      );
    });
  });
});
