import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { HELD_PIECE_CONSTRAINTS } from "../live-book-errors.mjs";
import { assertIsolation, canReadAgreement, canWriteCustomer, canWritePhoto } from "./isolation.mjs";
import type { Database } from "./client";
import { dollarsToCents } from "./money.mjs";
import type { Actor } from "./records";
import {
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

export type LiveAgreementInput = {
  id: string;
  customerId: string;
  watchIds: string[];
  amount: number;
  termMonths: number;
  delivery: string;
  ownerName: string;
  email: string;
  createdOn: string;
  status?: string;
  agreementCode?: string;
  signedOn?: string;
  scale?: Record<string, unknown> | null;
};

export type LivePreviewInput = {
  id?: string;
  timepieceId: string;
  previewUrl: string;
  kind?: string;
};

function uniqueConstraint(error: unknown): string | null {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return null;
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

function mapUniqueError(error: unknown): never {
  const constraint = uniqueConstraint(error);
  if (HELD_PIECE_CONSTRAINTS.has(constraint ?? "")) {
    throw new Error("LIVE_WATCH_CONFLICT");
  }
  if (constraint === "live_agreements_pkey") {
    throw new Error("DUPLICATE_ID");
  }
  if (constraint === "live_agreement_members_agreement_timepiece_uidx") {
    throw new Error("DUPLICATE_MEMBER");
  }
  throw error instanceof Error ? error : new Error("UNIQUE_VIOLATION");
}

async function assertOwnedPieces(db: Database, customerId: string, watchIds: string[]) {
  const uniqueIds = [...new Set(watchIds)];
  const rows = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces)
    .where(inArray(timepieces.id, uniqueIds));
  if (rows.length !== uniqueIds.length || rows.some((row) => row.customerId !== customerId)) {
    throw new Error("TIMEPIECE_NOT_OWNED");
  }
}

export async function insertLiveAgreement(db: Database, actor: Actor, input: LiveAgreementInput) {
  assertIsolation(canWriteCustomer(actor, input.customerId));
  if (!input.watchIds.length) {
    throw new Error("WATCH_IDS_REQUIRED");
  }
  const amountCents = dollarsToCents(input.amount);
  if (amountCents === null) {
    throw new Error("INVALID_DOLLAR_AMOUNT");
  }
  await assertOwnedPieces(db, input.customerId, input.watchIds);
  try {
    return await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(liveAgreements)
        .values({
          id: input.id,
          customerId: input.customerId,
          amountCents,
          termMonths: input.termMonths,
          delivery: input.delivery,
          ownerName: input.ownerName,
          email: input.email,
          status: input.status ?? "pending_signature",
          agreementCode: input.agreementCode,
          createdOn: input.createdOn,
          signedOn: input.signedOn,
          scale: input.scale ?? null,
        })
        .returning();
      await tx.insert(liveAgreementMembers).values(
        input.watchIds.map((timepieceId) => ({
          id: randomUUID(),
          agreementId: input.id,
          timepieceId,
          status: "live",
        })),
      );
      return row;
    });
  } catch (error) {
    mapUniqueError(error);
  }
}

export async function insertLivePreview(db: Database, actor: Actor, input: LivePreviewInput) {
  const [piece] = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces)
    .where(eq(timepieces.id, input.timepieceId))
    .limit(1);
  if (!piece) {
    throw new Error("TIMEPIECE_NOT_FOUND");
  }
  assertIsolation(canWritePhoto(actor, piece.customerId));
  const [row] = await db
    .insert(livePreviews)
    .values({
      id: input.id ?? randomUUID(),
      timepieceId: input.timepieceId,
      kind: input.kind ?? "legacy_preview",
      previewUrl: input.previewUrl,
    })
    .returning();
  return row;
}

export async function getLiveAgreement(db: Database, actor: Actor, id: string) {
  const [agreement] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, id)).limit(1);
  if (!agreement) return null;
  assertIsolation(canReadAgreement(actor, agreement.customerId));
  const members = await db
    .select()
    .from(liveAgreementMembers)
    .where(eq(liveAgreementMembers.agreementId, id));
  const [bookEnd] = await db
    .select()
    .from(liveAgreementEnds)
    .where(eq(liveAgreementEnds.agreementId, id))
    .limit(1);
  return {
    ...agreement,
    watchIds: members.map((member) => member.timepieceId),
    members,
    bookEnd: bookEnd ?? null,
  };
}
