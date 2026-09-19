import { randomUUID } from "node:crypto";
import { and, eq, isNotNull, lt, ne } from "drizzle-orm";
import { captureOperationalErrorOnce } from "../observability.mjs";
import { photoObjectKeys } from "../storage/photo-object-key.mjs";
import { REQUESTABLE_PHOTO_KINDS } from "../timepiece-shots.mjs";
import {
  assertAppraisalPhotoChangeAllowed,
  assertRetailPieceEditable,
} from "./appraisal-attempts";
import type { Database } from "./client";
import type { Actor } from "./records";
import {
  appraisalAttempts,
  livePreviews,
  photoObjects,
  timepieces,
} from "./schema";

type ObjectStore = {
  presignPut: (
    key: string,
    options: { contentLength: number; contentType: string; sha256: string; expiresSeconds?: number },
  ) => Promise<{ url: string; expiresAt: string; headers: Record<string, string> }>;
  presignGet: (key: string, expiresSeconds?: number) => Promise<{ url: string; expiresAt: string }>;
  headMetadata: (key: string) => Promise<{ bytes: number; sha256: string | null } | null>;
};

type UploadPart = {
  size: number;
  type: string;
  sha256: string;
};

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type RequestPhotoUploadInput = {
  timepieceId: string;
  kind: string;
  original: UploadPart;
  preview: UploadPart;
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/heic"]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/**
 * A photo may only be uploaded for a kind the intake screen has a slot for.
 * That is what bounds a timepiece to seven photographs (R7): seven slots, one
 * current photo each. A kind with no slot could never be supplied or replaced.
 */
const ALLOWED_KINDS = new Set(REQUESTABLE_PHOTO_KINDS);

function appEnv(env: NodeJS.ProcessEnv) {
  const value = String(env.APP_ENV ?? "development").trim();
  return value === "staging" || value === "production" ? value : "development";
}

function validatePart(part: UploadPart) {
  if (
    !Number.isInteger(part.size)
    || part.size <= 0
    || part.size > MAX_IMAGE_BYTES
    || !ALLOWED_TYPES.has(part.type)
    || !/^[0-9a-f]{64}$/.test(part.sha256)
  ) {
    throw new Error("PHOTO_UPLOAD_INVALID");
  }
}

function actorPieceWhere(actor: Actor, timepieceId: string) {
  return actor.role === "collector"
    ? and(eq(timepieces.id, timepieceId), eq(timepieces.customerId, actor.customerId))
    : eq(timepieces.id, timepieceId);
}

function constraintName(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return null;
    if ("constraint" in current && typeof current.constraint === "string") return current.constraint;
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

async function scopedPiece(db: Database, actor: Actor, timepieceId: string) {
  const [piece] = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces)
    .where(actorPieceWhere(actor, timepieceId))
    .limit(1);
  if (!piece) throw new Error("TIMEPIECE_NOT_FOUND");
  return piece;
}

async function scopedPhoto(db: Database, actor: Actor, photoId: string) {
  const where = actor.role === "collector"
    ? and(eq(photoObjects.id, photoId), eq(photoObjects.customerId, actor.customerId))
    : eq(photoObjects.id, photoId);
  const [row] = await db.select().from(photoObjects).where(where).limit(1);
  if (!row) throw new Error("PHOTO_NOT_FOUND");
  return row;
}

async function activePhotoByChecksum(db: Database, timepieceId: string, checksum: string) {
  const [row] = await db
    .select()
    .from(photoObjects)
    .where(
      and(
        eq(photoObjects.timepieceId, timepieceId),
        eq(photoObjects.originalChecksum, checksum),
        ne(photoObjects.status, "abandoned"),
        isNotNull(photoObjects.previewKey),
      ),
    )
    .limit(1);
  return row;
}

async function uploadUrls(store: ObjectStore, row: typeof photoObjects.$inferSelect) {
  if (!row.previewKey || !row.previewChecksum || row.previewBytes == null || !row.previewContentType || !row.contentType) {
    throw new Error("PHOTO_UPLOAD_INVALID");
  }
  const [original, preview] = await Promise.all([
    store.presignPut(row.originalKey, {
      contentLength: row.originalBytes,
      contentType: row.contentType,
      sha256: row.originalChecksum,
      expiresSeconds: 600,
    }),
    store.presignPut(row.previewKey, {
      contentLength: row.previewBytes,
      contentType: row.previewContentType,
      sha256: row.previewChecksum,
      expiresSeconds: 600,
    }),
  ]);
  return { photoId: row.id, status: "pending" as const, original, preview };
}

function matchesUpload(row: typeof photoObjects.$inferSelect, input: RequestPhotoUploadInput) {
  return (
    row.originalBytes === input.original.size
    && row.contentType === input.original.type
    && row.originalChecksum === input.original.sha256
    && row.previewBytes === input.preview.size
    && row.previewContentType === input.preview.type
    && row.previewChecksum === input.preview.sha256
  );
}

function assertMatchingKind(row: typeof photoObjects.$inferSelect, kind: string) {
  if (row.kind !== kind) throw new Error("PHOTO_CHECKSUM_IN_USE");
}

async function lockPhotoPiece(
  tx: Transaction,
  actor: Actor,
  timepieceId: string,
) {
  await lockTimepieceRow(tx, timepieceId);
  if (actor.role === "collector") {
    await assertRetailPieceEditable(tx as unknown as Database, timepieceId);
  }
}

async function lockTimepieceRow(
  tx: Transaction,
  timepieceId: string,
) {
  await tx
    .select({ id: timepieces.id })
    .from(timepieces)
    .where(eq(timepieces.id, timepieceId))
    .for("update")
    .limit(1);
}

async function reuseStoredPhoto(
  db: Database,
  row: typeof photoObjects.$inferSelect,
  actor: Actor,
) {
  await db.transaction(async (tx) => {
    await lockPhotoPiece(tx, actor, row.timepieceId);
    await assertAppraisalPhotoChangeAllowed(
      tx as unknown as Database,
      row.timepieceId,
      row.kind,
      row.id,
    );
    await setCurrentPreview(tx, row);
  });
  return { photoId: row.id, status: "stored" as const };
}

export async function requestPhotoUpload(
  db: Database,
  store: ObjectStore,
  actor: Actor,
  input: RequestPhotoUploadInput,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!ALLOWED_KINDS.has(input.kind)) throw new Error("PHOTO_UPLOAD_INVALID");
  validatePart(input.original);
  validatePart(input.preview);
  const piece = await scopedPiece(db, actor, input.timepieceId);

  const existing = await activePhotoByChecksum(db, piece.id, input.original.sha256);
  if (existing) assertMatchingKind(existing, input.kind);
  if (existing?.status === "stored") {
    return reuseStoredPhoto(db, existing, actor);
  }
  if (existing) {
    if (!matchesUpload(existing, input)) throw new Error("PHOTO_UPLOAD_INVALID");
    const refreshed = await db.transaction(async (tx) => {
      await lockPhotoPiece(tx, actor, existing.timepieceId);
      await assertAppraisalPhotoChangeAllowed(
        tx as unknown as Database,
        existing.timepieceId,
        existing.kind,
        existing.id,
      );
      const [row] = await tx
        .update(photoObjects)
        .set({ receivedAt: new Date() })
        .where(and(eq(photoObjects.id, existing.id), eq(photoObjects.status, "pending")))
        .returning();
      return row;
    });
    if (refreshed) return uploadUrls(store, refreshed);
    const raced = await activePhotoByChecksum(db, piece.id, input.original.sha256);
    if (raced) assertMatchingKind(raced, input.kind);
    if (raced?.status === "stored") return reuseStoredPhoto(db, raced, actor);
    throw new Error("PHOTO_NOT_FOUND");
  }

  const id = randomUUID();
  const keys = photoObjectKeys({ appEnv: appEnv(env), customerId: piece.customerId, photoId: id });

  let row: typeof photoObjects.$inferSelect;
  try {
    row = await db.transaction(async (tx) => {
      await lockPhotoPiece(tx, actor, piece.id);
      await assertAppraisalPhotoChangeAllowed(
        tx as unknown as Database,
        piece.id,
        input.kind,
      );
      if (actor.role === "collector") {
        const [attempt] = await tx
          .select({ id: appraisalAttempts.id })
          .from(appraisalAttempts)
          .where(eq(appraisalAttempts.timepieceId, piece.id))
          .limit(1);
        if (attempt) {
          const [sameKind] = await tx
            .select({ id: photoObjects.id })
            .from(photoObjects)
            .where(
              and(
                eq(photoObjects.timepieceId, piece.id),
                eq(photoObjects.kind, input.kind),
                ne(photoObjects.status, "abandoned"),
              ),
            )
            .limit(1);
          if (sameKind) throw new Error("PHOTO_KIND_TAKEN");
        }
      }
      const [inserted] = await tx
        .insert(photoObjects)
        .values({
          id,
          timepieceId: piece.id,
          customerId: piece.customerId,
          kind: input.kind,
          originalKey: keys.originalKey,
          originalChecksum: input.original.sha256,
          originalBytes: input.original.size,
          contentType: input.original.type,
          previewKey: keys.previewKey,
          previewChecksum: input.preview.sha256,
          previewBytes: input.preview.size,
          previewContentType: input.preview.type,
          status: "pending",
          uploadedBy: actor.email,
        })
        .returning();
      return inserted;
    });
  } catch (error) {
    if (error instanceof Error && ["REVIEW_LOCKED", "PIECE_HELD", "PHOTO_KIND_TAKEN"].includes(error.message)) {
      throw error;
    }
    if (constraintName(error) !== "photo_objects_timepiece_checksum_uidx") throw error;
    const raced = await activePhotoByChecksum(db, piece.id, input.original.sha256);
    if (!raced) throw error;
    assertMatchingKind(raced, input.kind);
    if (raced.status === "stored") {
      return reuseStoredPhoto(db, raced, actor);
    }
    if (!matchesUpload(raced, input)) throw new Error("PHOTO_UPLOAD_INVALID");
    await db.transaction(async (tx) => {
      await lockPhotoPiece(tx, actor, raced.timepieceId);
      await assertAppraisalPhotoChangeAllowed(
        tx as unknown as Database,
        raced.timepieceId,
        raced.kind,
        raced.id,
      );
    });
    row = raced;
  }
  return uploadUrls(store, row);
}

