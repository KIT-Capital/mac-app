import "server-only";
import { and, desc, eq, inArray, isNotNull, ne } from "drizzle-orm";
import {
  canEditAppraisal,
  isDeskRole,
  isSuperAdmin,
} from "../roles.mjs";
import {
  completedAppraisalDecisions,
  nextAppraisalAttemptNo,
} from "../contract/repo-book.mjs";
import { DEFAULT_SETTINGS } from "../theme";
import { normalizeRequiredPhotoKinds } from "../timepiece-shots.mjs";
import type { Database } from "./client";
import { dollarsToCents } from "./money.mjs";
import type { Actor } from "./records";
import {
  appraisalAttemptPhotos,
  appraisalAttempts,
  deskSettings,
  liveAgreementMembers,
  livePreviews,
  photoObjects,
  timepieces,
} from "./schema";

type PieceRow = typeof timepieces.$inferSelect;

type SubmitInput = {
  id: string;
  timepieceId: string;
  note: string;
};

type DecideInput = {
  id: string;
  decision: "accept" | "refuse";
  value?: number;
  rangeLow?: number;
  rangeHigh?: number;
};

function constraintName(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") return null;
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

function requireRetailOwner(actor: Actor) {
  if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
  return actor;
}

function requireAppraiser(actor: Actor) {
  if (!isDeskRole(actor.role) || !canEditAppraisal(actor)) {
    throw new Error("ROLE_FORBIDDEN");
  }
  const desk = actor as Extract<Actor, { role: import("../types").DeskRole }>;
  if (!desk.staffId) throw new Error("SESSION_INVALID");
  return desk as typeof desk & { staffId: string };
}

async function lockPiece(db: Database, actor: Actor, timepieceId: string) {
  const where = actor.role === "collector"
    ? and(eq(timepieces.id, timepieceId), eq(timepieces.customerId, actor.customerId))
    : eq(timepieces.id, timepieceId);
  const [piece] = await db
    .select()
    .from(timepieces)
    .where(where)
    .for("update")
    .limit(1);
  if (!piece) throw new Error("TIMEPIECE_NOT_FOUND");
  return piece;
}

async function lockAttemptAndPiece(db: Database, actor: Actor, attemptId: string) {
  const [locator] = await db
    .select({ timepieceId: appraisalAttempts.timepieceId })
    .from(appraisalAttempts)
    .where(eq(appraisalAttempts.id, attemptId))
    .limit(1);
  if (!locator) throw new Error("ATTEMPT_NOT_FOUND");
  const piece = await lockPiece(db, actor, locator.timepieceId);
  const [attempt] = await db
    .select()
    .from(appraisalAttempts)
    .where(eq(appraisalAttempts.id, attemptId))
    .for("update")
    .limit(1);
  if (!attempt) throw new Error("ATTEMPT_NOT_FOUND");
  return { attempt, piece };
}

async function lockedAttemptsForPiece(db: Database, timepieceId: string) {
  return db
    .select()
    .from(appraisalAttempts)
    .where(eq(appraisalAttempts.timepieceId, timepieceId))
    .orderBy(appraisalAttempts.attemptNo)
    .for("update");
}

function snapshotFields(piece: PieceRow) {
  return {
    brand: piece.brand,
    model: piece.model,
    reference: piece.reference ?? undefined,
    condition: piece.condition,
    boxPapers: piece.boxPapers,
    caseMetal: piece.caseMetal,
    caseType: piece.caseType,
    caseDiameter: piece.caseDiameter,
    dialColor: piece.dialColor,
    buckle: piece.buckle,
    band: piece.band === "bracelet" ? "bracelet" : "strap",
    bandMaterial: piece.bandMaterial,
    complication: piece.complication,
  };
}

async function currentStoredPhotos(db: Database, timepieceId: string) {
  const rows = await db
    .select({
      photoId: photoObjects.id,
      kind: photoObjects.kind,
      originalKey: photoObjects.originalKey,
      originalChecksum: photoObjects.originalChecksum,
      createdAt: livePreviews.createdAt,
    })
    .from(livePreviews)
    .innerJoin(photoObjects, eq(livePreviews.photoObjectId, photoObjects.id))
    .where(
      and(
        eq(livePreviews.timepieceId, timepieceId),
        eq(photoObjects.status, "stored"),
      ),
    )
    .orderBy(desc(livePreviews.createdAt), desc(livePreviews.id));
  const byKind = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!byKind.has(row.kind)) byKind.set(row.kind, row);
  }
  return [...byKind.values()];
}

