/**
 * Repo request transitions, as one pure table.
 *
 * Both books drive their requests through `applyTransition`, so the live book
 * and the browser book cannot answer the same move differently (R25). Nothing
 * here does I/O: the caller supplies the clock, the actor, and any minted ids,
 * and receives the next row, the event to record, and which document stage to
 * mint. Persistence, locking, and notices belong to the callers (U10, U11).
 *
 * The app exists to avoid negotiation. Before inspection the amount never
 * moves: the Desk confirms or declines, the owner signs, declines, or
 * withdraws. Only `amend`, after a re-appraisal at inspection, may lower it.
 *
 * Layering: this module may read `repo-book.mjs`; `repo-book.mjs` never reads
 * this one.
 */
import {
  DELIVERY_DAYS,
  REQUEST_RESPONSE_DAYS,
  REQUEST_STATES,
  deskToday,
  isRequestExpired,
  validateSaleAmountLower,
} from "./repo-book.mjs";

export { DELIVERY_DAYS, REQUEST_RESPONSE_DAYS };

/** Statuses that no further transition may leave. */
const TERMINAL = Object.freeze(["executed", "closed"]);

/** Desk queue tabs. Retail screens keep the four collector words. */
export const DESK_REQUEST_TABS = Object.freeze([
  { id: "queue", label: "Queue" },
  { id: "awaiting-collector", label: "Awaiting collector" },
  { id: "awaiting-intake", label: "Awaiting intake" },
  { id: "inspection", label: "Inspection" },
  { id: "book", label: "Book" },
  { id: "closed", label: "Closed" },
]);

const FORBIDDEN_COPY = /\b(loan|lender|interest|debt|financing|vesting|paid off|originated|advance|principal|balance|collateral|borrower)\b/i;

const DESK_EVENT_LINES = Object.freeze({
  submit: "Collector sent this request.",
  signCollector: "Collector signed.",
  recordDelivery: "Intake recorded.",
  inspect: "Inspection recorded.",
  amend: "Inspection returned a new amount.",
  declineAtInspection: "Declined at inspection.",
  executeMac: "MAC completed the purchase.",
  decline: "Collector declined this request.",
  withdraw: "Collector withdrew this request.",
  expire: "This request expired.",
  recordReturn: "Pieces returned.",
  flagCustomerSuccess: "Customer-success flag updated.",
});

/**
 * The table. One row per legal (status, action) cell.
 *
 * `actorKind` is who may drive the cell; `requiresInspector` narrows a desk
 * cell to the roles that may inspect and sign for MAC (KTD16). `versionBump`
 * and `mintsStage` fire only where the money or the pieces actually change
 * (KTD6, R21).
 */
const TABLE = Object.freeze({
  // With MAC: the Desk owes an answer. The owner's only exit is to withdraw —
  // there is no proposal yet to decline (R12, R13).
  submitted: {
    deskReturn: { actorKind: "desk" },
    withdraw: { actorKind: "retail", next: "closed", closeReason: "withdrawn" },
    flagCustomerSuccess: { actorKind: "desk", next: "submitted", internal: true },
  },
  // Your turn: the owner holds a proposal at the amount they chose. They sign
  // it or leave; there is no counter-offer, and the Desk does not overwrite it.
  returned: {
    signCollector: { actorKind: "retail", next: "collector_signed", mintsStage: "collector_signed" },
    decline: { actorKind: "retail", next: "closed", closeReason: "declined_by_collector" },
    withdraw: { actorKind: "retail", next: "closed", closeReason: "withdrawn" },
    expire: { actorKind: "system", next: "closed", closeReason: "expired" },
    flagCustomerSuccess: { actorKind: "desk", next: "returned", internal: true },
  },
  collector_signed: {
    recordDelivery: { actorKind: "desk", next: "inspecting" },
    withdraw: { actorKind: "retail", next: "closed", closeReason: "withdrawn" },
    expire: { actorKind: "system", next: "closed", closeReason: "expired" },
    flagCustomerSuccess: { actorKind: "desk", next: "collector_signed", internal: true },
  },
  inspecting: {
    // The pieces are MAC's only once MAC signs and pays, so the owner may still
    // pull out; R27 then owes them a recorded return of the pieces.
    withdraw: { actorKind: "retail", next: "closed", closeReason: "withdrawn" },
    amend: {
      actorKind: "desk",
      requiresInspector: true,
      next: "returned",
      versionBump: true,
      mintsStage: "proposal",
    },
    executeMac: {
      actorKind: "desk",
      requiresInspector: true,
      next: "executed",
      mintsStage: "executed",
      setsExecutedOn: true,
    },
    declineAtInspection: {
      actorKind: "desk",
      requiresInspector: true,
      next: "closed",
      closeReason: "declined_by_desk",
    },
    flagCustomerSuccess: { actorKind: "desk", next: "inspecting", internal: true },
  },
  executed: {},
  closed: {},
});

