const FORBIDDEN = new Set([
  "DESK_REQUIRED",
  "ROLE_FORBIDDEN",
  "ADMIN_REQUIRED",
  "ADMIN_RENEW_REQUIRED",
  "COLLECTOR_REQUIRED",
  "ISOLATION_DENIED",
  "DESK_SESSION_INVALID",
]);
const UNAUTHORIZED = new Set([
  "SESSION_INVALID",
  "SESSION_REQUIRED",
]);
const NOT_FOUND = new Set([
  "CUSTOMER_NOT_FOUND",
  "TIMEPIECE_NOT_FOUND",
  "AGREEMENT_NOT_FOUND",
  "DOCUMENT_NOT_FOUND",
  "PHOTO_NOT_FOUND",
  "ATTEMPT_NOT_FOUND",
  "PREVIEW_NOT_FOUND",
  "CATALOG_ENTRY_NOT_FOUND",
  "CATALOG_BRAND_NOT_FOUND",
  "AGREEMENT_SHELL_NOT_FOUND",
]);
const CONFLICT = new Set([
  "AGREEMENT_HAS_DOCUMENTS",
  "DOCUMENT_VERSION_CONFLICT",
  "ID_COLLISION",
  "PREVIEW_ID_COLLISION",
  "LIVE_WATCH_CONFLICT",
  "REVIEW_LOCKED",
  "PIECE_HELD",
  "SUBMISSION_OPEN",
  "ATTEMPT_STATE_CONFLICT",
  "APPRAISAL_ATTEMPTS_EXHAUSTED",
  "APPRAISAL_NOT_OWNER",
  "ATTEMPT_SUPERSEDED",
  "PHOTO_KIND_TAKEN",
  "PHOTO_REFERENCED",
  "TIMEPIECE_REFERENCED",
  "CUSTOMER_REFERENCED",
  "AGREEMENT_IMMUTABLE",
  "PASSWORD_ROTATION_REQUIRED",
  "AGREEMENT_SHELL_OPEN_EXISTS",
  "AGREEMENT_OPEN_SHELL_REQUIRED",
  // Request transitions: the row moved under the caller, or its clock ran out.
  "AGREEMENT_STATE_CONFLICT",
  "REQUEST_EXPIRED",
  "APPRAISAL_EXPIRED",
  "DOCUMENT_STALE",
  "DOCUMENT_NOT_READY",
  "DOCUMENT_ALREADY_SENT",
  "SIGNATURE_STALE",
  "INSPECTION_INCOMPLETE",
]);
/**
 * The unique indexes that mean "this piece is already spoken for". U5 widened
 * the rule from live members to held ones; environments that have not run that
 * migration still raise the old name, so both must read as the same conflict.
 */
