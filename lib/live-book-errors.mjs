const FORBIDDEN = new Set([
  "DESK_REQUIRED",
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
  "PREVIEW_NOT_FOUND",
  "CATALOG_ENTRY_NOT_FOUND",
  "AGREEMENT_SHELL_NOT_FOUND",
]);
const CONFLICT = new Set([
  "AGREEMENT_HAS_DOCUMENTS",
  "DOCUMENT_VERSION_CONFLICT",
  "ID_COLLISION",
  "PREVIEW_ID_COLLISION",
  "LIVE_WATCH_CONFLICT",
  "TIMEPIECE_REFERENCED",
  "CUSTOMER_REFERENCED",
  "AGREEMENT_IMMUTABLE",
  "PASSWORD_ROTATION_REQUIRED",
  "AGREEMENT_SHELL_OPEN_EXISTS",
  "AGREEMENT_OPEN_SHELL_REQUIRED",
]);
const THROTTLED = new Set([
  "DOCUMENT_SEND_THROTTLED",
]);
const UPSTREAM = new Set([
  "DOCUMENT_SEND_FAILED",
  "DOCUMENT_SEND_TIMEOUT",
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
  "AGREEMENT_AMOUNT_INVALID",
  "AGREEMENT_TERM_INVALID",
  "AGREEMENT_DATE_INVALID",
  "CUSTOMER_UPDATE_INVALID",
  "CUSTOMER_INVITE_INVALID",
  "SETTINGS_UPDATE_INVALID",
  "CATALOG_ENTRY_INVALID",
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
  "BELOW_CURRENT",
  "OVER_LTV",
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
  if (constraint === "live_agreement_members_live_timepiece_uidx") {
    return { status: 409, error: "LIVE_WATCH_CONFLICT" };
  }
  if (constraint === "agreement_shells_open_uidx") {
    return { status: 409, error: "AGREEMENT_SHELL_OPEN_EXISTS" };
  }
  if ([
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
