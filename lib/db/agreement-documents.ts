import { createHash, randomUUID } from "node:crypto";
import { type SQL, and, desc, eq, gte, inArray, max } from "drizzle-orm";
import {
  SENDS_PER_HOUR,
  SEND_WINDOW_MS,
  composeAgreementDocumentMail,
  composeExecutedDocumentMail,
  dispatchAgreementDocumentMail,
  resolveSendRecipient,
} from "@/lib/agreement-document-mail.mjs";
import { buildAgreementSnapshot, INSPECTION_CONDITION, renderAgreementSnapshotPdf } from "@/lib/contract/repo-agreement-snapshot.mjs";
import {
  captureOperationalError,
  captureOperationalErrorOnce,
} from "@/lib/observability.mjs";
import { agreementObjectKey } from "@/lib/storage/agreement-object-key.mjs";
import { sha256Hex } from "@/lib/storage/object-store.mjs";
import { DEFAULT_SETTINGS } from "@/lib/theme";
import type { Database } from "./client";
import { centsToDollars } from "./money.mjs";
import type { Actor } from "./records";
import { isRetailActor } from "./records";
import { agreementDocumentSends, agreementDocuments, agreementSignatures, deskSettings, liveAgreementMembers, liveAgreements, timepieces } from "./schema";

type QueryDb = Pick<Database, "select" | "insert" | "update">;

export type DocumentStore = {
  putIfAbsent: (key: string, body: Uint8Array, checksum: string) => Promise<void>;
  head: (key: string) => Promise<boolean>;
  get: (key: string) => Promise<Uint8Array>;
  presignGet: (key: string, expiresSeconds?: number) => Promise<{ url: string; expiresAt: string }>;
};

export type DocumentRow = typeof agreementDocuments.$inferSelect;
type LiveAgreementRow = typeof liveAgreements.$inferSelect;

/** Which step of a request a PDF records (KTD11). `legacy` is the Stage 4 path. */
export type DocumentStage = "proposal" | "collector_signed" | "executed";

export async function deskBrandPreset(db: QueryDb) {
  const [row] = await db
    .select({ brandPreset: deskSettings.brandPreset })
    .from(deskSettings)
    .where(eq(deskSettings.id, "default"))
    .limit(1);
  return row?.brandPreset === "mbf" ? "mbf" : "mac";
}

type FrozenSnapshot = NonNullable<ReturnType<typeof buildAgreementSnapshot>["value"]>;

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
  if (isRetailActor(actor)) {
    return { createdByKind: "collector", createdById: actor.customerId };
  }
  return { createdByKind: "desk", createdById: actor.email };
}

/**
 * The subset of a built snapshot a document row stores. `text` rides along so
 * the stored record itself carries every sentence the reader was shown (R44),
 * not only the parts the renderer recomputes from.
 */
function frozenFields(value: FrozenSnapshot) {
  return {
    templateVersion: value.templateVersion,
    templateLegalStatus: value.templateLegalStatus,
    contract: value.contract,
    scale: value.scale,
    schedule: value.schedule,
    clauses: value.clauses,
    collectionLines: value.collectionLines,
    facts: value.facts,
    label: value.label,
    text: value.text,
    signatures: value.signatures ?? [],
  };
}

function failureCodeOf(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : fallback;
  const monitorCode = /^[A-Z0-9_]{1,80}$/.test(message) ? message : fallback;
  return { failureCode: monitorCode, monitorCode };
}

function appEnv(env: NodeJS.ProcessEnv) {
  const value = String(env.APP_ENV ?? "development").trim();
  return value === "staging" || value === "production" ? value : "development";
}

async function scopedAgreement(db: QueryDb, actor: Actor, liveAgreementId: string) {
  const where = isRetailActor(actor)
    ? and(eq(liveAgreements.id, liveAgreementId), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, liveAgreementId);
  const [row] = await db.select().from(liveAgreements).where(where).limit(1);
  if (!row) throw new Error("DOCUMENT_NOT_FOUND");
  return row;
}

