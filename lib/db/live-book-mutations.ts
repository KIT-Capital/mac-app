import { and, eq, inArray, ne, or } from "drizzle-orm";
import { maxPurchaseAmount } from "@/lib/catalog";
import {
  applyAgreementEnd,
  bookLabel,
  isLiveBookLabel,
  validateSaleAmountRaise,
} from "@/lib/contract/repo-book.mjs";
import { planRenewal } from "@/lib/contract/repo-renewal.mjs";
import { parseLiveBookOperation } from "@/lib/live-book-operation.mjs";
import type { Agreement } from "@/lib/types";
import type { Database } from "./client";
import { dollarsToCents } from "./money.mjs";
import type { Actor } from "./records";
import {
  agreements as preparedAgreements,
  allocations,
  applications,
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  photoObjects,
  timepieces,
} from "./schema";

type Operation = ReturnType<typeof parseLiveBookOperation>;

function isDesk(actor: Actor) {
  return actor.role === "staff" || actor.role === "admin";
}

function requireDesk(actor: Actor) {
  if (!isDesk(actor)) throw new Error("DESK_REQUIRED");
}

async function ownedPiece(db: Database, actor: Actor, id: string) {
  const where = actor.role === "collector"
    ? and(eq(timepieces.id, id), eq(timepieces.customerId, actor.customerId))
    : eq(timepieces.id, id);
  const [piece] = await db.select().from(timepieces).where(where).limit(1);
  if (!piece) throw new Error("TIMEPIECE_NOT_FOUND");
  return piece;
}

async function ownedAgreement(db: Database, actor: Actor, id: string) {
  const where = actor.role === "collector"
    ? and(eq(liveAgreements.id, id), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, id);
  const [agreement] = await db.select().from(liveAgreements).where(where).limit(1);
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

export async function executeLiveBookOperation(
  db: Database,
  actor: Actor,
  input: unknown,
) {
  const operation = parseLiveBookOperation(input) as Operation & Record<string, unknown>;
  const action = operation.action;

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
    await db.update(customers).set({
      name: typeof patch.name === "string" ? patch.name.trim() : undefined,
      phone: typeof patch.phone === "string" ? patch.phone.trim() : undefined,
      status: patch.status === "suspended" || patch.status === "invited" || patch.status === "active" ? patch.status : undefined,
      member: typeof patch.member === "boolean" ? patch.member : undefined,
      updatedAt: new Date(),
    }).where(eq(customers.id, id));
    return;
  }

  if (action === "customer.invite") {
    requireDesk(actor);
    const customer = operation.customer as Record<string, unknown>;
    const id = String(customer.id);
    const email = String(customer.email);
    const [collision] = await db.select({ id: customers.id, email: customers.email })
      .from(customers)
      .where(or(eq(customers.id, id), eq(customers.email, email)))
      .limit(1);
    if (collision) throw new Error("ID_COLLISION");
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
    if (action === "timepiece.deskUpdate") requireDesk(actor);
    const id = String(operation.id);
    await ownedPiece(db, actor, id);
    const patch = operation.patch as Record<string, unknown>;
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
      db.select({ id: photoObjects.id }).from(photoObjects).where(eq(photoObjects.timepieceId, id)).limit(1),
    ]);
    if (live[0] || app[0] || prepared[0] || allocation[0] || original[0]) {
      throw new Error("TIMEPIECE_REFERENCED");
    }
    await db.transaction(async (tx) => {
      await tx.delete(livePreviews).where(eq(livePreviews.timepieceId, id));
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
    const pieces = await db.select().from(timepieces).where(inArray(timepieces.id, agreement.watchIds));
    if (pieces.length !== new Set(agreement.watchIds).size || pieces.some((row) => row.customerId !== actor.customerId)) {
      throw new Error("TIMEPIECE_NOT_OWNED");
    }
    if (pieces.some((row) => row.status !== "appraised" || !row.financeable)) {
      throw new Error("INELIGIBLE_PIECE");
    }
    const [owner] = await db.select().from(customers).where(eq(customers.id, actor.customerId)).limit(1);
    if (!owner || owner.email !== actor.email) throw new Error("COLLECTOR_NOT_FOUND");
    const share = Number((agreement.scale as { purchaseShare?: number } | undefined)?.purchaseShare ?? 0.6);
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
        scale: agreement.scale ?? null,
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
    await db.transaction(async (tx) => {
      await tx.delete(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, agreement.id));
      await tx.delete(liveAgreementMembers).where(eq(liveAgreementMembers.agreementId, agreement.id));
      await tx.delete(liveAgreements).where(eq(liveAgreements.id, agreement.id));
    });
    return;
  }

  if (action === "agreement.recordEnd") {
    requireDesk(actor);
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
    if (actor.role !== "admin") throw new Error("ADMIN_REQUIRED");
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const planned = planRenewal(
      agreement,
      String(operation.closeDate),
      undefined,
      operation.scale as Record<string, unknown>,
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
        scale: operation.scale as Record<string, unknown>,
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
