import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, gte, inArray, max } from "drizzle-orm";
import {
  SENDS_PER_HOUR,
  SEND_WINDOW_MS,
  composeAgreementDocumentMail,
  dispatchAgreementDocumentMail,
  resolveSendRecipient,
} from "@/lib/agreement-document-mail.mjs";
import { buildAgreementSnapshot, renderAgreementSnapshotPdf } from "@/lib/contract/repo-agreement-snapshot.mjs";
import { agreementObjectKey } from "@/lib/storage/agreement-object-key.mjs";
import { sha256Hex } from "@/lib/storage/object-store.mjs";
import type { Database } from "./client";
import { centsToDollars } from "./money.mjs";
import type { Actor } from "./records";
import { agreementDocumentSends, agreementDocuments, liveAgreementMembers, liveAgreements, timepieces } from "./schema";

type QueryDb = Pick<Database, "select" | "insert" | "update">;

type DocumentStore = {
  putIfAbsent: (key: string, body: Uint8Array, checksum: string) => Promise<void>;
  head: (key: string) => Promise<boolean>;
  get: (key: string) => Promise<Uint8Array>;
  presignGet: (key: string, expiresSeconds?: number) => Promise<{ url: string; expiresAt: string }>;
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

function snapshotHash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function actorMeta(actor: Actor) {
  if (actor.role === "collector") {
    return { createdByKind: "collector", createdById: actor.customerId };
  }
  return { createdByKind: "desk", createdById: actor.email };
}

function appEnv(env: NodeJS.ProcessEnv) {
  const value = String(env.APP_ENV ?? "development").trim();
  return value === "staging" || value === "production" ? value : "development";
}

async function scopedAgreement(db: QueryDb, actor: Actor, liveAgreementId: string) {
  const where = actor.role === "collector"
    ? and(eq(liveAgreements.id, liveAgreementId), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, liveAgreementId);
  const [row] = await db.select().from(liveAgreements).where(where).limit(1);
  if (!row) throw new Error("DOCUMENT_NOT_FOUND");
  return row;
}

async function scopedDocument(db: QueryDb, actor: Actor, documentId: string) {
  const where = actor.role === "collector"
    ? and(eq(agreementDocuments.id, documentId), eq(agreementDocuments.customerId, actor.customerId))
    : eq(agreementDocuments.id, documentId);
  const [row] = await db.select().from(agreementDocuments).where(where).limit(1);
  if (!row) throw new Error("DOCUMENT_NOT_FOUND");
  return row;
}

async function livePieces(db: QueryDb, liveAgreementId: string) {
  const members = await db
    .select()
    .from(liveAgreementMembers)
    .where(eq(liveAgreementMembers.agreementId, liveAgreementId));
  const ids = members.map((member) => member.timepieceId);
  if (!ids.length) return [];
  return db.select().from(timepieces).where(inArray(timepieces.id, ids));
}

async function nextVersion(db: QueryDb, liveAgreementId: string) {
  const [row] = await db
    .select({ version: max(agreementDocuments.version) })
    .from(agreementDocuments)
    .where(eq(agreementDocuments.liveAgreementId, liveAgreementId));
  return Number(row?.version ?? 0) + 1;
}

async function latestStoredId(db: QueryDb, liveAgreementId: string) {
  const [row] = await db
    .select({ id: agreementDocuments.id })
    .from(agreementDocuments)
    .where(and(eq(agreementDocuments.liveAgreementId, liveAgreementId), eq(agreementDocuments.status, "stored")))
    .orderBy(desc(agreementDocuments.version))
    .limit(1);
  return row?.id ?? null;
}

export async function liveAgreementHasDocuments(db: Database, liveAgreementId: string) {
  const [row] = await db
    .select({ id: agreementDocuments.id })
    .from(agreementDocuments)
    .where(eq(agreementDocuments.liveAgreementId, liveAgreementId))
    .limit(1);
  return Boolean(row);
}

async function reconcileBuilding(db: Database, store: DocumentStore, row: typeof agreementDocuments.$inferSelect) {
  if (row.status !== "building" || !row.objectKey || !row.checksum || row.bytes == null) return row;
  if (!(await store.head(row.objectKey))) return row;
  const bytes = await store.get(row.objectKey);
  if (sha256Hex(bytes) !== row.checksum || bytes.byteLength !== row.bytes) {
    const [updated] = await db
      .update(agreementDocuments)
      .set({ status: "failed", failureCode: "CHECKSUM_MISMATCH" })
      .where(and(eq(agreementDocuments.id, row.id), eq(agreementDocuments.status, "building")))
      .returning();
    return updated ?? row;
  }
  const [updated] = await db
    .update(agreementDocuments)
    .set({ status: "stored", storedAt: new Date(), failureCode: null })
    .where(and(eq(agreementDocuments.id, row.id), eq(agreementDocuments.status, "building")))
    .returning();
  return updated ?? row;
}

async function freezeSnapshot(db: QueryDb, agreement: typeof liveAgreements.$inferSelect) {
  const pieces = await livePieces(db, agreement.id);
  return buildAgreementSnapshot({
    sellerName: agreement.ownerName,
    sellerEmail: agreement.email,
    saleAmount: centsToDollars(agreement.amountCents),
    termMonths: agreement.termMonths,
    startDate: agreement.createdOn,
    delivery: agreement.delivery,
    agreementCode: agreement.agreementCode ?? "",
    scale: agreement.scale,
    timepieces: pieces.map((piece) => ({
      name: [piece.brand, piece.model].filter(Boolean).join(" "),
      brand: piece.brand,
      model: piece.model,
      reference: piece.reference ?? "",
      serial: piece.serial ?? "",
    })),
  });
}

export async function buildAgreementDocument(
  db: Database,
  actor: Actor,
  input: { liveAgreementId: string },
  store: DocumentStore,
  env: NodeJS.ProcessEnv = process.env,
) {
  const prepared = await db.transaction(async (tx) => {
    const agreement = await scopedAgreement(tx, actor, input.liveAgreementId);
    const snapshot = await freezeSnapshot(tx, agreement);
    if (!snapshot.ok || !snapshot.value) {
      throw new Error(snapshot.errors[0] ?? "SCALE_UNFROZEN");
    }
    const frozen = {
      templateVersion: snapshot.value.templateVersion,
      templateLegalStatus: snapshot.value.templateLegalStatus,
      contract: snapshot.value.contract,
      scale: snapshot.value.scale,
      schedule: snapshot.value.schedule,
      clauses: snapshot.value.clauses,
      collectionLines: snapshot.value.collectionLines,
      facts: snapshot.value.facts,
      label: snapshot.value.label,
    };
    const documentId = randomUUID();
    const created = actorMeta(actor);
    let building: typeof agreementDocuments.$inferSelect | undefined;
    let version = 0;
    let objectKey = "";
    for (let attempt = 0; attempt < 5; attempt += 1) {
      version = await nextVersion(tx, agreement.id);
      objectKey = agreementObjectKey({
        appEnv: appEnv(env),
        customerId: agreement.customerId,
        liveAgreementId: agreement.id,
        version,
        documentId,
      });
      try {
        [building] = await tx
          .insert(agreementDocuments)
          .values({
            id: documentId,
            liveAgreementId: agreement.id,
            customerId: agreement.customerId,
            version,
            supersedesDocumentId: await latestStoredId(tx, agreement.id),
            templateVersion: snapshot.value.templateVersion,
            status: "building",
            snapshot: frozen,
            snapshotHash: snapshotHash(frozen),
            createdByKind: created.createdByKind,
            createdById: created.createdById,
          })
          .returning();
        break;
      } catch (error) {
        if (uniqueConstraint(error) !== "agreement_documents_live_version_uidx") throw error;
      }
    }
    if (!building) throw new Error("DOCUMENT_VERSION_CONFLICT");
    return { agreement, snapshot, building, objectKey, documentId };
  });
  const { snapshot, building, objectKey, documentId } = prepared;

  try {
    const pdf = await renderAgreementSnapshotPdf(snapshot.value);
    if (!pdf.ok || !pdf.bytes) {
      throw new Error(pdf.errors[0] ?? "CONTRACT_PDF_FAILED");
    }
    const checksum = sha256Hex(pdf.bytes);
    await db
      .update(agreementDocuments)
      .set({ objectKey, checksum, bytes: pdf.bytes.byteLength })
      .where(and(eq(agreementDocuments.id, documentId), eq(agreementDocuments.status, "building")));
    try {
      await store.putIfAbsent(objectKey, pdf.bytes, checksum);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "OBJECT_EXISTS") throw error;
      const existing = await store.get(objectKey);
      if (sha256Hex(existing) !== checksum || existing.byteLength !== pdf.bytes.byteLength) {
        throw new Error("OBJECT_EXISTS");
      }
    }
    const [stored] = await db
      .update(agreementDocuments)
      .set({
        status: "stored",
        objectKey,
        checksum,
        bytes: pdf.bytes.byteLength,
        storedAt: new Date(),
        failureCode: null,
      })
      .where(and(eq(agreementDocuments.id, documentId), eq(agreementDocuments.status, "building")))
      .returning();
    return stored ?? building;
  } catch (error) {
    const [current] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.id, documentId)).limit(1);
    if (current) {
      const recovered = await reconcileBuilding(db, store, current);
      if (recovered.status === "stored") return recovered;
    }
    const failureCode = error instanceof Error ? error.message : "DOCUMENT_BUILD_FAILED";
    const [failed] = await db
      .update(agreementDocuments)
      .set({ status: "failed", failureCode: failureCode.slice(0, 80), objectKey })
      .where(and(eq(agreementDocuments.id, documentId), eq(agreementDocuments.status, "building")))
      .returning();
    throw new Error(failed?.failureCode ?? failureCode);
  }
}

