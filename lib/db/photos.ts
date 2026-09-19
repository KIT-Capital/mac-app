import { randomUUID } from "node:crypto";
import { and, eq, lt, ne } from "drizzle-orm";
import { photoObjectKeys } from "../storage/photo-object-key.mjs";
import type { Database } from "./client";
import type { Actor } from "./records";
import { photoObjects, timepieces } from "./schema";

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

export type RequestPhotoUploadInput = {
  timepieceId: string;
  kind: string;
  original: UploadPart;
  preview: UploadPart;
};

const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/heic"]);
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
const PHOTO_KINDS = new Set(["front", "back", "left", "right", "clasp", "more", "buckle", "box", "papers", "other"]);

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

export async function requestPhotoUpload(
  db: Database,
  store: ObjectStore,
  actor: Actor,
  input: RequestPhotoUploadInput,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (!PHOTO_KINDS.has(input.kind)) throw new Error("PHOTO_UPLOAD_INVALID");
  validatePart(input.original);
  validatePart(input.preview);
  const piece = await scopedPiece(db, actor, input.timepieceId);

  const existing = await activePhotoByChecksum(db, piece.id, input.original.sha256);
  if (existing?.status === "stored") {
    return { photoId: existing.id, status: "stored" as const };
  }
  if (existing) {
    if (!matchesUpload(existing, input)) throw new Error("PHOTO_UPLOAD_INVALID");
    const [refreshed] = await db
      .update(photoObjects)
      .set({ receivedAt: new Date() })
      .where(and(eq(photoObjects.id, existing.id), eq(photoObjects.status, "pending")))
      .returning();
    if (refreshed) return uploadUrls(store, refreshed);
    const raced = await activePhotoByChecksum(db, piece.id, input.original.sha256);
    if (raced?.status === "stored") return { photoId: raced.id, status: "stored" as const };
    throw new Error("PHOTO_NOT_FOUND");
  }

  const id = randomUUID();
  const keys = photoObjectKeys({ appEnv: appEnv(env), customerId: piece.customerId, photoId: id });

  let row: typeof photoObjects.$inferSelect;
  try {
    [row] = await db
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
  } catch (error) {
    if (constraintName(error) !== "photo_objects_timepiece_checksum_uidx") throw error;
    const raced = await activePhotoByChecksum(db, piece.id, input.original.sha256);
    if (!raced) throw error;
    if (raced.status === "stored") {
      return { photoId: raced.id, status: "stored" as const };
    }
    if (!matchesUpload(raced, input)) throw new Error("PHOTO_UPLOAD_INVALID");
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
  if (original.bytes !== row.originalBytes || preview.bytes !== row.previewBytes) return { state: "size" as const };
  if (
    original.sha256.toLowerCase() !== row.originalChecksum.toLowerCase()
    || preview.sha256.toLowerCase() !== row.previewChecksum.toLowerCase()
  ) return { state: "checksum" as const };
  return { state: "match" as const };
}

export async function confirmPhotoUpload(db: Database, store: ObjectStore, actor: Actor, photoId: string) {
  const row = await scopedPhoto(db, actor, photoId);
  if (row.status === "stored") return row;
  if (row.status !== "pending") throw new Error("PHOTO_NOT_FOUND");
  const result = await matchingMetadata(store, row);
  if (result.state === "size") throw new Error("PHOTO_SIZE_MISMATCH");
  if (result.state !== "match") return row;
  const [stored] = await db
    .update(photoObjects)
    .set({ status: "stored", receivedAt: new Date() })
    .where(and(eq(photoObjects.id, row.id), eq(photoObjects.status, "pending")))
    .returning();
  if (stored) return stored;
  const current = await scopedPhoto(db, actor, row.id);
  if (current.status === "stored") return current;
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
    await db
      .update(photoObjects)
      .set({ status, ...(status === "stored" ? { receivedAt: now } : {}) })
      .where(and(eq(photoObjects.id, row.id), eq(photoObjects.status, "pending")));
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
