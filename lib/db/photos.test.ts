import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { memoryObjectStore, sha256Hex } from "../storage/object-store.mjs";
import { createDb } from "./client";
import { listPhotos, saveOriginal } from "./photos";
import { createTimepiece, registerCollector, toCollectorActor } from "./records";
import { customers, photoObjects, timepieces } from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

describe("Stage 3 original photos", { skip }, () => {
  const db = createDb();
  const store = memoryObjectStore();

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    await db.delete(photoObjects).where(inArray(photoObjects.customerId, createdCustomerIds));
    await db.delete(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("saves only after checksum verify and does not duplicate on retry", async () => {
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
    const bytes = new TextEncoder().encode(`original-${suffix}`);
    const checksum = sha256Hex(bytes);

    await assert.rejects(
      () => saveOriginal(db, store, actor, { timepieceId: piece.id, kind: "front", bytes, checksum: "nope" }),
      { message: "CHECKSUM_MISMATCH" },
    );
    assert.equal(store.objects.size, 0);

    const first = await saveOriginal(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      bytes,
      checksum,
    });
    const retry = await saveOriginal(db, store, actor, {
      timepieceId: piece.id,
      kind: "front",
      bytes,
      checksum,
    });
    assert.equal(first.id, retry.id);
    assert.equal(store.objects.size, 1);
    assert.equal((await listPhotos(db, actor, piece.id)).length, 1);
  });

  it("keeps collector B from reading collector A photos", async () => {
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
    const bytes = new TextEncoder().encode(`secret-original-${suffix}`);
    await saveOriginal(db, store, actorA, {
      timepieceId: piece.id,
      kind: "back",
      bytes,
      checksum: sha256Hex(bytes),
    });

    await assert.rejects(() => listPhotos(db, actorB, piece.id), { message: "ISOLATION_DENIED" });
    await assert.rejects(
      () =>
        saveOriginal(db, store, actorB, {
          timepieceId: piece.id,
          kind: "left",
          bytes,
          checksum: sha256Hex(bytes),
        }),
      { message: "ISOLATION_DENIED" },
    );
  });
});
