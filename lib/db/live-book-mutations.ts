import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { maxPurchaseAmount } from "@/lib/catalog";
import {
  applyAgreementEnd,
  bookLabel,
  isLiveBookLabel,
  validateRecordedEndKind,
  validateSaleAmountRaise,
} from "@/lib/contract/repo-book.mjs";
import { planRenewal } from "@/lib/contract/repo-renewal.mjs";
import {
  agreementScaleFromDesk,
  assertScenario60Floors,
} from "@/lib/contract/repo-scale.mjs";
import { parseLiveBookOperation } from "@/lib/live-book-operation.mjs";
import { isLiveBookEnabled } from "@/lib/env/live-book-flag.mjs";
import type { Agreement } from "@/lib/types";
import { DEFAULT_SETTINGS } from "@/lib/theme";
import type { Database } from "./client";
import { liveAgreementHasDocuments } from "./agreement-documents";
import { dollarsToCents } from "./money.mjs";
import {
  lockStaffForDeskMutation,
  writeDeskAudit,
} from "./staff-accounts";
import type { Actor } from "./records";
import { deskActor } from "./records";
import {
  agreements as preparedAgreements,
  agreementShells,
  allocations,
  applications,
  catalogReferences,
  collectorSessions,
  customers,
  deskSettings,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  photoObjects,
  staffAccounts,
  timepieces,
} from "./schema";

import { canEditAppraisal, isDeskRole, patchNeedsAppraisal } from "../roles.mjs";
import type { DeskRole } from "../types";

type Operation = ReturnType<typeof parseLiveBookOperation>;

function isDesk(
  actor: Actor,
): actor is Extract<Actor, { role: DeskRole }> {
  return isDeskRole(actor.role);
}

function requireDesk(actor: Actor) {
  if (!isDesk(actor)) throw new Error("DESK_REQUIRED");
}

/**
 * Appraisal numbers and catalog ranges belong to appraisers and super admins.
 * Admins may read them and operate the rest of the desk (R5, KTD2).
 */
function requireAppraiser(actor: Actor) {
  requireDesk(actor);
  if (!canEditAppraisal(actor)) throw new Error("ROLE_FORBIDDEN");
}

async function ownedPiece(db: Database, actor: Actor, id: string) {
  const where = !isDesk(actor)
    ? and(eq(timepieces.id, id), eq(timepieces.customerId, actor.customerId))
    : eq(timepieces.id, id);
  const [piece] = await db.select().from(timepieces).where(where).limit(1);
  if (!piece) throw new Error("TIMEPIECE_NOT_FOUND");
  return piece;
}

async function ownedAgreement(db: Database, actor: Actor, id: string) {
  const where = !isDesk(actor)
    ? and(eq(liveAgreements.id, id), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, id);
  const [agreement] = await db.select().from(liveAgreements).where(where).for("update").limit(1);
  if (!agreement) throw new Error("AGREEMENT_NOT_FOUND");
  const [members, ends] = await Promise.all([
    db.select().from(liveAgreementMembers).where(eq(liveAgreementMembers.agreementId, id)),
    db.select().from(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, id)),
  ]);
  return {
    ...agreement,
    amount: agreement.amountCents / 100,
    createdAt: agreement.createdOn,
    signedAt: agreement.signedOn ?? undefined,
    watchIds: members.map((row) => row.timepieceId),
    bookEnd: ends[0]
      ? { kind: ends[0].kind, date: ends[0].endedOn, amount: ends[0].amountCents / 100 }
      : undefined,
  } as Agreement & { customerId: string };
}

function requireMutableAgreement(agreement: Agreement) {
  if (agreement.status === "signed" || agreement.bookEnd) {
    throw new Error("AGREEMENT_IMMUTABLE");
  }
}

function pieceValues(timepiece: Record<string, unknown>, actor: Actor) {
  const collector = actor.role === "collector";
  const status = collector
    ? timepiece.status === "reviewing" ? "reviewing" : "not_evaluated"
    : timepiece.status === "appraised" || timepiece.status === "reviewing" ? timepiece.status : "not_evaluated";
  return {
    brand: String(timepiece.brand ?? "").trim(),
    model: String(timepiece.model ?? "").trim(),
    reference: String(timepiece.reference ?? "").trim() || null,
    status,
    financeable: collector ? false : Boolean(timepiece.financeable),
    condition: String(timepiece.condition ?? ""),
    boxPapers: String(timepiece.boxPapers ?? ""),
    caseMetal: String(timepiece.caseMetal ?? ""),
    caseType: String(timepiece.caseType ?? ""),
    caseDiameter: String(timepiece.caseDiameter ?? ""),
    dialColor: String(timepiece.dialColor ?? ""),
    buckle: String(timepiece.buckle ?? ""),
    band: timepiece.band === "bracelet" ? "bracelet" : "strap",
    bandMaterial: String(timepiece.bandMaterial ?? ""),
    complication: String(timepiece.complication ?? ""),
    assetCode: typeof timepiece.assetCode === "string" ? timepiece.assetCode : null,
  };
}

