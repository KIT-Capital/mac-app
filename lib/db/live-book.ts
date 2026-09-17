import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { dollarsToCents } from "./money.mjs";
import {
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
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

function isUniqueViolation(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

export async function insertLiveAgreement(db: Database, input: LiveAgreementInput) {
  if (!input.watchIds.length) {
    throw new Error("WATCH_IDS_REQUIRED");
  }
  const amountCents = dollarsToCents(input.amount);
  if (amountCents === null) {
    throw new Error("INVALID_DOLLAR_AMOUNT");
  }
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
    if (isUniqueViolation(error)) {
      throw new Error("LIVE_WATCH_CONFLICT");
    }
    throw error;
  }
}

export async function insertLivePreview(db: Database, input: LivePreviewInput) {
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

export async function getLiveAgreement(db: Database, id: string) {
  const [agreement] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, id)).limit(1);
  if (!agreement) return null;
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
