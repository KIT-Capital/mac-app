import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mapLiveBookRows } from "./live-book-adapter";

describe("live-book adapter mapping", () => {
  it("maps imported Hale rows to the current Agreement and Timepiece shapes", () => {
    const state = mapLiveBookRows({
      customers: [{
        id: "cust-hale",
        email: "jonathan.hale@mechartcap.com",
        name: "Jonathan Hale",
        phone: "",
        role: "collector",
        status: "active",
        member: false,
        avatar: "",
        onboardingComplete: true,
        applicationSubmitted: true,
        promoCode: null,
        preferences: {},
        lastActive: null,
      }],
      timepieces: [{
        id: "rm-011",
        customerId: "cust-hale",
        brand: "Richard Mille",
        model: "RM 011",
        reference: "RM 011",
        status: "appraised",
        financeable: true,
        condition: "Mint",
        boxPapers: "Box and papers",
        caseMetal: "Rose gold",
        caseType: "Tonneau",
        caseDiameter: "44mm",
        dialColor: "Skeleton",
        buckle: "Folding clasp",
        band: "strap",
        bandMaterial: "Rubber",
        complication: "Chronograph",
        evaluatedAt: null,
        assetCode: "20210321-RM011",
        valueLowCents: 28000000,
        valueHighCents: 35000000,
      }],
      agreements: [{
        id: "agr-31419",
        customerId: "cust-hale",
        amountCents: 20000000,
        termMonths: 12,
        delivery: "Desk arranges intake",
        ownerName: "Jonathan Hale",
        email: "jonathan.hale@mechartcap.com",
        status: "pending_signature",
        agreementCode: "MAC-31419",
        createdOn: "2021-03-14",
        signedOn: null,
        scale: null,
      }],
      members: [{ agreementId: "agr-31419", timepieceId: "rm-011", status: "live" }],
      ends: [],
      previews: [],
    });

    assert.equal(state.timepieces[0].valueLow, 280000);
    assert.equal(state.timepieces[0].ownerEmail, "jonathan.hale@mechartcap.com");
    assert.deepEqual(state.agreements[0], {
      id: "agr-31419",
      watchIds: ["rm-011"],
      amount: 200000,
      termMonths: 12,
      delivery: "Desk arranges intake",
      ownerName: "Jonathan Hale",
      email: "jonathan.hale@mechartcap.com",
      status: "pending_signature",
      createdAt: "2021-03-14",
      agreementCode: "MAC-31419",
    });
  });

  it("keeps collector reads scoped while desk reads all rows", () => {
    const rows = {
      customers: [
        { id: "cust-a", email: "a@example.com", name: "A" },
        { id: "cust-b", email: "b@example.com", name: "B" },
      ],
      timepieces: [
        { id: "piece-a", customerId: "cust-a" },
        { id: "piece-b", customerId: "cust-b" },
      ],
      agreements: [
        { id: "repo-a", customerId: "cust-a" },
        { id: "repo-b", customerId: "cust-b" },
      ],
      members: [
        { agreementId: "repo-a", timepieceId: "piece-a" },
        { agreementId: "repo-b", timepieceId: "piece-b" },
      ],
      ends: [],
      previews: [],
    };

    const collector = mapLiveBookRows(rows, "cust-a");
    const desk = mapLiveBookRows(rows);
    assert.deepEqual(collector.timepieces.map((row) => row.id), ["piece-a"]);
    assert.deepEqual(collector.agreements.map((row) => row.id), ["repo-a"]);
    assert.equal(desk.timepieces.length, 2);
    assert.equal(desk.agreements.length, 2);
  });

  it("maps a recorded end without changing the agreement status field", () => {
    const state = mapLiveBookRows({
      customers: [{ id: "cust-a", email: "a@example.com", name: "A" }],
      timepieces: [{ id: "piece-a", customerId: "cust-a" }],
      agreements: [{
        id: "repo-a",
        customerId: "cust-a",
        amountCents: 10000,
        termMonths: 12,
        delivery: "",
        ownerName: "A",
        email: "a@example.com",
        status: "signed",
        createdOn: "2026-01-01",
      }],
      members: [{ agreementId: "repo-a", timepieceId: "piece-a", status: "released" }],
      ends: [{
        agreementId: "repo-a",
        kind: "renewed",
        endedOn: "2026-09-17",
        amountCents: 12500,
      }],
      previews: [],
    });
    assert.equal(state.agreements[0].status, "signed");
    assert.deepEqual(state.agreements[0].bookEnd, {
      kind: "renewed",
      date: "2026-09-17",
      amount: 125,
    });
  });

  it("returns authoritative desk data and default settings without seeding rows", () => {
    const base = {
      customers: [],
      timepieces: [],
      agreements: [],
      members: [],
      ends: [],
      previews: [],
    };
    const defaults = mapLiveBookRows({
      ...base,
      settings: [],
      catalog: [],
      shells: [],
    });
    assert.equal(defaults.settings.maxLtv, 0.6);
    assert.equal(defaults.settings.startingRate, 0.185);
    assert.deepEqual(defaults.catalog, []);
    assert.deepEqual(defaults.shells, []);

    const state = mapLiveBookRows({
      ...base,
      settings: [{
        id: "default",
        maxLtvBps: 5500,
        startingRateBps: 2000,
        setupFeeBps: 150,
        earlyRepurchaseAmountBps: 400,
        brokerFeeBps: 400,
        minMonths: 4,
        earlyStartMonth: 5,
        earlyUntilMonth: 9,
        typicalTerm: 12,
        membershipMonthlyCents: 799,
        vaultLocation: "MAC Vault",
      }],
      catalog: [{
        id: "cat-1",
        brand: "Cartier",
        model: "Tank",
        reference: "WSTA",
        caseMetal: "Steel",
        caseDiameter: "33mm",
        typicalLowCents: 1_000_000,
        typicalHighCents: 2_000_000,
        financeable: true,
        notes: "Desk reference",
      }],
      shells: [{
        id: "shell-1",
        code: "MAC-OPEN-12",
        title: "Open 12-month shell",
        termMonths: 12,
        rateBps: 2000,
        ltvBps: 5500,
        setupFeeBps: 150,
        earlyRepurchaseAmountBps: 400,
        brokerFeeBps: 400,
        minMonths: 4,
        earlyStartMonth: 5,
        earlyUntilMonth: 9,
        status: "open",
        createdOn: "2026-09-18",
      }],
    });
    assert.equal(state.settings.maxLtv, 0.55);
    assert.equal(state.settings.membershipMonthly, 7.99);
    assert.equal(state.settings.vaultLocation, "MAC Vault");
    assert.deepEqual(state.catalog.map((entry) => entry.id), ["cat-1"]);
    assert.equal(state.catalog[0].typicalLow, 10_000);
    assert.deepEqual(state.shells.map((shell) => shell.id), ["shell-1"]);
    assert.equal(state.shells[0].rate, 0.2);
  });

  it("withholds custom pricing, shells, and custody until collector disclosure", () => {
    const rows = {
      customers: [{ id: "cust-a", email: "a@example.com", name: "A" }],
      timepieces: [],
      agreements: [],
      members: [],
      ends: [],
      previews: [],
      settings: [{
        id: "default",
        maxLtvBps: 5500,
        startingRateBps: 2000,
        setupFeeBps: 150,
        earlyRepurchaseAmountBps: 400,
        brokerFeeBps: 400,
        minMonths: 4,
        earlyStartMonth: 5,
        earlyUntilMonth: 9,
        typicalTerm: 12,
        membershipMonthlyCents: 799,
        vaultLocation: "MAC Vault",
      }],
      catalog: [],
      shells: [{
        id: "shell-1",
        code: "MAC-OPEN-12",
        title: "Open",
        termMonths: 12,
        rateBps: 2000,
        ltvBps: 5500,
        setupFeeBps: 150,
        earlyRepurchaseAmountBps: 400,
        brokerFeeBps: 400,
        minMonths: 4,
        earlyStartMonth: 5,
        earlyUntilMonth: 9,
        status: "open",
        createdOn: "2026-09-18",
      }],
    };
    const before = mapLiveBookRows(rows, "cust-a", false);
    assert.equal(before.settings.maxLtv, 0.6);
    assert.equal(before.settings.vaultLocation, "");
    assert.deepEqual(before.shells, []);

    const after = mapLiveBookRows(rows, "cust-a", true);
    assert.equal(after.settings.maxLtv, 0.55);
    assert.equal(after.settings.vaultLocation, "MAC Vault");
    assert.equal(after.shells.length, 1);
  });
});
