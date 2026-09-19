import {
  completedAppraisalDecisions,
  isUnderReview,
  liveWatchIds,
  nextAppraisalAttemptNo,
} from "./contract/repo-book.mjs";
import { canEditAppraisal, isSuperAdmin } from "./roles.mjs";
import { normalizeRequiredPhotoKinds } from "./timepiece-shots.mjs";

function fail(error) {
  return { ok: false, error };
}

function staffId(actor) {
  return actor?.staffId || (actor?.email ? `browser:${String(actor.email).toLowerCase()}` : "");
}

function canOwnPiece(piece, actor) {
  return (
    (actor?.role === "collector" || actor?.role === "dealer") &&
    String(piece?.ownerEmail ?? "").toLowerCase() === String(actor.email ?? "").toLowerCase()
  );
}

function snapshotFields(piece) {
  return {
    brand: piece.brand,
    model: piece.model,
    reference: piece.reference,
    condition: piece.condition,
    boxPapers: piece.boxPapers,
    caseMetal: piece.caseMetal,
    caseType: piece.caseType,
    caseDiameter: piece.caseDiameter,
    dialColor: piece.dialColor,
    buckle: piece.buckle,
    band: piece.band,
    bandMaterial: piece.bandMaterial,
    complication: piece.complication,
  };
}

function piecePhotos(state, piece) {
  const byKind = new Map();
  for (const photo of state.photos ?? []) {
    if (photo.assetId !== piece.id || byKind.has(photo.kind)) continue;
    byKind.set(photo.kind, photo);
  }
  return byKind;
}

function updatePiece(state, pieceId, patch) {
  return {
    ...state,
    timepieces: state.timepieces.map((piece) =>
      piece.id === pieceId ? { ...piece, ...patch } : piece
    ),
  };
}

function browserStaffCanAppraise(actor) {
  return canEditAppraisal(actor) && Boolean(staffId(actor));
}

export function browserPhotoMutationError(state, photo) {
  if (!photo?.assetId) return null;
  if (isUnderReview(state.appraisalAttempts, photo.assetId)) return "REVIEW_LOCKED";
  if (!(state.appraisalAttempts ?? []).some((attempt) => attempt.timepieceId === photo.assetId)) {
    return null;
  }
  const existingById = (state.photos ?? []).find((row) => row.id === photo.id);
  if (
    existingById &&
    (
      existingById.assetId !== photo.assetId ||
      existingById.kind !== photo.kind ||
      existingById.url !== photo.url
    )
  ) {
    return "PHOTO_REFERENCED";
  }
  const occupied = (state.photos ?? []).find(
    (row) => row.assetId === photo.assetId && row.kind === photo.kind,
  );
  if (occupied && occupied.id !== photo.id) return "PHOTO_KIND_TAKEN";
  return null;
}

function latestDecision(attempts, pieceId, excludingId) {
  return [...(attempts ?? [])]
    .filter(
      (attempt) =>
        attempt.timepieceId === pieceId &&
        attempt.id !== excludingId &&
        attempt.decisionNo !== null,
    )
    .sort((a, b) => b.decisionNo - a.decisionNo)[0];
}

export function applyAppraisalSubmit(state, actor, input, now = new Date().toISOString()) {
  const piece = state.timepieces.find((item) => item.id === input.timepieceId);
  if (!piece || !canOwnPiece(piece, actor)) return fail("TIMEPIECE_NOT_FOUND");
  if (String(input.note ?? "").trim().length > 256) return fail("NOTE_TOO_LONG");
  if (isUnderReview(state.appraisalAttempts, piece.id)) return fail("SUBMISSION_OPEN");
  if (liveWatchIds(state.agreements ?? []).has(piece.id)) return fail("PIECE_HELD");
  if (completedAppraisalDecisions(state.appraisalAttempts, piece.id) >= 3) {
    return fail("APPRAISAL_ATTEMPTS_EXHAUSTED");
  }
  if ((state.appraisalAttempts ?? []).some((attempt) => attempt.id === input.id)) {
    return fail("ID_COLLISION");
  }
  const photos = piecePhotos(state, piece);
  const required = normalizeRequiredPhotoKinds(state.settings?.requiredPhotoKinds);
  if (required.some((kind) => !photos.has(kind))) return fail("PHOTOS_INCOMPLETE");
  const note = String(input.note ?? "").trim();
  const attempt = {
    id: input.id,
    timepieceId: piece.id,
    attemptNo: nextAppraisalAttemptNo(state.appraisalAttempts, piece.id),
    decisionNo: null,
    status: "under_review",
    note,
    snapshot: {
      fields: snapshotFields(piece),
      note,
      book: "browser",
      baseline: {
        status: piece.status === "appraised" ? "appraised" : "not_evaluated",
        financeable: Boolean(piece.financeable),
        valueLowCents:
          typeof piece.valueLow === "number" ? Math.round(piece.valueLow * 100) : undefined,
        valueHighCents:
          typeof piece.valueHigh === "number" ? Math.round(piece.valueHigh * 100) : undefined,
        evaluatedAt: piece.evaluatedAt,
      },
    },
    submittedAt: now,
    reopenedCount: 0,
  };
  const evidence = [...photos.values()].map((photo) => ({
    attemptId: attempt.id,
    photoId: photo.id,
    kind: photo.kind,
    book: "browser",
  }));
  return {
    ok: true,
    state: updatePiece(
      {
        ...state,
        appraisalAttempts: [...(state.appraisalAttempts ?? []), attempt],
        appraisalAttemptPhotos: [...(state.appraisalAttemptPhotos ?? []), ...evidence],
      },
      piece.id,
      { status: "reviewing", appraisalState: "with_mac" },
    ),
  };
}

