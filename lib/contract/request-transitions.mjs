/**
 * Repo request transitions, as one pure table.
 *
 * Both books drive their requests through `applyTransition`, so the live book
 * and the browser book cannot answer the same move differently (R25). Nothing
 * here does I/O: the caller supplies the clock, the actor, and any minted ids,
 * and receives the next row, the event to record, and which document stage to
 * mint. Persistence, locking, and notices belong to the callers (U10, U11).
 *
 * Layering: this module may read `repo-book.mjs`; `repo-book.mjs` never reads
 * this one.
 */
import {
  DELIVERY_DAYS,
  REQUEST_RESPONSE_DAYS,
  validateSaleAmountLower,
} from "./repo-book.mjs";

export { DELIVERY_DAYS, REQUEST_RESPONSE_DAYS };

/** Statuses that no further transition may leave. */
const TERMINAL = Object.freeze(["executed", "closed"]);

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
  // there is no proposal yet to decline or to argue down (R12, R13).
  submitted: {
    deskReturn: { actorKind: "desk" },
    withdraw: { actorKind: "retail", next: "closed", closeReason: "withdrawn" },
    flagCustomerSuccess: { actorKind: "desk", next: "submitted", internal: true },
  },
  // Your turn: the owner holds a proposal. The Desk does not overwrite it.
  returned: {
    signCollector: { actorKind: "retail", next: "collector_signed", mintsStage: "collector_signed" },
    askLower: { actorKind: "retail", next: "submitted", versionBump: true, mintsStage: "proposal" },
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

/** The Desk's three answers to a request, folded into one action (R12). */
const DESK_RETURN_DECISIONS = Object.freeze({
  confirm: { next: "returned" },
  lower: { next: "returned", versionBump: true, mintsStage: "proposal", movesAmount: true },
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
 * The four words a retail user ever reads for a request (R29, KTD22).
 *
 * @param {{status?: string}} agreement
 * @returns {"With MAC" | "Your turn" | "Active" | "Closed"}
 */
export function retailRequestWord(agreement) {
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

  // Amount only ever moves down, and only where the table says it may.
  const movesAmount = resolved.movesAmount || action === "askLower" || action === "amend";
  let amount = Number(agreement?.amount ?? 0);
  if (movesAmount) {
    if (input?.amount === undefined) return fail("AMOUNT_REQUIRED");
    const checked = validateSaleAmountLower(amount, Number(input.amount));
    if (!checked.ok) return fail(checked.error);
    amount = Number(input.amount);
  }

  const version = Number(agreement?.version ?? 1) + (resolved.versionBump ? 1 : 0);
  const next = {
    ...agreement,
    status: resolved.next,
    version,
    amount,
    lastActionAt: ctx.now,
  };
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
