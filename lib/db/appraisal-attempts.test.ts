import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { and, eq, sql } from "drizzle-orm";
import { memoryObjectStore, sha256Hex } from "../storage/object-store.mjs";
import { hashStaffPassword } from "../staff-password.mjs";
import { completedAppraisalDecisions } from "../contract/repo-book.mjs";
import { createDb, type Database } from "./client";
import { readLiveBookState } from "./live-book-adapter";
import {
  finalizeAcceptedAttempt,
  reverseAcceptedAttempt,
} from "./appraisal-attempts";
import { executeLiveBookOperation } from "./live-book-mutations";
import {
  confirmPhotoUpload,
  requestPhotoUpload,
  sweepPendingPhotos,
} from "./photos";
import {
  createTimepiece,
  deskActor,
  registerCollector,
  toCollectorActor,
  type TimepieceInput,
} from "./records";
import { createStaffAccount } from "./staff-accounts";
import {
  appraisalAttemptPhotos,
  appraisalAttempts,
  deskAuditLog,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  photoObjects,
  timepieces,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const rootDb = createDb();
let db: Database;
let releaseTransaction: (() => void) | undefined;
let transactionPromise: Promise<unknown> | undefined;

function nestedMessage(error: unknown) {
  const messages: string[] = [];
  let current: unknown = error;
  for (let depth = 0; depth < 6; depth += 1) {
    if (!current || typeof current !== "object") break;
    if ("message" in current && typeof current.message === "string") {
      messages.push(current.message);
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return messages.join(" | ");
}

function uploadParts(label: string) {
  const original = new TextEncoder().encode(`original-${label}`);
  const preview = new TextEncoder().encode(`preview-${label}`);
  return {
    original,
    preview,
    input: {
      original: {
        size: original.byteLength,
        type: "image/jpeg",
        sha256: sha256Hex(original),
      },
      preview: {
        size: preview.byteLength,
        type: "image/jpeg",
        sha256: sha256Hex(preview),
      },
    },
  };
}

function keyFromMemoryUrl(url: string) {
  const parsed = new URL(url);
  return `${parsed.hostname}${parsed.pathname}`;
}

async function assertDbReject(
  operation: (tx: Database) => Promise<unknown>,
  validate: (error: unknown) => boolean,
) {
  await assert.rejects(
    () => db.transaction((tx) => operation(tx as unknown as Database)),
    validate,
  );
}

async function staff(label: string, role: "admin" | "appraiser" | "super_admin") {
  const row = await createStaffAccount(db, {
    name: `Attempt ${label}`,
    email: `attempt-${label}.${suffix}@mac.test`,
    role,
    passwordHash: await hashStaffPassword(`attempt password ${label} 123`),
    mustRotate: false,
  });
  return deskActor(role, row.email, row.id, role === "super_admin");
}

async function piece(
  label: string,
  kinds = ["front", "back", "left", "right", "clasp", "box", "papers"],
  input: Partial<TimepieceInput> = {},
) {
  const customer = await registerCollector(db, {
    name: `Attempt Collector ${label}`,
    email: `attempt-${label}.${suffix}@mac.test`,
  });
  const actor = toCollectorActor(customer);
  const created = await createTimepiece(db, actor, customer.id, {
    brand: "Cartier",
    model: `Crash ${label}`,
    condition: "Excellent",
    boxPapers: "Box and papers",
    ...input,
  });
  for (const [index, kind] of kinds.entries()) {
    const id = `attempt-photo-${label}-${kind}-${suffix}`;
    const checksum = (index + 1).toString(16).padStart(64, "0");
    await db.insert(photoObjects).values({
      id,
      timepieceId: created.id,
      customerId: customer.id,
      kind,
      originalKey: `development/originals/${customer.id}/${id}`,
      originalChecksum: checksum,
      originalBytes: 100 + index,
      contentType: "image/jpeg",
      previewKey: `development/previews/${customer.id}/${id}`,
      previewChecksum: checksum,
      previewBytes: 50 + index,
      previewContentType: "image/jpeg",
      status: "stored",
      uploadedBy: customer.email,
    });
    await db.insert(livePreviews).values({
      id,
      timepieceId: created.id,
      kind,
      photoObjectId: id,
    });
  }
  return { customer, actor, piece: created };
}

describe("appraisal attempts repository", { skip }, () => {
  let appraiserA: ReturnType<typeof deskActor>;
  let appraiserB: ReturnType<typeof deskActor>;
  let superAdmin: ReturnType<typeof deskActor>;
  let admin: ReturnType<typeof deskActor>;

  before(async () => {
    let ready!: () => void;
    let release!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    releaseTransaction = release;
    transactionPromise = rootDb.transaction(async (tx) => {
      db = tx as unknown as Database;
      ready();
      await releasePromise;
      throw new Error("APPRAISAL_TEST_ROLLBACK");
    });
    await readyPromise;
    [appraiserA, appraiserB, superAdmin, admin] = await Promise.all([
      staff("a", "appraiser"),
      staff("b", "appraiser"),
      staff("super", "super_admin"),
      staff("admin", "admin"),
    ]);
  });

  after(async () => {
    releaseTransaction?.();
    await assert.rejects(
      () => transactionPromise,
      { message: "APPRAISAL_TEST_ROLLBACK" },
    );
  });

  it("freezes submitted fields and exact stored photo evidence", async () => {
    const fixture = await piece("snapshot", ["front", "back", "left", "right", "clasp"]);
    const attemptId = `attempt-snapshot-${suffix}`;
    const result = await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: attemptId,
      timepieceId: fixture.piece.id,
      note: "Please check the bracelet.",
    });
    assert.deepEqual(result, { attemptId, attemptNo: 1 });
    const [attempt] = await db
      .select()
      .from(appraisalAttempts)
      .where(eq(appraisalAttempts.id, attemptId));
    assert.equal(attempt.status, "under_review");
    assert.equal(attempt.decisionNo, null);
    assert.ok(attempt.evidenceSealedAt);
    assert.deepEqual((attempt.snapshot as { note: string }).note, "Please check the bracelet.");
    const evidence = await db
      .select()
      .from(appraisalAttemptPhotos)
      .where(eq(appraisalAttemptPhotos.attemptId, attemptId));
    assert.equal(evidence.length, 5);
    assert.ok(evidence.every((row) => row.originalKey && row.originalChecksum.length === 64));
    const retailState = await readLiveBookState(db, fixture.actor);
    const retailAttempt = retailState.appraisalAttempts.find((row) => row.id === attemptId);
    const retailPhoto = retailState.appraisalAttemptPhotos.find(
      (row) => row.attemptId === attemptId,
    );
    assert.ok(retailAttempt);
    assert.ok(retailPhoto);
    assert.equal("decidedByStaffId" in retailAttempt, false);
    assert.equal("originalKey" in retailPhoto, false);
    const deskState = await readLiveBookState(db, appraiserA);
    const deskPhoto = deskState.appraisalAttemptPhotos.find((row) => row.attemptId === attemptId);
    assert.equal(deskPhoto?.originalKey?.startsWith("development/"), true);

    await assertDbReject(
      (tx) => tx
        .update(appraisalAttempts)
        .set({ snapshot: { changed: true } })
        .where(eq(appraisalAttempts.id, attemptId)),
      (error) => nestedMessage(error).includes("APPRAISAL_SNAPSHOT_IMMUTABLE"),
    );
    await assertDbReject(
      (tx) => tx
        .update(appraisalAttempts)
        .set({ note: "Changed after submission." })
        .where(eq(appraisalAttempts.id, attemptId)),
      (error) => nestedMessage(error).includes("APPRAISAL_SNAPSHOT_IMMUTABLE"),
    );
    await assertDbReject(
      (tx) => tx
        .delete(appraisalAttempts)
        .where(eq(appraisalAttempts.id, attemptId)),
      (error) => nestedMessage(error).includes("APPRAISAL_ATTEMPT_IMMUTABLE"),
    );
    await assertDbReject(
      async (tx) => {
        // A runtime-role session may set arbitrary custom GUCs; the production
        // trigger deliberately ignores this former cleanup escape hatch.
        await tx.execute(sql`set local mac.allow_appraisal_cleanup = 'on'`);
        return tx
          .update(appraisalAttempts)
          .set({ snapshot: { bypassed: true } })
          .where(eq(appraisalAttempts.id, attemptId));
      },
      (error) => nestedMessage(error).includes("APPRAISAL_SNAPSHOT_IMMUTABLE"),
    );
    await assertDbReject(
      (tx) => tx
        .update(photoObjects)
        .set({ status: "abandoned" })
        .where(eq(photoObjects.id, evidence[0].photoObjectId)),
      (error) => nestedMessage(error).includes("PHOTO_REFERENCED"),
    );
    await assertDbReject(
      (tx) => tx
        .delete(appraisalAttemptPhotos)
        .where(
          and(
            eq(appraisalAttemptPhotos.attemptId, attemptId),
            eq(appraisalAttemptPhotos.photoObjectId, evidence[0].photoObjectId),
          ),
        ),
      (error) => nestedMessage(error).includes("APPRAISAL_PHOTO_IMMUTABLE"),
    );
    const latePhotoId = `attempt-late-photo-${suffix}`;
    await db.insert(photoObjects).values({
      id: latePhotoId,
      timepieceId: fixture.piece.id,
      customerId: fixture.customer.id,
      kind: "box",
      originalKey: `development/originals/${fixture.customer.id}/${latePhotoId}`,
      originalChecksum: "aa".repeat(32),
      originalBytes: 100,
      contentType: "image/jpeg",
      previewKey: `development/previews/${fixture.customer.id}/${latePhotoId}`,
      previewChecksum: "aa".repeat(32),
      previewBytes: 50,
      previewContentType: "image/jpeg",
      status: "stored",
      uploadedBy: fixture.customer.email,
    });
    await assertDbReject(
      (tx) => tx.insert(appraisalAttemptPhotos).values({
        attemptId,
        photoObjectId: latePhotoId,
        originalKey: `development/originals/${fixture.customer.id}/${latePhotoId}`,
        originalChecksum: "aa".repeat(32),
        kind: "box",
      }),
      (error) => nestedMessage(error).includes("APPRAISAL_PHOTO_IMMUTABLE"),
    );
    await assertDbReject(
      async (tx) => {
        const unsealedId = `attempt-invalid-evidence-${suffix}`;
        await tx.insert(appraisalAttempts).values({
          id: unsealedId,
          timepieceId: fixture.piece.id,
          customerId: fixture.customer.id,
          attemptNo: 999,
          status: "returned",
          responseNote: "Returned test row.",
          snapshot: { fields: {}, note: "" },
        });
        return tx.insert(appraisalAttemptPhotos).values({
          attemptId: unsealedId,
          photoObjectId: latePhotoId,
          originalKey: "wrong-key",
          originalChecksum: "bb".repeat(32),
          kind: "box",
        });
      },
      (error) => nestedMessage(error).includes("PHOTO_EVIDENCE_INVALID"),
    );
    await assertDbReject(
      async (tx) => {
        await tx.insert(appraisalAttempts).values({
          id: `attempt-unsealed-${suffix}`,
          timepieceId: fixture.piece.id,
          customerId: fixture.customer.id,
          attemptNo: 1000,
          status: "returned",
          responseNote: "Unsealed test row.",
          snapshot: { fields: {}, note: "" },
        });
        return tx.execute(sql`set constraints appraisal_attempts_evidence_sealed immediate`);
      },
      (error) => nestedMessage(error).includes("APPRAISAL_EVIDENCE_UNSEALED"),
    );
    for (const patch of [
      { status: "pending" },
      { originalKey: "rewritten-key" },
      { originalChecksum: "ff".repeat(32) },
      { kind: "papers" },
    ]) {
      await assertDbReject(
        (tx) => tx
          .update(photoObjects)
          .set(patch)
          .where(eq(photoObjects.id, evidence[0].photoObjectId)),
        (error) => nestedMessage(error).includes("PHOTO_REFERENCED"),
      );
    }
    await assertDbReject(
      (tx) => tx
        .update(photoObjects)
        .set({ status: "unknown" })
        .where(eq(photoObjects.id, latePhotoId)),
      (error) => nestedMessage(error).includes("photo_objects_status_check"),
    );
  });

  it("locks retail edits and photo changes only while under review", async () => {
    const fixture = await piece("lock", ["front", "back", "left", "right", "clasp"]);
    const store = memoryObjectStore();
    const legacyPreviewId = `legacy-preview-lock-${suffix}`;
    await executeLiveBookOperation(db, admin, {
      action: "preview.upsert",
      id: legacyPreviewId,
      timepieceId: fixture.piece.id,
      kind: "buckle",
      url: "/legacy-buckle.jpg",
    });
    // Retake front before the first attempt; the old stored row stays for
    // history while the new object becomes current.
    const replacementParts = uploadParts(`replacement-${suffix}`);
    const replacement = await requestPhotoUpload(db, store, fixture.actor, {
      timepieceId: fixture.piece.id,
      kind: "front",
      ...replacementParts.input,
    });
    assert.equal(replacement.status, "pending");
    await Promise.all([
      store.put(
        keyFromMemoryUrl(replacement.original.url),
        replacementParts.original,
        replacementParts.input.original.sha256,
      ),
      store.put(
        keyFromMemoryUrl(replacement.preview.url),
        replacementParts.preview,
        replacementParts.input.preview.sha256,
      ),
    ]);
    await confirmPhotoUpload(db, store, fixture.actor, replacement.photoId);

    // Stage an unused box photo but do not confirm it yet.
    const boxParts = uploadParts(`box-${suffix}`);
    const pendingBox = await requestPhotoUpload(db, store, fixture.actor, {
      timepieceId: fixture.piece.id,
      kind: "box",
      ...boxParts.input,
    });
    assert.equal(pendingBox.status, "pending");
    await Promise.all([
      store.put(
        keyFromMemoryUrl(pendingBox.original.url),
        boxParts.original,
        boxParts.input.original.sha256,
      ),
      store.put(
        keyFromMemoryUrl(pendingBox.preview.url),
        boxParts.preview,
        boxParts.input.preview.sha256,
      ),
    ]);
    const papersParts = uploadParts(`papers-${suffix}`);
    const pendingPapers = await requestPhotoUpload(db, store, fixture.actor, {
      timepieceId: fixture.piece.id,
      kind: "papers",
      ...papersParts.input,
    });
    await Promise.all([
      store.put(
        keyFromMemoryUrl(pendingPapers.original.url),
        papersParts.original,
        papersParts.input.original.sha256,
      ),
      store.put(
        keyFromMemoryUrl(pendingPapers.preview.url),
        papersParts.preview,
        papersParts.input.preview.sha256,
      ),
    ]);

    const attemptId = `attempt-lock-${suffix}`;
    await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: attemptId,
      timepieceId: fixture.piece.id,
      note: "",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, fixture.actor, {
        action: "timepiece.update",
        id: fixture.piece.id,
        patch: { condition: "Mint" },
      }),
      { message: "REVIEW_LOCKED" },
    );
    await assert.rejects(
      () => confirmPhotoUpload(db, store, fixture.actor, pendingBox.photoId),
      { message: "REVIEW_LOCKED" },
    );
    await db
      .update(photoObjects)
      .set({ receivedAt: new Date(Date.now() - 25 * 60 * 60 * 1000) })
      .where(eq(photoObjects.id, pendingPapers.photoId));
    const swept = await sweepPendingPhotos(
      db,
      store,
      new Date(),
    );
    assert.ok(swept.stored >= 1);
    const [papersPreviewDuringReview] = await db
      .select({ id: livePreviews.id })
      .from(livePreviews)
      .where(
        and(
          eq(livePreviews.timepieceId, fixture.piece.id),
          eq(livePreviews.kind, "papers"),
        ),
      )
      .limit(1);
    assert.equal(papersPreviewDuringReview, undefined);
    const adminParts = uploadParts(`admin-under-review-${suffix}`);
    await assert.rejects(
      () => requestPhotoUpload(
        db,
        store,
        admin,
        {
          timepieceId: fixture.piece.id,
          kind: "front",
          ...adminParts.input,
        },
      ),
      { message: "REVIEW_LOCKED" },
    );

    await executeLiveBookOperation(
      db,
      appraiserA,
      { action: "appraisal.return", id: attemptId, note: "Add the box photo." },
      {
        env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    await executeLiveBookOperation(db, fixture.actor, {
      action: "timepiece.update",
      id: fixture.piece.id,
      patch: { condition: "Mint" },
    });
    const confirmedBox = await confirmPhotoUpload(
      db,
      store,
      fixture.actor,
      pendingBox.photoId,
    );
    assert.equal(confirmedBox.status, "stored");
    const confirmedPapers = await confirmPhotoUpload(
      db,
      store,
      fixture.actor,
      pendingPapers.photoId,
    );
    assert.equal(confirmedPapers.status, "stored");

    // The old pre-submission front row cannot be restored after evidence exists.
    const oldFrontChecksum = "1".padStart(64, "0");
    const restoreParts = uploadParts(`restore-old-${suffix}`);
    await assert.rejects(
      () => requestPhotoUpload(
        db,
        store,
        fixture.actor,
        {
          timepieceId: fixture.piece.id,
          kind: "front",
          original: {
            size: restoreParts.original.byteLength,
            type: "image/jpeg",
            sha256: oldFrontChecksum,
          },
          preview: restoreParts.input.preview,
        },
      ),
      { message: "PHOTO_KIND_TAKEN" },
    );
    await assert.rejects(
      () => requestPhotoUpload(db, store, admin, {
        timepieceId: fixture.piece.id,
        kind: "front",
        ...adminParts.input,
      }),
      { message: "PHOTO_KIND_TAKEN" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "preview.remove",
        id: replacement.photoId,
      }),
      { message: "PHOTO_REFERENCED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "preview.upsert",
        id: legacyPreviewId,
        timepieceId: fixture.piece.id,
        kind: "box",
        url: "/legacy-buckle.jpg",
      }),
      { message: "PHOTO_REFERENCED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "preview.upsert",
        id: legacyPreviewId,
        timepieceId: fixture.piece.id,
        kind: "buckle",
        url: "/changed-buckle.jpg",
      }),
      { message: "PHOTO_REFERENCED" },
    );
  });

  it("serializes preview removal with the first submission", async () => {
    const fixture = await piece("remove-race");
    const [front] = await db
      .select({ id: livePreviews.id })
      .from(livePreviews)
      .where(
        and(
          eq(livePreviews.timepieceId, fixture.piece.id),
          eq(livePreviews.kind, "front"),
        ),
      )
      .limit(1);
    // Removal first: submission sees the missing required slot and cannot freeze
    // incomplete evidence. The opposite order is covered above (remove blocked).
    await executeLiveBookOperation(db, admin, {
      action: "preview.remove",
      id: front.id,
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, fixture.actor, {
        action: "appraisal.submit",
        id: `attempt-after-remove-${suffix}`,
        timepieceId: fixture.piece.id,
        note: "",
      }),
      { message: "PHOTOS_INCOMPLETE" },
    );
  });

  it("keeps decision ownership and returns an advisory range warning", async () => {
    const fixture = await piece("decision");
    const attemptId = `attempt-decision-${suffix}`;
    await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: attemptId,
      timepieceId: fixture.piece.id,
      note: "",
    });
    const decided = await executeLiveBookOperation(
      db,
      appraiserA,
      {
        action: "appraisal.decide",
        id: attemptId,
        decision: "accept",
        value: 150000,
        rangeLow: 100000,
        rangeHigh: 140000,
      },
      {
        env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    assert.deepEqual(decided, { attemptId, decisionNo: 1, rangeWarning: "above" });
    await executeLiveBookOperation(
      db,
      superAdmin,
      { action: "appraisal.reopen", id: attemptId, reason: "New evidence." },
      {
        env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    const [reopenAudit] = await db
      .select({ detail: deskAuditLog.detail })
      .from(deskAuditLog)
      .where(
        and(
          eq(deskAuditLog.action, "appraisal.reopen"),
          eq(deskAuditLog.targetId, attemptId),
        ),
      )
      .orderBy(sql`${deskAuditLog.createdAt} desc`)
      .limit(1);
    assert.deepEqual(reopenAudit.detail, { reason: "New evidence." });
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        appraiserB,
        {
          action: "appraisal.decide",
          id: attemptId,
          decision: "refuse",
        },
        {
          env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
          clientAddress: "127.0.0.1",
        },
      ),
      { message: "APPRAISAL_NOT_OWNER" },
    );
    const ownerDecision = await executeLiveBookOperation(
      db,
      appraiserA,
      {
        action: "appraisal.decide",
        id: attemptId,
        decision: "refuse",
      },
      {
        env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    assert.equal(ownerDecision.decisionNo, 1);
  });

  it("blocks legacy appraisal projection writes after an attempt exists", async () => {
    const fixture = await piece("projection-lock");
    const attemptId = `attempt-projection-lock-${suffix}`;
    const options = {
      env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
      clientAddress: "127.0.0.1",
    };
    await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: attemptId,
      timepieceId: fixture.piece.id,
      note: "",
    });
    await executeLiveBookOperation(
      db,
      appraiserA,
      {
        action: "appraisal.decide",
        id: attemptId,
        decision: "accept",
        value: 120_000,
        rangeLow: 100_000,
        rangeHigh: 140_000,
      },
      options,
    );

    for (const action of ["timepiece.update", "timepiece.deskUpdate"] as const) {
      await assert.rejects(
        () => executeLiveBookOperation(db, appraiserB, {
          action,
          id: fixture.piece.id,
          patch: {
            status: "appraised",
            valueLow: 500_000,
            valueHigh: 600_000,
            financeable: true,
          },
        }),
        { message: "ATTEMPT_STATE_CONFLICT" },
      );
    }
    const [pieceAfter] = await db
      .select()
      .from(timepieces)
      .where(eq(timepieces.id, fixture.piece.id));
    assert.equal(pieceAfter.valueLowCents, 10_000_000);
    assert.equal(pieceAfter.valueHighCents, 14_000_000);
  });

  it("restores a legacy appraised projection when its first submission is returned", async () => {
    const fixture = await piece(
      "legacy-return",
      ["front", "back", "left", "right", "clasp", "box", "papers"],
      {
        status: "appraised",
        financeable: true,
        valueLow: 100000,
        valueHigh: 140000,
        evaluatedAt: "2026-09-01T00:00:00.000Z",
      },
    );
    const attemptId = `attempt-legacy-return-${suffix}`;
    await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: attemptId,
      timepieceId: fixture.piece.id,
      note: "",
    });
    await executeLiveBookOperation(
      db,
      appraiserA,
      { action: "appraisal.return", id: attemptId, note: "Add a clearer photo." },
      {
        env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    const [restored] = await db
      .select()
      .from(timepieces)
      .where(eq(timepieces.id, fixture.piece.id));
    assert.equal(restored.status, "appraised");
    assert.equal(restored.financeable, true);
    assert.equal(restored.valueLowCents, 10_000_000);
    assert.equal(restored.valueHighCents, 14_000_000);
  });

  it("enforces required stored photos, three decisions, role fences, and references", async () => {
    const missing = await piece("missing", ["front", "back", "left", "right"]);
    await assert.rejects(
      () => executeLiveBookOperation(db, missing.actor, {
        action: "appraisal.submit",
        id: `attempt-missing-${suffix}`,
        timepieceId: missing.piece.id,
        note: "",
      }),
      { message: "PHOTOS_INCOMPLETE" },
    );
    const pending = await piece("pending", ["front", "back", "left", "right"]);
    await db.insert(photoObjects).values({
      id: `attempt-photo-pending-clasp-${suffix}`,
      timepieceId: pending.piece.id,
      customerId: pending.customer.id,
      kind: "clasp",
      originalKey: `development/originals/${pending.customer.id}/pending-clasp`,
      originalChecksum: "ef".repeat(32),
      originalBytes: 100,
      contentType: "image/jpeg",
      previewKey: `development/previews/${pending.customer.id}/pending-clasp`,
      previewChecksum: "ef".repeat(32),
      previewBytes: 50,
      previewContentType: "image/jpeg",
      status: "pending",
      uploadedBy: pending.customer.email,
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, pending.actor, {
        action: "appraisal.submit",
        id: `attempt-pending-${suffix}`,
        timepieceId: pending.piece.id,
        note: "",
      }),
      { message: "PHOTOS_NOT_STORED" },
    );

    const fixture = await piece("limits");
    await assertDbReject(
      (tx) => tx.insert(appraisalAttempts).values({
        id: `attempt-malformed-${suffix}`,
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: 99,
        decisionNo: 1,
        status: "accepted",
        snapshot: { fields: {}, note: "" },
        decidedByStaffId: appraiserA.staffId,
        decidedAt: new Date(),
        // Deliberately no value/range: the DB invariant must reject this even
        // if a future writer bypasses the operation parser.
      }),
      (error) => nestedMessage(error).includes("appraisal_attempts_decision_shape_check"),
    );
    for (const malformed of [
      {
        id: `attempt-malformed-returned-${suffix}`,
        attemptNo: 98,
        status: "returned",
        valueCents: 1,
      },
      {
        id: `attempt-malformed-review-${suffix}`,
        attemptNo: 97,
        status: "under_review",
        decidedByStaffId: appraiserA.staffId,
        decidedAt: new Date(),
      },
    ]) {
      await assertDbReject(
        (tx) => tx.insert(appraisalAttempts).values({
          ...malformed,
          timepieceId: fixture.piece.id,
          customerId: fixture.customer.id,
          snapshot: { fields: {}, note: "" },
        }),
        (error) => nestedMessage(error).includes("appraisal_attempts_decision_shape_check"),
      );
    }
    await assertDbReject(
      (tx) => tx.insert(appraisalAttempts).values({
        id: `attempt-returned-without-note-${suffix}`,
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: 96,
        status: "returned",
        snapshot: { fields: {}, note: "" },
      }),
      (error) => nestedMessage(error).includes("appraisal_attempts_response_note_check"),
    );
    await assertDbReject(
      (tx) => tx.insert(appraisalAttempts).values({
        id: `attempt-partial-finalization-${suffix}`,
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: 95,
        decisionNo: 1,
        status: "accepted",
        snapshot: { fields: {}, note: "" },
        decidedByStaffId: appraiserA.staffId,
        decidedAt: new Date(),
        valueCents: 100,
        rangeLowCents: 100,
        rangeHighCents: 200,
        finalizedAt: new Date(),
      }),
      (error) => nestedMessage(error).includes("appraisal_attempts_finalization_shape_check"),
    );
    const priorIds = [1, 2, 3].map((number) => `attempt-limit-${number}-${suffix}`);
    await db.insert(appraisalAttempts).values(
      priorIds.map((id, index) => ({
        id,
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: index + 1,
        decisionNo: index + 1,
        status: "refused",
        snapshot: { fields: {}, note: "" },
        decidedByStaffId: appraiserA.staffId,
        decidedAt: new Date(),
      })),
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, fixture.actor, {
        action: "appraisal.submit",
        id: `attempt-limit-4-${suffix}`,
        timepieceId: fixture.piece.id,
        note: "",
      }),
      { message: "APPRAISAL_ATTEMPTS_EXHAUSTED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        admin,
        { action: "appraisal.reopen", id: priorIds[2], reason: "No." },
        {
          env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
          clientAddress: "127.0.0.1",
        },
      ),
      { message: "ROLE_FORBIDDEN" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        deskActor("appraiser", "missing-id@mac.test"),
        { action: "appraisal.reopen", id: priorIds[2], reason: "No id." },
        {
          env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
          clientAddress: "127.0.0.1",
        },
      ),
      { message: "SESSION_INVALID" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, fixture.actor, {
        action: "timepiece.remove",
        id: fixture.piece.id,
      }),
      { message: "TIMEPIECE_REFERENCED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, superAdmin, {
        action: "customer.remove",
        id: fixture.customer.id,
      }),
      { message: "CUSTOMER_REFERENCED" },
    );
  });

  it("refuses to reopen an older attempt after a newer submission", async () => {
    const fixture = await piece("superseded");
    const firstId = `attempt-superseded-1-${suffix}`;
    const secondId = `attempt-superseded-2-${suffix}`;
    const options = {
      env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
      clientAddress: "127.0.0.1",
    };

    await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: firstId,
      timepieceId: fixture.piece.id,
      note: "",
    });
    await executeLiveBookOperation(
      db,
      appraiserA,
      { action: "appraisal.decide", id: firstId, decision: "refuse" },
      options,
    );
    await executeLiveBookOperation(db, fixture.actor, {
      action: "appraisal.submit",
      id: secondId,
      timepieceId: fixture.piece.id,
      note: "",
    });

    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        appraiserA,
        { action: "appraisal.reopen", id: firstId, reason: "Older evidence." },
        options,
      ),
      { message: "ATTEMPT_SUPERSEDED" },
    );
  });

  it("refuses retail edits while a piece is held on a live repo", async () => {
    const fixture = await piece("held");
    const agreementId = `agreement-held-${suffix}`;
    await db.insert(liveAgreements).values({
      id: agreementId,
      customerId: fixture.customer.id,
      amountCents: 100_000,
      termMonths: 12,
      delivery: "vault",
      ownerName: fixture.customer.name,
      email: fixture.customer.email,
      status: "signed",
      createdOn: "2026-09-19",
      signedOn: "2026-09-19",
    });
    await db.insert(liveAgreementMembers).values({
      id: `member-held-${suffix}`,
      agreementId,
      timepieceId: fixture.piece.id,
      status: "live",
    });

    await assert.rejects(
      () => executeLiveBookOperation(db, fixture.actor, {
        action: "timepiece.update",
        id: fixture.piece.id,
        patch: { condition: "Mint" },
      }),
      { message: "PIECE_HELD" },
    );
  });

  it("allows exactly one decision transition on the third attempt", async () => {
    const fixture = await piece("race");
    const now = new Date();
    const ids = [1, 2, 3].map((number) => `attempt-race-${number}-${suffix}`);
    await db.insert(appraisalAttempts).values([
      {
        id: ids[0],
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: 1,
        decisionNo: 1,
        status: "refused",
        snapshot: { fields: {}, note: "" },
        decidedByStaffId: appraiserA.staffId,
        decidedAt: now,
      },
      {
        id: ids[1],
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: 2,
        decisionNo: 2,
        status: "refused",
        snapshot: { fields: {}, note: "" },
        decidedByStaffId: appraiserA.staffId,
        decidedAt: now,
      },
      {
        id: ids[2],
        timepieceId: fixture.piece.id,
        customerId: fixture.customer.id,
        attemptNo: 3,
        status: "under_review",
        snapshot: { fields: {}, note: "" },
      },
    ]);
    await executeLiveBookOperation(
      db,
      appraiserA,
      { action: "appraisal.decide", id: ids[2], decision: "refuse" },
      {
        env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        appraiserB,
        { action: "appraisal.decide", id: ids[2], decision: "refuse" },
        {
          env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
          clientAddress: "127.0.0.1",
        },
      ),
      { message: "ATTEMPT_STATE_CONFLICT" },
    );
    const [attempt] = await db
      .select()
      .from(appraisalAttempts)
      .where(eq(appraisalAttempts.id, ids[2]));
    assert.equal(attempt.decisionNo, 3);
    assert.equal(attempt.status, "refused");
  });

  it("finalizes an Accept with an inspected value and reverses it without spending a decision", async () => {
    const fixture = await piece("inspect");
    const attemptId = `attempt-inspect-${suffix}`;
    const agreementId = `repo-inspect-${suffix}`;
    await db.insert(appraisalAttempts).values({
      id: attemptId,
      timepieceId: fixture.piece.id,
      customerId: fixture.customer.id,
      attemptNo: 1,
      decisionNo: 1,
      status: "accepted",
      snapshot: { fields: {}, note: "" },
      decidedByStaffId: appraiserA.staffId,
      decidedAt: new Date(),
      valueCents: 11_000_000,
      rangeLowCents: 10_000_000,
      rangeHighCents: 12_000_000,
    });
    await db.insert(liveAgreements).values({
      id: agreementId,
      customerId: fixture.customer.id,
      amountCents: 3_000_000,
      termMonths: 12,
      delivery: "",
      ownerName: fixture.customer.name,
      email: fixture.customer.email,
      status: "inspecting",
      createdOn: "2026-09-20",
    });
    const before = completedAppraisalDecisions(
      await db.select().from(appraisalAttempts).where(eq(appraisalAttempts.timepieceId, fixture.piece.id)),
      fixture.piece.id,
    );
    const finalized = await finalizeAcceptedAttempt(db, {
      timepieceId: fixture.piece.id,
      agreementId,
      staffId: appraiserA.staffId!,
      inspectedValueCents: 4_500_000,
    });
    assert.equal(finalized.inspectedValueCents, 4_500_000);
    assert.ok(finalized.finalizedAt);
    assert.equal(finalized.finalizedAgreementId, agreementId);
    assert.equal(finalized.decisionNo, 1);
    await assert.rejects(
      () => finalizeAcceptedAttempt(db, {
        timepieceId: fixture.piece.id,
        agreementId,
        staffId: appraiserA.staffId!,
        inspectedValueCents: 5_000_000,
      }),
      { message: "INSPECTION_INCOMPLETE" },
    );
    await db.update(appraisalAttempts)
      .set({
        finalizedAt: null,
        finalizedByStaffId: null,
        finalizedAgreementId: null,
        inspectedValueCents: null,
      })
      .where(eq(appraisalAttempts.id, attemptId));
    const reversed = await reverseAcceptedAttempt(db, { timepieceId: fixture.piece.id });
    assert.equal(reversed.status, "refused");
    assert.equal(reversed.decisionNo, 1);
    assert.equal(reversed.valueCents, null);
    const after = await db.select().from(appraisalAttempts).where(eq(appraisalAttempts.timepieceId, fixture.piece.id));
    assert.equal(completedAppraisalDecisions(after, fixture.piece.id), before);
  });
});
