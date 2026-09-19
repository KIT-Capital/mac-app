import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "./client";
import { commitLiveBookImport } from "./live-book-import-commit";
import { createStaffAccount } from "./staff-accounts";
import { getLiveAgreement } from "./live-book";
import { deskActor } from "./records";
import {
  customers,
  deskAuditLog,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  staffAccounts,
  timepieces,
} from "./schema";
import { hashStaffPassword } from "../staff-password.mjs";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];
const createdAgreementIds: string[] = [];
const createdPieceIds: string[] = [];
const createdStaffIds: string[] = [];
const desk = deskActor("appraiser", `desk.import.${suffix}@mac.test`);
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
    if (createdStaffIds.length) {
      await db.delete(staffAccounts).where(inArray(staffAccounts.id, createdStaffIds));
    }
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
    const audits = await db.select().from(deskAuditLog)
      .where(eq(deskAuditLog.actorEmail, desk.email));
    assert.equal(audits.length, 4);
    assert.ok(audits.every((row) => row.action === "live-book.import"));
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

  it("refuses an admin import that carries appraisal values", async () => {
    // R5: bulk-writing appraised status, financeable, or values is an appraisal write.
    const admin = deskActor("admin", `admin.import.${suffix}@mac.test`);
    await assert.rejects(
      () => commitLiveBookImport(db, admin, haleExport, {
        confirmLiveImport: true,
        env: { APP_ENV: "development" } as NodeJS.ProcessEnv,
      }),
      { message: "ROLE_FORBIDDEN" },
    );
    const plainIds = haleExport.timepieces.map((watch) => `${watch.id}-plain`);
    createdPieceIds.push(...plainIds);
    const plainPayload = {
      ...haleExport,
      timepieces: haleExport.timepieces.map((watch, index) => ({
        ...watch,
        id: plainIds[index],
        status: "not_evaluated",
        financeable: false,
        valueLow: undefined,
        valueHigh: undefined,
      })),
      agreements: [],
    };
    await commitLiveBookImport(db, admin, plainPayload, {
      confirmLiveImport: true,
      env: { APP_ENV: "development" } as NodeJS.ProcessEnv,
    });
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

  it("refuses an import email already held by staff", async () => {
    const staffEmail = `staff-import.${suffix}@mac.test`;
    const staff = await createStaffAccount(db, {
      name: "Import Staff",
      email: staffEmail,
      role: "appraiser",
      passwordHash: await hashStaffPassword("temporary password 123"),
    });
    createdStaffIds.push(staff.id);
    const collisionPieceIds = haleExport.timepieces.map((watch) => `${watch.id}-staff`);
    const payload = {
      ...haleExport,
      timepieces: haleExport.timepieces.map((watch, index) => ({
        ...watch,
        id: collisionPieceIds[index],
        ownerEmail: staffEmail,
      })),
      agreements: haleExport.agreements.map((agreement) => ({
        ...agreement,
        id: `${agreement.id}-staff`,
        watchIds: collisionPieceIds,
        email: staffEmail,
      })),
    };
    await assert.rejects(
      () => commitLiveBookImport(db, desk, payload, { confirmLiveImport: true }),
      /RESERVED_DESK_EMAIL/,
    );
  });

  it("attributes staged imports to locked staff and rolls back on audit failure", async () => {
    const staff = await createStaffAccount(db, {
      name: "Authenticated Import Staff",
      email: `authenticated-import.${suffix}@mac.test`,
      role: "appraiser",
      passwordHash: await hashStaffPassword("temporary password 123"),
      mustRotate: false,
    });
    createdStaffIds.push(staff.id);
    const actor = deskActor("appraiser", staff.email, staff.id);
    const payload = remappedImport(`import-owner.${suffix}@mac.test`, "authenticated");
    const committed = await commitLiveBookImport(db, actor, payload, {
      confirmLiveImport: true,
      env: { APP_ENV: "staging", MAC_LIVE_BOOK: "off" } as NodeJS.ProcessEnv,
      clientAddress: "198.51.100.9",
    });
    createdCustomerIds.push(...committed.customers.map((row) => row.id));
    createdPieceIds.push(...committed.timepieces.map((row) => row.id));
    createdAgreementIds.push(...committed.agreements.map((row) => row.id));
    const [audit] = await db.select().from(deskAuditLog).where(eq(
      deskAuditLog.actorEmail,
      staff.email,
    ));
    assert.equal(audit.action, "live-book.import");
    assert.equal(audit.clientAddress, "198.51.100.9");

    const failedEmail = `failed-import.${suffix}@mac.test`;
    await assert.rejects(() => commitLiveBookImport(
      db,
      actor,
      remappedImport(failedEmail, "failed-audit"),
      {
        confirmLiveImport: true,
        env: { APP_ENV: "staging", MAC_LIVE_BOOK: "off" } as NodeJS.ProcessEnv,
        clientAddress: "",
      },
    ));
    assert.equal((await db.select({ id: customers.id }).from(customers)
      .where(eq(customers.email, failedEmail))).length, 0);
  });
});

function remappedImport(ownerEmail: string, label: string) {
  const ids = haleExport.timepieces.map((watch) => `${watch.id}-${label}`);
  return {
    ...haleExport,
    timepieces: haleExport.timepieces.map((watch, index) => ({
      ...watch,
      id: ids[index],
      ownerEmail,
    })),
    agreements: haleExport.agreements.map((agreement) => ({
      ...agreement,
      id: `${agreement.id}-${label}`,
      watchIds: ids,
      email: ownerEmail,
    })),
  };
}
