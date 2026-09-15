import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { PhotoKind } from "../types";
import { sha256Hex } from "../storage/object-store.mjs";
import type { Database } from "./client";
import { assertIsolation, canReadPhoto, canWritePhoto } from "./isolation.mjs";
import type { Actor } from "./records";
import { photoObjects, timepieces } from "./schema";

export type ObjectStore = {
  put: (key: string, body: Uint8Array, checksum: string) => Promise<void>;
};

export type SaveOriginalInput = {
  timepieceId: string;
  kind: PhotoKind;
  bytes: Uint8Array;
  checksum: string;
};

export async function saveOriginal(
  db: Database,
  store: ObjectStore,
  actor: Actor,
  input: SaveOriginalInput,
) {
  const actual = sha256Hex(input.bytes);
  if (actual !== input.checksum) {
    throw new Error("CHECKSUM_MISMATCH");
  }

  const [piece] = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces)
    .where(eq(timepieces.id, input.timepieceId))
    .limit(1);
  if (!piece) {
    throw new Error("TIMEPIECE_NOT_FOUND");
  }
  assertIsolation(canWritePhoto(actor, piece.customerId));

  const [existing] = await db
    .select()
    .from(photoObjects)
    .where(
      and(eq(photoObjects.timepieceId, piece.id), eq(photoObjects.originalChecksum, actual)),
    )
    .limit(1);
  if (existing) {
    return existing;
  }

  const key = `originals/${piece.customerId}/${piece.id}/${actual}`;
  await store.put(key, input.bytes, actual);

  const [row] = await db
    .insert(photoObjects)
    .values({
      id: randomUUID(),
      timepieceId: piece.id,
      customerId: piece.customerId,
      kind: input.kind,
      originalKey: key,
      originalChecksum: actual,
      originalBytes: input.bytes.byteLength,
      uploadedBy: actor.email,
    })
    .returning();
  return row;
}

export async function listPhotos(db: Database, actor: Actor, timepieceId: string) {
  const [piece] = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces)
    .where(eq(timepieces.id, timepieceId))
    .limit(1);
  if (!piece) return [];
  assertIsolation(canReadPhoto(actor, piece.customerId));
  return db.select().from(photoObjects).where(eq(photoObjects.timepieceId, timepieceId));
}