async function requiredPhotoKinds(db: Database) {
  const [row] = await db
    .select({ requiredPhotoKinds: deskSettings.requiredPhotoKinds })
    .from(deskSettings)
    .where(eq(deskSettings.id, "default"))
    .limit(1);
  return normalizeRequiredPhotoKinds(
    row?.requiredPhotoKinds ?? DEFAULT_SETTINGS.requiredPhotoKinds,
  );
}

async function assertRequiredPhotos(
  db: Database,
  timepieceId: string,
  photos: Awaited<ReturnType<typeof currentStoredPhotos>>,
) {
  const required = await requiredPhotoKinds(db);
  const storedKinds = new Set(photos.map((photo) => photo.kind));
  const missing = required.filter((kind) => !storedKinds.has(kind));
  if (!missing.length) return;
  const pending = await db
    .select({ kind: photoObjects.kind })
    .from(photoObjects)
    .where(
      and(
        eq(photoObjects.timepieceId, timepieceId),
        eq(photoObjects.status, "pending"),
        inArray(photoObjects.kind, missing),
      ),
    );
  const pendingKinds = new Set(pending.map((photo) => photo.kind));
  if (missing.some((kind) => pendingKinds.has(kind))) {
    throw new Error("PHOTOS_NOT_STORED");
  }
  throw new Error("PHOTOS_INCOMPLETE");
}

async function assertPieceFree(db: Database, timepieceId: string) {
  const [member] = await db
    .select({ id: liveAgreementMembers.id })
    .from(liveAgreementMembers)
    .where(
      and(
        eq(liveAgreementMembers.timepieceId, timepieceId),
        eq(liveAgreementMembers.status, "live"),
      ),
    )
    .limit(1);
  if (member) throw new Error("PIECE_HELD");
}

export async function assertRetailPieceEditable(
  db: Database,
  timepieceId: string,
) {
  const [open, member] = await Promise.all([
    db
      .select({ id: appraisalAttempts.id })
      .from(appraisalAttempts)
      .where(
        and(
          eq(appraisalAttempts.timepieceId, timepieceId),
          eq(appraisalAttempts.status, "under_review"),
        ),
      )
      .limit(1),
    db
      .select({ id: liveAgreementMembers.id })
      .from(liveAgreementMembers)
      .where(
        and(
          eq(liveAgreementMembers.timepieceId, timepieceId),
          eq(liveAgreementMembers.status, "live"),
        ),
      )
      .limit(1),
  ]);
  if (open[0]) throw new Error("REVIEW_LOCKED");
  if (member[0]) throw new Error("PIECE_HELD");
}

export async function pieceHasAppraisalAttempt(
  db: Database,
  timepieceId: string,
) {
  const [attempt] = await db
    .select({ id: appraisalAttempts.id })
    .from(appraisalAttempts)
    .where(eq(appraisalAttempts.timepieceId, timepieceId))
    .limit(1);
  return Boolean(attempt);
}

/**
 * Every actor shares the evidence rule: no photo surface changes while review
 * is open; after the first submission an occupied kind can only be re-used
 * idempotently, never replaced or restored from an older object.
 *
 * Callers lock the timepiece row before invoking this helper.
 */