async function scopedDocument(db: QueryDb, actor: Actor, documentId: string) {
  const where = isRetailActor(actor)
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
    await captureOperationalErrorOnce(
      new Error("DOCUMENT_CHECKSUM_MISMATCH"),
      {
        operation: "agreement_document.reconcile",
        errorCode: "DOCUMENT_CHECKSUM_MISMATCH",
        recordId: row.id,
      },
    );
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

/**
 * Every member of the agreement, whatever its status: a request's pieces are
 * `reserved`, an executed repo's are `live`, and the document names them all.
 */
async function freezeSnapshot(db: QueryDb, agreement: LiveAgreementRow, stage: DocumentStage = "proposal") {
  const pieces = await livePieces(db, agreement.id);
  const signatureRows = stage === "proposal"
    ? []
    : await db
      .select()
      .from(agreementSignatures)
      .where(and(
        eq(agreementSignatures.agreementId, agreement.id),
        eq(agreementSignatures.version, agreement.version ?? 1),
      ));
  return buildAgreementSnapshot({
    sellerName: agreement.ownerName,
    sellerEmail: agreement.email,
    saleAmount: centsToDollars(agreement.amountCents),
    termMonths: agreement.termMonths,
    startDate: agreement.createdOn,
    delivery: agreement.delivery,
    agreementCode: agreement.agreementCode ?? "",
    scale: agreement.scale,
    stage,
    signatures: signatureRows.map((row) => ({
      party: row.party,
      typedName: row.typedName,
      signedAt: row.signedAt instanceof Date ? row.signedAt.toISOString() : String(row.signedAt),
      snapshotHash: row.snapshotHash,
    })),
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
    const frozen = frozenFields(snapshot.value);
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
    const pdf = await renderAgreementSnapshotPdf(snapshot.value, {
      brandPreset: await deskBrandPreset(db),
    });
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
    const { failureCode, monitorCode } = failureCodeOf(error, "DOCUMENT_BUILD_FAILED");
    await captureOperationalErrorOnce(
      error,
      {
        operation: "agreement_document.build",
        errorCode: monitorCode,
        recordId: documentId,
      },
    );
    const [failed] = await db
      .update(agreementDocuments)
      .set({ status: "failed", failureCode, objectKey })
      .where(and(eq(agreementDocuments.id, documentId), eq(agreementDocuments.status, "building")))
      .returning();
    throw new Error(failed?.failureCode ?? failureCode);
  }
}

/**
 * Freeze a request's snapshot and insert its `building` row inside the
 * caller's transaction (KTD11, KTD27). The bytes are rendered after commit by
 * `renderStageDocument`; the object key is fixed here so the two agree.
 *
 * No retry loop: `agreement_documents_stage_uidx` allows one usable document
 * per (agreement, version, stage), and a second insert is a real conflict.
 */
export async function insertStageDocumentRow(
  tx: QueryDb,
  agreement: LiveAgreementRow,
  stage: DocumentStage,
  actor: Actor,
  env: NodeJS.ProcessEnv = process.env,
) {
  const snapshot = await freezeSnapshot(tx, agreement, stage);
  if (!snapshot.ok || !snapshot.value) {
    throw new Error(snapshot.errors[0] ?? "SCALE_UNFROZEN");
  }
  return insertStageRowFromSnapshot(tx, agreement, stage, frozenFields(snapshot.value), actorMeta(actor), env);
}

async function insertStageRowFromSnapshot(
  tx: QueryDb,
  agreement: LiveAgreementRow,
  stage: DocumentStage,
  frozen: ReturnType<typeof frozenFields>,
  created: ReturnType<typeof actorMeta>,
  env: NodeJS.ProcessEnv,
  // A retry of a failed row re-uses the frozen snapshot as stored; jsonb does
  // not preserve key order, so the hash must travel with it rather than be
  // recomputed from the round-tripped object.
  hash = snapshotHash(frozen),
) {
  const documentId = randomUUID();
  const objectKey = agreementObjectKey({
    appEnv: appEnv(env),
    customerId: agreement.customerId,
    liveAgreementId: agreement.id,
    version: agreement.version,
    documentId,
  });
  try {
    const [row] = await tx
      .insert(agreementDocuments)
      .values({
        id: documentId,
        liveAgreementId: agreement.id,
        customerId: agreement.customerId,
        version: agreement.version,
        supersedesDocumentId: await latestStoredId(tx, agreement.id),
        templateVersion: frozen.templateVersion,
        status: "building",
        stage,
        snapshot: frozen,
        snapshotHash: hash,
        objectKey,
        createdByKind: created.createdByKind,
        createdById: created.createdById,
      })
      .returning();
    return row;
  } catch (error) {
    if (uniqueConstraint(error) === "agreement_documents_stage_uidx") {
      throw new Error("DOCUMENT_VERSION_CONFLICT");
    }
    throw error;
  }
}

/**
 * Render a `building` stage row into its object and mark it `stored`.
 * Idempotent: a row that is no longer building is returned untouched, and a
 * put that finds the object already there is accepted when the bytes match.
 * Runs as an after-commit job, so it records a failure instead of throwing.
 */
export async function renderStageDocument(
  db: Database,
  documentId: string,
  store: DocumentStore | undefined,
  env: NodeJS.ProcessEnv = process.env,
): Promise<DocumentRow | null> {
  let row: DocumentRow | undefined;
  try {
    [row] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.id, documentId)).limit(1);
  } catch (error) {
    await captureOperationalErrorOnce(error, {
      operation: "agreement_document.render",
      errorCode: "DOCUMENT_BUILD_FAILED",
      recordId: documentId,
    }).catch(() => undefined);
    return null;
  }
  if (!row) return null;
  if (row.status !== "building") return row;
  const objectKey = row.objectKey ?? agreementObjectKey({
    appEnv: appEnv(env),
    customerId: row.customerId,
    liveAgreementId: row.liveAgreementId,
    version: row.version,
    documentId: row.id,
  });
  try {
    if (!store) throw new Error("DOCUMENT_STORE_UNAVAILABLE");
    const pdf = await renderAgreementSnapshotPdf({
      ...(row.snapshot as FrozenSnapshot),
      snapshotHash: row.snapshotHash,
    }, { brandPreset: await deskBrandPreset(db) });
    if (!pdf.ok || !pdf.bytes) {
      throw new Error(pdf.errors[0] ?? "CONTRACT_PDF_FAILED");
    }
    const checksum = sha256Hex(pdf.bytes);
    try {
      await store.putIfAbsent(objectKey, pdf.bytes, checksum);
    } catch (error) {
      if (!(error instanceof Error) || error.message !== "OBJECT_EXISTS") throw error;
      const existing = await store.get(objectKey);
      if (sha256Hex(existing) !== checksum || existing.byteLength !== pdf.bytes.byteLength) {
        // A matching sibling already stored this row. A mismatched object at
        // the same key is not our PDF — fail so render-on-read can replace it.
        const [current] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.id, row.id)).limit(1);
        if (current && current.status !== "building") return current;
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
      .where(and(eq(agreementDocuments.id, row.id), eq(agreementDocuments.status, "building")))
      .returning();
    if (stored) return stored;
    const [current] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.id, row.id)).limit(1);
    return current ?? row;
  } catch (error) {
    const { failureCode, monitorCode } = failureCodeOf(error, "DOCUMENT_BUILD_FAILED");
    try {
      await captureOperationalErrorOnce(
        error,
        {
          operation: "agreement_document.render",
          errorCode: monitorCode,
          recordId: row.id,
        },
      );
      const [failed] = await db
        .update(agreementDocuments)
        .set({ status: "failed", failureCode, objectKey })
        .where(and(eq(agreementDocuments.id, row.id), eq(agreementDocuments.status, "building")))
        .returning();
      return failed ?? row;
    } catch {
      return row;
    }
  }
}

