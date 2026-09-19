import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyAppraisalDecision,
  applyAppraisalReopen,
  applyAppraisalReturn,
  applyAppraisalSubmit,
  browserPhotoMutationError,
} from "./appraisal-attempt-apply.mjs";

const REQUIRED = ["front", "back", "left", "right", "clasp"];

function state() {
  const images = REQUIRED.map((kind) => `data:image/jpeg;base64,${kind}`);
  return {
    timepieces: [{
      id: "piece-1",
      ownerEmail: "collector@example.com",
      brand: "Cartier",
      model: "Crash",
      images,
      photoKinds: REQUIRED,
      status: "not_evaluated",
      financeable: false,
      condition: "Excellent",
      boxPapers: "Box and papers",
      caseMetal: "Gold",
      caseType: "Asymmetric",
      caseDiameter: "38mm",
      dialColor: "White",
      buckle: "Pin",
      band: "strap",
      bandMaterial: "Leather",
      complication: "Time only",
    }],
    agreements: [],
    photos: REQUIRED.map((kind, index) => ({
      id: `photo-${kind}`,
      assetId: "piece-1",
      kind,
      url: images[index],
      caption: kind,
      uploadedAt: "2026-09-19",
      ownerEmail: "collector@example.com",
    })),
    appraisalAttempts: [],
    appraisalAttemptPhotos: [],
    settings: { requiredPhotoKinds: REQUIRED },
  };
}

const collector = { role: "collector", email: "collector@example.com" };
const appraiserA = { role: "appraiser", email: "a@mechartcap.com", staffId: "staff-a" };
const appraiserB = { role: "appraiser", email: "b@mechartcap.com", staffId: "staff-b" };
const superAdmin = { role: "super_admin", email: "rc@mechartcap.com", staffId: "staff-rc" };

