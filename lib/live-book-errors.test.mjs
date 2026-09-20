import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveBookErrorResponse } from "./live-book-errors.mjs";

describe("live-book route errors", () => {
  it("maps known validation and authorization errors to stable 4xx responses", () => {
    assert.deepEqual(liveBookErrorResponse(new Error("DESK_REQUIRED")), {
      status: 403,
      error: "DESK_REQUIRED",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("ROLE_FORBIDDEN")), {
      status: 403,
      error: "ROLE_FORBIDDEN",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("ATTEMPT_NOT_FOUND")), {
      status: 404,
      error: "ATTEMPT_NOT_FOUND",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("REVIEW_LOCKED")), {
      status: 409,
      error: "REVIEW_LOCKED",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("APPRAISAL_NOT_OWNER")), {
      status: 409,
      error: "APPRAISAL_NOT_OWNER",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("PHOTOS_INCOMPLETE")), {
      status: 422,
      error: "PHOTOS_INCOMPLETE",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("DESK_SESSION_INVALID")), {
      status: 403,
      error: "DESK_SESSION_INVALID",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("SESSION_INVALID")), {
      status: 401,
      error: "SESSION_INVALID",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("PREVIEW_ID_COLLISION")), {
      status: 409,
      error: "PREVIEW_ID_COLLISION",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("AGREEMENT_IMMUTABLE")), {
      status: 409,
      error: "AGREEMENT_IMMUTABLE",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("AGREEMENT_SCALE_INVALID")), {
      status: 422,
      error: "AGREEMENT_SCALE_INVALID",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("AGREEMENT_SHELL_NOT_FOUND")), {
      status: 404,
      error: "AGREEMENT_SHELL_NOT_FOUND",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("AGREEMENT_OPEN_SHELL_REQUIRED")), {
      status: 409,
      error: "AGREEMENT_OPEN_SHELL_REQUIRED",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("DOCUMENT_SEND_THROTTLED")), {
      status: 429,
      error: "DOCUMENT_SEND_THROTTLED",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("DOCUMENT_SEND_TIMEOUT")), {
      status: 503,
      error: "DOCUMENT_SEND_TIMEOUT",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("PHOTO_NOT_FOUND")), {
      status: 404,
      error: "PHOTO_NOT_FOUND",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("PHOTO_SIZE_MISMATCH")), {
      status: 422,
      error: "PHOTO_SIZE_MISMATCH",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("PHOTO_UPLOAD_INVALID")), {
      status: 422,
      error: "PHOTO_UPLOAD_INVALID",
    });
    assert.deepEqual(liveBookErrorResponse(new Error("PHOTO_CHECKSUM_IN_USE")), {
      status: 422,
      error: "PHOTO_CHECKSUM_IN_USE",
    });
  });

  it("maps the request flow's refusals to stable statuses", () => {
    const expected = {
      AGREEMENT_STATE_CONFLICT: 409,
      REQUEST_EXPIRED: 409,
      APPRAISAL_EXPIRED: 409,
      THROTTLED: 429,
      REQUEST_DECISION_INVALID: 422,
      AMOUNT_ABOVE_CAP: 422,
      AMOUNT_BELOW_MINIMUM: 422,
      AMOUNT_WHOLE_DOLLARS: 422,
      AMOUNT_REQUIRED: 422,
      REQUEST_NO_CHANGE: 422,
      DOCUMENT_UNAVAILABLE: 422,
      INSPECTED_VALUE_REQUIRED: 422,
      DELIVERY_METHOD_INVALID: 422,
      DOCUMENT_STALE: 409,
      DOCUMENT_NOT_READY: 409,
      SIGNATURE_STALE: 409,
      INSPECTION_INCOMPLETE: 409,
      TYPED_NAME_REQUIRED: 422,
      PAYMENT_REFERENCE_REQUIRED: 422,
      CHECKLIST_INCOMPLETE: 422,
      RETURN_NOT_APPLICABLE: 422,
    };
    for (const [code, status] of Object.entries(expected)) {
      assert.deepEqual(liveBookErrorResponse(new Error(code)), { status, error: code }, code);
    }
  });

  it("hides unexpected database and infrastructure messages", () => {
    assert.deepEqual(
      liveBookErrorResponse(new Error("Failed query: password=secret")),
      { status: 503, error: "LIVE_BOOK_WRITE_FAILED" },
    );
  });

  it("maps nested Postgres uniqueness constraints to stable conflicts", () => {
    const wrapped = new Error("Failed query");
    wrapped.cause = { cause: { constraint: "live_agreement_members_held_timepiece_uidx" } };
    assert.deepEqual(liveBookErrorResponse(wrapped), {
      status: 409,
      error: "LIVE_WATCH_CONFLICT",
    });
    // Environments that have not run U5's migration still raise the old name.
    const legacyIndex = new Error("Failed query");
    legacyIndex.cause = { cause: { constraint: "live_agreement_members_live_timepiece_uidx" } };
    assert.deepEqual(liveBookErrorResponse(legacyIndex), {
      status: 409,
      error: "LIVE_WATCH_CONFLICT",
    });
    const duplicate = new Error("Failed query");
    duplicate.cause = { constraint: "live_agreements_pkey" };
    assert.deepEqual(liveBookErrorResponse(duplicate), {
      status: 409,
      error: "ID_COLLISION",
    });
    const openShell = new Error("Failed query");
    openShell.cause = { constraint: "agreement_shells_open_uidx" };
    assert.deepEqual(liveBookErrorResponse(openShell), {
      status: 409,
      error: "AGREEMENT_SHELL_OPEN_EXISTS",
    });
  });
});