/**
 * The Desk's two answers to a request, folded into one action (R12). Neither
 * touches the amount; a Desk return is never a counter-offer.
 */
const DESK_RETURN_DECISIONS = Object.freeze({
  confirm: { next: "returned" },
  decline: { next: "closed", closeReason: "declined_by_desk" },
});

const INSPECTOR_ROLES = Object.freeze(["appraiser", "super_admin"]);

function fail(error) {
  return { ok: false, error };
}

/**
 * @param {string | undefined} status
 * @returns {boolean}
 */
export function isTerminalRequestStatus(status) {
  return TERMINAL.includes(status);
}

/**
 * A row that has not executed is a request; executed and legacy rows read
 * the book. A closed request with no `executedOn` stays a request.
 *
 * @param {{ status?: string, executedOn?: string | null }} agreement
 * @returns {boolean}
 */
export function isRequestRow(agreement) {
  return !agreement?.executedOn && (
    REQUEST_STATES.includes(agreement?.status) || agreement?.status === "closed"
  );
}

/**
 * Which Desk tab a row belongs on. Executed and legacy Hale rows read Book.
 *
 * @param {{ status?: string, executedOn?: string | null }} agreement
 * @returns {"queue" | "awaiting-collector" | "awaiting-intake" | "inspection" | "book" | "closed"}
 */
export function deskRequestTab(agreement) {
  if (!isRequestRow(agreement)) return "book";
  switch (agreement?.status) {
    case "submitted":
      return "queue";
    case "returned":
      return "awaiting-collector";
    case "collector_signed":
      return "awaiting-intake";
    case "inspecting":
      return "inspection";
    case "closed":
      return "closed";
    default:
      return "book";
  }
}

/**
 * @param {{events?: Array<{action?: string}>}} agreement
 * @returns {boolean}
 */
export function hasRecordReturn(agreement) {
  return (agreement?.events ?? []).some((event) => event.action === "recordReturn");
}

/**
 * Inspected-value cap, matching `maxPurchaseAmount(dollars, dollars, share)`.
 *
 * @param {number} inspectedValueCents
 * @param {number} [purchaseShare]
 * @returns {number}
 */
export function inspectCapDollars(inspectedValueCents, purchaseShare = 0.6) {
  const dollars = Number(inspectedValueCents) / 100;
  return Math.round((dollars * purchaseShare) / 500) * 500;
}

/**
 * What recording this inspection will do. The appraiser never types the amount.
 *
 * @param {{amount?: number, scale?: {purchaseShare?: number}}} agreement
 * @param {Array<{decision?: string, inspectedValueCents?: number}>} pieces
 * @returns {{kind: "execute" | "return" | "decline", maximum: number, amount: number}}
 */
export function inspectPreview(agreement, pieces) {
  const rows = Array.isArray(pieces) ? pieces : [];
  const kept = rows.filter((piece) => piece.decision === "confirm");
  const share = Number(agreement?.scale?.purchaseShare ?? 0.6);
  const maximum = kept.reduce(
    (sum, piece) => sum + inspectCapDollars(piece.inspectedValueCents ?? 0, share),
    0,
  );
  const dropped = kept.length !== rows.length;
  if (!kept.length) return { kind: "decline", maximum, amount: 0 };
  const signed = Number(agreement?.amount ?? 0);
  if (dropped || signed > maximum) {
    return { kind: "return", maximum, amount: Math.min(signed, maximum) };
  }
  return { kind: "execute", maximum, amount: signed };
}

/**
 * Warn before a desk note uses a collector-forbidden word (R24). Does not block.
 *
 * @param {string} [text]
 * @returns {string}
 */
export function forbiddenCopyWarning(text) {
  return FORBIDDEN_COPY.test(String(text ?? ""))
    ? "This note uses a word MAC does not use with collectors."
    : "";
}

