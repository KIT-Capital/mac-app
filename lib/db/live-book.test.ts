import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray, sql } from "drizzle-orm";
import { ATTESTATION_LABEL, INSPECTION_CONDITION } from "../contract/repo-agreement-snapshot.mjs";
import { bookLabel, completedAppraisalDecisions, deskToday } from "../contract/repo-book.mjs";
import { agreementDocumentStore, memoryObjectStore, sha256Hex } from "../storage/object-store.mjs";
import { createDb, type Database } from "./client";
import { clearAccessRateLimit } from "./collector-sessions";
import { sendExecutedDocumentEmails } from "./agreement-documents";
import { readLiveBookState } from "./live-book-adapter";
import {
  executeLiveBookOperation,
  type RequestSubmitResult,
  type RequestTransitionResult,
} from "./live-book-mutations";
import { insertLiveAgreement } from "./live-book";
import { createTimepiece, deskActor, registerCollector, toCollectorActor } from "./records";
import { listAgreementEvents } from "./request-events";
import { createStaffAccount } from "./staff-accounts";
import { hashStaffPassword } from "../staff-password.mjs";
import {
  agreementDocumentSends,
  agreementDocuments,
  agreementEvents,
  agreementSignatures,
  agreementShells,
  appraisalAttempts,
  catalogReferences,
  customers,
  deskAuditLog,
  deskSettings,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  staffAccounts,
  timepieces,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const customerIds: string[] = [];
const staffIds: string[] = [];
let originalSettings: (typeof deskSettings.$inferSelect)[] = [];
let originalShells: (typeof agreementShells.$inferSelect)[] = [];

describe("live-book operation repository", { skip }, () => {
  const db = createDb();

  before(async () => {
    [originalSettings, originalShells] = await Promise.all([
      db.select().from(deskSettings),
      db.select().from(agreementShells),
    ]);
  });

  after(async () => {
    await db.delete(agreementShells);
    await db.delete(deskSettings);
    if (originalSettings.length) await db.insert(deskSettings).values(originalSettings);
    if (originalShells.length) await db.insert(agreementShells).values(originalShells);
    await db.delete(catalogReferences).where(eq(catalogReferences.id, `cat-u5-${suffix}`));
    const pieces = customerIds.length
      ? (await db.select({ id: timepieces.id }).from(timepieces).where(inArray(timepieces.customerId, customerIds))).map((row) => row.id)
      : [];
    const repos = customerIds.length
      ? (await db.select({ id: liveAgreements.id }).from(liveAgreements).where(inArray(liveAgreements.customerId, customerIds))).map((row) => row.id)
      : [];
    if (pieces.length) {
      await db.delete(livePreviews).where(inArray(livePreviews.timepieceId, pieces));
      await db.delete(liveAgreementMembers).where(inArray(liveAgreementMembers.timepieceId, pieces));
    }
    if (repos.length) {
      await db.delete(liveAgreementEnds).where(inArray(liveAgreementEnds.agreementId, repos));
      await db.delete(liveAgreementMembers).where(inArray(liveAgreementMembers.agreementId, repos));
      await db.delete(liveAgreements).where(inArray(liveAgreements.id, repos));
    }
    if (customerIds.length) {
      await db.delete(timepieces).where(inArray(timepieces.customerId, customerIds));
      await db.delete(customers).where(inArray(customers.id, customerIds));
    }
    if (staffIds.length) {
      await db.delete(staffAccounts).where(inArray(staffAccounts.id, staffIds));
    }
  });

  async function collector(label: string) {
    const customer = await registerCollector(db, {
      email: `${label}.${suffix}@mac.test`,
      name: label,
    });
    customerIds.push(customer.id);
    return { customer, actor: toCollectorActor(customer) };
  }

  it("persists shared desk data, audits money changes, and derives new agreement scale", async () => {
    await db.delete(agreementShells);
    await db.delete(deskSettings);
    const emptyLiveDesk = await readLiveBookState(db, deskActor("appraiser", "desk@mechartcap.com"));
    assert.equal(emptyLiveDesk.settings.maxLtv, 0.6);
    assert.deepEqual(emptyLiveDesk.shells, []);
    assert.equal((await db.select().from(deskSettings)).length, 0);
    const passwordHash = await hashStaffPassword("temporary password 123");
    const admin = await createStaffAccount(db, {
      name: "U5 Admin",
      email: `u5-admin.${suffix}@mac.test`,
      role: "admin",
      passwordHash,
      mustRotate: false,
    });
    const member = await createStaffAccount(db, {
      name: "U5 Staff",
      email: `u5-staff.${suffix}@mac.test`,
      role: "appraiser",
      passwordHash,
      mustRotate: false,
    });
    staffIds.push(admin.id, member.id);
    const adminActor = deskActor("admin", admin.email, admin.id);
    const staff = deskActor("appraiser", member.email, member.id);
    const options = {
      env: { MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
      clientAddress: "127.0.0.1",
    };
    const settingsOperation = {
      action: "settings.update",
      patch: {
        maxLtv: 0.55,
        startingRate: 0.2,
        setupFee: 0.015,
        earlyRepurchaseAmount: 0.04,
        brokerFee: 0.04,
        minMonths: 4,
        earlyStartMonth: 5,
        earlyUntilMonth: 9,
        typicalTerm: 12,
        membershipMonthly: 7.99,
        vaultLocation: "MAC Vault",
        appearance: "light",
      },
    };
    // Every desk role is admin-level for money settings; retail actors are refused.
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        { role: "collector", customerId: "nobody", email: "nobody@example.com" },
        settingsOperation,
        options,
      ),
      { message: "DESK_REQUIRED" },
    );
    await executeLiveBookOperation(db, adminActor, settingsOperation, options);
    await executeLiveBookOperation(db, adminActor, {
      action: "settings.update",
      patch: {
        minMonths: 3,
        earlyStartMonth: 3,
        earlyUntilMonth: 6,
        typicalTerm: 9,
      },
    }, options);
    await executeLiveBookOperation(
      db,
      adminActor,
      { action: "settings.update", patch: { typicalTerm: 7 } },
      options,
    );
    assert.equal((await readLiveBookState(db, adminActor)).settings.typicalTerm, 7);
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        adminActor,
        { action: "settings.update", patch: { earlyUntilMonth: 3 } },
        options,
      ),
      { message: "AGREEMENT_SCALE_INVALID" },
    );
    await executeLiveBookOperation(db, staff, {
      action: "catalog.upsert",
      entry: {
        id: `cat-u5-${suffix}`,
        brand: "Cartier",
        model: "Tank",
        reference: "WSTA",
        caseMetal: "Steel",
        caseDiameter: "33mm",
        typicalLow: 10_000,
        typicalHigh: 20_000,
        financeable: true,
        notes: "Shared reference",
      },
    }, options);
    await executeLiveBookOperation(db, adminActor, {
      action: "shell.upsert",
      shell: {
        id: `shell-u5-${suffix}`,
        code: "MAC-OPEN-12",
        title: "Open 12-month shell",
        termMonths: 12,
        rate: 0.21,
        ltv: 0.5,
        setupFee: 0.02,
        earlyRepurchaseAmount: 0.045,
        brokerFee: 0.045,
        minMonths: 4,
        earlyStartMonth: 5,
        earlyUntilMonth: 9,
        status: "open",
        createdAt: "2026-09-18",
      },
    }, options);

    const shared = await readLiveBookState(db, staff);
    const sharedOnSecondDesk = await readLiveBookState(db, adminActor);
    assert.equal(shared.settings.maxLtv, 0.55);
    assert.deepEqual(sharedOnSecondDesk.settings, shared.settings);
    assert.deepEqual(sharedOnSecondDesk.catalog, shared.catalog);
    assert.deepEqual(sharedOnSecondDesk.shells, shared.shells);
    assert.equal(shared.settings.appearance, "dark");
    assert.ok(shared.catalog.some((entry) => entry.id === `cat-u5-${suffix}`));
    assert.deepEqual(shared.shells.map((shell) => shell.id), [`shell-u5-${suffix}`]);

    const owner = await collector("server-scale");
    const beforeDisclosure = await readLiveBookState(db, owner.actor);
    assert.equal(beforeDisclosure.settings.maxLtv, 0.6);
    assert.equal(beforeDisclosure.settings.vaultLocation, "");
    assert.deepEqual(beforeDisclosure.shells, []);
    const piece = await createTimepiece(db, owner.actor, owner.customer.id, {
      brand: "Cartier",
      model: "Tank",
      status: "appraised",
      financeable: true,
      valueLow: 100_000,
      valueHigh: 120_000,
    });
    // Scale derivation at Apply is covered by the `repo requests` suite below;
    // here an executed fixture is enough to open the terms disclosure.
    const repoId = `repo-server-scale-${suffix}`;
    await insertLiveAgreement(db, owner.actor, {
      id: repoId,
      customerId: owner.customer.id,
      watchIds: [piece.id],
      amount: 50_000,
      termMonths: 12,
      delivery: "",
      ownerName: owner.customer.name,
      email: owner.customer.email,
      createdOn: "2026-09-18",
      agreementCode: `MAC-U5-${suffix}`,
      scale: { purchaseShare: 0.5, annualAdjustment: 0.21 },
    });
    const [created] = await db.select({ scale: liveAgreements.scale })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, repoId));
    const disclosed = await readLiveBookState(db, owner.actor);
    assert.equal(disclosed.settings.maxLtv, 0.55);
    assert.equal(disclosed.settings.vaultLocation, "MAC Vault");
    assert.equal(disclosed.shells[0].ltv, 0.5);

    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        adminActor,
        { action: "shell.remove", id: `shell-u5-${suffix}` },
        options,
      ),
      { message: "AGREEMENT_OPEN_SHELL_REQUIRED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, adminActor, {
        action: "shell.upsert",
        shell: { ...shared.shells[0], status: "assigned" },
      }, options),
      { message: "AGREEMENT_OPEN_SHELL_REQUIRED" },
    );
    await executeLiveBookOperation(db, adminActor, {
      action: "shell.upsert",
      shell: {
        id: `shell-u5-nine-${suffix}`,
        code: "MAC-OPEN-9",
        title: "Open 9-month shell",
        termMonths: 9,
        rate: 0.22,
        ltv: 0.45,
        setupFee: 0.025,
        earlyRepurchaseAmount: 0.05,
        brokerFee: 0.05,
        minMonths: 3,
        earlyStartMonth: 3,
        earlyUntilMonth: 6,
        status: "open",
        createdAt: "2026-09-18",
      },
    }, options);
    const replacedShells = await readLiveBookState(db, adminActor);
    assert.equal(replacedShells.shells.find((shell) => shell.id === `shell-u5-${suffix}`)?.status, "assigned");
    assert.equal(replacedShells.shells.find((shell) => shell.id === `shell-u5-nine-${suffix}`)?.status, "open");
    const firstApplicant = await collector("first-application-cap");
    await createTimepiece(
      db,
      firstApplicant.actor,
      firstApplicant.customer.id,
      {
        brand: "Vacheron Constantin",
        model: "Overseas",
        status: "appraised",
        financeable: true,
        valueLow: 100_000,
        valueHigh: 120_000,
      },
    );
    const firstApplicantState = await readLiveBookState(db, firstApplicant.actor);
    assert.equal(firstApplicantState.settings.maxLtv, 0.6);
    assert.deepEqual(firstApplicantState.shells, []);
    assert.equal(firstApplicantState.applicationPurchaseShares[9], 0.45);
    assert.equal(firstApplicantState.applicationPurchaseShares[12], 0.55);
    await Promise.all([10, 11].map((termMonths) =>
      executeLiveBookOperation(db, adminActor, {
        action: "shell.upsert",
        shell: {
          id: `shell-u5-${termMonths}-${suffix}`,
          code: `MAC-OPEN-${termMonths}`,
          title: `Open ${termMonths}-month shell`,
          termMonths,
          rate: 0.22,
          ltv: 0.45,
          setupFee: 0.025,
          earlyRepurchaseAmount: 0.05,
          brokerFee: 0.05,
          minMonths: 3,
          earlyStartMonth: 3,
          earlyUntilMonth: 6,
          status: "open",
          createdAt: "2026-09-18",
        },
      }, options)
    ));
    const afterConcurrentReplacement = await readLiveBookState(db, adminActor);
    assert.equal(
      afterConcurrentReplacement.shells.filter((shell) => shell.status === "open").length,
      1,
    );

    await executeLiveBookOperation(db, adminActor, {
      action: "settings.update",
      patch: { membershipMonthly: 8.99 },
    }, options);
    const [unchanged] = await db.select({ scale: liveAgreements.scale })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, repoId));
    assert.deepEqual(unchanged.scale, created.scale);

    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        adminActor,
        { action: "settings.update", patch: { membershipMonthly: 9.99 } },
        { ...options, clientAddress: "" },
      ),
      { message: "CLIENT_ADDRESS_REQUIRED" },
    );
    assert.equal((await readLiveBookState(db, staff)).settings.membershipMonthly, 8.99);
    await executeLiveBookOperation(
      db,
      adminActor,
      { action: "shell.remove", id: `shell-u5-${suffix}` },
      options,
    );
    await db.update(staffAccounts).set({ disabledAt: new Date() })
      .where(eq(staffAccounts.id, member.id));
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        staff,
        { action: "catalog.remove", id: `cat-u5-${suffix}` },
        options,
      ),
      { message: "SESSION_INVALID" },
    );
    await db.update(staffAccounts).set({ disabledAt: null })
      .where(eq(staffAccounts.id, member.id));
    await executeLiveBookOperation(
      db,
      staff,
      { action: "catalog.remove", id: `cat-u5-${suffix}` },
      options,
    );
    const finalShells = (await readLiveBookState(db, staff)).shells;
    assert.equal(finalShells.some((shell) => shell.id === `shell-u5-${suffix}`), false);
    assert.equal(finalShells.filter((shell) => shell.status === "open").length, 1);

    const audits = await db.select().from(deskAuditLog).where(and(
      inArray(deskAuditLog.actorEmail, [admin.email, member.email]),
      inArray(deskAuditLog.action, [
        "settings.update",
        "catalog.upsert",
        "catalog.remove",
        "shell.upsert",
        "shell.remove",
      ]),
    ));
    assert.deepEqual(audits.map((row) => row.action).sort(), [
      "catalog.remove",
      "catalog.upsert",
      "settings.update",
      "settings.update",
      "settings.update",
      "settings.update",
      "shell.remove",
      "shell.upsert",
      "shell.upsert",
      "shell.upsert",
      "shell.upsert",
    ]);
    assert.ok(
      audits
        .filter((row) => row.action.startsWith("catalog."))
        .every((row) => row.targetId === `cat-u5-${suffix}`),
    );
    await db.delete(deskSettings);
  });

  it("keeps collector reads isolated while desk reads all rows", async () => {
    const a = await collector("read-a");
    const b = await collector("read-b");
    await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    await createTimepiece(db, b.actor, b.customer.id, { brand: "Rolex", model: "Daytona" });
    const own = await readLiveBookState(db, a.actor);
    const all = await readLiveBookState(db, deskActor("appraiser", "desk@mechartcap.com"));
    assert.equal(own.timepieces.length, 1);
    assert.equal(own.timepieces[0].ownerEmail, a.customer.email);
    assert.ok(all.timepieces.some((row) => row.ownerEmail === a.customer.email));
    assert.ok(all.timepieces.some((row) => row.ownerEmail === b.customer.email));
    await assert.rejects(
      () => executeLiveBookOperation(db, b.actor, {
        action: "timepiece.update",
        id: own.timepieces[0].id,
        patch: { model: "Stolen" },
      }),
      { message: "TIMEPIECE_NOT_FOUND" },
    );
  });

  it("creates one collector piece without changing another customer's row", async () => {
    const a = await collector("write-a");
    const b = await collector("write-b");
    const existing = await createTimepiece(db, b.actor, b.customer.id, { brand: "Patek Philippe", model: "Nautilus" });
    await executeLiveBookOperation(db, a.actor, {
      action: "timepiece.create",
      timepiece: {
        id: `piece-a-${suffix}`,
        brand: "Audemars Piguet",
        model: "Royal Oak",
        status: "appraised",
        valueLow: 999999,
        assetCode: `ASSET-${suffix}`,
      },
    });
    const own = await readLiveBookState(db, a.actor);
    const untouched = await readLiveBookState(db, b.actor);
    assert.equal(own.timepieces[0].status, "not_evaluated");
    assert.equal(own.timepieces[0].valueLow, undefined);
    assert.equal(own.timepieces[0].assetCode, `ASSET-${suffix}`);
    assert.deepEqual(untouched.timepieces.map((row) => row.id), [existing.id]);
  });

  it("keeps valuation and end controls on the desk", async () => {
    const a = await collector("desk-control");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Crash" });
    const repoId = `repo-desk-${suffix}`;
    await insertLiveAgreement(db, a.actor, {
      id: repoId,
      customerId: a.customer.id,
      watchIds: [piece.id],
      amount: 60000,
      termMonths: 12,
      delivery: "",
      ownerName: a.customer.name,
      email: a.customer.email,
      createdOn: "2026-01-01",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "timepiece.deskUpdate",
        id: piece.id,
        patch: { status: "appraised", valueLow: 100000 },
      }),
      { message: "DESK_REQUIRED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "agreement.recordEnd",
        id: repoId,
        end: { kind: "bought_back", date: "2026-09-17", amount: 70000 },
      }),
      { message: "DESK_REQUIRED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, deskActor("appraiser", "desk@mechartcap.com"), {
        action: "agreement.recordEnd",
        id: repoId,
        end: { kind: "renewed", date: "2026-09-17", amount: 70000 },
      }),
      { message: "ADMIN_RENEW_REQUIRED" },
    );
    await executeLiveBookOperation(db, deskActor("appraiser", "desk@mechartcap.com"), {
      action: "agreement.recordEnd",
      id: repoId,
      end: { kind: "bought_back", date: "2026-09-17", amount: 70000 },
    });
    const state = await readLiveBookState(db, a.actor);
    assert.equal(state.agreements[0].bookEnd?.kind, "bought_back");
  });

  it("reserves the required-photo policy for super admins and round-trips it", async () => {
    const appraiser = deskActor("appraiser", "dov@mechartcap.com");
    const superAdmin = deskActor("super_admin", "rc@mechartcap.com");
    const five = ["front", "back", "left", "right", "clasp"];

    for (const actor of [appraiser, deskActor("admin", "rosario@mechartcap.com")]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, actor, {
          action: "settings.update",
          patch: { requiredPhotoKinds: [...five, "box"] },
        }),
        { message: "ROLE_FORBIDDEN" },
      );
    }

    await executeLiveBookOperation(db, superAdmin, {
      action: "settings.update",
      patch: { requiredPhotoKinds: [...five, "box"] },
    });
    const withBox = await readLiveBookState(db, superAdmin);
    assert.deepEqual(withBox.settings.requiredPhotoKinds, [...five, "box"]);

    // A patch of unrelated fields must not silently reset the policy.
    await executeLiveBookOperation(db, superAdmin, {
      action: "settings.update",
      patch: { vaultLocation: "Manhattan vault" },
    });
    const afterOther = await readLiveBookState(db, superAdmin);
    assert.deepEqual(afterOther.settings.requiredPhotoKinds, [...five, "box"]);

    await executeLiveBookOperation(db, superAdmin, {
      action: "settings.update",
      patch: { requiredPhotoKinds: five },
    });
    const restored = await readLiveBookState(db, superAdmin);
    assert.deepEqual(restored.settings.requiredPhotoKinds, five);
  });

  it("reserves appraisal values and catalog writes for appraisers and super admins", async () => {
    const a = await collector("appraisal-fence");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Santos" });
    const admin = deskActor("admin", "rosario@mechartcap.com");
    const appraiser = deskActor("appraiser", "appraiser@mechartcap.com");

    for (const patch of [
      { valueLow: 100000 },
      { valueHigh: 120000 },
      { financeable: true },
      { status: "appraised" },
      { evaluatedAt: "2026-09-19T12:00:00.000Z" },
    ]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, admin, { action: "timepiece.deskUpdate", id: piece.id, patch }),
        { message: "ROLE_FORBIDDEN" },
        `admin must not write ${Object.keys(patch)[0]}`,
      );
    }
    // The collector-named action must not be a side door for a desk actor.
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "timepiece.update",
        id: piece.id,
        patch: { status: "appraised" },
      }),
      { message: "ROLE_FORBIDDEN" },
    );
    const [untouched] = await db.select().from(timepieces).where(eq(timepieces.id, piece.id));
    assert.equal(untouched.valueLowCents, null);
    assert.equal(untouched.status, "not_evaluated");

    await executeLiveBookOperation(db, admin, {
      action: "timepiece.deskUpdate",
      id: piece.id,
      patch: { assetCode: "MAC-0001", status: "reviewing" },
    });
    const [tagged] = await db.select().from(timepieces).where(eq(timepieces.id, piece.id));
    assert.equal(tagged.assetCode, "MAC-0001");
    assert.equal(tagged.status, "reviewing");

    await executeLiveBookOperation(db, appraiser, {
      action: "timepiece.deskUpdate",
      id: piece.id,
      patch: { status: "appraised", valueLow: 100000, valueHigh: 120000, financeable: true },
    });
    const [appraised] = await db.select().from(timepieces).where(eq(timepieces.id, piece.id));
    assert.equal(appraised.status, "appraised");
    assert.equal(appraised.valueLowCents, 10_000_000);

    // Demoting an appraised piece would erase the appraiser's decision.
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "timepiece.deskUpdate",
        id: piece.id,
        patch: { status: "reviewing" },
      }),
      { message: "ROLE_FORBIDDEN" },
    );
    const [stillAppraised] = await db.select().from(timepieces).where(eq(timepieces.id, piece.id));
    assert.equal(stillAppraised.status, "appraised");
    await executeLiveBookOperation(db, appraiser, {
      action: "timepiece.deskUpdate",
      id: piece.id,
      patch: { status: "reviewing" },
    });

    const entry = {
      id: `cat-fence-${suffix}`,
      brand: "Cartier",
      model: "Santos",
      reference: "WSSA0018",
      caseMetal: "Steel",
      caseDiameter: "39.8",
      typicalLow: 6000,
      typicalHigh: 8000,
      financeable: true,
      notes: "",
    };
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, { action: "catalog.upsert", entry }),
      { message: "ROLE_FORBIDDEN" },
    );
    await executeLiveBookOperation(db, appraiser, { action: "catalog.upsert", entry });
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, { action: "catalog.remove", id: entry.id }),
      { message: "ROLE_FORBIDDEN" },
    );
    await executeLiveBookOperation(db, deskActor("super_admin", "rc@mechartcap.com"), {
      action: "catalog.remove",
      id: entry.id,
    });
  });

  it("allows only desk renewal and moves membership transactionally", async () => {
    const a = await collector("renew");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Richard Mille", model: "RM 011" });
    const repoId = `repo-renew-${suffix}`;
    await insertLiveAgreement(db, a.actor, {
      id: repoId,
      customerId: a.customer.id,
      watchIds: [piece.id],
      amount: 100000,
      termMonths: 12,
      delivery: "",
      ownerName: a.customer.name,
      email: a.customer.email,
      createdOn: "2025-09-17",
    });
    const operation = {
      action: "agreement.renew",
      id: repoId,
      closeDate: "2026-09-17",
      successorId: `repo-successor-${suffix}`,
      agreementCode: `MAC-${suffix}`,
      scale: { purchaseShare: 0.01, annualAdjustment: 0.01 },
    };
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, operation),
      { message: "DESK_REQUIRED" },
    );
    // Super admins and appraisers hold the former admin verbs.
    await executeLiveBookOperation(db, deskActor("super_admin", "rc@mechartcap.com"), operation);
    const state = await readLiveBookState(db, a.actor);
    assert.equal(state.agreements.find((row) => row.id === repoId)?.bookEnd?.kind, "renewed");
    assert.deepEqual(state.agreements.find((row) => row.id === operation.successorId)?.watchIds, [piece.id]);
    assert.equal(state.agreements.find((row) => row.id === operation.successorId)?.scale?.purchaseShare, 0.6);
  });

  it("rejects canonical deletion when the piece is referenced", async () => {
    const a = await collector("remove");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Rolex", model: "Submariner" });
    await insertLiveAgreement(db, a.actor, {
      id: `repo-remove-${suffix}`,
      customerId: a.customer.id,
      watchIds: [piece.id],
      amount: 20000,
      termMonths: 12,
      delivery: "",
      ownerName: a.customer.name,
      email: a.customer.email,
      createdOn: "2026-09-17",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, { action: "timepiece.remove", id: piece.id }),
      { message: "TIMEPIECE_REFERENCED" },
    );
  });

  it("does not let one customer take another piece's preview id", async () => {
    const a = await collector("preview-a");
    const b = await collector("preview-b");
    const pieceA = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    const pieceB = await createTimepiece(db, b.actor, b.customer.id, { brand: "Rolex", model: "Daytona" });
    await executeLiveBookOperation(db, a.actor, {
      action: "preview.upsert",
      id: `shared-preview-${suffix}`,
      timepieceId: pieceA.id,
      kind: "front",
      url: "/preview-a.jpg",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, b.actor, {
        action: "preview.upsert",
        id: `shared-preview-${suffix}`,
        timepieceId: pieceB.id,
        kind: "back",
        url: "/preview-b.jpg",
      }),
      { message: "PREVIEW_ID_COLLISION" },
    );
    assert.deepEqual((await readLiveBookState(db, a.actor)).photos.map((row) => row.url), ["/preview-a.jpg"]);
  });

  it("lets desk mutate explicit customers, previews, and agreements safely", async () => {
    const empty = await collector("customer-empty");
    const linked = await collector("customer-linked");
    const desk = deskActor("appraiser", "desk@mechartcap.com");
    const invitedId = `customer-invited-${suffix}`;
    await executeLiveBookOperation(db, desk, {
      action: "customer.invite",
      customer: {
        id: invitedId,
        name: "Invited Collector",
        email: `INVITED.${suffix}@MAC.TEST`,
        phone: "",
        role: "collector",
        status: "active",
        member: false,
      },
    });
    customerIds.push(invitedId);
    const invited = (await readLiveBookState(db, desk)).users.find((row) => row.id === invitedId);
    assert.equal(invited?.status, "invited");
    assert.equal(invited?.email, `invited.${suffix}@mac.test`);
    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: empty.customer.id,
      patch: { name: "Updated Customer", status: "suspended" },
    });
    const piece = await createTimepiece(db, linked.actor, linked.customer.id, { brand: "Cartier", model: "Tank" });
    await assert.rejects(
      () => executeLiveBookOperation(db, desk, { action: "customer.remove", id: linked.customer.id }),
      { message: "CUSTOMER_REFERENCED" },
    );
    const repoId = `repo-remove-desk-${suffix}`;
    await insertLiveAgreement(db, linked.actor, {
      id: repoId,
      customerId: linked.customer.id,
      watchIds: [piece.id],
      amount: 10000,
      termMonths: 12,
      delivery: "",
      ownerName: linked.customer.name,
      email: linked.customer.email,
      createdOn: "2026-09-17",
    });
    // Pieces on a live repo are retail-locked; the Desk may still maintain its
    // operational preview (R8).
    await executeLiveBookOperation(db, desk, {
      action: "preview.upsert",
      id: `preview-remove-${suffix}`,
      timepieceId: piece.id,
      kind: "front",
      url: "/preview.jpg",
    });
    await executeLiveBookOperation(db, desk, { action: "preview.remove", id: `preview-remove-${suffix}` });
    await executeLiveBookOperation(db, desk, { action: "agreement.remove", id: repoId });
    await executeLiveBookOperation(db, desk, { action: "customer.remove", id: empty.customer.id });
    await executeLiveBookOperation(db, desk, { action: "customer.remove", id: invitedId });
    customerIds.splice(customerIds.indexOf(empty.customer.id), 1);
    customerIds.splice(customerIds.indexOf(invitedId), 1);
    assert.equal((await readLiveBookState(db, linked.actor)).agreements.length, 0);
    assert.equal((await readLiveBookState(db, linked.actor)).photos.length, 0);
  });

  it("keeps signed and ended agreements immutable to desk edit and removal", async () => {
    const a = await collector("immutable");
    const desk = deskActor("appraiser", "desk@mechartcap.com");
    const first = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    const second = await createTimepiece(db, a.actor, a.customer.id, { brand: "Rolex", model: "Daytona" });
    const signedId = `repo-signed-${suffix}`;
    const endedId = `repo-ended-${suffix}`;
    for (const [id, piece] of [[signedId, first], [endedId, second]] as const) {
      await insertLiveAgreement(db, a.actor, {
        id,
        customerId: a.customer.id,
        watchIds: [piece.id],
        amount: 10000,
        termMonths: 12,
        delivery: "",
        ownerName: a.customer.name,
        email: a.customer.email,
        createdOn: "2026-01-01",
      });
    }
    await db.update(liveAgreements)
      .set({ signedOn: "2026-01-02" })
      .where(eq(liveAgreements.id, signedId));
    await executeLiveBookOperation(db, desk, {
      action: "agreement.recordEnd",
      id: endedId,
      end: { kind: "bought_back", date: "2026-09-17", amount: 11000 },
    });
    for (const id of [signedId, endedId]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, desk, { action: "agreement.markSigned", id }),
        { message: "LIVE_BOOK_ACTION_INVALID" },
      );
      await assert.rejects(
        () => executeLiveBookOperation(db, desk, {
          action: "agreement.updateScale",
          id,
          termMonths: 12,
          scale: {
            purchaseShare: 0.6,
            setupFee: 0.01,
            annualAdjustment: 0.185,
            earlyRepurchaseAmount: 0.035,
            brokerFee: 0.035,
          },
        }),
        { message: "AGREEMENT_IMMUTABLE" },
      );
      await assert.rejects(
        () => executeLiveBookOperation(db, desk, { action: "agreement.remove", id }),
        { message: "AGREEMENT_IMMUTABLE" },
      );
    }
  });
});

