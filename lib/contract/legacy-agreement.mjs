/**
 * The one legacy mapping (KTD21).
 *
 * Before the request model, a repo row carried `draft | pending_signature |
 * signed` and sat on the book from the day it was created. Three readers need
 * to agree on what those rows become: the SQL backfill in the migration, the
 * browser book's persisted-state upgrade, and the Desk import planner. They
 * all call this function, so the three can never drift apart.
 *
 * No legacy row lands in a request state — a request is something a retail
 * user applied for, and these rows predate applying.
 */

const LEGACY_STATUSES = Object.freeze(["draft", "pending_signature", "signed"]);

/** A request reserves its pieces; an executed repo holds them live. */
function holdsPiecesForStatus(status, executedOn) {
  if (status === "closed") return "released";
  if (status === "executed") return executedOn ? "live" : "released";
  return "reserved";
}

/**
 * @param {string | undefined | null} value
 * @returns {string | undefined}
 */
function isoDay(value) {
  const text = String(value ?? "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : undefined;
}

/**
 * @param {{
 *   status?: string,
 *   createdAt?: string,
 *   signedAt?: string,
 *   signedOn?: string,
 *   updatedAt?: string,
 *   version?: number,
 *   executedOn?: string,
 * }} agreement
 * @returns {{
 *   status: import("../types").AgreementStatus,
 *   executedOn: string | undefined,
 *   closeReason: import("../types").RequestCloseReason | undefined,
 *   version: number,
 *   lastActionAt: string,
 *   signedAt?: string | undefined,
 *   membersStatus: "live" | "released" | "reserved",
 *   event: {action: string, actorKind: "system", fromStatus: string, toStatus: string, version: number} | undefined,
 * }}
 */
export function legacyAgreementToRequest(agreement) {
  const status = String(agreement?.status ?? "");
  const createdOn = isoDay(agreement?.createdAt);
  // A row that already tracks its own last action keeps it: rewinding the clock
  // to the creation day would make a live request look expired and free its
  // reserved pieces (KTD12).
  const lastActionAt =
    agreement?.lastActionAt ??
    agreement?.updatedAt ??
    (createdOn ? `${createdOn}T00:00:00.000Z` : new Date(0).toISOString());

  // Anything that is not one of the three legacy values is already on the new
  // shape — including request states a later unit writes. Carry it through
  // untouched so a re-run, a second import, or a future in-flight request is
  // never collapsed into an executed repo.
  if (!LEGACY_STATUSES.includes(status)) {
    const executedOn = isoDay(agreement?.executedOn);
    return {
      status,
      executedOn,
      closeReason: agreement?.closeReason,
      version: Number(agreement?.version ?? 1),
      lastActionAt,
      membersStatus: holdsPiecesForStatus(status, executedOn),
      event: undefined,
    };
  }

  // A draft was never sent, so nothing about it belongs on the book.
  if (status === "draft") {
    return {
      status: "closed",
      executedOn: undefined,
      closeReason: "withdrawn",
      version: 1,
      lastActionAt,
      membersStatus: "released",
      event: {
        action: "legacy_backfill",
        actorKind: "system",
        fromStatus: status,
        toStatus: "closed",
        version: 1,
      },
    };
  }

  // `signed` uses the day it was signed; `pending_signature` rows were already
  // on the book with live members from the day they were created, and the Hale
  // demo depends on that reading.
  const executedOn =
    status === "signed"
      ? isoDay(agreement?.signedAt) ?? isoDay(agreement?.signedOn) ?? createdOn
      : createdOn;

  // An executed repo must carry the day it went on the book — the schema will
  // enforce `(status = 'executed') = (executed_on is not null)`. A legacy row
  // with no readable date cannot be executed, so it closes instead.
  if (!executedOn) {
    return {
      status: "closed",
      executedOn: undefined,
      closeReason: "withdrawn",
      version: 1,
      lastActionAt,
      membersStatus: "released",
      event: {
        action: "legacy_backfill",
        actorKind: "system",
        fromStatus: status,
        toStatus: "closed",
        version: 1,
      },
    };
  }

  return {
    status: "executed",
    executedOn,
    closeReason: undefined,
    version: 1,
    lastActionAt,
    // A legacy `signed` row that never recorded its date is still signed, and
    // every immutability check now reads `signedAt`, so carry one through.
    signedAt:
      status === "signed" ? isoDay(agreement?.signedAt) ?? isoDay(agreement?.signedOn) ?? executedOn : undefined,
    membersStatus: "live",
    event: {
      action: "legacy_backfill",
      actorKind: "system",
      fromStatus: status,
      toStatus: "executed",
      version: 1,
    },
  };
}