async function matchingMetadata(store: ObjectStore, row: typeof photoObjects.$inferSelect) {
  if (!row.previewKey || !row.previewChecksum || row.previewBytes == null) return { state: "missing" as const };
  const [original, preview] = await Promise.all([
    store.headMetadata(row.originalKey),
    store.headMetadata(row.previewKey),
  ]);
  if (!original || !preview) return { state: "missing" as const };
  if (!original.sha256 || !preview.sha256) return { state: "unverified" as const };
  if (original.bytes !== row.originalBytes || preview.bytes !== row.previewBytes) {
    await captureOperationalErrorOnce(
      new Error("PHOTO_SIZE_MISMATCH"),
      { operation: "photo.confirm", errorCode: "PHOTO_SIZE_MISMATCH", recordId: row.id },
    );
    return { state: "size" as const };
  }
  if (
    original.sha256.toLowerCase() !== row.originalChecksum.toLowerCase()
    || preview.sha256.toLowerCase() !== row.previewChecksum.toLowerCase()
  ) {
    await captureOperationalErrorOnce(
      new Error("PHOTO_CHECKSUM_MISMATCH"),
      { operation: "photo.confirm", errorCode: "PHOTO_CHECKSUM_MISMATCH", recordId: row.id },
    );
    return { state: "checksum" as const };
  }
  return { state: "match" as const };
}

