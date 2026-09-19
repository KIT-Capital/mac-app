import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { memoryObjectStore, sha256Hex } from "../storage/object-store.mjs";
import { createDb } from "./client";
import {
  confirmPhotoUpload,
  listPhotos,
  mintPhotoPreviewUrl,
  requestPhotoUpload,
  sweepPendingPhotos,
} from "./photos";
import { executeLiveBookOperation } from "./live-book-mutations";
import { createTimepiece, registerCollector, toCollectorActor } from "./records";
import { customers, photoObjects, timepieces } from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

function keyFromMemoryUrl(url: string) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname}`;
}

function parts(label: string) {
  const original = new TextEncoder().encode(`original-${label}`);
  const preview = new TextEncoder().encode(`preview-${label}`);
  return {
    original,
    preview,
    input: {
      original: { size: original.byteLength, type: "image/jpeg", sha256: sha256Hex(original) },
      preview: { size: preview.byteLength, type: "image/jpeg", sha256: sha256Hex(preview) },
    },
  };
}

describe("direct photo uploads", { skip }, () => {
  const db = createDb();
  const store = memoryObjectStore();

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    await db.delete(photoObjects).where(inArray(photoObjects.customerId, createdCustomerIds));
    await db.delete(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("reuses a pending checksum, confirms both objects, and mints a preview URL", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo.${suffix}@mac.test`,
      name: "Photo Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Patek Philippe",
      model: "Nautilus",
    });
    const uploadParts = parts(String(suffix));
    await assert.rejects(
      () => requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id,
        kind: "front",
        ...uploadParts.input,
        original: { ...uploadParts.input.original, size: 25 * 1024 * 1024 + 1 },
      }),
      { message: "PHOTO_UPLOAD_INVALID" },
    );
    await assert.rejects(
      () => requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id,
        kind: "front",
        ...uploadParts.input,
        preview: { ...uploadParts.input.preview, type: "image/gif" },
      }),
      { message: "PHOTO_UPLOAD_INVALID" },
    );
    const first = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      ...uploadParts.input,
    });
    assert.equal(first.status, "pending");
    const retry = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      ...uploadParts.input,
    });
    assert.equal(first.photoId, retry.photoId);
    assert.notEqual(first.original.expiresAt, "");
    await assert.rejects(
      () => requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id,
        kind: "front",
        ...uploadParts.input,
        preview: { ...uploadParts.input.preview, sha256: "ab".repeat(32) },
      }),
      { message: "PHOTO_UPLOAD_INVALID" },
    );
    assert.equal((await listPhotos(db, actor, piece.id)).length, 0);

    const missing = await confirmPhotoUpload(db, store, actor, first.photoId);
    assert.equal(missing.status, "pending");
    const checksumAbsent = await confirmPhotoUpload(
      db,
      {
        ...store,
        async headMetadata() {
          return { bytes: uploadParts.original.byteLength, sha256: null };
        },
      },
      actor,
      first.photoId,
    );
    assert.equal(checksumAbsent.status, "pending");
    await store.put(keyFromMemoryUrl(first.original.url), uploadParts.original, uploadParts.input.original.sha256);
    await store.put(keyFromMemoryUrl(first.preview.url), uploadParts.preview, uploadParts.input.preview.sha256);
    const stored = await confirmPhotoUpload(db, store, actor, first.photoId);
    assert.equal(stored.status, "stored");
    assert.equal((await listPhotos(db, actor, piece.id)).length, 1);
    const storedRetry = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      ...uploadParts.input,
    });
    assert.deepEqual(storedRetry, { photoId: first.photoId, status: "stored" });
    assert.match((await mintPhotoPreviewUrl(db, store, actor, first.photoId)).url, /\/previews\//);
  });

  it("hides foreign pieces and pending previews from collectors", async () => {
    const customerA = await registerCollector(db, {
      email: `collector-photo-a.${suffix}@mac.test`,
      name: "Photo A",
    });
    const customerB = await registerCollector(db, {
      email: `collector-photo-b.${suffix}@mac.test`,
      name: "Photo B",
    });
    createdCustomerIds.push(customerA.id, customerB.id);
    const actorA = toCollectorActor(customerA);
    const actorB = toCollectorActor(customerB);
    const piece = await createTimepiece(db, actorA, customerA.id, {
      brand: "Richard Mille",
      model: "RM 027",
    });
    const pieceB = await createTimepiece(db, actorB, customerB.id, {
      brand: "Cartier",
      model: "Santos",
    });
    const uploadParts = parts(`foreign-${suffix}`);
    const upload = await requestPhotoUpload(db, store, actorA, {
      timepieceId: piece.id, kind: "back", ...uploadParts.input,
    });

    await assert.rejects(
      () => requestPhotoUpload(db, store, actorB, { timepieceId: piece.id, kind: "left", ...uploadParts.input }),
      { message: "TIMEPIECE_NOT_FOUND" },
    );
    const independent = await requestPhotoUpload(db, store, actorB, {
      timepieceId: pieceB.id,
      kind: "left",
      ...uploadParts.input,
    });
    assert.notEqual(independent.photoId, upload.photoId);
    await assert.rejects(() => mintPhotoPreviewUrl(db, store, actorA, upload.photoId), { message: "PHOTO_NOT_FOUND" });
    await assert.rejects(() => mintPhotoPreviewUrl(db, store, actorB, upload.photoId), { message: "PHOTO_NOT_FOUND" });
  });

  it("defaults legacy photo rows to stored", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo-legacy.${suffix}@mac.test`,
      name: "Photo Legacy",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Rolex",
      model: "Submariner",
    });
    const checksum = "cd".repeat(32);
    const [legacy] = await db
      .insert(photoObjects)
      .values({
        id: `legacy-${suffix}`,
        timepieceId: piece.id,
        customerId: customer.id,
        kind: "front",
        originalKey: `legacy/${suffix}`,
        originalChecksum: checksum,
        originalBytes: 42,
        uploadedBy: actor.email,
      })
      .returning();
    assert.equal(legacy.status, "stored");
    const upload = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      original: { size: 42, type: "image/jpeg", sha256: checksum },
      preview: { size: 21, type: "image/jpeg", sha256: "ef".repeat(32) },
    });
    assert.deepEqual(upload, { photoId: legacy.id, status: "stored" });
  });

  it("allows desk staff to upload and view a collector photo", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo-desk.${suffix}@mac.test`,
      name: "Photo Desk",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Omega",
      model: "Speedmaster",
    });
    const desk = { role: "staff" as const, email: "desk@mechartcap.com" };
    const uploadParts = parts(`desk-${suffix}`);
    const upload = await requestPhotoUpload(db, store, desk, {
      timepieceId: piece.id, kind: "front", ...uploadParts.input,
    });
    assert.equal(upload.status, "pending");
    await store.put(keyFromMemoryUrl(upload.original.url), uploadParts.original, uploadParts.input.original.sha256);
    await store.put(keyFromMemoryUrl(upload.preview.url), uploadParts.preview, uploadParts.input.preview.sha256);
    assert.equal((await confirmPhotoUpload(db, store, desk, upload.photoId)).status, "stored");
    assert.match((await mintPhotoPreviewUrl(db, store, desk, upload.photoId)).url, /^memory:/);
  });

  it("leaves size mismatches pending and abandons stale missing uploads", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo-sweep.${suffix}@mac.test`,
      name: "Photo Sweep",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Rolex",
      model: "Explorer",
    });
    const uploadParts = parts(`sweep-${suffix}`);
    const upload = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id, kind: "front", ...uploadParts.input,
    });
    assert.equal(upload.status, "pending");
    store.objects.set(keyFromMemoryUrl(upload.original.url), new Uint8Array(uploadParts.original.byteLength + 1));
    store.objects.set(keyFromMemoryUrl(upload.preview.url), uploadParts.preview);
    await assert.rejects(() => confirmPhotoUpload(db, store, actor, upload.photoId), {
      message: "PHOTO_SIZE_MISMATCH",
    });
    const [pending] = await db.select().from(photoObjects).where(eq(photoObjects.id, upload.photoId));
    assert.equal(pending.status, "pending");

    store.objects.clear();
    await db
      .update(photoObjects)
      .set({ receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(photoObjects.id, upload.photoId));
    const reminted = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id, kind: "front", ...uploadParts.input,
    });
    assert.equal(reminted.photoId, upload.photoId);
    assert.deepEqual(await sweepPendingPhotos(db, store), { checked: 0, stored: 0, abandoned: 0 });
    await db
      .update(photoObjects)
      .set({ receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(photoObjects.id, reminted.photoId));
    assert.deepEqual(await sweepPendingPhotos(db, store), { checked: 1, stored: 0, abandoned: 1 });
    const next = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id, kind: "front", ...uploadParts.input,
    });
    assert.equal(next.status, "pending");
    assert.notEqual(next.photoId, reminted.photoId);
    await store.put(keyFromMemoryUrl(next.original.url), uploadParts.original, uploadParts.input.original.sha256);
    await store.put(keyFromMemoryUrl(next.preview.url), uploadParts.preview, uploadParts.input.preview.sha256);
    await db
      .update(photoObjects)
      .set({ receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(photoObjects.id, next.photoId));
    assert.deepEqual(
      await sweepPendingPhotos(db, { ...store, async headMetadata(key) {
        const metadata = await store.headMetadata(key);
        return metadata ? { ...metadata, sha256: null } : null;
      } }),
      { checked: 1, stored: 0, abandoned: 0 },
    );
    assert.deepEqual(await sweepPendingPhotos(db, store), { checked: 1, stored: 1, abandoned: 0 });
  });

  it("keeps pending photo metadata attached to its timepiece", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo-remove.${suffix}@mac.test`,
      name: "Photo Remove",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Cartier",
      model: "Tank",
    });
    const upload = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id, kind: "front", ...parts(`remove-${suffix}`).input,
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, actor, { action: "timepiece.remove", id: piece.id }),
      { message: "TIMEPIECE_REFERENCED" },
    );
    assert.equal((await db.select().from(timepieces).where(eq(timepieces.id, piece.id))).length, 1);
    assert.equal((await db.select().from(photoObjects).where(eq(photoObjects.id, upload.photoId))).length, 1);
    await db.update(photoObjects).set({ status: "abandoned" }).where(eq(photoObjects.id, upload.photoId));
    await executeLiveBookOperation(db, actor, { action: "timepiece.remove", id: piece.id });
    assert.equal((await db.select().from(timepieces).where(eq(timepieces.id, piece.id))).length, 0);
    assert.equal((await db.select().from(photoObjects).where(eq(photoObjects.id, upload.photoId))).length, 0);
  });
});