export async function assertAppraisalPhotoChangeAllowed(
  db: Database,
  timepieceId: string,
  kind: string,
  candidatePhotoId?: string,
) {
  const [openRows, attemptRows, currentRows] = await Promise.all([
    db
      .select({ id: appraisalAttempts.id })
      .from(appraisalAttempts)
      .where(
        and(
          eq(appraisalAttempts.timepieceId, timepieceId),
          eq(appraisalAttempts.status, "under_review"),
        ),
      )
      .limit(1),
    db
      .select({ id: appraisalAttempts.id })
      .from(appraisalAttempts)
      .where(eq(appraisalAttempts.timepieceId, timepieceId))
      .limit(1),
    db
      .select({
        id: livePreviews.id,
        photoObjectId: livePreviews.photoObjectId,
      })
      .from(livePreviews)
      .where(
        and(
          eq(livePreviews.timepieceId, timepieceId),
          eq(livePreviews.kind, kind),
        ),
      )
      .orderBy(desc(livePreviews.createdAt), desc(livePreviews.id))
      .limit(1),
  ]);
  const open = openRows[0];
  const anyAttempt = attemptRows[0];
  const current = currentRows[0];
  if (open) throw new Error("REVIEW_LOCKED");
  if (!anyAttempt) return;
  if (!current) return;
  const currentId = current.photoObjectId ?? current.id;
  if (!candidatePhotoId || currentId !== candidatePhotoId) {
    throw new Error("PHOTO_KIND_TAKEN");
  }
}

export async function submitAppraisalAttempt(
  db: Database,
  actor: Actor,
  input: SubmitInput,
) {
  const retail = requireRetailOwner(actor);
  const piece = await lockPiece(db, retail, input.timepieceId);
  await assertPieceFree(db, piece.id);
  const attempts = await lockedAttemptsForPiece(db, piece.id);
  if (attempts.some((attempt) => attempt.status === "under_review")) {
    throw new Error("SUBMISSION_OPEN");
  }
  if (completedAppraisalDecisions(attempts, piece.id) >= 3) {
    throw new Error("APPRAISAL_ATTEMPTS_EXHAUSTED");
  }
  const photos = await currentStoredPhotos(db, piece.id);
  await assertRequiredPhotos(db, piece.id, photos);
  const attemptNo = nextAppraisalAttemptNo(attempts, piece.id);
  try {
    await db.insert(appraisalAttempts).values({
      id: input.id,
      timepieceId: piece.id,
      customerId: piece.customerId,
      attemptNo,
      status: "under_review",
      note: input.note,
      snapshot: {
        fields: snapshotFields(piece),
        note: input.note,
        baseline: {
          status:
            piece.status === "appraised" ? "appraised" : "not_evaluated",
          financeable: piece.financeable,
          valueLowCents: piece.valueLowCents,
          valueHighCents: piece.valueHighCents,
          evaluatedAt: piece.evaluatedAt?.toISOString(),
        },
      },
    });
    if (photos.length) {
      await db.insert(appraisalAttemptPhotos).values(
        photos.map((photo) => ({
          attemptId: input.id,
          photoObjectId: photo.photoId,
          originalKey: photo.originalKey,
          originalChecksum: photo.originalChecksum,
          kind: photo.kind,
        })),
      );
    }
    await db
      .update(appraisalAttempts)
      .set({ evidenceSealedAt: new Date() })
      .where(eq(appraisalAttempts.id, input.id));
    await db
      .update(timepieces)
      .set({ status: "reviewing", updatedAt: new Date() })
      .where(eq(timepieces.id, piece.id));
  } catch (error) {
    const constraint = constraintName(error);
    if (constraint === "appraisal_attempts_open_timepiece_uidx") {
      throw new Error("SUBMISSION_OPEN");
    }
    if (constraint === "appraisal_attempts_pkey") throw new Error("ID_COLLISION");
    throw error;
  }
  return { attemptId: input.id, attemptNo };
}