export function applyAppraisalReturn(state, actor, input) {
  if (!browserStaffCanAppraise(actor)) return fail("ROLE_FORBIDDEN");
  const attempt = (state.appraisalAttempts ?? []).find((item) => item.id === input.id);
  if (!attempt) return fail("ATTEMPT_NOT_FOUND");
  if (attempt.status !== "under_review" || attempt.decisionNo !== null) {
    return fail("ATTEMPT_STATE_CONFLICT");
  }
  const note = String(input.note ?? "").trim();
  if (!note || note.length > 1_000) return fail("APPRAISAL_RETURN_INVALID");
  const prior = latestDecision(state.appraisalAttempts, attempt.timepieceId, attempt.id);
  const baseline = attempt.snapshot?.baseline ?? {};
  const projection = prior?.status === "accepted"
    ? {
        status: "appraised",
        financeable: true,
        valueLow:
          typeof prior.rangeLowCents === "number" ? prior.rangeLowCents / 100 : undefined,
        valueHigh:
          typeof prior.rangeHighCents === "number" ? prior.rangeHighCents / 100 : undefined,
        evaluatedAt: prior.decidedAt?.slice(0, 10),
        appraisalState: "accepted",
      }
    : prior?.status === "refused"
      ? {
          status: "not_evaluated",
          financeable: false,
          valueLow: undefined,
          valueHigh: undefined,
          evaluatedAt: prior.decidedAt?.slice(0, 10),
          appraisalState: "not_accepted",
        }
      : {
          status:
            baseline.status === "reviewing" || baseline.status === "appraised"
              ? baseline.status
              : "not_evaluated",
          financeable: Boolean(baseline.financeable),
          valueLow:
            typeof baseline.valueLowCents === "number"
              ? baseline.valueLowCents / 100
              : undefined,
          valueHigh:
            typeof baseline.valueHighCents === "number"
              ? baseline.valueHighCents / 100
              : undefined,
          evaluatedAt: baseline.evaluatedAt,
          appraisalState:
            baseline.status === "appraised"
              ? "accepted"
              : baseline.status === "reviewing"
                ? "with_mac"
                : "not_sent",
        };
  const attempts = state.appraisalAttempts.map((item) =>
    item.id === attempt.id
      ? { ...item, status: "returned", responseNote: note }
      : item
  );
  return {
    ok: true,
    state: updatePiece(
      { ...state, appraisalAttempts: attempts },
      attempt.timepieceId,
      projection,
    ),
  };
}