function stageKey(row: DocumentRow) {
  return `${row.liveAgreementId}\u0000${row.version}\u0000${row.stage}`;
}

/** Fresh rows for one (agreement, version, stage) after a failed render. */
const STAGE_RENDER_REATTEMPTS = 3;

function failedCountFor(rows: DocumentRow[], key: string) {
  return rows.filter((row) => row.status === "failed" && stageKey(row) === key).length;
}

/**
 * Render on read (KTD27). A stage row still `building` is rendered now; a
 * `failed` one with no usable sibling gets a fresh `building` row for the same
 * (agreement, version, stage) — the partial unique index admits it because
 * failed rows are excluded — and that row is rendered. After three failed
 * rows for that key, reads stop inserting and mint surfaces
 * `DOCUMENT_UNAVAILABLE`. Legacy rows keep their own reconcile path. Without
 * a store there is nothing to render into, so the rows are returned as they
 * are rather than flipped to failed.
 */
async function renderStageDocumentsOnRead(
  db: Database,
  rows: DocumentRow[],
  store: DocumentStore | undefined,
  env: NodeJS.ProcessEnv,
) {
  if (!store) return { rows, changed: false };
  const usable = new Set(
    rows.filter((row) => row.stage !== "legacy" && row.status !== "failed").map(stageKey),
  );
  let changed = false;
  const reattempted = new Set<string>();
  for (const row of rows) {
    if (row.stage === "legacy") continue;
    if (row.status === "building") {
      await renderStageDocument(db, row.id, store, env);
      changed = true;
      continue;
    }
    const key = stageKey(row);
    if (row.status !== "failed" || usable.has(key) || reattempted.has(key)) continue;
    if (failedCountFor(rows, key) >= STAGE_RENDER_REATTEMPTS) continue;
    reattempted.add(key);
    const [agreement] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, row.liveAgreementId)).limit(1);
    if (!agreement) continue;
    let fresh: DocumentRow | undefined;
    try {
      fresh = await insertStageRowFromSnapshot(
        db,
        { ...agreement, version: row.version },
        row.stage as DocumentStage,
        row.snapshot as ReturnType<typeof frozenFields>,
        { createdByKind: row.createdByKind, createdById: row.createdById },
        env,
        row.snapshotHash,
      );
    } catch (error) {
      // A concurrent reader inserted the fresh row first; the re-read picks it up.
      if (!(error instanceof Error) || error.message !== "DOCUMENT_VERSION_CONFLICT") throw error;
    }
    if (fresh) await renderStageDocument(db, fresh.id, store, env);
    changed = true;
  }
  return { rows, changed };
}