async function setCurrentPreview(
  tx: Transaction,
  row: typeof photoObjects.$inferSelect,
  preserveDifferentCurrent = false,
) {
  await tx
    .select({ id: timepieces.id })
    .from(timepieces)
    .where(eq(timepieces.id, row.timepieceId))
    .for("update")
    .limit(1);
  if (preserveDifferentCurrent) {
    const [current] = await tx
      .select({ id: livePreviews.id })
      .from(livePreviews)
      .where(and(eq(livePreviews.timepieceId, row.timepieceId), eq(livePreviews.kind, row.kind)))
      .limit(1);
    if (current && current.id !== row.id) return;
  }
  await tx.delete(livePreviews).where(and(
    eq(livePreviews.timepieceId, row.timepieceId),
    eq(livePreviews.kind, row.kind),
    ne(livePreviews.id, row.id),
  ));
  await tx.insert(livePreviews).values({
    id: row.id,
    timepieceId: row.timepieceId,
    kind: row.kind,
    previewUrl: null,
    photoObjectId: row.id,
  }).onConflictDoUpdate({
    target: livePreviews.id,
    set: { kind: row.kind, previewUrl: null, photoObjectId: row.id },
  });
}

export async function confirmPhotoUpload(db: Database, store: ObjectStore, actor: Actor, photoId: string) {
  const row = await scopedPhoto(db, actor, photoId);
  if (row.status === "stored") {
    await db.transaction(async (tx) => {
      await lockPhotoPiece(tx, actor, row.timepieceId);
      await assertAppraisalPhotoChangeAllowed(
        tx as unknown as Database,
        row.timepieceId,
        row.kind,
        row.id,
      );
      await setCurrentPreview(tx, row, true);
    });
    return row;
  }
  if (row.status !== "pending") throw new Error("PHOTO_NOT_FOUND");
  const result = await matchingMetadata(store, row);
  if (result.state === "size") throw new Error("PHOTO_SIZE_MISMATCH");
  if (result.state !== "match") return row;
  const stored = await db.transaction(async (tx) => {
    await lockPhotoPiece(tx, actor, row.timepieceId);
    await assertAppraisalPhotoChangeAllowed(
      tx as unknown as Database,
      row.timepieceId,
      row.kind,
      row.id,
    );
    const [transitioned] = await tx
      .update(photoObjects)
      .set({ status: "stored", receivedAt: new Date() })
      .where(and(eq(photoObjects.id, row.id), eq(photoObjects.status, "pending")))
      .returning();
    if (!transitioned) return null;
    await setCurrentPreview(tx, transitioned);
    return transitioned;
  });
  if (stored) return stored;
  const current = await scopedPhoto(db, actor, row.id);
  if (current.status === "stored") return confirmPhotoUpload(db, store, actor, row.id);
  throw new Error("PHOTO_NOT_FOUND");
}