/**
 * The four words a retail user ever reads for a request (R29, KTD22).
 * A derived-expired request already reads Closed (KTD12); the server closes
 * the row at the next mutation.
 *
 * @param {{status?: string, lastActionAt?: string | null}} agreement
 * @param {string} [today]
 * @returns {"With MAC" | "Your turn" | "Active" | "Closed"}
 */
export function retailRequestWord(agreement, today = deskToday()) {
  if (isRequestExpired(agreement, today)) return "Closed";
  switch (agreement?.status) {
    case "returned":
      return "Your turn";
    case "executed":
      return "Active";
    case "closed":
      return "Closed";
    default:
      return "With MAC";
  }
}

/** List headings, in the order a collector reads them (R29). */
export const RETAIL_LIST_WORDS = Object.freeze(["Your turn", "With MAC", "Active", "Closed"]);

/**
 * Group a list row under one of the four words. A request uses
 * `retailRequestWord`; an executed book row is Active unless a staff end
 * has closed it.
 *
 * @param {{status?: string, lastActionAt?: string | null, executedOn?: string | null, bookEnd?: {kind?: string}}} agreement
 * @param {string} [today]
 * @returns {"Your turn" | "With MAC" | "Active" | "Closed"}
 */
export function retailListWord(agreement, today = deskToday()) {
  if (isRequestRow(agreement)) return retailRequestWord(agreement, today);
  const end = agreement?.bookEnd?.kind;
  if (end === "bought_back" || end === "liquidated" || end === "renewed") return "Closed";
  return "Active";
}

/**
 * Pieces that were on this request at Apply and are no longer reserved —
 * dropped at inspection (R43). `pieceCaps` keeps the original set.
 *
 * @param {{watchIds?: string[], pieceCaps?: Record<string, number>}} agreement
 * @returns {string[]}
 */
export function releasedWatchIds(agreement) {
  const current = new Set(agreement?.watchIds ?? []);
  return Object.keys(agreement?.pieceCaps ?? {}).filter((id) => !current.has(id));
}

/**
 * Start again (R31) opens New repo with every piece that was on this request.
 *
 * @param {{watchIds?: string[], pieceCaps?: Record<string, number>}} agreement
 * @returns {string}
 */
export function startAgainHref(agreement) {
  const ids = [...new Set([...(agreement?.watchIds ?? []), ...releasedWatchIds(agreement)])];
  return ids.length ? `/repurchase/new?watches=${ids.join(",")}` : "/repurchase/new";
}

/**
 * The one line under the retail word. Never an internal status (R29).
 *
 * @param {{
 *   status?: string,
 *   version?: number,
 *   deliveredOn?: string | null,
 *   lastActionAt?: string | null,
 *   signatures?: Array<{party?: string}>,
 *   events?: Array<{action?: string}>,
 * }} agreement
 * @param {string} [today]
 * @returns {string}
 */
export function retailRequestLine(agreement, today = deskToday()) {
  const word = retailRequestWord(agreement, today);
  if (word === "Your turn") {
    return Number(agreement?.version ?? 1) > 1
      ? "MAC inspected the pieces. Sign the new amount."
      : "MAC confirmed your request.";
  }
  if (word === "Closed") {
    const returned = (agreement?.events ?? []).some((event) => event.action === "recordReturn");
    if (agreement?.deliveredOn && !returned) return "Awaiting return of your pieces.";
    return "This request is closed.";
  }
  if (
    agreement?.status === "collector_signed"
    || agreement?.status === "inspecting"
    || (agreement?.signatures ?? []).some((signature) => signature.party === "collector")
  ) {
    return "Awaiting inspection.";
  }
  return "MAC is reviewing your request.";
}

const EVENT_LINES = Object.freeze({
  submit: "You sent this request.",
  deskReturn: "MAC confirmed your request.",
  signCollector: "You signed.",
  recordDelivery: "MAC received the pieces.",
  inspect: "MAC inspected the pieces.",
  amend: "MAC inspected the pieces.",
  declineAtInspection: "MAC declined this request.",
  executeMac: "MAC completed the purchase.",
  decline: "You declined this request.",
  withdraw: "You withdrew this request.",
  expire: "This request closed.",
  recordReturn: "MAC returned your pieces.",
});

/**
 * One retail sentence for a thread row. Empty string means hide it.
 *
 * @param {{action?: string, toStatus?: string}} event
 * @returns {string}
 */