export async function listAgreementDocuments(
  db: Database,
  actor: Actor,
  filter: { liveAgreementId?: string; customerId?: string } = {},
  store?: DocumentStore,
  env: NodeJS.ProcessEnv = process.env,
) {
  const clauses: SQL[] = [];
  if (isRetailActor(actor)) {
    clauses.push(eq(agreementDocuments.customerId, actor.customerId));
  } else if (filter.customerId) {
    clauses.push(eq(agreementDocuments.customerId, filter.customerId));
  }
  if (filter.liveAgreementId) {
    clauses.push(eq(agreementDocuments.liveAgreementId, filter.liveAgreementId));
  }
  const query = () => {
    const base = db.select().from(agreementDocuments);
    return clauses.length
      ? base.where(and(...clauses)).orderBy(desc(agreementDocuments.version), desc(agreementDocuments.createdAt))
      : base.orderBy(desc(agreementDocuments.version), desc(agreementDocuments.createdAt));
  };
  const rows = await query();
  const rendered = await renderStageDocumentsOnRead(db, rows, store, env);
  return rendered.changed ? query() : rows;
}

/**
 * The current version's stage row, rendered now when it is still building or
 * failed (KTD11). Sign and MAC execute call this before they bind a signature.
 */
export async function recoverCurrentStageDocument(
  db: Database,
  liveAgreementId: string,
  version: number,
  stage: DocumentStage,
  store: DocumentStore | undefined,
  env: NodeJS.ProcessEnv = process.env,
) {
  const rows = await db
    .select()
    .from(agreementDocuments)
    .where(
      and(
        eq(agreementDocuments.liveAgreementId, liveAgreementId),
        eq(agreementDocuments.version, version),
        eq(agreementDocuments.stage, stage),
      ),
    )
    .orderBy(desc(agreementDocuments.createdAt));
  const stored = rows.find((row) => row.status === "stored");
  if (stored) return stored;
  const latest = rows[0];
  if (!latest || !store) throw new Error("DOCUMENT_NOT_READY");
  const recovered = await readyStageDocument(db, latest, store, env);
  if (recovered.status !== "stored") throw new Error("DOCUMENT_NOT_READY");
  return recovered;
}

