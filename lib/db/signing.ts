import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { sha256Hex } from "../storage/object-store.mjs";
import type { ObjectStore } from "./photos";
import { getAgreement, getCurrentVersion, isVersionExecutable } from "./agreements";
import type { Database } from "./client";
import { assertIsolation, canPrepareAgreement, canReadAgreement, canSubmitApplication } from "./isolation.mjs";
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
  const [envelope] = await db
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
  const next = { ...envelope };
  if (payload.event === "collector_signed" || payload.event === "complete") {
    next.collectorSignedAt = next.collectorSignedAt ?? now;
  }
  if (payload.event === "mac_signed" || payload.event === "complete") {
    next.macSignedAt = next.macSignedAt ?? now;
  }
  if (next.collectorSignedAt && next.macSignedAt) {
    next.status = "complete";
    next.completedAt = next.completedAt ?? now;
  } else if (payload.event === "collector_signed") {
    next.status = "collector_signed";
  }
  const [row] = await db
    .update(signatureEnvelopes)
    .set({
      status: next.status,
      collectorSignedAt: next.collectorSignedAt,
      macSignedAt: next.macSignedAt,
      completedAt: next.completedAt,
      updatedAt: now,
    })
    .where(eq(signatureEnvelopes.id, envelope.id))
    .returning();
  return row;
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

export function assertCannotReplaceArchive(actor: Actor, ownerCustomerId: string) {
  if (canSubmitApplication(actor, ownerCustomerId) || actor.role === "staff" || actor.role === "admin") {
    throw new Error("ARCHIVE_IMMUTABLE");
  }
  throw new Error("ARCHIVE_IMMUTABLE");
}