export const HELD_PIECE_CONSTRAINTS = new Set([
  "live_agreement_members_held_timepiece_uidx",
  "live_agreement_members_live_timepiece_uidx",
]);
const THROTTLED = new Set([
  "DOCUMENT_SEND_THROTTLED",
  "THROTTLED",
]);
const UPSTREAM = new Set([
  "DOCUMENT_SEND_FAILED",
  "DOCUMENT_SEND_TIMEOUT",
  "SPARKLE_UNAVAILABLE",
]);
const INVALID = new Set([
  "DOCUMENT_BODY_INVALID",
  "DOCUMENT_RECIPIENT_UNCONFIRMED",
  "LIVE_BOOK_ACTION_INVALID",
  "LIVE_BOOK_OPERATION_INVALID",
  "LIVE_BOOK_ID_REQUIRED",
  "PREVIEW_URL_INVALID",
  "PREVIEW_KIND_INVALID",
  "WATCH_IDS_REQUIRED",
  "AGREEMENT_SCALE_INVALID",
  "SCALE_UNFROZEN",
  "DOCUMENT_UNAVAILABLE",
  "PHOTO_SIZE_MISMATCH",
  "PHOTO_CHECKSUM_IN_USE",
  "PHOTO_UPLOAD_INVALID",
  "NOTE_TOO_LONG",
  "APPRAISAL_RETURN_INVALID",
  "APPRAISAL_DECISION_INVALID",
  "APPRAISAL_REOPEN_INVALID",
  "PHOTOS_INCOMPLETE",
  "PHOTOS_NOT_STORED",
  "RANGE_REQUIRED",
  "AGREEMENT_AMOUNT_INVALID",
  "AGREEMENT_TERM_INVALID",
  "AGREEMENT_DATE_INVALID",
  "CUSTOMER_UPDATE_INVALID",
  "CUSTOMER_INVITE_INVALID",
  "SETTINGS_UPDATE_INVALID",
  "CATALOG_ENTRY_INVALID",
  "PHOTO_REQUIRED",
  "AGREEMENT_SHELL_INVALID",
  "RESERVED_DESK_EMAIL",
  "ASSET_CODE_INVALID",
  "INVALID_DOLLAR_AMOUNT",
  "CLIENT_ADDRESS_REQUIRED",
  "TIMEPIECE_IDENTITY_REQUIRED",
  "TIMEPIECE_NOT_OWNED",
  "INELIGIBLE_PIECE",
  "NOT_LIVE",
  "INVALID_KIND",
  "MISSING_DATE",
  "DATE_BEFORE_CREATED",
  "DATE_AFTER_TODAY",
  "INVALID_AMOUNT",
  "AMOUNT_RAISE_FORBIDDEN",
  "REQUEST_DECISION_INVALID",
  "AMOUNT_ABOVE_CAP",
  "AMOUNT_BELOW_MINIMUM",
  "AMOUNT_WHOLE_DOLLARS",
  "AMOUNT_REQUIRED",
  "REQUEST_NO_CHANGE",
  "INSPECTED_VALUE_REQUIRED",
  "DELIVERY_METHOD_INVALID",
  "TYPED_NAME_REQUIRED",
  "PAYMENT_REFERENCE_REQUIRED",
  "CHECKLIST_INCOMPLETE",
  "RETURN_NOT_APPLICABLE",
]);

function constraintName(error) {
  let current = error;
  for (let depth = 0; depth < 5; depth += 1) {
    if (!current || typeof current !== "object") return null;
    if (typeof current.constraint === "string") return current.constraint;
    current = current.cause;
  }
  return null;
}

export function liveBookErrorResponse(error) {
  const message = error instanceof Error ? error.message : "";
  if (UNAUTHORIZED.has(message)) return { status: 401, error: message };
  if (FORBIDDEN.has(message)) return { status: 403, error: message };
  if (NOT_FOUND.has(message)) return { status: 404, error: message };
  if (CONFLICT.has(message)) return { status: 409, error: message };
  if (THROTTLED.has(message)) return { status: 429, error: message };
  if (UPSTREAM.has(message)) return { status: 503, error: message };
  if (INVALID.has(message)) return { status: 422, error: message };
  const constraint = constraintName(error);
  if (HELD_PIECE_CONSTRAINTS.has(constraint)) {
    return { status: 409, error: "LIVE_WATCH_CONFLICT" };
  }
  if (constraint === "agreement_shells_open_uidx") {
    return { status: 409, error: "AGREEMENT_SHELL_OPEN_EXISTS" };
  }
  if (constraint === "appraisal_attempts_open_timepiece_uidx") {
    return { status: 409, error: "SUBMISSION_OPEN" };
  }
  if (constraint === "appraisal_attempts_timepiece_decision_uidx") {
    return { status: 409, error: "APPRAISAL_ATTEMPTS_EXHAUSTED" };
  }
  if (constraint === "catalog_references_retail_photo_check") {
    return { status: 422, error: "PHOTO_REQUIRED" };
  }
  if ([
    "appraisal_attempts_pkey",
    "live_agreements_pkey",
    "live_agreement_members_pkey",
    "live_previews_pkey",
    "timepieces_pkey",
    "customers_pkey",
  ].includes(constraint)) {
    return { status: 409, error: "ID_COLLISION" };
  }
  return { status: 503, error: "LIVE_BOOK_WRITE_FAILED" };
}