/**
 * Requests write to the append-only `agreement_events` thread, which no
 * cleanup may delete. The suite therefore runs inside one root transaction
 * that is rolled back in `after`, exactly as the appraisal suite does.
 */
describe("repo requests", { skip }, () => {
  const rootDb = createDb();
  let db: Database;
  let releaseTransaction: (() => void) | undefined;
  let transactionPromise: Promise<unknown> | undefined;
  let appraiserId = "";
  let inspector: ReturnType<typeof deskActor>;
  let admin: ReturnType<typeof deskActor>;
  let adminEmail = "";
  let adminStaffId = "";
  const store = agreementDocumentStore(memoryObjectStore());
  const deskOptions = {
    env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
    clientAddress: "127.0.0.1",
    documentStore: store,
  };
  const retailOptions = { documentStore: store, env: { APP_ENV: "development" } as NodeJS.ProcessEnv };
  const CHECKLIST = {
    identityVerified: true,
    serialsMatch: true,
    conditionMatches: true,
    termAgreed: true,
    inCustody: true,
  } as const;
  const DAY = 86_400_000;

  before(async () => {
    let ready!: () => void;
    let release!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    releaseTransaction = release;
    transactionPromise = rootDb.transaction(async (tx) => {
      db = tx as unknown as Database;
      ready();
      await releasePromise;
      throw new Error("REQUEST_TEST_ROLLBACK");
    });
    await readyPromise;
    // Deterministic caps: no desk row means Scenario 60 (share 0.6, $1,000 floor).
    await db.delete(agreementShells);
    await db.delete(deskSettings);
    const passwordHash = await hashStaffPassword("request password 123");
    const appraiser = await createStaffAccount(db, {
      name: "Request Appraiser",
      email: `request-appraiser.${suffix}@mac.test`,
      role: "appraiser",
      passwordHash,
      mustRotate: false,
    });
    appraiserId = appraiser.id;
    inspector = deskActor("appraiser", appraiser.email, appraiser.id);
    const adminRow = await createStaffAccount(db, {
      name: "Request Admin",
      email: `request-admin.${suffix}@mac.test`,
      role: "admin",
      passwordHash,
      mustRotate: false,
    });
    adminEmail = adminRow.email;
    adminStaffId = adminRow.id;
    admin = deskActor("admin", adminRow.email, adminRow.id);
  });

  after(async () => {
    releaseTransaction?.();
    await assert.rejects(() => transactionPromise, { message: "REQUEST_TEST_ROLLBACK" });
  });

  async function collector(label: string) {
    const customer = await registerCollector(db, {
      email: `${label}.${suffix}@mac.test`,
      name: label,
    });
    return { customer, actor: toCollectorActor(customer) };
  }

  /** An appraised, purchaseable piece whose Accept was decided `daysAgo` days ago. */
  async function acceptedPiece(
    owner: Awaited<ReturnType<typeof collector>>,
    daysAgo = 0,
    input: { valueLow?: number; valueHigh?: number; financeable?: boolean } = {},
  ) {
    const decidedAt = new Date(Date.now() - daysAgo * DAY);
    const piece = await createTimepiece(db, owner.actor, owner.customer.id, {
      brand: "Cartier",
      model: `Tank ${randomUUID().slice(0, 6)}`,
      status: "appraised",
      financeable: input.financeable ?? true,
      valueLow: input.valueLow ?? 100_000,
      valueHigh: input.valueHigh ?? 120_000,
      evaluatedAt: decidedAt.toISOString(),
    });
    await db.insert(appraisalAttempts).values({
      id: randomUUID(),
      timepieceId: piece.id,
      customerId: owner.customer.id,
      attemptNo: 1,
      decisionNo: 1,
      status: "accepted",
      snapshot: {},
      evidenceSealedAt: decidedAt,
      decidedByStaffId: appraiserId,
      decidedAt,
      valueCents: 11_000_000,
      rangeLowCents: (input.valueLow ?? 100_000) * 100,
      rangeHighCents: (input.valueHigh ?? 120_000) * 100,
    });
    return piece;
  }

  function submit(
    owner: Awaited<ReturnType<typeof collector>>,
    id: string,
    watchIds: string[],
    amount: number,
    extra: Record<string, unknown> = {},
  ) {
    return executeLiveBookOperation(db, owner.actor, {
      action: "request.submit",
      id,
      watchIds,
      termMonths: 12,
      amount,
      delivery: "Insured courier",
      note: "Please keep the boxes together.",
      ...extra,
    }, retailOptions) as Promise<RequestSubmitResult>;
  }

  async function agreementRow(id: string) {
    const [row] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, id));
    return row;
  }

  async function membersOf(id: string) {
    return db.select().from(liveAgreementMembers).where(eq(liveAgreementMembers.agreementId, id));
  }

  async function eventsOf(id: string) {
    return db.select().from(agreementEvents).where(eq(agreementEvents.agreementId, id)).orderBy(agreementEvents.createdAt);
  }

  async function documentsOf(id: string) {
    return db.select().from(agreementDocuments).where(eq(agreementDocuments.liveAgreementId, id));
  }

  async function signaturesOf(id: string) {
    return db.select().from(agreementSignatures).where(eq(agreementSignatures.agreementId, id));
  }

  async function attemptsOf(timepieceId: string) {
    return db.select().from(appraisalAttempts).where(eq(appraisalAttempts.timepieceId, timepieceId));
  }

  async function flush(result: { afterCommit?: Array<() => Promise<unknown>> }) {
    for (const job of result.afterCommit ?? []) await job();
  }

  async function stageHash(id: string, stage: string, version: number) {
    const docs = await documentsOf(id);
    const row = docs.find((doc) => doc.stage === stage && doc.version === version);
    assert.ok(row, `missing ${stage} v${version}`);
    return row.snapshotHash;
  }

  async function confirmRequest(id: string) {
    const row = await agreementRow(id);
    return executeLiveBookOperation(db, admin, {
      action: "request.deskReturn",
      id,
      decision: "confirm",
      expectedStatus: row.status,
      expectedVersion: row.version ?? 1,
    }, deskOptions);
  }

  async function signRequest(
    owner: Awaited<ReturnType<typeof collector>>,
    id: string,
    extra: {
      snapshotHash?: string;
      typedName?: string;
      delivery?: string;
      options?: { documentStore?: ReturnType<typeof agreementDocumentStore> };
    } = {},
  ) {
    const row = await agreementRow(id);
    const result = await executeLiveBookOperation(db, owner.actor, {
      action: "request.signCollector",
      id,
      typedName: extra.typedName ?? owner.customer.name,
      snapshotHash: extra.snapshotHash ?? await stageHash(id, "proposal", row.version ?? 1),
      delivery: extra.delivery ?? "Desk arranges intake",
      expectedStatus: row.status,
      expectedVersion: row.version ?? 1,
    }, extra.options ?? retailOptions) as RequestSubmitResult;
    await flush(result);
    return result;
  }

  async function deliverRequest(id: string) {
    const row = await agreementRow(id);
    return executeLiveBookOperation(db, admin, {
      action: "request.recordDelivery",
      id,
      expectedStatus: row.status,
      expectedVersion: row.version ?? 1,
    }, deskOptions);
  }

  async function inspectPieces(
    id: string,
    pieces: Array<{ timepieceId: string; decision: "confirm" | "refuse" | "drop"; inspectedValueCents?: number }>,
    outcome: "proceed" | "decline" = "proceed",
    actor = inspector,
  ) {
    const row = await agreementRow(id);
    const result = await executeLiveBookOperation(db, actor, {
      action: "request.inspect",
      id,
      outcome,
      pieces,
      expectedStatus: row.status,
      expectedVersion: row.version ?? 1,
    }, deskOptions) as RequestSubmitResult;
    await flush(result);
    return result;
  }

  async function executeRequest(
    id: string,
    extra: {
      snapshotHash?: string;
      paymentReference?: string;
      checklist?: Record<string, true>;
      expectedStatus?: string;
      expectedVersion?: number;
    } = {},
  ) {
    const row = await agreementRow(id);
    const result = await executeLiveBookOperation(db, inspector, {
      action: "request.executeMac",
      id,
      typedName: "Dov Tuzman",
      snapshotHash: extra.snapshotHash ?? await stageHash(id, "collector_signed", row.version ?? 1),
      paymentReference: extra.paymentReference ?? "ABC-1",
      checklist: extra.checklist ?? CHECKLIST,
      expectedStatus: extra.expectedStatus ?? row.status,
      expectedVersion: extra.expectedVersion ?? row.version ?? 1,
    }, deskOptions) as RequestSubmitResult;
    await flush(result);
    return result;
  }

  it("submits three current pieces at the cap and mints a building proposal", async () => {
    const owner = await collector("request-submit");
    const pieces = [
      await acceptedPiece(owner, 0),
      await acceptedPiece(owner, 3),
      await acceptedPiece(owner, 6),
    ];
    const id = `request-submit-${suffix}`;
    const result = await submit(owner, id, pieces.map((piece) => piece.id), 180_000);
    assert.equal(result.agreement.status, "submitted");
    assert.equal(result.agreement.version, 1);
    assert.deepEqual(
      result.agreement.pieceCaps,
      Object.fromEntries(pieces.map((piece) => [piece.id, 60_000])),
    );
    assert.equal(Object.hasOwn(result.agreement, "customerSuccess"), false);

    const row = await agreementRow(id);
    assert.equal(row.status, "submitted");
    assert.equal(row.version, 1);
    assert.equal(row.amountCents, 18_000_000);
    assert.equal(row.termMonths, 12);
    assert.equal(row.delivery, "Insured courier");
    assert.equal(row.createdOn, deskToday());
    assert.match(row.agreementCode ?? "", /^MAC-[A-Z0-9]{6}$/);
    assert.equal(Object.keys(row.pieceCaps as Record<string, number>).length, 3);
    assert.equal((row.scale as { purchaseShare: number }).purchaseShare, 0.6);

    const members = await membersOf(id);
    assert.equal(members.length, 3);
    assert.ok(members.every((member) => member.status === "reserved"));
    assert.deepEqual(members.map((member) => member.id).sort(), pieces.map((piece) => `${id}:${piece.id}`).sort());

    const events = await eventsOf(id);
    assert.equal(events.length, 1);
    assert.equal(events[0].action, "submit");
    assert.equal(events[0].actorKind, "retail");
    assert.equal(events[0].actorId, owner.customer.id);
    assert.equal(events[0].fromStatus, null);
    assert.equal(events[0].toStatus, "submitted");
    assert.equal(events[0].amountCents, 18_000_000);
    assert.equal(events[0].version, 1);
    assert.equal(events[0].note, "Please keep the boxes together.");
    assert.equal(events[0].internal, false);

    const [building] = await documentsOf(id);
    assert.equal(building.stage, "proposal");
    assert.equal(building.status, "building");
    assert.equal(building.version, 1);
    assert.ok(building.objectKey);
    assert.equal(building.createdByKind, "collector");

    assert.equal(result.afterCommit.length, 1);
    for (const job of result.afterCommit) await job();
    const [stored] = await documentsOf(id);
    assert.equal(stored.status, "stored");
    assert.ok(await store.head(stored.objectKey ?? ""));
    assert.equal(stored.checksum, sha256Hex(await store.get(stored.objectKey ?? "")));
    const snapshot = stored.snapshot as { text: string; facts: string[] };
    assert.ok(snapshot.text.includes(INSPECTION_CONDITION));
    assert.ok(snapshot.facts.includes(INSPECTION_CONDITION));
    assert.doesNotMatch(
      snapshot.text.replaceAll("not a loan", ""),
      /\b(loan|lender|interest|financing|collateral|borrower)\b/i,
    );
    // The job is idempotent: a second run leaves the stored row alone.
    for (const job of result.afterCommit) await job();
    assert.equal((await documentsOf(id)).length, 1);
  });

  it("refuses a fractional, sub-floor, or over-cap amount and leaves no row", async () => {
    const owner = await collector("request-amounts");
    const piece = await acceptedPiece(owner);
    for (const [amount, message] of [
      [500.5, "AMOUNT_WHOLE_DOLLARS"],
      [999, "AMOUNT_BELOW_MINIMUM"],
      [60_001, "AMOUNT_ABOVE_CAP"],
    ] as const) {
      const id = `request-amount-${message}-${suffix}`;
      await assert.rejects(() => submit(owner, id, [piece.id], amount), { message });
      assert.equal(await agreementRow(id), undefined);
      assert.deepEqual(await eventsOf(id), []);
    }
    const ok = await submit(owner, `request-amount-ok-${suffix}`, [piece.id], 60_000);
    assert.equal(ok.agreement.amount, 60_000);
  });

  it("refuses pieces another request holds, stale or open appraisals, and ineligible pieces", async () => {
    const owner = await collector("request-pieces");
    try {
    const held = await acceptedPiece(owner);
    await submit(owner, `request-holder-${suffix}`, [held.id], 60_000);
    await assert.rejects(
      () => submit(owner, `request-conflict-${suffix}`, [held.id], 60_000),
      { message: "LIVE_WATCH_CONFLICT" },
    );

    const stale = await acceptedPiece(owner, 8);
    await assert.rejects(
      () => submit(owner, `request-stale-${suffix}`, [stale.id], 60_000),
      { message: "APPRAISAL_EXPIRED" },
    );
    const fresh = await acceptedPiece(owner, 6);
    const accepted = await submit(owner, `request-fresh-${suffix}`, [fresh.id], 60_000);
    assert.equal(accepted.agreement.status, "submitted");

    const reviewing = await acceptedPiece(owner, 1);
    await db.insert(appraisalAttempts).values({
      id: randomUUID(),
      timepieceId: reviewing.id,
      customerId: owner.customer.id,
      attemptNo: 2,
      status: "under_review",
      snapshot: {},
    });
    await assert.rejects(
      () => submit(owner, `request-reviewing-${suffix}`, [reviewing.id], 60_000),
      { message: "REVIEW_LOCKED" },
    );
    await clearAccessRateLimit(db, "request.submit", owner.customer.id);

    const unfinanceable = await acceptedPiece(owner, 0, { financeable: false });
    await assert.rejects(
      () => submit(owner, `request-unfinanceable-${suffix}`, [unfinanceable.id], 60_000),
      { message: "INELIGIBLE_PIECE" },
    );

    const stranger = await collector("request-stranger");
    await assert.rejects(
      () => submit(stranger, `request-not-owned-${suffix}`, [fresh.id], 60_000),
      { message: "TIMEPIECE_NOT_OWNED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "request.submit",
        id: `request-desk-${suffix}`,
        watchIds: [fresh.id],
        termMonths: 12,
        amount: 60_000,
        delivery: "Insured courier",
        note: "",
      }, deskOptions),
      { message: "COLLECTOR_REQUIRED" },
    );
    const collision = await acceptedPiece(owner);
    await assert.rejects(
      () => submit(owner, `request-holder-${suffix}`, [collision.id], 60_000),
      { message: "ID_COLLISION" },
    );
    } finally {
      await clearAccessRateLimit(db, "request.submit", owner.customer.id);
    }
  });

  it("freezes the server scale for the term at Apply and caps against it", async () => {
    const owner = await collector("request-scale");
    const piece = await acceptedPiece(owner);
    await db.insert(agreementShells).values({
      id: `shell-request-${suffix}`,
      code: "MAC-OPEN-12",
      title: "Open 12-month shell",
      termMonths: 12,
      rateBps: 2100,
      ltvBps: 5000,
      setupFeeBps: 200,
      earlyRepurchaseAmountBps: 450,
      brokerFeeBps: 450,
      minMonths: 4,
      earlyStartMonth: 5,
      earlyUntilMonth: 9,
      status: "open",
      createdOn: "2026-09-18",
    });
    try {
      await assert.rejects(
        () => submit(owner, `request-scale-over-${suffix}`, [piece.id], 50_001),
        { message: "AMOUNT_ABOVE_CAP" },
      );
      const id = `request-scale-${suffix}`;
      // Client-supplied scale is not part of the operation and cannot leak in.
      await submit(owner, id, [piece.id], 50_000, { scale: { purchaseShare: 1.5 } });
      const row = await agreementRow(id);
      assert.equal((row.scale as { purchaseShare: number }).purchaseShare, 0.5);
      assert.equal((row.scale as { annualAdjustment: number }).annualAdjustment, 0.21);
      assert.deepEqual(row.pieceCaps, { [piece.id]: 50_000 });
    } finally {
      await db.delete(agreementShells).where(eq(agreementShells.id, `shell-request-${suffix}`));
    }
  });

  it("throttles the sixth submit by one collector in a day", async () => {
    const owner = await collector("request-throttle");
    try {
      for (let index = 0; index < 5; index += 1) {
        const piece = await acceptedPiece(owner);
        await submit(owner, `request-throttle-${index}-${suffix}`, [piece.id], 60_000);
      }
      const sixth = await acceptedPiece(owner);
      const id = `request-throttle-6-${suffix}`;
      await assert.rejects(() => submit(owner, id, [sixth.id], 60_000), { message: "THROTTLED" });
      assert.equal(await agreementRow(id), undefined);
      assert.deepEqual(await eventsOf(id), []);
    } finally {
      await clearAccessRateLimit(db, "request.submit", owner.customer.id);
    }
  });

  it("counts a refused submit against the daily throttle", async () => {
    const owner = await collector("request-throttle-refuse");
    const piece = await acceptedPiece(owner);
    try {
      for (let index = 0; index < 5; index += 1) {
        await assert.rejects(
          () => submit(owner, `request-throttle-refuse-${index}-${suffix}`, [piece.id], 60_001),
          { message: "AMOUNT_ABOVE_CAP" },
        );
      }
      const id = `request-throttle-refuse-6-${suffix}`;
      await assert.rejects(() => submit(owner, id, [piece.id], 60_000), { message: "THROTTLED" });
      assert.equal(await agreementRow(id), undefined);
    } finally {
      await clearAccessRateLimit(db, "request.submit", owner.customer.id);
    }
  });

  it("mints the agreement code and ignores a client-supplied one", async () => {
    const owner = await collector("request-code");
    const piece = await acceptedPiece(owner);
    const id = `request-code-${suffix}`;
    await submit(owner, id, [piece.id], 60_000, { agreementCode: "CLIENT-CODE" });
    const row = await agreementRow(id);
    assert.match(row.agreementCode ?? "", /^MAC-[A-Z0-9]{6}$/);
    assert.notEqual(row.agreementCode, "CLIENT-CODE");
  });

  it("lets the Desk confirm once, scoped by owner and guarded by the expected row", async () => {
    const owner = await collector("request-confirm");
    const other = await collector("request-confirm-other");
    const piece = await acceptedPiece(owner);
    const id = `request-confirm-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    const expected = { expectedStatus: "submitted", expectedVersion: 1 };

    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "request.deskReturn", id, decision: "lower", ...expected,
      }, deskOptions),
      { message: "REQUEST_DECISION_INVALID" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 0,
      }, deskOptions),
      { message: "AGREEMENT_STATE_CONFLICT" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, {
        action: "request.deskReturn", id, decision: "confirm", ...expected,
      }),
      { message: "ROLE_FORBIDDEN" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, other.actor, {
        action: "request.deskReturn", id, decision: "confirm", ...expected,
      }),
      { message: "AGREEMENT_NOT_FOUND" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, other.actor, {
        action: "request.withdraw", id, expectedStatus: "closed", expectedVersion: 7,
      }),
      { message: "AGREEMENT_NOT_FOUND" },
    );
    assert.equal((await agreementRow(id)).status, "submitted");
    await db.update(appraisalAttempts)
      .set({ decidedAt: new Date(Date.now() - 9 * DAY) })
      .where(eq(appraisalAttempts.timepieceId, piece.id));

    const confirmed = await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id, decision: "confirm", note: "Ready for you.", ...expected,
    }, deskOptions) as RequestTransitionResult;
    assert.equal(confirmed.agreement.status, "returned");
    assert.equal(confirmed.agreement.version, 1);
    const row = await agreementRow(id);
    assert.equal(row.status, "returned");
    assert.equal(row.version, 1);
    assert.equal(row.closeReason, null);
    assert.equal(row.amountCents, 6_000_000);
    const events = await eventsOf(id);
    assert.deepEqual(events.map((event) => event.action), ["submit", "deskReturn"]);
    assert.equal(events[1].actorKind, "desk");
    assert.equal(events[1].actorId, adminStaffId);
    assert.equal(events[1].fromStatus, "submitted");
    assert.equal(events[1].toStatus, "returned");
    assert.equal(events[1].note, "Ready for you.");
    // Confirming mints nothing: the proposal the owner reads is the v1 document.
    assert.equal((await documentsOf(id)).length, 1);

    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "request.deskReturn", id, decision: "confirm", ...expected,
      }, deskOptions),
      { message: "AGREEMENT_STATE_CONFLICT" },
    );
    const audits = await db.select().from(deskAuditLog).where(and(
      eq(deskAuditLog.actorEmail, adminEmail),
      eq(deskAuditLog.action, "request.deskReturn"),
      eq(deskAuditLog.targetId, id),
    ));
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].detail, { decision: "confirm", note: "Ready for you." });
  });

  it("lets the Desk decline, closing the request and releasing its pieces", async () => {
    const owner = await collector("request-desk-decline");
    const piece = await acceptedPiece(owner);
    const id = `request-desk-decline-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id, decision: "decline", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    const row = await agreementRow(id);
    assert.equal(row.status, "closed");
    assert.equal(row.closeReason, "declined_by_desk");
    assert.ok((await membersOf(id)).every((member) => member.status === "released"));
    assert.equal((await documentsOf(id)).length, 1);
  });

  it("lets the owner withdraw a returned request and reuse the pieces", async () => {
    const owner = await collector("request-withdraw");
    const piece = await acceptedPiece(owner);
    const id = `request-withdraw-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    const withdrawn = await executeLiveBookOperation(db, owner.actor, {
      action: "request.withdraw", id, expectedStatus: "returned", expectedVersion: 1, note: "Changed my mind.",
    }) as RequestTransitionResult;
    assert.equal(withdrawn.agreement.status, "closed");
    assert.equal(withdrawn.agreement.closeReason, "withdrawn");
    const row = await agreementRow(id);
    assert.equal(row.status, "closed");
    assert.equal(row.closeReason, "withdrawn");
    assert.ok((await membersOf(id)).every((member) => member.status === "released"));
    assert.deepEqual((await eventsOf(id)).map((event) => event.action), ["submit", "deskReturn", "withdraw"]);

    const again = await submit(owner, `request-withdraw-again-${suffix}`, [piece.id], 60_000);
    assert.equal(again.agreement.status, "submitted");
  });

  it("throttles the sixth withdraw by one collector in a day", async () => {
    const owner = await collector("request-withdraw-throttle");
    try {
      for (let index = 0; index < 5; index += 1) {
        const piece = await acceptedPiece(owner);
        const id = `request-withdraw-throttle-${index}-${suffix}`;
        await submit(owner, id, [piece.id], 60_000);
        await executeLiveBookOperation(db, admin, {
          action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
        }, deskOptions);
        await executeLiveBookOperation(db, owner.actor, {
          action: "request.withdraw", id, expectedStatus: "returned", expectedVersion: 1,
        });
      }
      await clearAccessRateLimit(db, "request.submit", owner.customer.id);
      const piece = await acceptedPiece(owner);
      const id = `request-withdraw-throttle-6-${suffix}`;
      await submit(owner, id, [piece.id], 60_000);
      await executeLiveBookOperation(db, admin, {
        action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
      }, deskOptions);
      await assert.rejects(
        () => executeLiveBookOperation(db, owner.actor, {
          action: "request.withdraw", id, expectedStatus: "returned", expectedVersion: 1,
        }),
        { message: "THROTTLED" },
      );
      assert.equal((await agreementRow(id)).status, "returned");
    } finally {
      await clearAccessRateLimit(db, "request.submit", owner.customer.id);
      await clearAccessRateLimit(db, "request.withdraw", owner.customer.id);
    }
  });

  it("lets the owner decline a returned proposal", async () => {
    const owner = await collector("request-decline");
    const piece = await acceptedPiece(owner);
    const id = `request-decline-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    // Nothing to decline while the Desk still holds it.
    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, {
        action: "request.decline", id, expectedStatus: "submitted", expectedVersion: 1,
      }),
      { message: "AGREEMENT_STATE_CONFLICT" },
    );
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    await executeLiveBookOperation(db, owner.actor, {
      action: "request.decline", id, expectedStatus: "returned", expectedVersion: 1,
    });
    const row = await agreementRow(id);
    assert.equal(row.status, "closed");
    assert.equal(row.closeReason, "declined_by_collector");
    assert.equal((await documentsOf(id)).length, 1);
  });

  it("closes an expired request for real before refusing the move, and frees its pieces", async () => {
    const owner = await collector("request-expired");
    const piece = await acceptedPiece(owner);
    const id = `request-expired-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    await db.update(liveAgreements)
      .set({ lastActionAt: new Date(Date.now() - 15 * DAY) })
      .where(eq(liveAgreements.id, id));

    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, {
        action: "request.decline", id, expectedStatus: "returned", expectedVersion: 1,
      }),
      { message: "REQUEST_EXPIRED" },
    );
    const row = await agreementRow(id);
    assert.equal(row.status, "closed");
    assert.equal(row.closeReason, "expired");
    assert.ok((await membersOf(id)).every((member) => member.status === "released"));
    const events = await eventsOf(id);
    assert.deepEqual(events.map((event) => event.action), ["submit", "deskReturn", "expire"]);
    assert.equal(events[2].actorKind, "system");
    assert.equal(events[2].internal, false);

    // Reading the thread agrees with the row; a second move sees a closed row.
    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, {
        action: "request.withdraw", id, expectedStatus: "returned", expectedVersion: 1,
      }),
      { message: "AGREEMENT_STATE_CONFLICT" },
    );
    const again = await submit(owner, `request-expired-again-${suffix}`, [piece.id], 60_000);
    assert.equal(again.agreement.status, "submitted");
  });

  it("closes an expired holder inside a new submit instead of reporting a conflict", async () => {
    const owner = await collector("request-expired-holder");
    const piece = await acceptedPiece(owner);
    const holderId = `request-expired-holder-${suffix}`;
    await submit(owner, holderId, [piece.id], 60_000);
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id: holderId, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    await db.update(liveAgreements)
      .set({ lastActionAt: new Date(Date.now() - 15 * DAY) })
      .where(eq(liveAgreements.id, holderId));
    const fresh = await submit(owner, `request-expired-holder-next-${suffix}`, [piece.id], 60_000);
    assert.equal(fresh.agreement.status, "submitted");
    const holder = await agreementRow(holderId);
    assert.equal(holder.status, "closed");
    assert.equal(holder.closeReason, "expired");
    assert.deepEqual((await eventsOf(holderId)).map((event) => event.action), ["submit", "deskReturn", "expire"]);
  });

  it("does not send an expiry letter until the new submit commits", async () => {
    const owner = await collector("request-expired-mail");
    const piece = await acceptedPiece(owner);
    const holderId = `request-expired-mail-${suffix}`;
    await submit(owner, holderId, [piece.id], 60_000);
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id: holderId, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    await db.update(liveAgreements)
      .set({ lastActionAt: new Date(Date.now() - 15 * DAY) })
      .where(eq(liveAgreements.id, holderId));
    const kinds: string[] = [];
    const mailOptions = {
      ...retailOptions,
      env: { ...retailOptions.env, RESEND_API_KEY: "re_test" },
      sendEmail: async (message: { tags: { name: string; value: string }[] }) => {
        kinds.push(message.tags.find((tag) => tag.name === "kind")?.value ?? "");
        return { data: { id: "re_test" }, error: null };
      },
    };
    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, {
        action: "request.submit",
        id: `request-expired-mail-abort-${suffix}`,
        watchIds: [piece.id],
        termMonths: 12,
        amount: 60_001,
        delivery: "Insured courier",
      }, mailOptions),
      { message: "AMOUNT_ABOVE_CAP" },
    );
    assert.deepEqual(kinds, []);
    const stillOpen = await agreementRow(holderId);
    assert.equal(stillOpen.status, "returned");
    const next = await executeLiveBookOperation(db, owner.actor, {
      action: "request.submit",
      id: `request-expired-mail-next-${suffix}`,
      watchIds: [piece.id],
      termMonths: 12,
      amount: 60_000,
      delivery: "Insured courier",
    }, mailOptions) as RequestSubmitResult;
    assert.deepEqual(kinds, []);
    await flush(next);
    assert.ok(kinds.includes("request_expired"));
    assert.ok(kinds.includes("request_submitted"));
  });

  it("flags customer success as a desk-only event the owner never reads", async () => {
    const owner = await collector("request-success");
    const piece = await acceptedPiece(owner);
    const id = `request-success-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, { action: "request.flagCustomerSuccess", id, flag: true }),
      { message: "ROLE_FORBIDDEN" },
    );
    const before = await agreementRow(id);
    const flagged = await executeLiveBookOperation(db, admin, {
      action: "request.flagCustomerSuccess", id, flag: true, note: "VIP handling.",
    }, deskOptions) as RequestTransitionResult;
    assert.equal(flagged.agreement.customerSuccess, true);
    assert.equal(flagged.agreement.status, "submitted");
    const row = await agreementRow(id);
    assert.equal(row.customerSuccess, true);
    assert.equal(row.status, "submitted");
    assert.equal(row.version, 1);
    assert.equal(row.lastActionAt.getTime(), before.lastActionAt.getTime());
    const events = await eventsOf(id);
    assert.deepEqual(events.map((event) => [event.action, event.internal]), [["submit", false], ["flagCustomerSuccess", true]]);
    assert.deepEqual((await listAgreementEvents(db, owner.actor, id)).map((event) => event.action), ["submit"]);
    assert.deepEqual((await listAgreementEvents(db, admin, id)).map((event) => event.action), ["submit", "flagCustomerSuccess"]);
    const stranger = await collector("request-success-stranger");
    await assert.rejects(() => listAgreementEvents(db, stranger.actor, id), { message: "AGREEMENT_NOT_FOUND" });
    const retailBook = await readLiveBookState(db, owner.actor);
    const flaggedRow = retailBook.agreements.find((item) => item.id === id);
    assert.ok(flaggedRow);
    assert.equal(Object.hasOwn(flaggedRow, "customerSuccess"), false);
    const audits = await db.select().from(deskAuditLog).where(and(
      eq(deskAuditLog.actorEmail, adminEmail),
      eq(deskAuditLog.action, "request.flagCustomerSuccess"),
      eq(deskAuditLog.targetId, id),
    ));
    assert.equal(audits.length, 1);
    assert.deepEqual(audits[0].detail, { flag: true, note: "VIP handling." });
    const withdrawn = await executeLiveBookOperation(db, owner.actor, {
      action: "request.withdraw", id, expectedStatus: "submitted", expectedVersion: 1,
    }) as RequestTransitionResult;
    assert.equal(withdrawn.agreement.status, "closed");
    assert.equal((await agreementRow(id)).closeReason, "withdrawn");
  });

  it("freezes the scale of a request and refuses removal", async () => {
    const owner = await collector("request-immutable");
    const piece = await acceptedPiece(owner);
    const id = `request-immutable-${suffix}`;
    await submit(owner, id, [piece.id], 60_000);
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "agreement.updateScale",
        id,
        termMonths: 12,
        scale: {
          purchaseShare: 0.6,
          setupFee: 0.01,
          annualAdjustment: 0.185,
          earlyRepurchaseAmount: 0.035,
          brokerFee: 0.035,
        },
      }, deskOptions),
      { message: "AGREEMENT_IMMUTABLE" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, { action: "agreement.remove", id }, deskOptions),
      { message: "AGREEMENT_IMMUTABLE" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, { action: "agreement.markSigned", id }, deskOptions),
      { message: "LIVE_BOOK_ACTION_INVALID" },
    );
    assert.equal((await agreementRow(id)).status, "submitted");
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn", id, decision: "confirm", expectedStatus: "submitted", expectedVersion: 1,
    }, deskOptions);
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "agreement.updateScale",
        id,
        termMonths: 12,
        scale: {
          purchaseShare: 0.6,
          setupFee: 0.01,
          annualAdjustment: 0.185,
          earlyRepurchaseAmount: 0.035,
          brokerFee: 0.035,
        },
      }, deskOptions),
      { message: "AGREEMENT_IMMUTABLE" },
    );
    assert.equal((await agreementRow(id)).status, "returned");
  });

  it("recovers a failed proposal on collector sign and refuses a stale hash", async () => {
    const owner = await collector("request-sign-recover");
    const piece = await acceptedPiece(owner);
    const id = `request-sign-recover-${suffix}`;
    const stranger = await collector("request-sign-stranger");
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await db.update(agreementDocuments)
      .set({ status: "failed" })
      .where(and(eq(agreementDocuments.liveAgreementId, id), eq(agreementDocuments.stage, "proposal")));

    await assert.rejects(
      () => signRequest(owner, id, { options: {} }),
      { message: "DOCUMENT_NOT_READY" },
    );
    await assert.rejects(
      () => signRequest(owner, id, { snapshotHash: "b".repeat(64) }),
      { message: "DOCUMENT_STALE" },
    );
    assert.equal((await agreementRow(id)).status, "returned");

    await signRequest(owner, id);
    const row = await agreementRow(id);
    assert.equal(row.status, "collector_signed");
    assert.equal(row.delivery, "Desk arranges intake");
    const signatures = await signaturesOf(id);
    assert.equal(signatures.length, 1);
    assert.equal(signatures[0].party, "collector");
    assert.equal(signatures[0].book, "live");
    assert.equal(signatures[0].version, 1);
    const proposal = (await documentsOf(id)).find((doc) => doc.stage === "proposal" && doc.status === "stored");
    assert.ok(proposal);
    assert.equal(signatures[0].documentId, proposal.id);
    assert.equal(signatures[0].snapshotHash, proposal.snapshotHash);
    assert.ok((await documentsOf(id)).some((doc) => doc.stage === "collector_signed"));

    await assert.rejects(
      () => signRequest(owner, id),
      { message: "AGREEMENT_STATE_CONFLICT" },
    );
    const other = await collector("request-sign-other-row");
    const otherPiece = await acceptedPiece(other);
    const otherId = `request-sign-other-${suffix}`;
    await flush(await submit(other, otherId, [otherPiece.id], 30_000));
    await confirmRequest(otherId);
    const otherHash = await stageHash(otherId, "proposal", 1);
    await assert.rejects(
      () => executeLiveBookOperation(db, owner.actor, {
        action: "request.signCollector",
        id: otherId,
        typedName: owner.customer.name,
        snapshotHash: otherHash,
        expectedStatus: "returned",
        expectedVersion: 1,
      }, retailOptions),
      { message: "AGREEMENT_NOT_FOUND" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, stranger.actor, {
        action: "request.signCollector",
        id,
        typedName: stranger.customer.name,
        snapshotHash: proposal.snapshotHash,
        expectedStatus: "returned",
        expectedVersion: 0,
      }, retailOptions),
      { message: "AGREEMENT_NOT_FOUND" },
    );
  });

  it("returns a signed request when inspection lowers the cap, then executes the accepted amount", async () => {
    const owner = await collector("request-inspect-lower");
    const piece = await acceptedPiece(owner);
    const id = `request-inspect-lower-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    const beforeDecisions = completedAppraisalDecisions(await attemptsOf(piece.id), piece.id);

    await assert.rejects(
      () => inspectPieces(id, [{ timepieceId: piece.id, decision: "confirm" }]),
      { message: "INSPECTED_VALUE_REQUIRED" },
    );
    await inspectPieces(id, [{
      timepieceId: piece.id, decision: "confirm", inspectedValueCents: 4_500_000,
    }]);
    const lowered = await agreementRow(id);
    assert.equal(lowered.status, "returned");
    assert.equal(lowered.version, 2);
    assert.equal(lowered.amountCents, 2_700_000);
    const [finalized] = await attemptsOf(piece.id);
    assert.equal(finalized.inspectedValueCents, 4_500_000);
    assert.ok(finalized.finalizedAt);
    assert.equal(completedAppraisalDecisions(await attemptsOf(piece.id), piece.id), beforeDecisions);

    await assert.rejects(
      () => executeRequest(id, { snapshotHash: "a".repeat(64) }),
      { message: "SIGNATURE_STALE" },
    );
    await signRequest(owner, id);
    await deliverRequest(id);
    const executed = await executeRequest(id);
    assert.equal(executed.agreement.status, "executed");
    assert.equal(executed.agreement.amount, 27_000);
    const row = await agreementRow(id);
    assert.equal(row.status, "executed");
    assert.equal(row.amountCents, 2_700_000);
    assert.ok(row.executedOn);
    assert.equal(row.paymentReference, "ABC-1");
    assert.ok((await membersOf(id)).every((member) => member.status === "live"));
    assert.ok((await signaturesOf(id)).some((signature) => signature.party === "mac" && signature.version === 2));
    assert.equal(bookLabel({
      executedOn: row.executedOn,
      createdAt: row.createdOn,
      termMonths: row.termMonths,
    }), "open");
  });

  it("stays inspecting when the signed amount still fits the inspected maximum", async () => {
    const owner = await collector("request-inspect-stay");
    const piece = await acceptedPiece(owner);
    const id = `request-inspect-stay-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    await inspectPieces(id, [{
      timepieceId: piece.id, decision: "confirm", inspectedValueCents: 5_833_300,
    }]);
    const row = await agreementRow(id);
    assert.equal(row.status, "inspecting");
    assert.equal(row.version, 1);
    assert.equal(row.amountCents, 3_000_000);
    const executed = await executeRequest(id);
    assert.equal(executed.agreement.status, "executed");
    assert.equal(executed.agreement.amount, 30_000);
    assert.ok((await membersOf(id)).every((member) => member.status === "live"));
  });

  it("lets only an appraiser inspect, and a refuse keeps the decision slot", async () => {
    const owner = await collector("request-inspect-refuse");
    const piece = await acceptedPiece(owner);
    const id = `request-inspect-refuse-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    await assert.rejects(
      () => inspectPieces(id, [{
        timepieceId: piece.id, decision: "confirm", inspectedValueCents: 5_833_300,
      }], "proceed", admin),
      { message: "ROLE_FORBIDDEN" },
    );
    const passwordHash = await hashStaffPassword("request password 123");
    const other = await createStaffAccount(db, {
      name: "Other Appraiser",
      email: `request-other-appraiser.${suffix}@mac.test`,
      role: "appraiser",
      passwordHash,
      mustRotate: false,
    });
    const otherActor = deskActor("appraiser", other.email, other.id);
    const before = await attemptsOf(piece.id);
    await inspectPieces(id, [{ timepieceId: piece.id, decision: "refuse" }], "proceed", otherActor);
    const after = await attemptsOf(piece.id);
    assert.equal(after[0].status, "refused");
    assert.equal(after[0].decisionNo, before[0].decisionNo);
    assert.equal(after[0].decidedByStaffId, appraiserId);
    assert.equal(completedAppraisalDecisions(after, piece.id), completedAppraisalDecisions(before, piece.id));
    const events = await eventsOf(id);
    assert.equal(events.at(-1)?.action, "declineAtInspection");
    assert.equal(events.at(-1)?.actorId, other.id);
    const row = await agreementRow(id);
    assert.equal(row.status, "closed");
    assert.equal(row.closeReason, "declined_by_desk");
  });

  it("drops a piece, returns a new proposal, and executes only after the collector signs it", async () => {
    const owner = await collector("request-inspect-drop");
    const kept = await acceptedPiece(owner);
    const dropped = await acceptedPiece(owner);
    const id = `request-inspect-drop-${suffix}`;
    await flush(await submit(owner, id, [kept.id, dropped.id], 60_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    await inspectPieces(id, [
      { timepieceId: kept.id, decision: "confirm", inspectedValueCents: 5_833_300 },
      { timepieceId: dropped.id, decision: "drop" },
    ]);
    const returned = await agreementRow(id);
    assert.equal(returned.status, "returned");
    assert.equal(returned.version, 2);
    assert.equal(returned.amountCents, 3_500_000);
    const members = await membersOf(id);
    assert.equal(members.find((member) => member.timepieceId === dropped.id)?.status, "released");
    assert.equal(members.find((member) => member.timepieceId === kept.id)?.status, "reserved");
    const [droppedAttempt] = await attemptsOf(dropped.id);
    assert.equal(droppedAttempt.status, "accepted");
    assert.equal(droppedAttempt.finalizedAt, null);
    await assert.rejects(
      () => executeRequest(id, { snapshotHash: "a".repeat(64) }),
      { message: "SIGNATURE_STALE" },
    );
    await signRequest(owner, id);
    await deliverRequest(id);
    const executed = await executeRequest(id);
    assert.equal(executed.agreement.status, "executed");
    assert.deepEqual(executed.agreement.watchIds, [kept.id]);
  });

  it("refuses MAC execute until inspection, payment, and the checklist are complete", async () => {
    const owner = await collector("request-execute-gates");
    const piece = await acceptedPiece(owner);
    const id = `request-execute-gates-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    await assert.rejects(() => executeRequest(id), { message: "INSPECTION_INCOMPLETE" });
    await inspectPieces(id, [{
      timepieceId: piece.id, decision: "confirm", inspectedValueCents: 5_833_300,
    }]);
    const signedHash = await stageHash(id, "collector_signed", 1);
    await assert.rejects(
      () => executeLiveBookOperation(db, inspector, {
        action: "request.executeMac",
        id,
        typedName: "Dov Tuzman",
        snapshotHash: signedHash,
        paymentReference: "",
        checklist: CHECKLIST,
        expectedStatus: "inspecting",
        expectedVersion: 1,
      }, deskOptions),
      { message: "PAYMENT_REFERENCE_REQUIRED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, inspector, {
        action: "request.executeMac",
        id,
        typedName: "Dov Tuzman",
        snapshotHash: signedHash,
        paymentReference: "ABC-1",
        checklist: { ...CHECKLIST, inCustody: false },
        expectedStatus: "inspecting",
        expectedVersion: 1,
      }, deskOptions),
      { message: "CHECKLIST_INCOMPLETE" },
    );
    const executed = await executeRequest(id);
    assert.equal(executed.agreement.status, "executed");
  });

  it("emails the executed PDF once per recipient and records a checksum failure without claiming a send", async () => {
    const owner = await collector("request-executed-mail");
    const piece = await acceptedPiece(owner);
    const id = `request-executed-mail-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    await inspectPieces(id, [{
      timepieceId: piece.id, decision: "confirm", inspectedValueCents: 5_833_300,
    }]);
    const executed = await executeRequest(id);
    assert.equal(executed.agreement.status, "executed");
    const docs = await documentsOf(id);
    const executedDoc = docs.find((row) => row.stage === "executed" && row.status === "stored");
    assert.ok(executedDoc);
    const snapshot = executedDoc.snapshot as { text: string; label: string };
    assert.equal(snapshot.label, ATTESTATION_LABEL);
    assert.match(snapshot.text, /Collector: /);
    assert.match(snapshot.text, /MAC: /);
    const sends = await db.select().from(agreementDocumentSends).where(eq(agreementDocumentSends.documentId, executedDoc.id));
    assert.equal(sends.filter((row) => row.actorKind === "system").length, 2);
    assert.ok(sends.every((row) => row.result === "accepted"));
    const resent = await executeLiveBookOperation(db, inspector, {
      action: "request.resendExecuted",
      id,
      expectedStatus: "executed",
      expectedVersion: executed.agreement.version,
    }, deskOptions) as RequestSubmitResult;
    await assert.rejects(() => flush(resent), { message: "DOCUMENT_ALREADY_SENT" });
    assert.equal(
      (await db.select().from(agreementDocumentSends).where(eq(agreementDocumentSends.documentId, executedDoc.id))).length,
      2,
    );

    const deskSend = sends.find((row) => row.recipientKind === "desk");
    assert.ok(deskSend);
    await db.update(agreementDocumentSends)
      .set({ result: "failed", failureCode: "DOCUMENT_SEND_FAILED" })
      .where(eq(agreementDocumentSends.id, deskSend.id));
    const retryDesk = await executeLiveBookOperation(db, inspector, {
      action: "request.resendExecuted",
      id,
      expectedStatus: "executed",
      expectedVersion: executed.agreement.version,
    }, deskOptions) as RequestSubmitResult;
    await flush(retryDesk);
    const retried = await db.select().from(agreementDocumentSends).where(eq(agreementDocumentSends.documentId, executedDoc.id));
    assert.equal(retried.length, 2);
    assert.ok(retried.every((row) => row.result === "accepted"));
    const alreadySent = await executeLiveBookOperation(db, inspector, {
      action: "request.resendExecuted",
      id,
      expectedStatus: "executed",
      expectedVersion: executed.agreement.version,
    }, deskOptions) as RequestSubmitResult;
    await assert.rejects(() => flush(alreadySent), { message: "DOCUMENT_ALREADY_SENT" });

    await db.update(agreementDocuments).set({ checksum: "ff".repeat(32) }).where(eq(agreementDocuments.id, executedDoc.id));
    await db.delete(agreementDocumentSends).where(eq(agreementDocumentSends.documentId, executedDoc.id));
    const failed = await sendExecutedDocumentEmails(db, executedDoc.id, store, { env: deskOptions.env });
    assert.ok(failed.every((row) => row && row.result === "failed" && row.failureCode === "DOCUMENT_CHECKSUM_MISMATCH"));
  });

  it("keeps the collector signature when the owner withdraws after signing", async () => {
    const owner = await collector("request-withdraw-signed");
    const piece = await acceptedPiece(owner);
    const id = `request-withdraw-signed-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await executeLiveBookOperation(db, owner.actor, {
      action: "request.withdraw",
      id,
      expectedStatus: "collector_signed",
      expectedVersion: 1,
    });
    const row = await agreementRow(id);
    assert.equal(row.status, "closed");
    assert.equal(row.closeReason, "withdrawn");
    assert.ok((await membersOf(id)).every((member) => member.status === "released"));
    assert.equal((await signaturesOf(id)).length, 1);
  });

  it("records a return only after a delivered request has closed", async () => {
    const owner = await collector("request-return");
    const piece = await acceptedPiece(owner);
    const id = `request-return-${suffix}`;
    await flush(await submit(owner, id, [piece.id], 30_000));
    await confirmRequest(id);
    await signRequest(owner, id);
    await deliverRequest(id);
    await inspectPieces(id, [{ timepieceId: piece.id, decision: "refuse" }]);
    const closed = await agreementRow(id);
    const recorded = await executeLiveBookOperation(db, admin, {
      action: "request.recordReturn",
      id,
      note: "Pieces handed back.",
      expectedStatus: closed.status,
      expectedVersion: closed.version ?? 1,
    }, deskOptions) as RequestTransitionResult;
    assert.equal(recorded.agreement.status, "closed");
    assert.ok((await eventsOf(id)).some((event) => event.action === "recordReturn"));
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "request.recordReturn",
        id,
        expectedStatus: closed.status,
        expectedVersion: closed.version ?? 1,
      }, deskOptions),
      { message: "AGREEMENT_STATE_CONFLICT" },
    );

    const neverDelivered = `request-return-never-${suffix}`;
    await flush(await submit(owner, neverDelivered, [(await acceptedPiece(owner)).id], 30_000));
    await executeLiveBookOperation(db, admin, {
      action: "request.deskReturn",
      id: neverDelivered,
      decision: "decline",
      expectedStatus: "submitted",
      expectedVersion: 1,
    }, deskOptions);
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "request.recordReturn",
        id: neverDelivered,
        expectedStatus: "closed",
        expectedVersion: 1,
      }, deskOptions),
      { message: "RETURN_NOT_APPLICABLE" },
    );
  });
});

