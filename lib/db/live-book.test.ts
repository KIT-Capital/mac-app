import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
import { createDb } from "./client";
import { readLiveBookState } from "./live-book-adapter";
import { executeLiveBookOperation } from "./live-book-mutations";
import { insertLiveAgreement } from "./live-book";
import { createTimepiece, deskActor, registerCollector, toCollectorActor } from "./records";
import { createStaffAccount } from "./staff-accounts";
import { hashStaffPassword } from "../staff-password.mjs";
import {
  agreementShells,
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
    const emptyLiveDesk = await readLiveBookState(db, deskActor("staff", "desk@mechartcap.com"));
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
      role: "staff",
      passwordHash,
      mustRotate: false,
    });
    staffIds.push(admin.id, member.id);
    const adminActor = deskActor("admin", admin.email, admin.id);
    const staff = deskActor("staff", member.email, member.id);
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
    await assert.rejects(
      () => executeLiveBookOperation(db, staff, settingsOperation, options),
      { message: "ADMIN_REQUIRED" },
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
    const repoId = `repo-server-scale-${suffix}`;
    await executeLiveBookOperation(db, owner.actor, {
      action: "agreement.create",
      agreement: {
        id: repoId,
        watchIds: [piece.id],
        amount: 50_000,
        termMonths: 12,
        delivery: "",
        ownerName: owner.customer.name,
        email: owner.customer.email,
        createdAt: "2026-09-18",
        agreementCode: `MAC-U5-${suffix}`,
        scale: { purchaseShare: 0.01 },
      },
    });
    const [created] = await db.select({ scale: liveAgreements.scale })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, repoId));
    assert.equal((created.scale as { purchaseShare: number }).purchaseShare, 0.5);
    assert.equal((created.scale as { annualAdjustment: number }).annualAdjustment, 0.21);
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
    const firstApplicantPiece = await createTimepiece(
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
    const firstApplicantRepoId = `repo-first-application-cap-${suffix}`;
    await executeLiveBookOperation(db, firstApplicant.actor, {
      action: "agreement.create",
      agreement: {
        id: firstApplicantRepoId,
        watchIds: [firstApplicantPiece.id],
        amount: 45_000,
        termMonths: 9,
        delivery: "",
        ownerName: firstApplicant.customer.name,
        email: firstApplicant.customer.email,
        createdAt: "2026-09-18",
        agreementCode: `MAC-U5-FIRST-${suffix}`,
      },
    });
    const [firstApplicantRepo] = await db.select({ scale: liveAgreements.scale })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, firstApplicantRepoId));
    assert.equal((firstApplicantRepo.scale as { purchaseShare: number }).purchaseShare, 0.45);
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

    const secondPiece = await createTimepiece(db, owner.actor, owner.customer.id, {
      brand: "Rolex",
      model: "Daytona",
      status: "appraised",
      financeable: true,
      valueLow: 100_000,
      valueHigh: 120_000,
    });
    const settingsScaleRepoId = `repo-settings-scale-${suffix}`;
    await executeLiveBookOperation(db, owner.actor, {
      action: "agreement.create",
      agreement: {
        id: settingsScaleRepoId,
        watchIds: [secondPiece.id],
        amount: 50_000,
        termMonths: 12,
        delivery: "",
        ownerName: owner.customer.name,
        email: owner.customer.email,
        createdAt: "2026-09-18",
        agreementCode: `MAC-U5-SETTINGS-${suffix}`,
      },
    });
    const [settingsScaleRepo] = await db.select({ scale: liveAgreements.scale })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, settingsScaleRepoId));
    assert.equal((settingsScaleRepo.scale as { purchaseShare: number }).purchaseShare, 0.55);
    assert.equal((settingsScaleRepo.scale as { annualAdjustment: number }).annualAdjustment, 0.2);

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
    const all = await readLiveBookState(db, deskActor("staff", "desk@mechartcap.com"));
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
      () => executeLiveBookOperation(db, deskActor("staff", "desk@mechartcap.com"), {
        action: "agreement.recordEnd",
        id: repoId,
        end: { kind: "renewed", date: "2026-09-17", amount: 70000 },
      }),
      { message: "ADMIN_RENEW_REQUIRED" },
    );
    await executeLiveBookOperation(db, deskActor("staff", "desk@mechartcap.com"), {
      action: "agreement.recordEnd",
      id: repoId,
      end: { kind: "bought_back", date: "2026-09-17", amount: 70000 },
    });
    const state = await readLiveBookState(db, a.actor);
    assert.equal(state.agreements[0].bookEnd?.kind, "bought_back");
  });

  it("allows only admin renewal and moves membership transactionally", async () => {
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
      () => executeLiveBookOperation(db, deskActor("staff", "desk@mechartcap.com"), operation),
      { message: "ADMIN_REQUIRED" },
    );
    await executeLiveBookOperation(db, deskActor("admin", "admin@mechartcap.com"), operation);
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

  it("rejects an agreement id already owned by another customer", async () => {
    const a = await collector("repo-id-a");
    const b = await collector("repo-id-b");
    const pieceA = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    const pieceB = await createTimepiece(db, b.actor, b.customer.id, { brand: "Rolex", model: "Daytona" });
    const id = `shared-repo-id-${suffix}`;
    await insertLiveAgreement(db, b.actor, {
      id,
      customerId: b.customer.id,
      watchIds: [pieceB.id],
      amount: 50000,
      termMonths: 12,
      delivery: "",
      ownerName: b.customer.name,
      email: b.customer.email,
      createdOn: "2026-09-17",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "agreement.create",
        agreement: {
          id,
          watchIds: [pieceA.id],
          amount: 25000,
          termMonths: 12,
          delivery: "",
          ownerName: a.customer.name,
          email: a.customer.email,
          createdAt: "2026-09-17",
          agreementCode: `MAC-A-${suffix}`,
        },
      }),
      { message: "ID_COLLISION" },
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

  it("ignores an unsafe client scale and stores the server scale", async () => {
    const a = await collector("scale");
    const piece = await createTimepiece(db, a.actor, a.customer.id, {
      brand: "Cartier",
      model: "Tank",
      status: "appraised",
      financeable: true,
      valueLow: 100000,
      valueHigh: 120000,
    });
    const id = `repo-scale-${suffix}`;
    await executeLiveBookOperation(db, a.actor, {
      action: "agreement.create",
      agreement: {
        id,
        watchIds: [piece.id],
        amount: 50000,
        termMonths: 12,
        delivery: "",
        ownerName: a.customer.name,
        email: a.customer.email,
        createdAt: "2026-09-17",
        scale: { purchaseShare: 1.5, setupFee: 0.01 },
      },
    });
    const [stored] = await db.select({ scale: liveAgreements.scale })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, id));
    assert.equal((stored.scale as { purchaseShare: number }).purchaseShare, 0.6);
  });

  it("rejects unappraised and nonpurchaseable pieces on agreement creation", async () => {
    const a = await collector("agreement-piece-safety");
    const unappraised = await createTimepiece(db, a.actor, a.customer.id, {
      brand: "Cartier",
      model: "Tank",
      status: "reviewing",
      financeable: true,
      valueLow: 100000,
      valueHigh: 120000,
    });
    const nonpurchaseable = await createTimepiece(db, a.actor, a.customer.id, {
      brand: "Rolex",
      model: "Daytona",
      status: "appraised",
      financeable: false,
      valueLow: 100000,
      valueHigh: 120000,
    });
    for (const piece of [unappraised, nonpurchaseable]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, a.actor, {
          action: "agreement.create",
          agreement: {
            id: `repo-ineligible-${piece.id}`,
            watchIds: [piece.id],
            amount: 50000,
            termMonths: 12,
            delivery: "",
            ownerName: a.customer.name,
            email: a.customer.email,
            createdAt: "2026-09-17",
            scale: {
              purchaseShare: 0.6,
              setupFee: 0.01,
              annualAdjustment: 0.185,
              earlyRepurchaseAmount: 0.035,
              brokerFee: 0.035,
            },
          },
        }),
        { message: "INELIGIBLE_PIECE" },
      );
    }
  });

  it("lets desk mutate explicit customers, previews, and agreements safely", async () => {
    const empty = await collector("customer-empty");
    const linked = await collector("customer-linked");
    const desk = deskActor("staff", "desk@mechartcap.com");
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
    await executeLiveBookOperation(db, linked.actor, {
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
    const desk = deskActor("staff", "desk@mechartcap.com");
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
    await executeLiveBookOperation(db, desk, { action: "agreement.markSigned", id: signedId });
    await executeLiveBookOperation(db, desk, {
      action: "agreement.recordEnd",
      id: endedId,
      end: { kind: "bought_back", date: "2026-09-17", amount: 11000 },
    });
    for (const id of [signedId, endedId]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, desk, { action: "agreement.markSigned", id }),
        { message: "AGREEMENT_IMMUTABLE" },
      );
      await assert.rejects(
        () => executeLiveBookOperation(db, a.actor, {
          action: "agreement.addWatches",
          id,
          watchIds: [id === signedId ? second.id : first.id],
        }),
        { message: "AGREEMENT_IMMUTABLE" },
      );
      await assert.rejects(
        () => executeLiveBookOperation(db, a.actor, {
          action: "agreement.setAmount",
          id,
          amount: 11000,
        }),
        { message: "AGREEMENT_IMMUTABLE" },
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