async function priorPieceProjection(
  db: Database,
  timepieceId: string,
  excludingAttemptId: string,
  snapshot: unknown,
) {
  const [latest] = await db
    .select({
      status: appraisalAttempts.status,
      rangeLowCents: appraisalAttempts.rangeLowCents,
      rangeHighCents: appraisalAttempts.rangeHighCents,
      decidedAt: appraisalAttempts.decidedAt,
    })
    .from(appraisalAttempts)
    .where(
      and(
        eq(appraisalAttempts.timepieceId, timepieceId),
        isNotNull(appraisalAttempts.decisionNo),
        ne(appraisalAttempts.id, excludingAttemptId),
      ),
    )
    .orderBy(desc(appraisalAttempts.decisionNo))
    .limit(1);
  if (latest?.status === "accepted") {
    return {
      status: "appraised",
      financeable: true,
      valueLowCents: latest.rangeLowCents,
      valueHighCents: latest.rangeHighCents,
      evaluatedAt: latest.decidedAt,
    };
  }
  if (latest?.status === "refused") {
    return {
      status: "not_evaluated",
      financeable: false,
      valueLowCents: null,
      valueHighCents: null,
      evaluatedAt: latest.decidedAt,
    };
  }
  const baseline = (
    snapshot &&
    typeof snapshot === "object" &&
    "baseline" in snapshot &&
    snapshot.baseline &&
    typeof snapshot.baseline === "object"
  ) ? snapshot.baseline as Record<string, unknown> : {};
  const rawStatus = baseline.status;
  return {
    status:
      rawStatus === "reviewing" || rawStatus === "appraised"
        ? rawStatus
        : "not_evaluated",
    financeable: Boolean(baseline.financeable),
    valueLowCents:
      typeof baseline.valueLowCents === "number" ? baseline.valueLowCents : null,
    valueHighCents:
      typeof baseline.valueHighCents === "number" ? baseline.valueHighCents : null,
    evaluatedAt:
      typeof baseline.evaluatedAt === "string"
        ? new Date(baseline.evaluatedAt)
        : null,
  };
}

export async function returnAppraisalAttempt(
  db: Database,
  actor: Actor,
  input: { id: string; note: string },
) {
  requireAppraiser(actor);
  const { attempt, piece } = await lockAttemptAndPiece(db, actor, input.id);
  if (attempt.status !== "under_review" || attempt.decisionNo !== null) {
    throw new Error("ATTEMPT_STATE_CONFLICT");
  }
  await db
    .update(appraisalAttempts)
    .set({ status: "returned", responseNote: input.note, updatedAt: new Date() })
    .where(
      and(
        eq(appraisalAttempts.id, attempt.id),
        eq(appraisalAttempts.status, "under_review"),
      ),
    );
  await db
    .update(timepieces)
    .set({
      ...await priorPieceProjection(db, piece.id, attempt.id, attempt.snapshot),
      updatedAt: new Date(),
    })
    .where(eq(timepieces.id, piece.id));
  return { attemptId: attempt.id };
}

