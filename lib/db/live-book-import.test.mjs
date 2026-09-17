import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveBookFlagOn, planLiveBookImport } from "./live-book-import.mjs";

const HALE = {
  user: null,
  timepieces: [
    {
      id: "rm-011",
      ownerEmail: "jonathan.hale@mechartcap.com",
      brand: "Richard Mille",
      model: "RM 011",
      status: "appraised",
      financeable: true,
      valueLow: 280000,
      valueHigh: 350000,
      images: ["/watches/richard-mille.jpg"],
    },
    {
      id: "pp-nautilus",
      ownerEmail: "jonathan.hale@mechartcap.com",
      brand: "Patek Philippe",
      model: "Nautilus",
      status: "appraised",
      financeable: true,
      valueLow: 95000,
      valueHigh: 120000,
      images: ["/watches/patek-nautilus.jpg"],
    },
  ],
  agreements: [
    {
      id: "agr-31419",
      watchIds: ["rm-011", "pp-nautilus"],
      amount: 200000,
      termMonths: 12,
      delivery: "Desk arranges intake",
      ownerName: "Jonathan Hale",
      email: "jonathan.hale@mechartcap.com",
      status: "pending_signature",
      createdAt: "2021-03-14",
    },
  ],
};

describe("liveBookFlagOn", () => {
  it("stays off unless the owner switch is set", () => {
    assert.equal(liveBookFlagOn({}), false);
    assert.equal(liveBookFlagOn({ MAC_LIVE_BOOK: "1" }), true);
    assert.equal(liveBookFlagOn({ MAC_LIVE_BOOK: "true" }), true);
  });
});

describe("planLiveBookImport", () => {
  it("plans Hale as one person, two pieces, one repo, no end", () => {
    const plan = planLiveBookImport(HALE, { confirmLiveImport: true });
    assert.equal(plan.ok, true);
    assert.equal(plan.customers.length, 1);
    assert.equal(plan.timepieces.length, 2);
    assert.equal(plan.agreements.length, 1);
    assert.deepEqual(plan.agreements[0].watchIds, ["rm-011", "pp-nautilus"]);
    assert.equal(plan.agreements[0].bookEnd, null);
    assert.equal(plan.previews.length, 2);
    assert.equal(plan.previews[0].kind, "legacy_preview");
  });

  it("keeps the same ids when the same export is planned twice", () => {
    const first = planLiveBookImport(HALE, { confirmLiveImport: true });
    const second = planLiveBookImport(HALE, {
      confirmLiveImport: true,
      existingCustomers: first.customers.map((row) => ({ id: row.id, email: row.email })),
    });
    assert.equal(second.ok, true);
    assert.equal(second.customers[0].id, first.customers[0].id);
    assert.equal(second.customers[0].action, "upsert");
    assert.deepEqual(
      second.agreements.map((row) => row.id),
      first.agreements.map((row) => row.id),
    );
  });

  it("does not treat in-memory Hale as live without staff confirm", () => {
    const plan = planLiveBookImport(HALE);
    assert.equal(plan.ok, false);
    assert.equal(plan.error, "DEMO_CONFIRM_REQUIRED");
  });

  it("rejects a reserved desk email as a customer", () => {
    const plan = planLiveBookImport(
      {
        timepieces: [],
        agreements: [{ ...HALE.agreements[0], email: "admin@mechartcap.com", watchIds: ["rm-011"] }],
      },
      { confirmLiveImport: true },
    );
    assert.equal(plan.ok, false);
    assert.ok(plan.rejects.some((item) => item.code === "RESERVED_DESK_EMAIL"));
  });

  it("rejects missing watch ids and email collisions", () => {
    const missing = planLiveBookImport(
      { ...HALE, agreements: [{ ...HALE.agreements[0], watchIds: [] }] },
      { confirmLiveImport: true },
    );
    assert.equal(missing.ok, false);
    assert.ok(missing.rejects.some((item) => item.code === "MISSING_WATCH_IDS"));

    const collision = planLiveBookImport(HALE, {
      confirmLiveImport: true,
      existingCustomers: [{ id: "other-id", email: "jonathan.hale@mechartcap.com" }],
    });
    assert.equal(collision.ok, false);
    assert.ok(collision.rejects.some((item) => item.code === "EMAIL_COLLISION"));
  });

  it("defers data-url previews and refuses after the owner flag", () => {
    const deferred = planLiveBookImport(
      {
        ...HALE,
        timepieces: [{ ...HALE.timepieces[0], images: ["data:image/jpeg;base64,abc"] }, HALE.timepieces[1]],
      },
      { confirmLiveImport: true },
    );
    assert.equal(deferred.ok, true);
    assert.equal(deferred.timepieces[0].deferredPreview, true);
    assert.equal(
      deferred.previews.some((preview) => preview.timepieceId === "rm-011"),
      false,
    );

    const flagged = planLiveBookImport(HALE, { confirmLiveImport: true, flagOn: true });
    assert.equal(flagged.ok, false);
    assert.equal(flagged.error, "LIVE_BOOK_FLAG_ON");
  });
});
