import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertVideoDuration,
  catalogEntryForPiece,
  catalogIdForSelection,
  custodyLabel,
  pieceCustody,
} from "./client-pieces";
import type { Agreement, CatalogEntry } from "./types";

function agreement(overrides: Partial<Agreement> = {}): Agreement {
  return {
    id: "agr-1",
    watchIds: ["w1"],
    amount: 1000,
    termMonths: 12,
    delivery: "Insured courier",
    ownerName: "A",
    email: "a@example.com",
    status: "executed",
    createdAt: "2026-09-01",
    executedOn: "2026-09-01",
    ...overrides,
  };
}

const catalog: CatalogEntry[] = [{
  id: "cat-rm",
  brandId: "brand-rm",
  brand: "Richard Mille",
  model: "RM 011",
  reference: "RM 011",
  caseMetal: "",
  caseDiameter: "",
  typicalLow: 0,
  typicalHigh: 0,
  financeable: false,
  notes: "",
  retailVisible: false,
  photoObjectKey: null,
  photoSourceUrl: "",
  photoLicense: "",
  photoAttribution: "",
  marketSourceUrls: [],
  marketRetrievedOn: null,
  lastEditedByStaffId: null,
}];

describe("client pieces", () => {
  it("links a piece to the matching catalog row", () => {
    assert.equal(
      catalogIdForSelection(catalog, "Richard Mille", "RM 011", "RM 011"),
      "cat-rm",
    );
    assert.equal(
      catalogEntryForPiece(catalog, { brand: "Other", model: "X", catalogId: "cat-rm" })?.id,
      "cat-rm",
    );
    assert.equal(catalogIdForSelection(catalog, "Patek", "Nautilus"), null);
  });

  it("labels free, in-request, and locked pieces", () => {
    assert.equal(pieceCustody([], "w1"), "free");
    assert.equal(pieceCustody([agreement({ executedOn: undefined, status: "submitted" })], "w1"), "in_request");
    assert.equal(pieceCustody([agreement()], "w1"), "locked");
    assert.equal(custodyLabel("locked"), "Locked in activated repo");
  });

  it("refuses a video longer than 60 seconds", () => {
    assert.equal(assertVideoDuration(12.4), 12.4);
    assert.throws(() => assertVideoDuration(61), /VIDEO_TOO_LONG/);
    assert.throws(() => assertVideoDuration(0), /VIDEO_TOO_LONG/);
  });
});
