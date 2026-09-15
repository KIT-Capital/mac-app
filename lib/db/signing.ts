import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { sha256Hex } from "../storage/object-store.mjs";
import type { ObjectStore } from "./photos";
import { getAgreement, getCurrentVersion, isVersionExecutable } from "./agreements";
import type { Database } from "./client";
import { assertIsolation, canPrepareAgreement, canReadAgreement } from "./isolation.mjs";
import type { Actor } from "./records";
import { archivedDocuments, signatureEnvelopes } from "./schema";

export type SignatureWebhook = {
  externalId: string;
  event: "collector_signed" | "mac_signed" | "complete";
};

export async function sendForSignature(db: Database, actor: Actor, agreementId: string) {
  assertIsolation(canPrepareAgreement(actor), "SEND_REQUIRES_DESK");
  const agreement = await getAgreement(db, actor, agreementId);
  if (!agreement) {
    throw new Error("AGREEMENT_NOT_FOUND");
  }
  const version = await getCurrentVersion(db, actor, agreementId);
  if (!isVersionExecutable(version) || !version) {
    throw new Error("VERSION_NOT_EXECUTABLE");
  }
  const [existing] = await db
    .select()
    .from(signatureEnvelopes)
    .where(eq(signatureEnvelopes.agreementVersionId, version.id))
    .limit(1);
  if (existing) return existing;
  const [row] = await db
    .insert(signatureEnvelopes)
    .values({
      id: randomUUID(),
      agreementId: agreement.id,
      agreementVersionId: version.id,
      provider: "mock",
      externalId: `mock-${version.id}`,
      status: "sent",
    })
    .returning();
  return row;
}

export async function applySignatureWebhook(db: Database, payload: SignatureWebhook) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select id from signature_envelopes where external_id = ${payload.externalId} for update`,
    );
    const [envelope] = await tx
      .select()
      .from(signatureEnvelopes)
      .where(eq(signatureEnvelopes.externalId, payload.externalId))
      .limit(1);
    if (!envelope) {
      throw new Error("ENVELOPE_NOT_FOUND");
    }
    if (envelope.status === "complete" || envelope.status === "archived") {
      return envelope;
    }
    const now = new Date();
    const collectorSignedAt =
      payload.event === "collector_signed" || payload.event === "complete"
        ? (envelope.collectorSignedAt ?? now)
        : envelope.collectorSignedAt;
    const macSignedAt =
      payload.event === "mac_signed" || payload.event === "complete"
        ? (envelope.macSignedAt ?? now)
        : envelope.macSignedAt;
    const complete = Boolean(collectorSignedAt && macSignedAt);
    const [row] = await tx
      .update(signatureEnvelopes)
      .set({
        status: complete ? "complete" : payload.event === "collector_signed" ? "collector_signed" : envelope.status,
        collectorSignedAt,
        macSignedAt,
        completedAt: complete ? (envelope.completedAt ?? now) : envelope.completedAt,
        updatedAt: now,
      })
      .where(
        and(
          eq(signatureEnvelopes.id, envelope.id),
          sql`${signatureEnvelopes.status} not in ('complete', 'archived')`,
        ),
      )
      .returning();
    return row ?? envelope;
  });
}

export async function archiveSignedPdf(
  db: Database,
  store: ObjectStore,
  actor: Actor,
  envelopeId: string,
  pdf: Uint8Array,
) {
  assertIsolation(canPrepareAgreement(actor), "ARCHIVE_REQUIRES_DESK");
  const [envelope] = await db
    .select()
    .from(signatureEnvelopes)
    .where(eq(signatureEnvelopes.id, envelopeId))
    .limit(1);
  if (!envelope) {
    throw new Error("ENVELOPE_NOT_FOUND");
  }
  if (envelope.status !== "complete" && envelope.status !== "archived") {
    throw new Error("SIGN_INCOMPLETE");
  }
  const [existing] = await db
    .select()
    .from(archivedDocuments)
    .where(eq(archivedDocuments.envelopeId, envelope.id))
    .limit(1);
  if (existing) {
    return existing;
  }
  const checksum = sha256Hex(pdf);
  const key = `agreements/${envelope.agreementId}/${envelope.agreementVersionId}.pdf`;
  await store.put(key, pdf, checksum);
  const [row] = await db
    .insert(archivedDocuments)
    .values({
      id: randomUUID(),
      envelopeId: envelope.id,
      objectKey: key,
      checksum,
      bytes: pdf.byteLength,
    })
    .returning();
  await db
    .update(signatureEnvelopes)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(signatureEnvelopes.id, envelope.id));
  return row;
}

export async function getArchivedDocument(db: Database, actor: Actor, envelopeId: string) {
  const [envelope] = await db
    .select()
    .from(signatureEnvelopes)
    .where(eq(signatureEnvelopes.id, envelopeId))
    .limit(1);
  if (!envelope) return null;
  const agreement = await getAgreement(db, actor, envelope.agreementId);
  if (!agreement) return null;
  assertIsolation(canReadAgreement(actor, agreement.customerId));
  const [doc] = await db
    .select()
    .from(archivedDocuments)
    .where(eq(archivedDocuments.envelopeId, envelopeId))
    .limit(1);
  return doc ?? null;
}
