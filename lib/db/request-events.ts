import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { REQUEST_STATES, deskToday, isRequestExpired } from "@/lib/contract/repo-book.mjs";
import type { Database } from "./client";
import type { Actor } from "./records";
import { isRetailActor } from "./records";
import { agreementEvents, liveAgreementMembers, liveAgreements } from "./schema";

type QueryDb = Pick<Database, "select" | "insert" | "update">;

export type AgreementEventInput = {
  agreementId: string;
  actorKind: "retail" | "desk" | "system";
  actorId?: string | null;
  action: string;
  fromStatus?: string | null;
  toStatus: string;
  amountCents?: number | null;
  version: number;
  note?: string;
  internal?: boolean;
  createdAt?: Date;
};

const NOTE_LIMIT = 1_000;

/**
 * Append one row to the request thread. The table is append-only in the
 * database (KTD25), so a correction is a later event, never an edit here.
 */
export async function recordAgreementEvent(db: QueryDb, input: AgreementEventInput) {
  const [row] = await db
    .insert(agreementEvents)
    .values({
      id: randomUUID(),
      agreementId: input.agreementId,
      actorKind: input.actorKind,
      actorId: input.actorId ?? null,
      action: input.action,
      fromStatus: input.fromStatus ?? null,
      toStatus: input.toStatus,
      amountCents: input.amountCents ?? null,
      version: input.version,
      note: String(input.note ?? "").slice(0, NOTE_LIMIT),
      internal: Boolean(input.internal),
      createdAt: input.createdAt ?? new Date(),
    })
    .returning();
  return row;
}

/**
 * The thread as one actor may read it. A retail reader sees only their own
 * request and never a desk-internal row (KTD22); the Desk reads everything.
 */
export async function listAgreementEvents(db: QueryDb, actor: Actor, agreementId: string) {
  const where = isRetailActor(actor)
    ? and(eq(liveAgreements.id, agreementId), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, agreementId);
  const [agreement] = await db.select({ id: liveAgreements.id }).from(liveAgreements).where(where).limit(1);
  if (!agreement) throw new Error("AGREEMENT_NOT_FOUND");
  const scope = isRetailActor(actor)
    ? and(eq(agreementEvents.agreementId, agreementId), eq(agreementEvents.internal, false))
    : eq(agreementEvents.agreementId, agreementId);
  return db
    .select()
    .from(agreementEvents)
    .where(scope)
    .orderBy(asc(agreementEvents.createdAt), asc(agreementEvents.id));
}

/**
 * Close a request whose retail window has run out (KTD12). Expiry is derived
 * from `lastActionAt`, so the row is only written when a mutation touches it:
 * the caller runs this inside its own transaction and the close commits even
 * when the caller's own move is then refused with `REQUEST_EXPIRED`.
 *
 * Returns the closed row, or `null` when the row is not an expired request.
 */
export async function closeExpiredRequest(db: QueryDb, agreementId: string, now = new Date()) {
  const [row] = await db
    .select()
    .from(liveAgreements)
    .where(eq(liveAgreements.id, agreementId))
    .for("update")
    .limit(1);
  if (!row || !REQUEST_STATES.includes(row.status)) return null;
  const expired = isRequestExpired(
    { status: row.status, lastActionAt: row.lastActionAt.toISOString() },
    deskToday(now),
  );
  if (!expired) return null;
  const [closed] = await db
    .update(liveAgreements)
    .set({
      status: "closed",
      closeReason: "expired",
      lastActionAt: now,
      updatedAt: now,
    })
    .where(and(eq(liveAgreements.id, row.id), eq(liveAgreements.status, row.status)))
    .returning();
  if (!closed) return null;
  await db
    .update(liveAgreementMembers)
    .set({ status: "released" })
    .where(
      and(
        eq(liveAgreementMembers.agreementId, row.id),
        eq(liveAgreementMembers.status, "reserved"),
      ),
    );
  await recordAgreementEvent(db, {
    agreementId: row.id,
    actorKind: "system",
    actorId: null,
    action: "expire",
    fromStatus: row.status,
    toStatus: "closed",
    amountCents: row.amountCents,
    version: row.version,
    note: "",
    internal: false,
    createdAt: now,
  });
  return closed;
}