export async function listAgreementDocuments(
  db: Database,
  actor: Actor,
  filter: { liveAgreementId?: string; customerId?: string } = {},
) {
  const clauses = [];
  if (actor.role === "collector") {
    clauses.push(eq(agreementDocuments.customerId, actor.customerId));
  } else if (filter.customerId) {
    clauses.push(eq(agreementDocuments.customerId, filter.customerId));
  }
  if (filter.liveAgreementId) {
    clauses.push(eq(agreementDocuments.liveAgreementId, filter.liveAgreementId));
  }
  const query = db.select().from(agreementDocuments);
  const rows = clauses.length
    ? await query.where(and(...clauses)).orderBy(desc(agreementDocuments.version))
    : await query.orderBy(desc(agreementDocuments.version));
  return rows;
}

export async function mintAgreementDocumentUrl(
  db: Database,
  actor: Actor,
  input: { documentId: string },
  store: DocumentStore,
) {
  const row = await scopedDocument(db, actor, input.documentId);
  const reconciled = await reconcileBuilding(db, store, row);
  if (reconciled.status !== "stored" || !reconciled.objectKey || !reconciled.checksum || reconciled.bytes == null) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const bytes = await store.get(reconciled.objectKey);
  if (sha256Hex(bytes) !== reconciled.checksum || bytes.byteLength !== reconciled.bytes) {
    throw new Error("DOCUMENT_UNAVAILABLE");
  }
  const minted = await store.presignGet(reconciled.objectKey, 300);
  return { url: minted.url, expiresAt: minted.expiresAt };
}