/** A stage row a reader asked for, rendered now if it still owes its object. */
async function readyStageDocument(
  db: Database,
  row: DocumentRow,
  store: DocumentStore,
  env: NodeJS.ProcessEnv,
) {
  if (row.stage === "legacy") return row;
  if (row.status === "building") return (await renderStageDocument(db, row.id, store, env)) ?? row;
  if (row.status !== "failed") return row;
  const siblings = await db
    .select()
    .from(agreementDocuments)
    .where(
      and(
        eq(agreementDocuments.liveAgreementId, row.liveAgreementId),
        eq(agreementDocuments.version, row.version),
        eq(agreementDocuments.stage, row.stage),
      ),
    )
    .orderBy(desc(agreementDocuments.createdAt));
  await renderStageDocumentsOnRead(db, siblings, store, env);
  const latestSiblings = await db
    .select()
    .from(agreementDocuments)
    .where(
      and(
        eq(agreementDocuments.liveAgreementId, row.liveAgreementId),
        eq(agreementDocuments.version, row.version),
        eq(agreementDocuments.stage, row.stage),
      ),
    )
    .orderBy(desc(agreementDocuments.createdAt));
  const stored = latestSiblings.find((sibling) => sibling.status === "stored");
  if (stored) return stored;
  if (failedCountFor(latestSiblings, stageKey(row)) >= STAGE_RENDER_REATTEMPTS) {
    throw new Error("DOCUMENT_UNAVAILABLE");
  }
  return latestSiblings[0] ?? row;
}