describe("browser appraisal attempt application", () => {
  it("freezes one demo snapshot and locks a second submission", () => {
    const submitted = applyAppraisalSubmit(
      state(),
      collector,
      { id: "attempt-1", timepieceId: "piece-1", note: "Check the bracelet." },
      "2026-09-19T12:00:00.000Z",
    );
    assert.equal(submitted.ok, true);
    assert.equal(submitted.state.appraisalAttempts[0].status, "under_review");
    assert.equal(submitted.state.appraisalAttempts[0].snapshot.book, "browser");
    assert.equal(submitted.state.appraisalAttemptPhotos.length, 5);
    assert.ok(submitted.state.appraisalAttemptPhotos.every((photo) => photo.book === "browser"));
    assert.ok(submitted.state.appraisalAttemptPhotos.every((photo) => !("originalKey" in photo)));
    assert.equal(submitted.state.timepieces[0].status, "reviewing");

    assert.deepEqual(
      applyAppraisalSubmit(
        submitted.state,
        collector,
        { id: "attempt-2", timepieceId: "piece-1", note: "" },
        "2026-09-19T12:01:00.000Z",
      ),
      { ok: false, error: "SUBMISSION_OPEN" },
    );
  });

  it("accepts outside the advisory range and returns a warning", () => {
    const submitted = applyAppraisalSubmit(
      state(),
      collector,
      { id: "attempt-1", timepieceId: "piece-1", note: "" },
      "2026-09-19T12:00:00.000Z",
    );
    const decided = applyAppraisalDecision(
      submitted.state,
      appraiserA,
      {
        id: "attempt-1",
        decision: "accept",
        value: 150000,
        rangeLow: 100000,
        rangeHigh: 140000,
      },
      "2026-09-19T13:00:00.000Z",
    );
    assert.equal(decided.ok, true);
    assert.equal(decided.rangeWarning, "above");
    assert.equal(decided.state.appraisalAttempts[0].decisionNo, 1);
    assert.equal(decided.state.timepieces[0].valueLow, 100000);
    assert.equal(decided.state.timepieces[0].appraisalValue, 150000);
  });

  it("matches live validation errors for malformed decisions", () => {
    const submitted = applyAppraisalSubmit(
      state(),
      collector,
      { id: "attempt-1", timepieceId: "piece-1", note: "" },
      "2026-09-19T12:00:00.000Z",
    );
    assert.deepEqual(
      applyAppraisalDecision(
        submitted.state,
        appraiserA,
        { id: "attempt-1", decision: "accept", value: 1 },
      ),
      { ok: false, error: "RANGE_REQUIRED" },
    );
    assert.deepEqual(
      applyAppraisalDecision(
        submitted.state,
        appraiserA,
        {
          id: "attempt-1",
          decision: "accept",
          value: -1,
          rangeLow: 100,
          rangeHigh: 200,
        },
      ),
      { ok: false, error: "APPRAISAL_DECISION_INVALID" },
    );
    assert.deepEqual(
      applyAppraisalDecision(
        submitted.state,
        appraiserA,
        { id: "attempt-1", decision: "refuse", value: 1 },
      ),
      { ok: false, error: "APPRAISAL_DECISION_INVALID" },
    );
  });

  it("keeps decision ownership and decision number through reopen", () => {
    const submitted = applyAppraisalSubmit(
      state(),
      collector,
      { id: "attempt-1", timepieceId: "piece-1", note: "" },
      "2026-09-19T12:00:00.000Z",
    );
    const refused = applyAppraisalDecision(
      submitted.state,
      appraiserA,
      { id: "attempt-1", decision: "refuse" },
      "2026-09-19T13:00:00.000Z",
    );
    const reopened = applyAppraisalReopen(
      refused.state,
      superAdmin,
      { id: "attempt-1", reason: "New evidence." },
    );
    assert.equal(reopened.ok, true);
    assert.deepEqual(
      applyAppraisalDecision(
        reopened.state,
        appraiserB,
        {
          id: "attempt-1",
          decision: "accept",
          value: 120000,
          rangeLow: 100000,
          rangeHigh: 140000,
        },
        "2026-09-19T15:00:00.000Z",
      ),
      { ok: false, error: "APPRAISAL_NOT_OWNER" },
    );
    const ownerDecision = applyAppraisalDecision(
      reopened.state,
      appraiserA,
      {
        id: "attempt-1",
        decision: "accept",
        value: 120000,
        rangeLow: 100000,
        rangeHigh: 140000,
      },
      "2026-09-19T15:00:00.000Z",
    );
    assert.equal(ownerDecision.ok, true);
    assert.equal(ownerDecision.state.appraisalAttempts[0].decisionNo, 1);
  });

  it("returns an undecided attempt without consuming a decision", () => {
    const submitted = applyAppraisalSubmit(
      state(),
      collector,
      { id: "attempt-1", timepieceId: "piece-1", note: "" },
      "2026-09-19T12:00:00.000Z",
    );
    const returned = applyAppraisalReturn(
      submitted.state,
      appraiserA,
      { id: "attempt-1", note: "Please add the box photo." },
    );
    assert.equal(returned.ok, true);
    assert.equal(returned.state.appraisalAttempts[0].decisionNo, null);
    assert.equal(returned.state.timepieces[0].status, "not_evaluated");
  });

  it("normalizes a legacy reviewing flag so Return cannot leave a ghost review", () => {
    const legacy = state();
    legacy.timepieces[0].status = "reviewing";
    const submitted = applyAppraisalSubmit(
      legacy,
      collector,
      { id: "attempt-legacy", timepieceId: "piece-1", note: "" },
      "2026-09-19T12:00:00.000Z",
    );
    const returned = applyAppraisalReturn(
      submitted.state,
      appraiserA,
      { id: "attempt-legacy", note: "Try again." },
    );
    assert.equal(returned.ok, true);
    assert.equal(returned.state.timepieces[0].status, "not_evaluated");
    assert.equal(returned.state.timepieces[0].appraisalState, "not_sent");
  });

  it("keeps browser preview ids bound to their original slot after submission", () => {
    const submitted = applyAppraisalSubmit(
      state(),
      collector,
      { id: "attempt-1", timepieceId: "piece-1", note: "" },
      "2026-09-19T12:00:00.000Z",
    );
    const decided = applyAppraisalDecision(
      submitted.state,
      appraiserA,
      { id: "attempt-1", decision: "refuse" },
      "2026-09-19T13:00:00.000Z",
    );
    const front = decided.state.photos.find((photo) => photo.kind === "front");
    assert.ok(front);
    assert.equal(browserPhotoMutationError(decided.state, front), null);
    assert.equal(
      browserPhotoMutationError(decided.state, { ...front, kind: "box" }),
      "PHOTO_REFERENCED",
    );
    assert.equal(
      browserPhotoMutationError(decided.state, {
        ...front,
        url: "data:image/jpeg;base64,rewritten",
      }),
      "PHOTO_REFERENCED",
    );
    assert.equal(
      browserPhotoMutationError(decided.state, {
        ...front,
        id: "replacement-front",
        url: "data:image/jpeg;base64,new",
      }),
      "PHOTO_KIND_TAKEN",
    );
  });
});