const toBasisPoints = (value: unknown) => Math.round(Number(value) * 10_000);

function settingsRowValues(source: Record<string, unknown>) {
  return {
    maxLtvBps: toBasisPoints(source.maxLtv),
    startingRateBps: toBasisPoints(source.startingRate),
    setupFeeBps: toBasisPoints(source.setupFee),
    earlyRepurchaseAmountBps: toBasisPoints(source.earlyRepurchaseAmount),
    brokerFeeBps: toBasisPoints(source.brokerFee),
    minMonths: Number(source.minMonths),
    earlyStartMonth: Number(source.earlyStartMonth),
    earlyUntilMonth: Number(source.earlyUntilMonth),
    typicalTerm: Number(source.typicalTerm),
    membershipMonthlyCents: Math.round(Number(source.membershipMonthly) * 100),
    vaultLocation: String(source.vaultLocation),
  };
}

function settingsRowPatch(patch: Record<string, unknown>) {
  const values = settingsRowValues({ ...DEFAULT_SETTINGS, ...patch });
  const fields: Record<string, keyof typeof values> = {
    maxLtv: "maxLtvBps",
    startingRate: "startingRateBps",
    setupFee: "setupFeeBps",
    earlyRepurchaseAmount: "earlyRepurchaseAmountBps",
    brokerFee: "brokerFeeBps",
    minMonths: "minMonths",
    earlyStartMonth: "earlyStartMonth",
    earlyUntilMonth: "earlyUntilMonth",
    typicalTerm: "typicalTerm",
    membershipMonthly: "membershipMonthlyCents",
    vaultLocation: "vaultLocation",
  };
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([input]) => patch[input] !== undefined)
      .map(([, column]) => [column, values[column]]),
  );
}

function shellScale(shell: Record<string, unknown>) {
  return {
    purchaseShare: Number(shell.ltv),
    annualAdjustment: Number(shell.rate),
    setupFee: Number(shell.setupFee),
    earlyRepurchaseAmount: Number(shell.earlyRepurchaseAmount),
    brokerFee: Number(shell.brokerFee),
    minMonths: Number(shell.minMonths),
    earlyStartMonth: Number(shell.earlyStartMonth),
    earlyUntilMonth: Number(shell.earlyUntilMonth),
  };
}

function shellRowValues(shell: Record<string, unknown>) {
  return {
    id: String(shell.id),
    code: String(shell.code),
    title: String(shell.title),
    termMonths: Number(shell.termMonths),
    rateBps: toBasisPoints(shell.rate),
    ltvBps: toBasisPoints(shell.ltv),
    setupFeeBps: toBasisPoints(shell.setupFee),
    earlyRepurchaseAmountBps: toBasisPoints(shell.earlyRepurchaseAmount),
    brokerFeeBps: toBasisPoints(shell.brokerFee),
    minMonths: Number(shell.minMonths),
    earlyStartMonth: Number(shell.earlyStartMonth),
    earlyUntilMonth: Number(shell.earlyUntilMonth),
    status: String(shell.status),
    createdOn: String(shell.createdAt),
  };
}

async function serverAgreementScale(db: Database, termMonths: number) {
  const [settingRows, shellRows] = await Promise.all([
    db.select().from(deskSettings).where(eq(deskSettings.id, "default")).limit(1),
    db.select().from(agreementShells).where(eq(agreementShells.status, "open")).limit(1),
  ]);
  const setting = settingRows[0];
  const shell = shellRows[0];
  const settings = setting
    ? {
        ...DEFAULT_SETTINGS,
        maxLtv: setting.maxLtvBps / 10_000,
        startingRate: setting.startingRateBps / 10_000,
        setupFee: setting.setupFeeBps / 10_000,
        earlyRepurchaseAmount: setting.earlyRepurchaseAmountBps / 10_000,
        brokerFee: setting.brokerFeeBps / 10_000,
        minMonths: setting.minMonths,
        earlyStartMonth: setting.earlyStartMonth,
        earlyUntilMonth: setting.earlyUntilMonth,
        typicalTerm: setting.typicalTerm,
        membershipMonthly: setting.membershipMonthlyCents / 100,
        vaultLocation: setting.vaultLocation,
      }
    : DEFAULT_SETTINGS;
  const openShell = shell?.termMonths === termMonths
    ? {
        termMonths: shell.termMonths,
        rate: shell.rateBps / 10_000,
        ltv: shell.ltvBps / 10_000,
        setupFee: shell.setupFeeBps / 10_000,
        earlyRepurchaseAmount: shell.earlyRepurchaseAmountBps / 10_000,
        brokerFee: shell.brokerFeeBps / 10_000,
        minMonths: shell.minMonths,
        earlyStartMonth: shell.earlyStartMonth,
        earlyUntilMonth: shell.earlyUntilMonth,
      }
    : undefined;
  const scale = agreementScaleFromDesk(settings, openShell, termMonths);
  if (!assertScenario60Floors(scale).ok) throw new Error("AGREEMENT_SCALE_INVALID");
  return scale;
}