export async function mintAgreementDocumentUrl(
  db: Database,
  actor: Actor,
  input: { documentId: string },
  store: DocumentStore,
  env: NodeJS.ProcessEnv = process.env,
) {
  const row = await readyStageDocument(db, await scopedDocument(db, actor, input.documentId), store, env);
  const reconciled = await reconcileBuilding(db, store, row);
  if (reconciled.status !== "stored" || !reconciled.objectKey || !reconciled.checksum || reconciled.bytes == null) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const bytes = await store.get(reconciled.objectKey);
  if (sha256Hex(bytes) !== reconciled.checksum || bytes.byteLength !== reconciled.bytes) {
    await captureOperationalErrorOnce(
      new Error("DOCUMENT_CHECKSUM_MISMATCH"),
      {
        operation: "agreement_document.download",
        errorCode: "DOCUMENT_CHECKSUM_MISMATCH",
        recordId: reconciled.id,
      },
    );
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
  if (isRetailActor(actor)) return [];
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

type ExecutedSendEmail = (message: {
  from: string;
  to: string[];
  replyTo: string;
  subject: string;
  html: string;
  text: string;
  tags: { name: string; value: string }[];
}, options?: { idempotencyKey?: string }) => Promise<{ data: { id?: string } | null; error: unknown }>;

type ExecutedSendOptions = {
  env?: NodeJS.ProcessEnv;
  sendEmail?: ExecutedSendEmail;
  deskEmail?: string;
  requirePending?: boolean;
};

/**
 * One system send per executed document and recipient (KTD23). Collector
 * throttle does not apply. A checksum mismatch records the failure and
 * attaches nothing (AE8).
 */
export async function sendExecutedDocumentEmails(
  db: Database,
  documentId: string,
  store: DocumentStore | undefined,
  options: ExecutedSendOptions = {},
) {
  const [row] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.id, documentId)).limit(1);
  if (!row || row.stage !== "executed") return [];
  const [agreement] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, row.liveAgreementId)).limit(1);
  if (!agreement) return [];
  const recipients = [
    { recipientKind: "retail", recipientEmail: agreement.email },
    { recipientKind: "desk", recipientEmail: options.deskEmail ?? DEFAULT_SETTINGS.financingEmail },
  ];
  const results = [];
  let pending = 0;
  for (const recipient of recipients) {
    const [existing] = await db
      .select()
      .from(agreementDocumentSends)
      .where(and(
        eq(agreementDocumentSends.documentId, row.id),
        eq(agreementDocumentSends.recipientKind, recipient.recipientKind),
        eq(agreementDocumentSends.actorKind, "system"),
      ))
      .limit(1);
    if (existing?.result === "accepted") {
      results.push(existing);
      continue;
    }
    pending += 1;
    results.push(await sendSystemExecutedOnce(db, row, agreement, store, recipient, options));
  }
  if (options.requirePending && pending === 0) throw new Error("DOCUMENT_ALREADY_SENT");
  return results;
}