export async function mintPhotoPreviewUrl(db: Database, store: ObjectStore, actor: Actor, photoId: string) {
  const row = await scopedPhoto(db, actor, photoId);
  if (row.status !== "stored" || !row.previewKey) throw new Error("PHOTO_NOT_FOUND");
  return store.presignGet(row.previewKey, 300);
}

export async function sweepPendingPhotos(
  db: Database,
  store: ObjectStore,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const pending = await db
    .select()
    .from(photoObjects)
    .where(and(eq(photoObjects.status, "pending"), lt(photoObjects.receivedAt, cutoff)));
  let stored = 0;
  let abandoned = 0;
  for (const row of pending) {
    const result = await matchingMetadata(store, row);
    if (result.state === "unverified") continue;
    const status = result.state === "match" ? "stored" : "abandoned";
    const transitioned = await db.transaction(async (tx) => {
      // Canonical photo lock order: timepiece first, then photo. Submission and
      // confirmation use the same order, so sweep cannot cross the frozen snapshot.
      await lockTimepieceRow(tx, row.timepieceId);
      const [currentPhoto] = await tx
        .select()
        .from(photoObjects)
        .where(and(eq(photoObjects.id, row.id), eq(photoObjects.status, "pending")))
        .for("update")
        .limit(1);
      if (!currentPhoto) return [];
      const changed = await tx
        .update(photoObjects)
        .set({ status, ...(status === "stored" ? { receivedAt: now } : {}) })
        .where(and(eq(photoObjects.id, row.id), eq(photoObjects.status, "pending")))
        .returning({ id: photoObjects.id });
      if (changed.length && status === "stored") {
        const [openReview] = await tx
          .select({ id: appraisalAttempts.id })
          .from(appraisalAttempts)
          .where(
            and(
              eq(appraisalAttempts.timepieceId, row.timepieceId),
              eq(appraisalAttempts.status, "under_review"),
            ),
          )
          .limit(1);
        // Preserve the frozen review surface and occupied post-submission slots.
        // The object stays stored; an unused slot may become current after Return.
        if (!openReview) {
          try {
            await assertAppraisalPhotoChangeAllowed(
              tx as unknown as Database,
              row.timepieceId,
              row.kind,
              row.id,
            );
            await setCurrentPreview(tx, row);
          } catch (error) {
            if (
              !(error instanceof Error) ||
              !["REVIEW_LOCKED", "PHOTO_KIND_TAKEN"].includes(error.message)
            ) {
              throw error;
            }
          }
        }
      }
      return changed;
    });
    if (transitioned.length === 0) continue;
    if (status === "stored") stored += 1;
    else abandoned += 1;
  }
  return { checked: pending.length, stored, abandoned };
}

export async function listPhotos(db: Database, actor: Actor, timepieceId: string) {
  const piece = await scopedPiece(db, actor, timepieceId);
  return db
    .select()
    .from(photoObjects)
    .where(and(eq(photoObjects.timepieceId, piece.id), eq(photoObjects.status, "stored")));
}