export function applyAppraisalDecision(state, actor, input, now = new Date().toISOString()) {
  if (!browserStaffCanAppraise(actor)) return fail("ROLE_FORBIDDEN");
  const attempt = (state.appraisalAttempts ?? []).find((item) => item.id === input.id);
  if (!attempt) return fail("ATTEMPT_NOT_FOUND");
  if (attempt.status !== "under_review") return fail("ATTEMPT_STATE_CONFLICT");
  const actorId = staffId(actor);
  if (
    attempt.decisionNo !== null &&
    attempt.decidedByStaffId !== actorId &&
    !isSuperAdmin(actor)
  ) {
    return fail("APPRAISAL_NOT_OWNER");
  }
  const decisionNo =
    attempt.decisionNo ??
    completedAppraisalDecisions(
      state.appraisalAttempts.filter((item) => item.id !== attempt.id),
      attempt.timepieceId,
    ) + 1;
  if (decisionNo > 3) return fail("APPRAISAL_ATTEMPTS_EXHAUSTED");

  if (input.decision === "accept") {
    if (
      input.value === undefined ||
      input.rangeLow === undefined ||
      input.rangeHigh === undefined
    ) {
      return fail("RANGE_REQUIRED");
    }
    const value = Number(input.value);
    const rangeLow = Number(input.rangeLow);
    const rangeHigh = Number(input.rangeHigh);
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isFinite(rangeLow) ||
      rangeLow < 0 ||
      !Number.isFinite(rangeHigh) ||
      rangeHigh < rangeLow
    ) {
      return fail("APPRAISAL_DECISION_INVALID");
    }
    const rangeWarning = value < rangeLow ? "below" : value > rangeHigh ? "above" : undefined;
    const attempts = state.appraisalAttempts.map((item) =>
      item.id === attempt.id
        ? {
            ...item,
            status: "accepted",
            decisionNo,
            decidedByStaffId: actorId,
            decidedAt: now,
            valueCents: Math.round(value * 100),
            rangeLowCents: Math.round(rangeLow * 100),
            rangeHighCents: Math.round(rangeHigh * 100),
            responseNote: undefined,
          }
        : item
    );
    return {
      ok: true,
      rangeWarning,
      state: updatePiece(
        { ...state, appraisalAttempts: attempts },
        attempt.timepieceId,
        {
          status: "appraised",
          financeable: true,
          valueLow: rangeLow,
          valueHigh: rangeHigh,
          evaluatedAt: now.slice(0, 10),
          appraisalState: decisionNo >= 3 ? "closed" : "accepted",
          decisionsUsed: decisionNo,
          appraisalValue: value,
        },
      ),
    };
  }
  if (input.decision !== "refuse") return fail("APPRAISAL_DECISION_INVALID");
  if (
    input.value !== undefined ||
    input.rangeLow !== undefined ||
    input.rangeHigh !== undefined
  ) {
    return fail("APPRAISAL_DECISION_INVALID");
  }
  const attempts = state.appraisalAttempts.map((item) =>
    item.id === attempt.id
      ? {
          ...item,
          status: "refused",
          decisionNo,
          decidedByStaffId: actorId,
          decidedAt: now,
          valueCents: undefined,
          rangeLowCents: undefined,
          rangeHighCents: undefined,
          responseNote: undefined,
        }
      : item
  );
  return {
    ok: true,
    state: updatePiece(
      { ...state, appraisalAttempts: attempts },
      attempt.timepieceId,
      {
        status: "not_evaluated",
        financeable: false,
        valueLow: undefined,
        valueHigh: undefined,
        evaluatedAt: now.slice(0, 10),
        appraisalState: decisionNo >= 3 ? "closed" : "not_accepted",
        decisionsUsed: decisionNo,
        appraisalValue: undefined,
      },
    ),
  };
}

export function applyAppraisalReopen(state, actor, input) {
  if (!browserStaffCanAppraise(actor)) return fail("ROLE_FORBIDDEN");
  const attempt = (state.appraisalAttempts ?? []).find((item) => item.id === input.id);
  if (!attempt) return fail("ATTEMPT_NOT_FOUND");
  if (!["accepted", "refused"].includes(attempt.status)) {
    return fail("ATTEMPT_STATE_CONFLICT");
  }
  const newest = Math.max(
    ...(state.appraisalAttempts ?? [])
      .filter((item) => item.timepieceId === attempt.timepieceId)
      .map((item) => item.attemptNo),
  );
  if (attempt.attemptNo !== newest) return fail("ATTEMPT_SUPERSEDED");
  if (attempt.decidedByStaffId !== staffId(actor) && !isSuperAdmin(actor)) {
    return fail("APPRAISAL_NOT_OWNER");
  }
  const reason = String(input.reason ?? "").trim();
  if (!reason || reason.length > 1_000) return fail("APPRAISAL_REOPEN_INVALID");
  const attempts = state.appraisalAttempts.map((item) =>
    item.id === attempt.id
      ? { ...item, status: "under_review", reopenedCount: item.reopenedCount + 1 }
      : item
  );
  return {
    ok: true,
    state: updatePiece(
      { ...state, appraisalAttempts: attempts },
      attempt.timepieceId,
      { status: "reviewing", appraisalState: "with_mac" },
    ),
  };
}