/**
 * Two desk users answering the same request at once need two real
 * connections, so this suite runs on its own schema and drops it afterwards.
 */
describe("repo request concurrency", { skip }, () => {
  const schema = `u10_race_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const rootDb = createDb();

  before(async () => {
    await rootDb.execute(sql.raw(`
      create schema "${schema}";
      create table "${schema}"."staff_accounts" (
        "id" text primary key, "name" text not null, "email" text not null,
        "password_hash" text, "password_salt" text, "password_params" jsonb,
        "role" text not null, "is_master" boolean not null default false,
        "must_rotate" boolean not null default false, "password_set_at" timestamptz,
        "session_valid_after" timestamptz not null default 'epoch',
        "disabled_at" timestamptz, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
      create table "${schema}"."desk_audit_log" (
        "id" text primary key, "actor_email" text not null, "actor_role" text not null,
        "action" text not null, "target_id" text, "client_address" text not null,
        "detail" jsonb not null default '{}'::jsonb, "created_at" timestamptz not null default now()
      );
      create table "${schema}"."live_agreements" (
        "id" text primary key, "customer_id" text not null, "amount_cents" integer not null,
        "term_months" integer not null, "delivery" text not null default '',
        "owner_name" text not null, "email" text not null, "status" text not null,
        "agreement_code" text, "created_on" text not null, "signed_on" text,
        "executed_on" text, "delivered_on" text, "version" integer not null default 1,
        "last_action_at" timestamptz not null default now(), "close_reason" text,
        "customer_success" boolean not null default false, "payment_reference" text,
        "piece_caps" jsonb, "scale" jsonb, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
      create table "${schema}"."live_agreement_members" (
        "id" text primary key, "agreement_id" text not null, "timepiece_id" text not null,
        "status" text not null default 'live', "created_at" timestamptz not null default now()
      );
      create table "${schema}"."live_agreement_ends" (
        "agreement_id" text primary key, "kind" text not null, "ended_on" text not null,
        "amount_cents" integer not null, "created_at" timestamptz not null default now()
      );
      create table "${schema}"."agreement_events" (
        "id" text primary key, "agreement_id" text not null, "actor_kind" text not null,
        "actor_id" text, "action" text not null, "from_status" text, "to_status" text not null,
        "amount_cents" integer, "version" integer not null, "note" text not null default '',
        "internal" boolean not null default false, "created_at" timestamptz not null default now()
      );
      insert into "${schema}"."staff_accounts" ("id","name","email","role")
      values ('staff-a','A','a@mac.test','admin'),('staff-b','B','b@mac.test','admin');
      insert into "${schema}"."live_agreements"
        ("id","customer_id","amount_cents","term_months","owner_name","email","status","created_on","scale")
      values ('request','customer',6000000,12,'Owner','owner@mac.test','submitted','2026-09-20','{"purchaseShare":0.6}');
      insert into "${schema}"."live_agreement_members" ("id","agreement_id","timepiece_id","status")
      values ('request:piece','request','piece','reserved');
    `));
  });

  after(async () => {
    await rootDb.execute(sql.raw(`drop schema if exists "${schema}" cascade`));
  });

  it("lets exactly one of two concurrent confirmations through", async () => {
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const run = (staffId: string, email: string) =>
      rootDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        arrivals += 1;
        if (arrivals === 2) release();
        await ready;
        return executeLiveBookOperation(
          tx as unknown as Database,
          deskActor("admin", email, staffId),
          {
            action: "request.deskReturn",
            id: "request",
            decision: "confirm",
            expectedStatus: "submitted",
            expectedVersion: 1,
          },
          {
            env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
            clientAddress: "127.0.0.1",
          },
        );
      });

    const results = await Promise.allSettled([
      run("staff-a", "a@mac.test"),
      run("staff-b", "b@mac.test"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const rejected = results.find((result) => result.status === "rejected");
    assert.ok(rejected && rejected.status === "rejected");
    assert.match(String(rejected.reason), /AGREEMENT_STATE_CONFLICT/);

    await rootDb.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
      const row = await tx.execute(sql`select status, version from live_agreements where id = 'request'`);
      assert.deepEqual(row.rows, [{ status: "returned", version: 1 }]);
      const events = await tx.execute(sql`select action from agreement_events where agreement_id = 'request'`);
      assert.deepEqual(events.rows, [{ action: "deskReturn" }]);
    });
  });
});
