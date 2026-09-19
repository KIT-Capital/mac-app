import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { and, eq, inArray } from "drizzle-orm";
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
import { customers, livePreviews, photoObjects, timepieces } from "./schema";

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
    const pieces = await db.select({ id: timepieces.id }).from(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    if (pieces.length) await db.delete(livePreviews).where(inArray(livePreviews.timepieceId, pieces.map((piece) => piece.id)));
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
    await assert.rejects(
      () => requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id,
        kind: "back",
        ...uploadParts.input,
      }),
      { message: "PHOTO_CHECKSUM_IN_USE" },
    );
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
    const [linked] = await db.select().from(livePreviews).where(eq(livePreviews.photoObjectId, first.photoId));
    assert.equal(linked.timepieceId, piece.id);
    assert.equal(linked.kind, "front");
    assert.equal(linked.previewUrl, null);
    await db.delete(livePreviews).where(eq(livePreviews.photoObjectId, first.photoId));
    const repaired = await confirmPhotoUpload(db, store, actor, first.photoId);
    assert.equal(repaired.status, "stored");
    assert.equal(
      (await db.select().from(livePreviews).where(eq(livePreviews.photoObjectId, first.photoId))).length,
      1,
    );
    const replacementParts = parts(`replacement-${suffix}`);
    const replacement = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      ...replacementParts.input,
    });
    assert.equal(replacement.status, "pending");
    await store.put(
      keyFromMemoryUrl(replacement.original.url),
      replacementParts.original,
      replacementParts.input.original.sha256,
    );
    await store.put(
      keyFromMemoryUrl(replacement.preview.url),
      replacementParts.preview,
      replacementParts.input.preview.sha256,
    );
    assert.equal((await confirmPhotoUpload(db, store, actor, replacement.photoId)).status, "stored");
    const currentFront = await db
      .select()
      .from(livePreviews)
      .where(and(eq(livePreviews.timepieceId, piece.id), eq(livePreviews.kind, "front")));
    assert.deepEqual(currentFront.map((preview) => preview.photoObjectId), [replacement.photoId]);
    assert.equal((await confirmPhotoUpload(db, store, actor, replacement.photoId)).status, "stored");
    assert.equal(
      (await db.select().from(livePreviews)
        .where(and(eq(livePreviews.timepieceId, piece.id), eq(livePreviews.kind, "front")))).length,
      1,
    );
    assert.equal((await confirmPhotoUpload(db, store, actor, first.photoId)).status, "stored");
    assert.deepEqual(
      (await db.select().from(livePreviews)
        .where(and(eq(livePreviews.timepieceId, piece.id), eq(livePreviews.kind, "front"))))
        .map((preview) => preview.photoObjectId),
      [replacement.photoId],
    );
    assert.equal((await listPhotos(db, actor, piece.id)).length, 2);
    const storedRetry = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      ...uploadParts.input,
    });
    assert.deepEqual(storedRetry, { photoId: first.photoId, status: "stored" });
    assert.deepEqual(
      (await db.select().from(livePreviews)
        .where(and(eq(livePreviews.timepieceId, piece.id), eq(livePreviews.kind, "front"))))
        .map((preview) => preview.photoObjectId),
      [first.photoId],
    );
    assert.match((await mintPhotoPreviewUrl(db, store, actor, first.photoId)).url, /\/previews\//);
  });

  it("serializes concurrent replacements for the same shot kind", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo-concurrent.${suffix}@mac.test`,
      name: "Photo Concurrent",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Rolex",
      model: "Daytona",
    });
    const firstParts = parts(`concurrent-first-${suffix}`);
    const secondParts = parts(`concurrent-second-${suffix}`);
    const [first, second] = await Promise.all([
      requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id,
        kind: "front",
        ...firstParts.input,
      }),
      requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id,
        kind: "front",
        ...secondParts.input,
      }),
    ]);
    await Promise.all([
      store.put(keyFromMemoryUrl(first.original.url), firstParts.original, firstParts.input.original.sha256),
      store.put(keyFromMemoryUrl(first.preview.url), firstParts.preview, firstParts.input.preview.sha256),
      store.put(keyFromMemoryUrl(second.original.url), secondParts.original, secondParts.input.original.sha256),
      store.put(keyFromMemoryUrl(second.preview.url), secondParts.preview, secondParts.input.preview.sha256),
    ]);

    await Promise.all([
      confirmPhotoUpload(db, store, actor, first.photoId),
      confirmPhotoUpload(db, store, actor, second.photoId),
    ]);

    const current = await db
      .select()
      .from(livePreviews)
      .where(and(eq(livePreviews.timepieceId, piece.id), eq(livePreviews.kind, "front")));
    assert.equal(current.length, 1);
    assert.ok([first.photoId, second.photoId].includes(current[0].photoObjectId ?? ""));
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

  it("keeps a legacy stored row while creating a direct-upload replacement", async () => {
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
    assert.equal(upload.status, "pending");
    assert.notEqual(upload.photoId, legacy.id);
    const [unchanged] = await db.select().from(photoObjects).where(eq(photoObjects.id, legacy.id));
    assert.equal(unchanged.status, "stored");
    assert.equal(unchanged.previewKey, null);
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
    const desk = { role: "appraiser" as const, email: "desk@mechartcap.com" };
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
    await db
      .update(photoObjects)
      .set({ status: "pending", receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(photoObjects.id, next.photoId));
    let metadataReads = 0;
    assert.deepEqual(
      await sweepPendingPhotos(db, { ...store, async headMetadata(key) {
        const metadata = await store.headMetadata(key);
        metadataReads += 1;
        if (metadataReads === 2) {
          await db
            .update(photoObjects)
            .set({ status: "stored" })
            .where(eq(photoObjects.id, next.photoId));
        }
        return metadata;
      } }),
      { checked: 1, stored: 0, abandoned: 0 },
    );
  });

  it("caps a timepiece at seven photos and still reuses an existing checksum", async () => {
    const customer = await registerCollector(db, {
      email: `collector-photo-cap.${suffix}@mac.test`,
      name: "Photo Cap",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Rolex",
      model: "Daytona",
    });
    const kinds = ["front", "back", "left", "right", "clasp", "box", "papers"] as const;
    for (const kind of kinds) {
      const upload = await requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id, kind, ...parts(`cap-${kind}-${suffix}`).input,
      });
      assert.equal(upload.status, "pending");
    }

    await assert.rejects(
      () => requestPhotoUpload(db, store, actor, {
        timepieceId: piece.id, kind: "more", ...parts(`cap-eighth-${suffix}`).input,
      }),
      { message: "PHOTO_LIMIT" },
    );

    // The cap counts photos, not requests: re-requesting one already on the
    // piece is how a retry resumes, and must keep working at the limit.
    const retry = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id, kind: "front", ...parts(`cap-front-${suffix}`).input,
    });
    assert.equal(retry.status, "pending");

    // An abandoned row frees its place.
    const [abandoned] = await db
      .select({ id: photoObjects.id })
      .from(photoObjects)
      .where(and(eq(photoObjects.timepieceId, piece.id), eq(photoObjects.kind, "papers")))
      .limit(1);
    await db.update(photoObjects).set({ status: "abandoned" }).where(eq(photoObjects.id, abandoned.id));
    const eighth = await requestPhotoUpload(db, store, actor, {
      timepieceId: piece.id, kind: "more", ...parts(`cap-eighth-${suffix}`).input,
    });
    assert.equal(eighth.status, "pending");
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