const AUDITED_DESK_ACTIONS = new Set([
  "customer.update",
  "customer.remove",
  "customer.invite",
  "timepiece.update",
  "timepiece.deskUpdate",
  "timepiece.remove",
  "agreement.updateScale",
  "agreement.markSigned",
  "agreement.recordEnd",
  "agreement.clearEnd",
  "agreement.renew",
  "agreement.remove",
  "preview.remove",
  "settings.update",
  "catalog.upsert",
  "catalog.remove",
  "shell.upsert",
  "shell.remove",
]);
const LOCKED_AGREEMENT_ACTIONS = new Set([
  "agreement.create",
  "agreement.updateScale",
  "agreement.signCollector",
  "agreement.markSigned",
  "agreement.recordEnd",
  "agreement.clearEnd",
  "agreement.renew",
  "agreement.addWatches",
  "agreement.setAmount",
  "agreement.remove",
]);

function auditTargetId(operation: Operation & Record<string, unknown>) {
  if (typeof operation.id === "string") return operation.id;
  if (operation.action === "settings.update") return "default";
  if (operation.shell && typeof operation.shell === "object") {
    return String((operation.shell as Record<string, unknown>).id ?? "");
  }
  if (operation.entry && typeof operation.entry === "object") {
    return String((operation.entry as Record<string, unknown>).id ?? "");
  }
  if (operation.timepiece && typeof operation.timepiece === "object") {
    return String((operation.timepiece as Record<string, unknown>).id ?? "");
  }
  if (operation.customer && typeof operation.customer === "object") {
    return String((operation.customer as Record<string, unknown>).id ?? "");
  }
  return "";
}

export async function executeLiveBookOperation(
  db: Database,
  actor: Actor,
  input: unknown,
  options: { clientAddress?: string; env?: NodeJS.ProcessEnv } = {},
) {
  const operation = parseLiveBookOperation(input) as Operation & Record<string, unknown>;
  if (
    isDesk(actor) &&
    isLiveBookEnabled((options.env ?? process.env).MAC_LIVE_BOOK) &&
    AUDITED_DESK_ACTIONS.has(operation.action)
  ) {
    if (!actor.staffId) throw new Error("SESSION_INVALID");
    const staffId = actor.staffId;
    return db.transaction(async (tx) => {
      const staff = await lockStaffForDeskMutation(tx, {
        id: staffId,
        email: actor.email,
        role: actor.role,
      });
      const trusted = deskActor(staff.role, staff.email, staff.id);
      await executeLiveBookOperationCore(tx as unknown as Database, trusted, operation);
      await writeDeskAudit(
        tx,
        staff,
        operation.action,
        auditTargetId(operation),
        options.clientAddress ?? "unknown",
      );
    });
  }
  if (LOCKED_AGREEMENT_ACTIONS.has(operation.action)) {
    return db.transaction((tx) =>
      executeLiveBookOperationCore(tx as unknown as Database, actor, operation)
    );
  }
  return executeLiveBookOperationCore(db, actor, operation);
}

