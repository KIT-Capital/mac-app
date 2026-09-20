import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { legacyAgreementToRequest } from "./legacy-agreement.mjs";

/** Hale demo fixture: 2021-03-14, 12 months, pending signature. Matches lib/seed.ts. */
const HALE = {
  id: "agr-31419",
  watchIds: ["rm-011", "pp-nautilus"],
  amount: 200000,
  termMonths: 12,
  delivery: "Desk arranges intake",
  ownerName: "Jonathan Hale",
  email: "jonathan.hale@mechartcap.com",
  status: "pending_signature",
  createdAt: "2021-03-14",
  updatedAt: "2021-03-14T00:00:00.000Z",
};

describe("legacyAgreementToRequest", () => {
  it("puts a signed row on the book from the day it was signed", () => {
    const mapped = legacyAgreementToRequest({
      ...HALE,
      status: "signed",
      signedAt: "2021-04-02",
    });
    assert.equal(mapped.status, "executed");
    assert.equal(mapped.executedOn, "2021-04-02");
    assert.equal(mapped.version, 1);
    assert.equal(mapped.closeReason, undefined);
    assert.deepEqual(mapped.event, {
      action: "legacy_backfill",
      actorKind: "system",
      fromStatus: "signed",
      toStatus: "executed",
      version: 1,
    });
  });

  it("puts an unsigned Hale row on the book from its creation day", () => {
    // These rows were already on the book with live members; the demo depends
    // on Hale still reading past due after the mapping.
    const mapped = legacyAgreementToRequest(HALE);
    assert.equal(mapped.status, "executed");
    assert.equal(mapped.executedOn, "2021-03-14");
    assert.equal(mapped.event.fromStatus, "pending_signature");
    assert.equal(mapped.membersStatus, "live");
  });

  it("falls back to the creation day when a signed row never recorded its date", () => {
    const mapped = legacyAgreementToRequest({ ...HALE, status: "signed", signedAt: undefined });
    assert.equal(mapped.executedOn, "2021-03-14");
  });

  it("closes a draft row and frees its pieces", () => {
    const mapped = legacyAgreementToRequest({ ...HALE, status: "draft" });
    assert.equal(mapped.status, "closed");
    assert.equal(mapped.closeReason, "withdrawn");
    assert.equal(mapped.executedOn, undefined);
    assert.equal(mapped.membersStatus, "released");
  });

  it("carries the last action time from the row's own updated stamp", () => {
    assert.equal(legacyAgreementToRequest(HALE).lastActionAt, "2021-03-14T00:00:00.000Z");
    const noStamp = legacyAgreementToRequest({ ...HALE, updatedAt: undefined });
    assert.equal(noStamp.lastActionAt, "2021-03-14T00:00:00.000Z");
  });

  it("never rewinds a row's own expiry clock", () => {
    // Rewinding a returned request to its application day would make it look
    // expired on the next read and free the pieces it has reserved.
    const returned = {
      ...HALE,
      status: "returned",
      createdAt: "2026-09-01",
      lastActionAt: "2026-09-15T12:00:00.000Z",
      updatedAt: undefined,
    };
    assert.equal(legacyAgreementToRequest(returned).lastActionAt, "2026-09-15T12:00:00.000Z");
  });

  it("keeps a legacy signed row recognisably signed", () => {
    // Every immutability check now reads signedAt, so a signed row that never
    // recorded its date must not come back editable.
    const mapped = legacyAgreementToRequest({ ...HALE, status: "signed", signedAt: undefined });
    assert.equal(mapped.signedAt, "2021-03-14");
    assert.equal(legacyAgreementToRequest(HALE).signedAt, undefined);
  });

  it("leaves an already-migrated row alone", () => {
    const already = { ...HALE, status: "executed", executedOn: "2021-03-14", version: 2 };
    const mapped = legacyAgreementToRequest(already);
    assert.equal(mapped.status, "executed");
    assert.equal(mapped.version, 2);
    assert.equal(mapped.event, undefined);
  });

  it("never collapses an in-flight request into an executed repo", () => {
    // A later unit writes these states; an upgrade or a second import must
    // carry them through untouched rather than putting them on the book.
    for (const status of ["submitted", "returned", "collector_signed", "inspecting"]) {
      const mapped = legacyAgreementToRequest({ ...HALE, status, version: 3 });
      assert.equal(mapped.status, status, status);
      assert.equal(mapped.executedOn, undefined, status);
      assert.equal(mapped.membersStatus, "reserved", status);
      assert.equal(mapped.version, 3, status);
      assert.equal(mapped.event, undefined, status);
    }
  });

  it("keeps a close reason it is handed", () => {
    const mapped = legacyAgreementToRequest({
      ...HALE,
      status: "closed",
      closeReason: "expired",
    });
    assert.equal(mapped.status, "closed");
    assert.equal(mapped.closeReason, "expired");
    assert.equal(mapped.membersStatus, "released");
  });

  it("closes a legacy row whose date cannot be read instead of faking one", () => {
    // The schema will require an execution date on every executed repo.
    const mapped = legacyAgreementToRequest({ ...HALE, createdAt: "not-a-date" });
    assert.equal(mapped.status, "closed");
    assert.equal(mapped.executedOn, undefined);
    assert.equal(mapped.membersStatus, "released");
  });

  it("never lands a legacy row in a request state", () => {
    for (const status of ["draft", "pending_signature", "signed"]) {
      const mapped = legacyAgreementToRequest({ ...HALE, status });
      assert.ok(["executed", "closed"].includes(mapped.status), status);
    }
  });
});
