import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { createDb } from "./client";
import { commitLiveBookImport } from "./live-book-import-commit";
import { getLiveAgreement } from "./live-book";
import { deskActor } from "./records";
import {
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];
const createdAgreementIds: string[] = [];
const createdPieceIds: string[] = [];
const desk = deskActor("staff", "desk@mechartcap.com");
const email = `hale.import.${suffix}@mac.test`;
const customerId = `cust-${email}`;
const haleExport = {
  timepieces: [
    {
      id: `rm-011-${suffix}`,
      ownerEmail: email,
      brand: "Richard Mille",
      model: "RM 011",
      status: "appraised",
      financeable: true,
      valueLow: 280000,
      valueHigh: 350000,
      images: ["/watches/richard-mille.jpg"],
    },
    {
      id: `pp-nautilus-${suffix}`,
      ownerEmail: email,
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
      id: `agr-import-${suffix}`,
      watchIds: [`rm-011-${suffix}`, `pp-nautilus-${suffix}`],
      amount: 200000,
      termMonths: 12,
      delivery: "Desk arranges intake",
      ownerName: "Jonathan Hale",
      email,
      status: "pending_signature",
      createdAt: "2021-03-14",
    },
  ],
};

describe("commitLiveBookImport", { skip }, () => {
  const db = createDb();

  after(async () => {
    createdCustomerIds.push(customerId);
    const pieceIds = [...new Set([...haleExport.timepieces.map((watch) => watch.id), ...createdPieceIds])];
    await db.delete(livePreviews).where(inArray(livePreviews.timepieceId, pieceIds));
    await db.delete(liveAgreementMembers).where(inArray(liveAgreementMembers.timepieceId, pieceIds));
    const agreementIds = [...new Set([haleExport.agreements[0].id, ...createdAgreementIds])];
    await db.delete(liveAgreementEnds).where(inArray(liveAgreementEnds.agreementId, agreementIds));
    await db.delete(liveAgreements).where(inArray(liveAgreements.id, agreementIds));
    await db.delete(timepieces).where(inArray(timepieces.id, pieceIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("commits Hale-shaped book twice with the same ids while the flag stays off", async () => {
    const first = await commitLiveBookImport(db, desk, haleExport, { confirmLiveImport: true });
    assert.equal(first.ok, true);
    assert.equal(first.agreements[0].watchIds.length, 2);
    const loaded = await getLiveAgreement(db, desk, haleExport.agreements[0].id);
    assert.equal(loaded?.createdOn, "2021-03-14");
    assert.equal(loaded?.amountCents, 20000000);
    assert.equal(loaded?.bookEnd, null);
    assert.deepEqual(loaded?.watchIds.sort(), haleExport.timepieces.map((watch) => watch.id).sort());

    const second = await commitLiveBookImport(
      db,
      desk,
      {
        ...haleExport,
        timepieces: haleExport.timepieces.map((watch, index) =>
          index === 0 ? { ...watch, condition: "Serviced", boxPapers: "Box only" } : watch,
        ),
      },
      { confirmLiveImport: true },
    );
    assert.equal(second.ok, true);
    const again = await getLiveAgreement(db, desk, haleExport.agreements[0].id);
    assert.equal(again?.id, loaded?.id);
    assert.equal(again?.amountCents, 20000000);
    const [piece] = await db.select().from(timepieces).where(inArray(timepieces.id, [haleExport.timepieces[0].id]));
    assert.equal(piece?.condition, "Serviced");
    assert.equal(piece?.boxPapers, "Box only");

    const ended = await commitLiveBookImport(
      db,
      desk,
      {
        ...haleExport,
        agreements: [
          {
            ...haleExport.agreements[0],
            bookEnd: { kind: "bought_back", date: "2022-01-15", amount: 220000 },
          },
        ],
      },
      { confirmLiveImport: true },
    );
    assert.equal(ended.ok, true);
    const withEnd = await getLiveAgreement(db, desk, haleExport.agreements[0].id);
    assert.equal(withEnd?.bookEnd?.kind, "bought_back");
    assert.ok(withEnd?.members.every((member) => member.status === "released"));

    const cleared = await commitLiveBookImport(db, desk, haleExport, { confirmLiveImport: true });
    assert.equal(cleared.ok, true);
    const withoutEnd = await getLiveAgreement(db, desk, haleExport.agreements[0].id);
    assert.equal(withoutEnd?.bookEnd, null);
  });

  it("imports a renewed repo and successor that share the same pieces", async () => {
    const oldId = `agr-old-${suffix}`;
    const newId = `agr-new-${suffix}`;
    const watchId = `rm-successor-${suffix}`;
    createdAgreementIds.push(oldId, newId);
    createdPieceIds.push(watchId);
    const payload = {
      timepieces: [
        {
          id: watchId,
          ownerEmail: email,
          brand: "Richard Mille",
          model: "RM 011",
          status: "appraised",
          financeable: true,
          valueLow: 280000,
          valueHigh: 350000,
          images: ["/watches/richard-mille.jpg"],
        },
      ],
      agreements: [
        {
          ...haleExport.agreements[0],
          id: oldId,
          watchIds: [watchId],
          bookEnd: { kind: "renewed", date: "2022-03-14", amount: 220000 },
        },
        {
          ...haleExport.agreements[0],
          id: newId,
          watchIds: [watchId],
          createdAt: "2022-03-14",
        },
      ],
    };
    const imported = await commitLiveBookImport(db, desk, payload, { confirmLiveImport: true });
    assert.equal(imported.ok, true);
    const oldRepo = await getLiveAgreement(db, desk, oldId);
    const newRepo = await getLiveAgreement(db, desk, newId);
    assert.equal(oldRepo?.bookEnd?.kind, "renewed");
    assert.ok(oldRepo?.members.every((member) => member.status === "released"));
    assert.equal(newRepo?.bookEnd, null);
    assert.ok(newRepo?.members.every((member) => member.status === "live"));
    assert.deepEqual(oldRepo?.watchIds.sort(), newRepo?.watchIds.sort());
  });

  it("refuses commit after the owner flag", async () => {
    await assert.rejects(
      () =>
        commitLiveBookImport(db, desk, haleExport, {
          confirmLiveImport: true,
          env: { MAC_LIVE_BOOK: "1" },
        }),
      { message: "LIVE_BOOK_FLAG_ON" },
    );
  });
});
