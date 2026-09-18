import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { liveBookErrorResponse } from "./live-book-errors.mjs";

describe("live-book route errors", () => {
  it("maps known validation and authorization errors to stable 4xx responses", () => {
    assert.deepEqual(liveBookErrorResponse(new Error("DESK_REQUIRED")), {
      status: 403,
      error: "DESK_REQUIRED",
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
    assert.deepEqual(liveBookErrorResponse(new Error("DOCUMENT_SEND_THROTTLED")), {
      status: 429,
      error: "DOCUMENT_SEND_THROTTLED",
    });
  });

  it("hides unexpected database and infrastructure messages", () => {
    assert.deepEqual(
      liveBookErrorResponse(new Error("Failed query: password=secret")),
      { status: 503, error: "LIVE_BOOK_WRITE_FAILED" },
    );
  });

  it("maps nested Postgres uniqueness constraints to stable conflicts", () => {
    const wrapped = new Error("Failed query");
    wrapped.cause = { cause: { constraint: "live_agreement_members_live_timepiece_uidx" } };
    assert.deepEqual(liveBookErrorResponse(wrapped), {
      status: 409,
      error: "LIVE_WATCH_CONFLICT",
    });
    const duplicate = new Error("Failed query");
    duplicate.cause = { constraint: "live_agreements_pkey" };
    assert.deepEqual(liveBookErrorResponse(duplicate), {
      status: 409,
      error: "ID_COLLISION",
    });
  });
});
