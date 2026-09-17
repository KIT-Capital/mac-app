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

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

/** @returns {string} */
export function utcToday() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {{ createdAt: string, termMonths: number }} agreement
 * @returns {string}
 */
export function termDate(agreement) {
  return addCalendarMonths(agreement.createdAt, agreement.termMonths);
}

/**
 * @param {string | undefined} kind
 * @returns {kind is "bought_back" | "in_liquidation" | "liquidated" | "renewed"}
 */
function isEndKind(kind) {
  return BOOK_END_KINDS.includes(kind);
}

/**
 * @param {string} label
 * @returns {boolean}
 */
export function isLiveBookLabel(label) {
  return LIVE_BOOK_LABELS.includes(label);
}

/**
 * @param {{ bookEnd?: { kind?: string } | null }} agreement
 * @param {string} [today]
 * @returns {"open" | "past due" | "bought back" | "in liquidation" | "liquidated" | "renewed"}
 */
export function bookLabel(agreement, today = utcToday()) {
  const end = agreement?.bookEnd;
  if (end && isEndKind(end.kind)) {
    return BOOK_LABELS[end.kind];
  }
  const due = termDate(agreement);
  return today > due ? BOOK_LABELS.past_due : BOOK_LABELS.open;
}

/**
 * @param {{ createdAt: string }} agreement
 * @param {{ kind?: string, date?: string, amount?: number }} input
 * @param {string} [today]
 * @returns {{ ok: true, end: { kind: string, date: string, amount: number } } | { ok: false, error: string }}
 */
export function validateAgreementEnd(agreement, input, today = utcToday()) {
  if (!input || !isEndKind(input.kind)) {
    return { ok: false, error: "INVALID_KIND" };
  }
  if (typeof input.date !== "string" || !ISO_DATE.test(input.date)) {
    return { ok: false, error: "MISSING_DATE" };
  }
  if (input.date < agreement.createdAt) {
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
export function applyAgreementEnd(agreement, input, today = utcToday()) {
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
 * Watch ids still held by an open, past-due, or in-liquidation repo.
 *
 * @param {Array<{ watchIds?: string[], bookEnd?: { kind?: string } | null, createdAt: string, termMonths: number }>} agreements
 * @param {string} [today]
 * @returns {Set<string>}
 */
export function liveWatchIds(agreements, today = utcToday()) {
  const ids = new Set();
  for (const agreement of agreements ?? []) {
    if (!isLiveBookLabel(bookLabel(agreement, today))) continue;
    for (const watchId of agreement.watchIds ?? []) {
      ids.add(watchId);
    }
  }
  return ids;
}

/**
 * Watch ids from a proposed repo that already sit on a live repo.
 *
 * @param {string[]} watchIds
 * @param {Array<{ watchIds?: string[], bookEnd?: { kind?: string } | null, createdAt: string, termMonths: number }>} agreements
 * @param {string} [today]
 * @returns {string[]}
 */
export function conflictingLiveWatchIds(watchIds, agreements, today = utcToday()) {
  const live = liveWatchIds(agreements, today);
  return (watchIds ?? []).filter((id) => live.has(id));
}