export async function listAgreementDocumentSends(
  db: QueryDb,
  actor: Actor,
  filter: { liveAgreementId?: string; documentId?: string } = {},
) {
  if (actor.role === "collector") return [];
  const docs = await listAgreementDocuments(db as Database, actor, {
    liveAgreementId: filter.liveAgreementId,
  });
  const ids = docs.map((row) => row.id).filter((id) => !filter.documentId || id === filter.documentId);
  if (!ids.length) return [];
  return db
    .select({
      id: agreementDocumentSends.id,
      documentId: agreementDocumentSends.documentId,
      actorKind: agreementDocumentSends.actorKind,
      recipientKind: agreementDocumentSends.recipientKind,
      result: agreementDocumentSends.result,
      createdAt: agreementDocumentSends.createdAt,
    })
    .from(agreementDocumentSends)
    .where(inArray(agreementDocumentSends.documentId, ids))
    .orderBy(desc(agreementDocumentSends.createdAt));
}

async function countRecentSends(
  db: QueryDb,
  where: ReturnType<typeof and>,
  now: Date,
) {
  const cutoff = new Date(now.getTime() - SEND_WINDOW_MS);
  const rows = await db
    .select({ id: agreementDocumentSends.id })
    .from(agreementDocumentSends)
    .where(and(where, gte(agreementDocumentSends.createdAt, cutoff)));
  return rows.length;
}