export function retailEventLine(event) {
  if (event?.action === "deskReturn" && event?.toStatus === "closed") {
    return "MAC declined this request.";
  }
  return EVENT_LINES[event?.action] ?? "";
}

/**
 * One desk sentence for a thread row. Empty string means hide it.
 *
 * @param {{action?: string, toStatus?: string}} event
 * @returns {string}
 */
export function deskEventLine(event) {
  if (event?.action === "deskReturn" && event?.toStatus === "closed") {
    return "Desk declined this request.";
  }
  if (event?.action === "deskReturn") return "Desk confirmed this request.";
  return DESK_EVENT_LINES[event?.action] ?? "";
}

/**
 * Which actions this actor may drive from this state. Drives the one primary
 * action per retail screen (R29) and the Desk's queue controls.
 *
 * @param {{status?: string}} agreement
 * @param {{kind?: string, role?: string}} actor
 * @returns {string[]}
 */
export function nextAllowedActions(agreement, actor) {
  const cells = TABLE[agreement?.status ?? ""] ?? {};
  return Object.keys(cells).filter((action) => {
    const cell = cells[action];
    if (cell.actorKind !== actor?.kind) return false;
    if (cell.requiresInspector && !INSPECTOR_ROLES.includes(actor?.role)) return false;
    return true;
  });
}

/**
 * Apply one transition. Returns the next row plus the event to record and the
 * document stage to mint, or a named refusal.
 *
 * @param {Record<string, unknown>} agreement
 * @param {{action: string, decision?: string, amount?: number, watchIds?: string[], note?: string}} input
 * @param {{now: string, today: string, actor: {kind?: string, id?: string, role?: string}}} ctx
 */
export function applyTransition(agreement, input, ctx) {
  const status = String(agreement?.status ?? "");
  const action = String(input?.action ?? "");
  const cell = (TABLE[status] ?? {})[action];
  if (!cell) return fail("AGREEMENT_STATE_CONFLICT");
  if (cell.actorKind !== ctx?.actor?.kind) return fail("ROLE_FORBIDDEN");
  if (cell.requiresInspector && !INSPECTOR_ROLES.includes(ctx?.actor?.role)) {
    return fail("ROLE_FORBIDDEN");
  }

  let resolved = cell;
  if (action === "deskReturn") {
    const decision = DESK_RETURN_DECISIONS[String(input?.decision ?? "")];
    if (!decision) return fail("REQUEST_DECISION_INVALID");
    resolved = { ...cell, ...decision };
  }

  // Amount only ever moves down, and only at inspection after a re-appraisal.
  const movesAmount = action === "amend";
  let amount = Number(agreement?.amount ?? 0);
  let changed = false;
  if (movesAmount) {
    if (input?.amount === undefined) return fail("AMOUNT_REQUIRED");
    const checked = validateSaleAmountLower(amount, Number(input.amount));
    if (!checked.ok) return fail(checked.error);
    changed = Number(input.amount) !== amount;
    amount = Number(input.amount);
  }
  if (action === "amend" && Array.isArray(input?.watchIds)) {
    const before = [...(agreement?.watchIds ?? [])].sort().join("\u0000");
    changed = changed || before !== [...input.watchIds].sort().join("\u0000");
  }
  // A version and a fresh proposal mean the money or the pieces moved. Amending
  // to the same offer is not a new round for the owner to sign again.
  if (resolved.versionBump && !changed) return fail("REQUEST_NO_CHANGE");

  const version = Number(agreement?.version ?? 1) + (resolved.versionBump ? 1 : 0);
  const next = {
    ...agreement,
    status: resolved.next,
    version,
    amount,
  };
  // Internal cells (the desk flag) must not reset the collector's expiry clock.
  if (!resolved.internal) next.lastActionAt = ctx.now;
  if (action === "amend" && Array.isArray(input?.watchIds)) {
    next.watchIds = [...input.watchIds];
  }
  if (resolved.setsExecutedOn) next.executedOn = ctx.today;
  if (resolved.closeReason) next.closeReason = resolved.closeReason;
  else delete next.closeReason;

  return {
    ok: true,
    agreement: next,
    mintsStage: resolved.mintsStage,
    event: {
      action,
      actorKind: ctx.actor.kind,
      actorId: ctx.actor.id ?? "",
      fromStatus: status,
      toStatus: resolved.next,
      amount,
      version,
      note: String(input?.note ?? ""),
      internal: Boolean(resolved.internal),
      createdAt: ctx.now,
    },
  };
}