async function executeLiveBookOperationCore(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
) {
  const action = operation.action;

  if (action === "settings.update") {
    requireDesk(actor);
    const patch = operation.patch as Record<string, unknown>;
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('mac-desk-settings'))`);
    const [current] = await db.select().from(deskSettings)
      .where(eq(deskSettings.id, "default"))
      .for("update")
      .limit(1);
    const currentSettings = current
      ? {
          ...DEFAULT_SETTINGS,
          maxLtv: current.maxLtvBps / 10_000,
          startingRate: current.startingRateBps / 10_000,
          setupFee: current.setupFeeBps / 10_000,
          earlyRepurchaseAmount: current.earlyRepurchaseAmountBps / 10_000,
          brokerFee: current.brokerFeeBps / 10_000,
          minMonths: current.minMonths,
          earlyStartMonth: current.earlyStartMonth,
          earlyUntilMonth: current.earlyUntilMonth,
          typicalTerm: current.typicalTerm,
          membershipMonthly: current.membershipMonthlyCents / 100,
          vaultLocation: current.vaultLocation,
        }
      : DEFAULT_SETTINGS;
    const nextSettings = { ...currentSettings, ...patch };
    const terms = {
      purchaseShare: nextSettings.maxLtv,
      annualAdjustment: nextSettings.startingRate,
      setupFee: nextSettings.setupFee,
      earlyRepurchaseAmount: nextSettings.earlyRepurchaseAmount,
      brokerFee: nextSettings.brokerFee,
    };
    if (
      !assertScenario60Floors(terms).ok ||
      nextSettings.minMonths > nextSettings.typicalTerm ||
      nextSettings.earlyStartMonth >= nextSettings.earlyUntilMonth ||
      nextSettings.earlyUntilMonth > nextSettings.typicalTerm
    ) {
      throw new Error("AGREEMENT_SCALE_INVALID");
    }
    const update = settingsRowPatch(patch);
    if (current) {
      await db.update(deskSettings)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(deskSettings.id, "default"));
    } else {
      await db.insert(deskSettings).values({
        id: "default",
        ...settingsRowValues(nextSettings),
      });
    }
    return;
  }

  if (action === "catalog.upsert") {
    requireAppraiser(actor);
    const entry = operation.entry as Record<string, unknown>;
    const typicalLowCents = dollarsToCents(Number(entry.typicalLow));
    const typicalHighCents = dollarsToCents(Number(entry.typicalHigh));
    if (typicalLowCents === null || typicalHighCents === null) {
      throw new Error("CATALOG_ENTRY_INVALID");
    }
    const values = {
      id: String(entry.id),
      brand: String(entry.brand),
      model: String(entry.model),
      reference: String(entry.reference),
      caseMetal: String(entry.caseMetal),
      caseDiameter: String(entry.caseDiameter),
      typicalLowCents,
      typicalHighCents,
      financeable: Boolean(entry.financeable),
      notes: String(entry.notes),
    };
    await db.insert(catalogReferences).values(values).onConflictDoUpdate({
      target: catalogReferences.id,
      set: {
        brand: values.brand,
        model: values.model,
        reference: values.reference,
        caseMetal: values.caseMetal,
        caseDiameter: values.caseDiameter,
        typicalLowCents: values.typicalLowCents,
        typicalHighCents: values.typicalHighCents,
        financeable: values.financeable,
        notes: values.notes,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (action === "catalog.remove") {
    requireAppraiser(actor);
    const result = await db.delete(catalogReferences)
      .where(eq(catalogReferences.id, String(operation.id)))
      .returning({ id: catalogReferences.id });
    if (!result.length) throw new Error("CATALOG_ENTRY_NOT_FOUND");
    return;
  }

  if (action === "shell.upsert") {
    requireDesk(actor);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('mac-open-agreement-shell'))`);
    const shell = operation.shell as Record<string, unknown>;
    const terms = shellScale(shell);
    if (!assertScenario60Floors(terms).ok) throw new Error("AGREEMENT_SCALE_INVALID");
    const values = shellRowValues(shell);
    const [open] = await db.select({ id: agreementShells.id })
      .from(agreementShells)
      .where(eq(agreementShells.status, "open"))
      .for("update")
      .limit(1);
    if (open?.id === values.id && values.status !== "open") {
      throw new Error("AGREEMENT_OPEN_SHELL_REQUIRED");
    }
    if (values.status === "open" && open && open.id !== values.id) {
      await db.update(agreementShells)
        .set({ status: "assigned", updatedAt: new Date() })
        .where(eq(agreementShells.id, open.id));
    }
    await db.insert(agreementShells).values(values).onConflictDoUpdate({
      target: agreementShells.id,
      set: {
        code: values.code,
        title: values.title,
        termMonths: values.termMonths,
        rateBps: values.rateBps,
        ltvBps: values.ltvBps,
        setupFeeBps: values.setupFeeBps,
        earlyRepurchaseAmountBps: values.earlyRepurchaseAmountBps,
        brokerFeeBps: values.brokerFeeBps,
        minMonths: values.minMonths,
        earlyStartMonth: values.earlyStartMonth,
        earlyUntilMonth: values.earlyUntilMonth,
        status: values.status,
        createdOn: values.createdOn,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (action === "shell.remove") {
    requireDesk(actor);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('mac-open-agreement-shell'))`);
    const [target] = await db.select({ status: agreementShells.status })
      .from(agreementShells)
      .where(eq(agreementShells.id, String(operation.id)))
      .for("update")
      .limit(1);
    if (!target) throw new Error("AGREEMENT_SHELL_NOT_FOUND");
    if (target.status === "open") throw new Error("AGREEMENT_OPEN_SHELL_REQUIRED");
    const result = await db.delete(agreementShells)
      .where(eq(agreementShells.id, String(operation.id)))
      .returning({ id: agreementShells.id });
    if (!result.length) throw new Error("AGREEMENT_SHELL_NOT_FOUND");
    return;
  }

  if (action === "profile.update") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const patch = operation.patch as Record<string, unknown>;
    await db.update(customers).set({
      name: typeof patch.name === "string" ? patch.name.trim() : undefined,
      phone: typeof patch.phone === "string" ? patch.phone.trim() : undefined,
      avatar: typeof patch.avatar === "string" ? patch.avatar : undefined,
      onboardingComplete: typeof patch.onboardingComplete === "boolean" ? patch.onboardingComplete : undefined,
      preferences: patch.preferences && typeof patch.preferences === "object" ? patch.preferences : undefined,
      updatedAt: new Date(),
    }).where(eq(customers.id, actor.customerId));
    return;
  }

  if (action === "customer.update") {
    requireDesk(actor);
    const id = String(operation.id);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const patch = operation.patch as Record<string, unknown>;
    const nextStatus = patch.status === "suspended" || patch.status === "invited" || patch.status === "active"
      ? patch.status
      : undefined;
    await db.transaction(async (tx) => {
      await tx.update(customers).set({
        name: typeof patch.name === "string" ? patch.name.trim() : undefined,
        phone: typeof patch.phone === "string" ? patch.phone.trim() : undefined,
        status: nextStatus,
        member: typeof patch.member === "boolean" ? patch.member : undefined,
        updatedAt: new Date(),
      }).where(eq(customers.id, id));
      if (nextStatus && nextStatus !== "active") {
        await tx.update(collectorSessions).set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(collectorSessions.customerId, id),
          isNull(collectorSessions.revokedAt),
        ));
      }
    });
    return;
  }

  if (action === "customer.invite") {
    requireDesk(actor);
    const customer = operation.customer as Record<string, unknown>;
    const id = String(customer.id);
    const email = String(customer.email);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const [customerCollision, staffCollision] = await Promise.all([
      db.select({ id: customers.id, email: customers.email })
        .from(customers)
        .where(or(eq(customers.id, id), eq(customers.email, email)))
        .limit(1),
      db.select({ id: staffAccounts.id }).from(staffAccounts)
        .where(eq(staffAccounts.email, email))
        .limit(1),
    ]);
    if (customerCollision[0]) throw new Error("ID_COLLISION");
    if (staffCollision[0]) throw new Error("RESERVED_DESK_EMAIL");
    await db.insert(customers).values({
      id,
      email,
      name: String(customer.name),
      phone: String(customer.phone),
      role: "collector",
      status: "invited",
      member: Boolean(customer.member),
      preferences: {},
    });
    return;
  }

  if (action === "customer.remove") {
    requireDesk(actor);
    const id = String(operation.id);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const [piece, agreement] = await Promise.all([
      db.select({ id: timepieces.id }).from(timepieces).where(eq(timepieces.customerId, id)).limit(1),
      db.select({ id: liveAgreements.id }).from(liveAgreements).where(eq(liveAgreements.customerId, id)).limit(1),
    ]);
    if (piece[0] || agreement[0]) throw new Error("CUSTOMER_REFERENCED");
    await db.delete(customers).where(eq(customers.id, id));
    return;
  }

  if (action === "timepiece.create") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const timepiece = operation.timepiece as Record<string, unknown>;
    const values = pieceValues(timepiece, actor);
    if (!values.brand || !values.model) throw new Error("TIMEPIECE_IDENTITY_REQUIRED");
    const [existing] = await db.select({ id: timepieces.id })
      .from(timepieces)
      .where(eq(timepieces.id, String(timepiece.id)))
      .limit(1);
    if (existing) throw new Error("ID_COLLISION");
    await db.insert(timepieces).values({
      id: String(timepiece.id),
      customerId: actor.customerId,
      ...values,
    });
    return;
  }

  if (action === "timepiece.update" || action === "timepiece.deskUpdate") {
    const patch = operation.patch as Record<string, unknown>;
    if (action === "timepiece.deskUpdate") requireDesk(actor);
    // A desk actor is fenced on either action name; `pieceValues` lets desk
    // actors set `appraised`, so `timepiece.update` must not be a side door.
    if (isDesk(actor) && patchNeedsAppraisal(patch)) requireAppraiser(actor);
    const id = String(operation.id);
    await ownedPiece(db, actor, id);
    const values = pieceValues(patch, actor);
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of Object.keys(patch)) {
      if (key in values) update[key] = values[key as keyof typeof values];
    }
    if (isDesk(actor)) {
      if (patch.valueLow !== undefined) update.valueLowCents = dollarsToCents(Number(patch.valueLow));
      if (patch.valueHigh !== undefined) update.valueHighCents = dollarsToCents(Number(patch.valueHigh));
      if (patch.financeable !== undefined) update.financeable = Boolean(patch.financeable);
      if (patch.evaluatedAt !== undefined) update.evaluatedAt = patch.evaluatedAt ? new Date(String(patch.evaluatedAt)) : null;
      if (patch.assetCode !== undefined) update.assetCode = String(patch.assetCode);
    }
    await db.update(timepieces).set(update).where(eq(timepieces.id, id));
    return;
  }

  if (action === "timepiece.remove") {
    const id = String(operation.id);
    await ownedPiece(db, actor, id);
    const [live, app, prepared, allocation, original] = await Promise.all([
      db.select({ id: liveAgreementMembers.id }).from(liveAgreementMembers).where(eq(liveAgreementMembers.timepieceId, id)).limit(1),
      db.select({ id: applications.id }).from(applications).where(eq(applications.timepieceId, id)).limit(1),
      db.select({ id: preparedAgreements.id }).from(preparedAgreements).where(eq(preparedAgreements.timepieceId, id)).limit(1),
      db.select({ id: allocations.id }).from(allocations).where(eq(allocations.timepieceId, id)).limit(1),
      db
        .select({ id: photoObjects.id })
        .from(photoObjects)
        .where(and(eq(photoObjects.timepieceId, id), ne(photoObjects.status, "abandoned")))
        .limit(1),
    ]);
    if (live[0] || app[0] || prepared[0] || allocation[0] || original[0]) {
      throw new Error("TIMEPIECE_REFERENCED");
    }
    await db.transaction(async (tx) => {
      await tx.delete(livePreviews).where(eq(livePreviews.timepieceId, id));
      await tx
        .delete(photoObjects)
        .where(and(eq(photoObjects.timepieceId, id), eq(photoObjects.status, "abandoned")));
      await tx.delete(timepieces).where(eq(timepieces.id, id));
    });
    return;
  }

  if (action === "agreement.create") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const agreement = operation.agreement as unknown as Agreement;
    if (!agreement.watchIds?.length) throw new Error("WATCH_IDS_REQUIRED");
    const [existingAgreement] = await db.select({ id: liveAgreements.id })
      .from(liveAgreements)
      .where(eq(liveAgreements.id, agreement.id))
      .limit(1);
    if (existingAgreement) throw new Error("ID_COLLISION");
    const pieces = await db.select().from(timepieces)
      .where(inArray(timepieces.id, agreement.watchIds))
      .orderBy(timepieces.id)
      .for("update");
    if (pieces.length !== new Set(agreement.watchIds).size || pieces.some((row) => row.customerId !== actor.customerId)) {
      throw new Error("TIMEPIECE_NOT_OWNED");
    }
    if (pieces.some((row) => row.status !== "appraised" || !row.financeable)) {
      throw new Error("INELIGIBLE_PIECE");
    }
    const [owner] = await db.select().from(customers).where(eq(customers.id, actor.customerId)).limit(1);
    if (!owner || owner.email !== actor.email) throw new Error("COLLECTOR_NOT_FOUND");
    const scale = await serverAgreementScale(db, agreement.termMonths);
    const share = scale.purchaseShare;
    const cap = pieces.reduce((sum, row) => sum + maxPurchaseAmount(
      (row.valueLowCents ?? 0) / 100,
      (row.valueHighCents ?? 0) / 100,
      share,
    ), 0);
    if (agreement.amount > cap) throw new Error("OVER_LTV");
    const conflicts = await db.select().from(liveAgreementMembers).where(and(
      inArray(liveAgreementMembers.timepieceId, agreement.watchIds),
      eq(liveAgreementMembers.status, "live"),
    ));
    if (conflicts.length) throw new Error("LIVE_WATCH_CONFLICT");
    const amountCents = dollarsToCents(agreement.amount);
    if (amountCents === null) throw new Error("INVALID_DOLLAR_AMOUNT");
    await db.transaction(async (tx) => {
      await tx.insert(liveAgreements).values({
        id: agreement.id,
        customerId: actor.customerId,
        amountCents,
        termMonths: agreement.termMonths,
        delivery: agreement.delivery,
        ownerName: owner.name,
        email: owner.email,
        status: "pending_signature",
        agreementCode: agreement.agreementCode,
        createdOn: agreement.createdAt,
        scale,
      });
      await tx.insert(liveAgreementMembers).values(agreement.watchIds.map((timepieceId) => ({
        id: `${agreement.id}:${timepieceId}`,
        agreementId: agreement.id,
        timepieceId,
        status: "live",
      })));
    });
    return;
  }

  if (action === "agreement.signCollector" || action === "agreement.markSigned") {
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    if (action === "agreement.markSigned") requireDesk(actor);
    if (action === "agreement.signCollector" && actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    requireMutableAgreement(agreement);
    await db.update(liveAgreements).set({
      status: "signed",
      signedOn: new Date().toISOString().slice(0, 10),
      updatedAt: new Date(),
    }).where(eq(liveAgreements.id, agreement.id));
    return;
  }

  if (action === "agreement.updateScale") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    requireMutableAgreement(agreement);
    await db.update(liveAgreements).set({
      scale: operation.scale as Record<string, unknown>,
      termMonths: Number(operation.termMonths),
      updatedAt: new Date(),
    }).where(eq(liveAgreements.id, String(operation.id)));
    return;
  }

  if (action === "agreement.remove") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    requireMutableAgreement(agreement);
    if (await liveAgreementHasDocuments(db, agreement.id)) {
      throw new Error("AGREEMENT_HAS_DOCUMENTS");
    }
    await db.transaction(async (tx) => {
      await tx.delete(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, agreement.id));
      await tx.delete(liveAgreementMembers).where(eq(liveAgreementMembers.agreementId, agreement.id));
      await tx.delete(liveAgreements).where(eq(liveAgreements.id, agreement.id));
    });
    return;
  }

  if (action === "agreement.recordEnd") {
    requireDesk(actor);
    const recordable = validateRecordedEndKind(
      (operation.end as { kind?: string }).kind,
    );
    if (!recordable.ok) throw new Error(recordable.error);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const checked = applyAgreementEnd(
      agreement,
      operation.end as NonNullable<Agreement["bookEnd"]>,
    );
    if (!checked.ok) throw new Error(checked.error);
    const end = checked.agreement.bookEnd!;
    if (isLiveBookLabel(bookLabel(checked.agreement))) {
      const conflicts = await db.select().from(liveAgreementMembers).where(and(
        inArray(liveAgreementMembers.timepieceId, agreement.watchIds),
        eq(liveAgreementMembers.status, "live"),
        ne(liveAgreementMembers.agreementId, agreement.id),
      ));
      if (conflicts.length) throw new Error("LIVE_WATCH_CONFLICT");
    }
    const amountCents = dollarsToCents(end.amount);
    if (amountCents === null) throw new Error("INVALID_DOLLAR_AMOUNT");
    await db.transaction(async (tx) => {
      await tx.insert(liveAgreementEnds).values({
        agreementId: agreement.id,
        kind: end.kind,
        endedOn: end.date,
        amountCents,
      }).onConflictDoUpdate({
        target: liveAgreementEnds.agreementId,
        set: { kind: end.kind, endedOn: end.date, amountCents },
      });
      await tx.update(liveAgreementMembers).set({
        status: isLiveBookLabel(bookLabel(checked.agreement)) ? "live" : "released",
      }).where(eq(liveAgreementMembers.agreementId, agreement.id));
    });
    return;
  }

  if (action === "agreement.clearEnd") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const conflicts = await db.select().from(liveAgreementMembers).where(and(
      inArray(liveAgreementMembers.timepieceId, agreement.watchIds),
      eq(liveAgreementMembers.status, "live"),
      ne(liveAgreementMembers.agreementId, agreement.id),
    ));
    if (conflicts.length) throw new Error("LIVE_WATCH_CONFLICT");
    await db.transaction(async (tx) => {
      await tx.delete(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, agreement.id));
      await tx.update(liveAgreementMembers).set({ status: "live" }).where(eq(liveAgreementMembers.agreementId, agreement.id));
    });
    return;
  }

  if (action === "agreement.renew") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const scale = await serverAgreementScale(db, 12);
    const planned = planRenewal(
      agreement,
      String(operation.closeDate),
      undefined,
      scale,
    );
    if (!planned.ok) throw new Error(planned.error);
    const successorId = String(operation.successorId);
    const amountCents = dollarsToCents(planned.successor.amount);
    const endCents = dollarsToCents(planned.end.amount);
    if (amountCents === null || endCents === null) throw new Error("INVALID_DOLLAR_AMOUNT");
    await db.transaction(async (tx) => {
      await tx.insert(liveAgreementEnds).values({
        agreementId: agreement.id,
        kind: "renewed",
        endedOn: planned.end.date,
        amountCents: endCents,
      }).onConflictDoUpdate({
        target: liveAgreementEnds.agreementId,
        set: { kind: "renewed", endedOn: planned.end.date, amountCents: endCents },
      });
      await tx.update(liveAgreementMembers).set({ status: "released" }).where(eq(liveAgreementMembers.agreementId, agreement.id));
      await tx.insert(liveAgreements).values({
        id: successorId,
        customerId: agreement.customerId,
        amountCents,
        termMonths: 12,
        delivery: planned.successor.delivery,
        ownerName: planned.successor.ownerName,
        email: agreement.email,
        status: "pending_signature",
        agreementCode: String(operation.agreementCode),
        createdOn: String(operation.closeDate),
        scale,
      });
      await tx.insert(liveAgreementMembers).values(agreement.watchIds.map((timepieceId) => ({
        id: `${successorId}:${timepieceId}`,
        agreementId: successorId,
        timepieceId,
        status: "live",
      })));
    });
    return;
  }

  if (action === "agreement.addWatches") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    requireMutableAgreement(agreement);
    if (!isLiveBookLabel(bookLabel(agreement))) throw new Error("NOT_LIVE");
    const watchIds = operation.watchIds as string[];
    const pieces = await db.select().from(timepieces).where(inArray(timepieces.id, watchIds));
    if (
      pieces.length !== new Set(watchIds).size ||
      pieces.some((row) => row.customerId !== actor.customerId || row.status !== "appraised" || !row.financeable)
    ) {
      throw new Error("INELIGIBLE_PIECE");
    }
    const conflicts = await db.select().from(liveAgreementMembers).where(and(
      inArray(liveAgreementMembers.timepieceId, watchIds),
      eq(liveAgreementMembers.status, "live"),
    ));
    if (conflicts.length) throw new Error("LIVE_WATCH_CONFLICT");
    await db.insert(liveAgreementMembers).values(watchIds.map((timepieceId) => ({
      id: `${agreement.id}:${timepieceId}`,
      agreementId: agreement.id,
      timepieceId,
      status: "live",
    })));
    return;
  }

  if (action === "agreement.setAmount") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    requireMutableAgreement(agreement);
    if (!isLiveBookLabel(bookLabel(agreement))) throw new Error("NOT_LIVE");
    const amount = Number(operation.amount);
    const checked = validateSaleAmountRaise(agreement.amount, amount);
    if (!checked.ok) throw new Error(checked.error);
    const pieces = await db.select().from(timepieces).where(inArray(timepieces.id, agreement.watchIds));
    const share = Number((agreement.scale as { purchaseShare?: number } | null)?.purchaseShare ?? 0.6);
    const cap = pieces.reduce((sum, row) => sum + maxPurchaseAmount(
      (row.valueLowCents ?? 0) / 100,
      (row.valueHighCents ?? 0) / 100,
      share,
    ), 0);
    if (amount > cap) throw new Error("OVER_LTV");
    await db.update(liveAgreements).set({
      amountCents: dollarsToCents(amount)!,
      updatedAt: new Date(),
    }).where(eq(liveAgreements.id, agreement.id));
    return;
  }

  if (action === "preview.upsert") {
    const timepieceId = String(operation.timepieceId);
    await ownedPiece(db, actor, timepieceId);
    const [existing] = await db.select({ timepieceId: livePreviews.timepieceId })
      .from(livePreviews)
      .where(eq(livePreviews.id, String(operation.id)))
      .limit(1);
    if (existing && existing.timepieceId !== timepieceId) {
      throw new Error("PREVIEW_ID_COLLISION");
    }
    await db.insert(livePreviews).values({
      id: String(operation.id),
      timepieceId,
      kind: String(operation.kind),
      previewUrl: String(operation.url),
    }).onConflictDoUpdate({
      target: livePreviews.id,
      set: { kind: String(operation.kind), previewUrl: String(operation.url) },
    });
    return;
  }

  if (action === "preview.remove") {
    requireDesk(actor);
    const id = String(operation.id);
    const [preview] = await db.select({ id: livePreviews.id }).from(livePreviews).where(eq(livePreviews.id, id)).limit(1);
    if (!preview) throw new Error("PREVIEW_NOT_FOUND");
    await db.delete(livePreviews).where(eq(livePreviews.id, id));
    return;
  }

  throw new Error("LIVE_BOOK_ACTION_INVALID");
}