export async function sendAgreementDocument(
  db: Database,
  actor: Actor,
  input: {
    documentId: string;
    recipientKind?: string;
    address?: string;
    confirmAddress?: string;
  },
  store: DocumentStore,
  options: {
    env?: NodeJS.ProcessEnv;
    sendEmail?: (message: Record<string, unknown>) => Promise<{ data: { id?: string } | null; error: unknown }>;
    now?: Date;
  } = {},
) {
  if (actor.role !== "collector") throw new Error("DOCUMENT_NOT_FOUND");
  const row = await scopedDocument(db, actor, input.documentId);
  const reconciled = await reconcileBuilding(db, store, row);
  if (reconciled.status !== "stored" || !reconciled.objectKey || !reconciled.checksum || reconciled.bytes == null) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const bytes = await store.get(reconciled.objectKey);
  if (sha256Hex(bytes) !== reconciled.checksum || bytes.byteLength !== reconciled.bytes) {
    throw new Error("DOCUMENT_UNAVAILABLE");
  }
  const recipient = resolveSendRecipient(actor, input);
  const now = options.now ?? new Date();
  const recentDocument = await countRecentSends(db, eq(agreementDocumentSends.documentId, reconciled.id), now);
  const recentActor = await countRecentSends(db, eq(agreementDocumentSends.actorId, actor.customerId), now);
  if (recentDocument >= SENDS_PER_HOUR || recentActor >= SENDS_PER_HOUR) {
    throw new Error("DOCUMENT_SEND_THROTTLED");
  }
  const sendId = randomUUID();
  await db.insert(agreementDocumentSends).values({
    id: sendId,
    documentId: reconciled.id,
    actorKind: "collector",
    actorId: actor.customerId,
    recipientEmail: recipient.recipientEmail,
    recipientKind: recipient.recipientKind,
    confirmedAt: recipient.recipientKind === "other" ? now : null,
    result: "sending",
  });
  const mail = composeAgreementDocumentMail({
    agreementCode: String((reconciled.snapshot as { contract?: { agreementCode?: string } } | null)?.contract?.agreementCode ?? ""),
    recipientEmail: recipient.recipientEmail,
  });
  try {
    const delivered = await dispatchAgreementDocumentMail(
      { ...mail, bytes },
      { env: options.env ?? process.env, sendEmail: options.sendEmail },
    );
    const result = "accepted";
    await db
      .update(agreementDocumentSends)
      .set({ result, providerMessageId: delivered.id })
      .where(eq(agreementDocumentSends.id, sendId));
    return { id: sendId, result, recipientKind: recipient.recipientKind };
  } catch (error) {
    const failureCode = error instanceof Error ? error.message : "DOCUMENT_SEND_FAILED";
    const result = failureCode === "DOCUMENT_SEND_TIMEOUT" ? "timeout" : "failed";
    await db
      .update(agreementDocumentSends)
      .set({ result, failureCode: failureCode.slice(0, 80) })
      .where(eq(agreementDocumentSends.id, sendId));
    throw new Error(failureCode);
  }
}
