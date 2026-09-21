/** Operations book labels. Persist only a staff end; derive open / past due. */

export const BOOK_END_KINDS = Object.freeze([
  "bought_back",
  "in_liquidation",
  "liquidated",
  "renewed",
]);

export const BOOK_LABELS = Object.freeze({
  open: "open",
  past_due: "past due",
  bought_back: "bought back",
  in_liquidation: "in liquidation",
  liquidated: "liquidated",
  renewed: "renewed",
});

/** Labels that still hold the pieces. Bought back, liquidated, and renewed free them. */
export const LIVE_BOOK_LABELS = Object.freeze(["open", "past due", "in liquidation"]);

export const LIVE_WATCH_CONFLICT = "LIVE_WATCH_CONFLICT";

/** Business days are the Desk's calendar days (KTD18). */
export const DESK_TIME_ZONE = "America/New_York";

/** Request states, before any book label exists (KTD6). */
export const REQUEST_STATES = Object.freeze([
  "submitted",
  "returned",
  "collector_signed",
  "inspecting",
]);

export const CLOSE_REASONS = Object.freeze([
  "declined_by_desk",
  "declined_by_collector",
  "withdrawn",
  "expired",
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param {Array<{timepieceId?: string, status?: string}>} attempts
 * @param {string} timepieceId
 */
export function isUnderReview(attempts, timepieceId) {
  return (attempts ?? []).some(
    (attempt) => attempt.timepieceId === timepieceId && attempt.status === "under_review",
  );
}

/**
 * Completed decisions, not submission snapshots, consume the three decisions.
 * @param {Array<{timepieceId?: string, decisionNo?: number | null}>} attempts
 * @param {string} timepieceId
 */
export function completedAppraisalDecisions(attempts, timepieceId) {
  return (attempts ?? []).filter(
    (attempt) => attempt.timepieceId === timepieceId && Number.isInteger(attempt.decisionNo),
  ).length;
}

/**
 * @param {Array<{timepieceId?: string, attemptNo?: number | null}>} attempts
 * @param {string} timepieceId
 */
export function nextAppraisalAttemptNo(attempts, timepieceId) {
  const numbers = (attempts ?? [])
    .filter((attempt) => attempt.timepieceId === timepieceId)
    .map((attempt) => Number(attempt.attemptNo))
    .filter((attemptNo) => Number.isInteger(attemptNo) && attemptNo > 0);
  return numbers.length ? Math.max(...numbers) + 1 : 1;
}

/**
 * @typedef {{
 *   id?: string,
 *   timepieceId?: string,
 *   attemptNo?: number,
 *   decisionNo?: number | null,
 *   status?: string,
 *   responseNote?: string,
 *   decidedByStaffId?: string,
 *   decidedAt?: string,
 *   valueCents?: number,
 *   finalizedAt?: string,
 * }} AppraisalAttemptLike
 */

/** Days an Accept stays good for a repo request (R42). */
export const APPRAISAL_VALID_DAYS = 7;

/**
 * Whether a piece carries an Accept fresh enough to apply on. The latest
 * completed decision must be an Accept decided within the last seven days,
 * counting day seven itself. Attempts are the truth; a legacy `appraised`
 * piece with no attempts is read through its `evaluatedAt` date alone.
 *
 * @param {AppraisalAttemptLike[]} attempts
 * @param {string} timepieceId
 * @param {string} [today]
 * @param {{status?: string, evaluatedAt?: string} | null} [piece]
 * @returns {boolean}
 */
export function isAppraisalCurrent(attempts, timepieceId, today = deskToday(), piece = null) {
  const mine = (attempts ?? []).filter((attempt) => attempt.timepieceId === timepieceId);
  let decidedOn;
  if (mine.length) {
    const latestDecision = [...mine]
      .sort((a, b) => Number(a.attemptNo) - Number(b.attemptNo))
      .reverse()
      .find((attempt) => Number.isInteger(attempt.decisionNo));
    if (latestDecision?.status !== "accepted") return false;
    decidedOn = deskCalendarDate(latestDecision.decidedAt);
  } else if (piece?.status === "appraised") {
    decidedOn = deskCalendarDate(piece.evaluatedAt);
  }
  if (!decidedOn || !ISO_DATE.test(decidedOn)) return false;
  return today <= addCalendarDays(decidedOn, APPRAISAL_VALID_DAYS);
}

/**
 * One reading of a piece's appraisal for every surface: the live projection,
 * the collector screens, and the Desk. Attempts are the source of truth; the
 * stored `status` only answers pieces that predate the attempt model.
 *
 * @param {AppraisalAttemptLike[]} attempts
 * @param {string} timepieceId
 * @param {{status?: string} | null} [piece]
 * @returns {{
 *   word: "not_sent" | "with_mac" | "accepted" | "not_accepted" | "closed",
 *   decisionsUsed: number,
 *   value: number | undefined,
 *   openAttempt: AppraisalAttemptLike | undefined,
 *   returnedAttempt: AppraisalAttemptLike | undefined,
 *   latestDecision: AppraisalAttemptLike | undefined,
 * }}
 */
export function appraisalView(attempts, timepieceId, piece = null) {
  const mine = (attempts ?? [])
    .filter((attempt) => attempt.timepieceId === timepieceId)
    .sort((a, b) => Number(a.attemptNo) - Number(b.attemptNo));
  const decisionsUsed = mine.filter((attempt) => Number.isInteger(attempt.decisionNo)).length;
  const latest = mine.at(-1);
  const openAttempt = latest?.status === "under_review" ? latest : undefined;
  // Only a return that nothing has superseded still asks the collector for work.
  const returnedAttempt = latest?.status === "returned" ? latest : undefined;
  const latestDecision = [...mine]
    .reverse()
    .find((attempt) => Number.isInteger(attempt.decisionNo));
  const word = openAttempt
    ? "with_mac"
    : decisionsUsed >= 3
      ? "closed"
      : latestDecision?.status === "accepted"
        ? "accepted"
        : latestDecision?.status === "refused"
          ? "not_accepted"
          : piece?.status === "appraised"
            ? "accepted"
            : "not_sent";
  return {
    word,
    decisionsUsed,
    value:
      latestDecision?.status === "accepted" && typeof latestDecision.valueCents === "number"
        ? latestDecision.valueCents / 100
        : undefined,
    openAttempt,
    returnedAttempt,
    latestDecision,
  };
}

/**
 * A photograph counts as appraisal evidence only when its own book can freeze
 * it. The live book requires a stored object id: a legacy preview path and a
 * not-yet-uploaded local data URL are both display-only there. The browser book
 * has no object store, so its demo data URLs are the evidence.
 *
 * @param {string | null | undefined} url
 * @param {{allowDataUrls?: boolean}} [options]
 */
export function isEvidencePhoto(url, { allowDataUrls = true } = {}) {
  const value = String(url ?? "");
  if (!value) return false;
  if (value.startsWith("data:")) return allowDataUrls;
  return !/^(?:blob:|https?:|\/)/.test(value);
}

/**
 * Required shots a piece still owes before it can be submitted. Pass
 * `allowDataUrls: false` in live mode so the Send button never promises a
 * submission the server will refuse with `PHOTOS_INCOMPLETE`.
 *
 * @param {Array<{assetId?: string, kind?: string, url?: string}>} photos
 * @param {string} timepieceId
 * @param {string[]} requiredKinds
 * @param {{allowDataUrls?: boolean}} [options]
 * @returns {string[]}
 */
export function missingEvidenceKinds(photos, timepieceId, requiredKinds, options = {}) {
  const present = new Set(
    (photos ?? [])
      .filter((photo) => photo.assetId === timepieceId && isEvidencePhoto(photo.url, options))
      .map((photo) => photo.kind),
  );
  return (requiredKinds ?? []).filter((kind) => !present.has(kind));
}

/**
 * The id a decision is recorded under. The live book uses the staff account id;
 * the browser book has no staff table, so it derives one from the desk email.
 * Both books compare ownership through this one function.
 *
 * @param {{staffId?: string, email?: string} | null | undefined} actor
 */
export function appraisalActorId(actor) {
  if (actor?.staffId) return actor.staffId;
  return actor?.email ? `browser:${String(actor.email).toLowerCase()}` : "";
}

/**
 * Which review controls a desk actor may see. Admins read; appraisers decide;
 * only the deciding appraiser or a super admin may reopen a settled ending.
 *
 * Ownership hides a control only when it can be *proven* foreign: a desk client
 * knows its email but not its staff account id, so a live-book decision id is
 * not comparable and the server's `APPRAISAL_NOT_OWNER` remains the fence.
 *
 * @param {AppraisalAttemptLike | null | undefined} attempt
 * @param {{role?: string, staffId?: string, email?: string} | null | undefined} actor
 * @returns {{readOnly: boolean, canDecide: boolean, canReturn: boolean, canReopen: boolean}}
 */
export function appraisalReviewControls(attempt, actor) {
  const id = appraisalActorId(actor);
  const appraiser =
    Boolean(id) && (actor?.role === "appraiser" || actor?.role === "super_admin");
  const owner = attempt?.decidedByStaffId;
  const comparable =
    Boolean(id && owner) && id.startsWith("browser:") === String(owner).startsWith("browser:");
  const owns =
    actor?.role === "super_admin" ||
    !Number.isInteger(attempt?.decisionNo) ||
    !comparable ||
    owner === id;
  const open = attempt?.status === "under_review";
  const settled = attempt?.status === "accepted" || attempt?.status === "refused";
  return {
    readOnly: !appraiser,
    canDecide: appraiser && open && owns,
    canReturn: appraiser && open && !Number.isInteger(attempt?.decisionNo),
    canReopen: appraiser && settled && owns,
  };
}

/**
 * @param {Array<{timepieceId?: string, status?: string}>} attempts
 * @param {string} timepieceId
 * @param {boolean} held
 * @returns {{ok: true} | {ok: false, error: "REVIEW_LOCKED" | "PIECE_HELD"}}
 */
export function canRetailEditPiece(attempts, timepieceId, held) {
  if (isUnderReview(attempts, timepieceId)) return { ok: false, error: "REVIEW_LOCKED" };
  if (held) return { ok: false, error: "PIECE_HELD" };
  return { ok: true };
}

/**
 * @param {number} year
 * @param {number} month 1-12
 */
function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

/**
 * Add calendar months to a YYYY-MM-DD date. Clamps the day to the last day of
 * the target month instead of overflowing like Date.setMonth.
 *
 * @param {string} isoDate
 * @param {number} months
 * @returns {string}
 */
export function addCalendarMonths(isoDate, months) {
  if (typeof isoDate !== "string" || !ISO_DATE.test(isoDate)) {
    throw new Error("INVALID_DATE");
  }
  if (!Number.isInteger(months)) {
    throw new Error("INVALID_MONTHS");
  }
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const day = Number(isoDate.slice(8, 10));
  const total = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  const targetDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return `${targetYear}-${pad2(targetMonth)}-${pad2(targetDay)}`;
}

/**
 * Business dates are calendar dates in the Desk's own timezone, not UTC
 * (KTD18). At 23:30 in New York a term that ends today is still open, even
 * though UTC has already rolled over.
 *
 * @param {Date} [now]
 * @returns {string}
 */
export function deskToday(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: DESK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Desk calendar day for a stored timestamp. A date-only value is already a
 * desk day; a full timestamp is read in New York, not by slicing the UTC
 * prefix (which is tomorrow after 20:00 in New York).
 *
 * @param {Date | string | null | undefined} value
 * @returns {string}
 */
export function deskCalendarDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return deskToday(value);
  const raw = String(value ?? "").trim();
  if (ISO_DATE.test(raw)) return raw;
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return deskToday(parsed);
  return "";
}

/**
 * The term clock starts at execution (KTD7). `createdAt` is the fallback only
 * for a row written before the request model existed.
 *
 * @param {{ createdAt?: string, executedOn?: string | null, termMonths: number }} agreement
 * @returns {string | null}
 */
export function termDate(agreement) {
  const start = agreement?.executedOn ?? agreement?.createdAt;
  if (!start) return null;
  return addCalendarMonths(start, agreement.termMonths);
}

/**
 * Days a request may sit waiting on the retail user before it is derived as
 * expired. Desk inaction never expires a request; the queue shows its age.
 */
export const REQUEST_RESPONSE_DAYS = 14;
export const DELIVERY_DAYS = 30;

/** States whose next move belongs to the retail user, with their window. */
const EXPIRY_WINDOWS = Object.freeze({
  returned: REQUEST_RESPONSE_DAYS,
  collector_signed: DELIVERY_DAYS,
});

/**
 * Expiry is derived, never stored (KTD12). A request that has waited past its
 * window is treated as closed everywhere it is read; the server closes it for
 * real at the next mutation.
 *
 * @param {{ status?: string, lastActionAt?: string | null }} agreement
 * @param {string} [today]
 * @returns {boolean}
 */
export function isRequestExpired(agreement, today = deskToday()) {
  const window = EXPIRY_WINDOWS[agreement?.status ?? ""];
  if (!window) return false;
  const since = deskCalendarDate(agreement?.lastActionAt);
  if (!ISO_DATE.test(since)) return false;
  return today > addCalendarDays(since, window);
}

/**
 * @param {string} isoDate
 * @param {number} days
 * @returns {string}
 */
function addCalendarDays(isoDate, days) {
  const base = new Date(`${isoDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString().slice(0, 10);
}

/**
 * @param {string | undefined} kind
 * @returns {kind is "bought_back" | "in_liquidation" | "liquidated" | "renewed"}
 */
function isEndKind(kind) {
  return BOOK_END_KINDS.includes(kind);
}

/**
 * @param {string | undefined} kind
 * @returns {{ ok: true } | { ok: false, error: "ADMIN_RENEW_REQUIRED" }}
 */
export function validateRecordedEndKind(kind) {
  return kind === "renewed"
    ? { ok: false, error: "ADMIN_RENEW_REQUIRED" }
    : { ok: true };
}

/**
 * A request has no book label at all, so `null` is never a live label.
 *
 * @param {string | null | undefined} label
 * @returns {boolean}
 */
export function isLiveBookLabel(label) {
  return typeof label === "string" && LIVE_BOOK_LABELS.includes(label);
}

/**
 * Book labels belong to executed repos only (R17, KTD7). A request that has
 * not executed has no place on the book, so it has no label.
 *
 * @param {{ bookEnd?: { kind?: string } | null, executedOn?: string | null }} agreement
 * @param {string} [today]
 * @returns {"open" | "past due" | "bought back" | "in liquidation" | "liquidated" | "renewed" | null}
 */
export function bookLabel(agreement, today = deskToday()) {
  if (!agreement?.executedOn) return null;
  const end = agreement?.bookEnd;
  if (end && isEndKind(end.kind)) {
    return BOOK_LABELS[end.kind];
  }
  const due = termDate(agreement);
  return due && today > due ? BOOK_LABELS.past_due : BOOK_LABELS.open;
}

/**
 * @param {{ createdAt: string }} agreement
 * @param {{ kind?: string, date?: string, amount?: number }} input
 * @param {string} [today]
 * @returns {{ ok: true, end: { kind: string, date: string, amount: number } } | { ok: false, error: string }}
 */
export function validateAgreementEnd(agreement, input, today = deskToday()) {
  if (!input || !isEndKind(input.kind)) {
    return { ok: false, error: "INVALID_KIND" };
  }
  if (typeof input.date !== "string" || !ISO_DATE.test(input.date)) {
    return { ok: false, error: "MISSING_DATE" };
  }
  // A repo cannot end before it went on the book.
  if (input.date < (agreement.executedOn ?? agreement.createdAt)) {
    return { ok: false, error: "DATE_BEFORE_CREATED" };
  }
  if (input.date > today) {
    return { ok: false, error: "DATE_AFTER_TODAY" };
  }
  if (typeof input.amount !== "number" || !Number.isFinite(input.amount) || input.amount < 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }
  return {
    ok: true,
    end: { kind: input.kind, date: input.date, amount: input.amount },
  };
}

/**
 * @template {Record<string, unknown>} T
 * @param {T} agreement
 * @param {{ kind?: string, date?: string, amount?: number }} input
 * @param {string} [today]
 * @returns {{ ok: true, agreement: T } | { ok: false, error: string, agreement: T }}
 */
export function applyAgreementEnd(agreement, input, today = deskToday()) {
  const checked = validateAgreementEnd(agreement, input, today);
  if (!checked.ok) {
    return { ok: false, error: checked.error, agreement };
  }
  return {
    ok: true,
    agreement: { ...agreement, bookEnd: checked.end },
  };
}

/**
 * @template {object} T
 * @param {T} agreement
 * @returns {T}
 */
export function clearAgreementEnd(agreement) {
  if (!agreement.bookEnd) return agreement;
  const next = { ...agreement };
  delete next.bookEnd;
  return next;
}

/**
 * Whether one agreement still holds its pieces: reserved by an open request,
 * or live on an executed repo. A closed or derived-expired request frees its
 * pieces at once (R18, KTD12).
 *
 * @param {{ status?: string, executedOn?: string | null, bookEnd?: { kind?: string } | null, lastActionAt?: string | null, createdAt?: string, termMonths?: number }} agreement
 * @param {string} today
 * @returns {boolean}
 */
export function holdsPieces(agreement, today) {
  if (agreement?.status === "closed") return false;
  if (REQUEST_STATES.includes(agreement?.status)) {
    return !isRequestExpired(agreement, today);
  }
  return isLiveBookLabel(bookLabel(agreement, today));
}

/**
 * Watch ids a request has reserved or an executed repo holds live.
 * Replaces `liveWatchIds`: a piece is unavailable from Apply, not from signing.
 *
 * @param {Array<{ watchIds?: string[] }>} agreements
 * @param {string} [today]
 * @returns {Set<string>}
 */
export function heldWatchIds(agreements, today = deskToday()) {
  const ids = new Set();
  for (const agreement of agreements ?? []) {
    if (!holdsPieces(agreement, today)) continue;
    for (const watchId of agreement.watchIds ?? []) {
      ids.add(watchId);
    }
  }
  return ids;
}

/**
 * MAC cannot purchase or activate a repo until every included piece has a
 * final inspected acceptance for that same repo (KTD, U-repos-heart).
 *
 * @param {Array<{ timepieceId?: string, status?: string, finalizedAt?: string | null, finalizedAgreementId?: string | null }>} attempts
 * @param {string[]} watchIds
 * @param {string} agreementId
 * @returns {boolean}
 */
export function piecesFinallyAcceptedForRepo(attempts, watchIds, agreementId) {
  if (!watchIds?.length) return false;
  return watchIds.every((watchId) =>
    (attempts ?? []).some(
      (attempt) =>
        attempt.timepieceId === watchId &&
        attempt.status === "accepted" &&
        attempt.finalizedAgreementId === agreementId &&
        Boolean(attempt.finalizedAt),
    ),
  );
}

/**
 * Watch ids from a proposed repo that another request or repo already holds.
 *
 * @param {string[]} watchIds
 * @param {Array<{ watchIds?: string[] }>} agreements
 * @param {string} [today]
 * @returns {string[]}
 */
export function conflictingHeldWatchIds(watchIds, agreements, today = deskToday()) {
  const held = heldWatchIds(agreements, today);
  return (watchIds ?? []).filter((id) => held.has(id));
}

/**
 * After Apply the sale amount only ever moves down (KTD8), and only once: the
 * inspection re-appraisal (`amend`) may lower it; nothing may raise it. The
 * Desk's return before inspection never touches the amount.
 *
 * @param {number} currentAmount
 * @param {number} requested
 * @returns {{ ok: true } | { ok: false, error: "INVALID_AMOUNT" | "AMOUNT_RAISE_FORBIDDEN" }}
 */
export function validateSaleAmountLower(currentAmount, requested) {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }
  if (requested > currentAmount) {
    return { ok: false, error: "AMOUNT_RAISE_FORBIDDEN" };
  }
  return { ok: true };
}