export async function decideAppraisalAttempt(
  db: Database,
  actor: Actor,
  input: DecideInput,
) {
  const appraiser = requireAppraiser(actor);
  const { attempt, piece } = await lockAttemptAndPiece(db, actor, input.id);
  if (attempt.status !== "under_review") throw new Error("ATTEMPT_STATE_CONFLICT");
  if (
    attempt.decisionNo !== null &&
    attempt.decidedByStaffId !== appraiser.staffId &&
    !isSuperAdmin(appraiser)
  ) {
    throw new Error("APPRAISAL_NOT_OWNER");
  }
  const attempts = await lockedAttemptsForPiece(db, piece.id);
  const decisionNo = attempt.decisionNo ??
    completedAppraisalDecisions(attempts.filter((row) => row.id !== attempt.id), piece.id) + 1;
  if (decisionNo > 3) throw new Error("APPRAISAL_ATTEMPTS_EXHAUSTED");
  const now = new Date();
  if (input.decision === "accept") {
    const valueCents = dollarsToCents(Number(input.value));
    const rangeLowCents = dollarsToCents(Number(input.rangeLow));
    const rangeHighCents = dollarsToCents(Number(input.rangeHigh));
    if (
      valueCents === null ||
      rangeLowCents === null ||
      rangeHighCents === null ||
      rangeHighCents < rangeLowCents
    ) {
      throw new Error("RANGE_REQUIRED");
    }
    const rangeWarning = valueCents < rangeLowCents
      ? "below"
      : valueCents > rangeHighCents
        ? "above"
        : undefined;
    const changed = await db
      .update(appraisalAttempts)
      .set({
        status: "accepted",
        decisionNo,
        decidedByStaffId: appraiser.staffId,
        decidedAt: now,
        valueCents,
        rangeLowCents,
        rangeHighCents,
        responseNote: null,
        updatedAt: now,
      })
      .where(
        and(
          eq(appraisalAttempts.id, attempt.id),
          eq(appraisalAttempts.status, "under_review"),
        ),
      )
      .returning({ id: appraisalAttempts.id });
    if (!changed.length) throw new Error("ATTEMPT_STATE_CONFLICT");
    await db
      .update(timepieces)
      .set({
        status: "appraised",
        financeable: true,
        valueLowCents: rangeLowCents,
        valueHighCents: rangeHighCents,
        evaluatedAt: now,
        updatedAt: now,
      })
      .where(eq(timepieces.id, piece.id));
    return { attemptId: attempt.id, decisionNo, rangeWarning };
  }
  const changed = await db
    .update(appraisalAttempts)
    .set({
      status: "refused",
      decisionNo,
      decidedByStaffId: appraiser.staffId,
      decidedAt: now,
      valueCents: null,
      rangeLowCents: null,
      rangeHighCents: null,
      responseNote: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(appraisalAttempts.id, attempt.id),
        eq(appraisalAttempts.status, "under_review"),
      ),
    )
    .returning({ id: appraisalAttempts.id });
  if (!changed.length) throw new Error("ATTEMPT_STATE_CONFLICT");
  await db
    .update(timepieces)
    .set({
      status: "not_evaluated",
      financeable: false,
      valueLowCents: null,
      valueHighCents: null,
      evaluatedAt: now,
      updatedAt: now,
    })
    .where(eq(timepieces.id, piece.id));
  return { attemptId: attempt.id, decisionNo };
}

export async function reopenAppraisalAttempt(
  db: Database,
  actor: Actor,
  input: { id: string; reason: string },
) {
  const appraiser = requireAppraiser(actor);
  const { attempt, piece } = await lockAttemptAndPiece(db, actor, input.id);
  if (!["accepted", "refused"].includes(attempt.status)) {
    throw new Error("ATTEMPT_STATE_CONFLICT");
  }
  const attempts = await lockedAttemptsForPiece(db, piece.id);
  const newest = Math.max(...attempts.map((row) => row.attemptNo));
  if (attempt.attemptNo !== newest) throw new Error("ATTEMPT_SUPERSEDED");
  if (
    attempt.decidedByStaffId !== appraiser.staffId &&
    !isSuperAdmin(appraiser)
  ) {
    throw new Error("APPRAISAL_NOT_OWNER");
  }
  await db
    .update(appraisalAttempts)
    .set({
      status: "under_review",
      reopenedCount: attempt.reopenedCount + 1,
      updatedAt: new Date(),
    })
    .where(eq(appraisalAttempts.id, attempt.id));
  await db
    .update(timepieces)
    .set({ status: "reviewing", updatedAt: new Date() })
    .where(eq(timepieces.id, piece.id));
  return { attemptId: attempt.id };
}
