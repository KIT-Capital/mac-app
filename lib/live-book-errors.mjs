const FORBIDDEN = new Set([
  "DESK_REQUIRED",
  "ADMIN_REQUIRED",
  "COLLECTOR_REQUIRED",
  "ISOLATION_DENIED",
]);
const NOT_FOUND = new Set([
  "CUSTOMER_NOT_FOUND",
  "TIMEPIECE_NOT_FOUND",
  "AGREEMENT_NOT_FOUND",
  "PREVIEW_NOT_FOUND",
]);
const CONFLICT = new Set([
  "ID_COLLISION",
  "PREVIEW_ID_COLLISION",
  "LIVE_WATCH_CONFLICT",
  "TIMEPIECE_REFERENCED",
  "CUSTOMER_REFERENCED",
  "AGREEMENT_IMMUTABLE",
]);
const INVALID = new Set([
  "LIVE_BOOK_ACTION_INVALID",
  "LIVE_BOOK_OPERATION_INVALID",
  "LIVE_BOOK_ID_REQUIRED",
  "PREVIEW_URL_INVALID",
  "PREVIEW_KIND_INVALID",
  "WATCH_IDS_REQUIRED",
  "AGREEMENT_SCALE_INVALID",
  "AGREEMENT_AMOUNT_INVALID",
  "AGREEMENT_TERM_INVALID",
  "AGREEMENT_DATE_INVALID",
  "CUSTOMER_UPDATE_INVALID",
  "CUSTOMER_INVITE_INVALID",
  "RESERVED_DESK_EMAIL",
  "ASSET_CODE_INVALID",
  "INVALID_DOLLAR_AMOUNT",
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

export function liveBookErrorResponse(error) {
  const message = error instanceof Error ? error.message : "";
  if (FORBIDDEN.has(message)) return { status: 403, error: message };
  if (NOT_FOUND.has(message)) return { status: 404, error: message };
  if (CONFLICT.has(message)) return { status: 409, error: message };
  if (INVALID.has(message)) return { status: 422, error: message };
  return { status: 503, error: "LIVE_BOOK_WRITE_FAILED" };
}