async function sendSystemExecutedOnce(
  db: Database,
  row: DocumentRow,
  agreement: LiveAgreementRow,
  store: DocumentStore | undefined,
  recipient: { recipientKind: string; recipientEmail: string },
  options: ExecutedSendOptions,
) {
  const [existing] = await db
    .select()
    .from(agreementDocumentSends)
    .where(and(
      eq(agreementDocumentSends.documentId, row.id),
      eq(agreementDocumentSends.recipientKind, recipient.recipientKind),
      eq(agreementDocumentSends.actorKind, "system"),
    ))
    .limit(1);
  if (existing?.result === "accepted") {
    return existing;
  }

  let failureCode: string | null = null;
  let bytes: Uint8Array | null = null;
  if (!store || row.status !== "stored" || !row.objectKey || !row.checksum || row.bytes == null) {
    failureCode = "DOCUMENT_NOT_STORED";
  } else {
    const body = await store.get(row.objectKey);
    if (sha256Hex(body) !== row.checksum || body.byteLength !== row.bytes) {
      await captureOperationalErrorOnce(
        new Error("DOCUMENT_CHECKSUM_MISMATCH"),
        {
          operation: "agreement_document.send_executed",
          errorCode: "DOCUMENT_CHECKSUM_MISMATCH",
          recordId: row.id,
        },
      );
      failureCode = "DOCUMENT_CHECKSUM_MISMATCH";
    } else {
      bytes = body;
    }
  }

  const sendId = existing?.id ?? randomUUID();
  if (!existing) {
    try {
      await db.insert(agreementDocumentSends).values({
        id: sendId,
        documentId: row.id,
        actorKind: "system",
        actorId: "system",
        recipientEmail: recipient.recipientEmail,
        recipientKind: recipient.recipientKind,
        result: "sending",
      });
    } catch (error) {
      if (uniqueConstraint(error) !== "agreement_document_sends_system_uidx") throw error;
      const [raced] = await db
        .select()
        .from(agreementDocumentSends)
        .where(and(
          eq(agreementDocumentSends.documentId, row.id),
          eq(agreementDocumentSends.recipientKind, recipient.recipientKind),
          eq(agreementDocumentSends.actorKind, "system"),
        ))
        .limit(1);
      if (raced?.result === "accepted") {
        return raced;
      }
      if (!raced) throw error;
      return sendSystemExecutedOnce(db, row, agreement, store, recipient, options);
    }
  } else {
    await db.update(agreementDocumentSends).set({ result: "sending", failureCode: null }).where(eq(agreementDocumentSends.id, sendId));
  }

  if (failureCode || !bytes) {
    const [failed] = await db
      .update(agreementDocumentSends)
      .set({ result: "failed", failureCode: failureCode ?? "DOCUMENT_NOT_STORED" })
      .where(eq(agreementDocumentSends.id, sendId))
      .returning();
    return failed;
  }

  const mail = composeExecutedDocumentMail({
    agreementCode: agreement.agreementCode ?? String(
      (row.snapshot as { contract?: { agreementCode?: string } } | null)?.contract?.agreementCode ?? "",
    ),
    recipientEmail: recipient.recipientEmail,
    inspectionCondition: INSPECTION_CONDITION,
  });
  try {
    const delivered = await dispatchAgreementDocumentMail(
      { ...mail, bytes },
      {
        env: options.env ?? process.env,
        sendEmail: options.sendEmail as ((message: Record<string, unknown>) => Promise<{
          data: { id?: string } | null;
          error: unknown;
        }>) | undefined,
      },
    );
    const [accepted] = await db
      .update(agreementDocumentSends)
      .set({ result: "accepted", providerMessageId: delivered.id, failureCode: null })
      .where(eq(agreementDocumentSends.id, sendId))
      .returning();
    return accepted;
  } catch (error) {
    const code = error instanceof Error ? error.message : "DOCUMENT_SEND_FAILED";
    const [failed] = await db
      .update(agreementDocumentSends)
      .set({ result: "failed", failureCode: code.slice(0, 80) })
      .where(eq(agreementDocumentSends.id, sendId))
      .returning();
    await captureOperationalError(error, {
      operation: "agreement_document.send_executed",
      errorCode: "DOCUMENT_SEND_FAILED",
      recordId: sendId,
    });
    return failed;
  }
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
  if (!isRetailActor(actor)) throw new Error("DOCUMENT_NOT_FOUND");
  const row = await scopedDocument(db, actor, input.documentId);
  const reconciled = await reconcileBuilding(db, store, row);
  if (reconciled.status !== "stored" || !reconciled.objectKey || !reconciled.checksum || reconciled.bytes == null) {
    throw new Error("DOCUMENT_NOT_FOUND");
  }
  const bytes = await store.get(reconciled.objectKey);
  if (sha256Hex(bytes) !== reconciled.checksum || bytes.byteLength !== reconciled.bytes) {
    await captureOperationalErrorOnce(
      new Error("DOCUMENT_CHECKSUM_MISMATCH"),
      {
        operation: "agreement_document.send",
        errorCode: "DOCUMENT_CHECKSUM_MISMATCH",
        recordId: reconciled.id,
      },
    );
    throw new Error("DOCUMENT_UNAVAILABLE");
  }
  const recipient = resolveSendRecipient(actor, input);
  const now = options.now ?? new Date();
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
  const recentDocument = await countRecentSends(db, eq(agreementDocumentSends.documentId, reconciled.id), now);
  const recentActor = await countRecentSends(db, eq(agreementDocumentSends.actorId, actor.customerId), now);
  if (recentDocument > SENDS_PER_HOUR || recentActor > SENDS_PER_HOUR) {
    await db
      .update(agreementDocumentSends)
      .set({ result: "throttled", failureCode: "DOCUMENT_SEND_THROTTLED" })
      .where(eq(agreementDocumentSends.id, sendId));
    throw new Error("DOCUMENT_SEND_THROTTLED");
  }
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
    await captureOperationalError(
      error,
      {
        operation: "agreement_document.send",
        errorCode: result === "timeout" ? "DOCUMENT_SEND_TIMEOUT" : "DOCUMENT_SEND_FAILED",
        recordId: sendId,
      },
    );
    throw new Error(failureCode);
  }
}
