import {
  addCalendarMonths,
  bookLabel,
  isLiveBookLabel,
  validateAgreementEnd,
} from "./repo-book.mjs";
import { repurchaseDollars } from "./repo-scale.mjs";

/**
 * Months on the old repo used to price a renew. Clamped to 1..termMonths.
 *
 * @param {{ createdAt?: string, executedOn?: string | null, termMonths: number }} agreement
 * @param {string} closeDate
 * @returns {number}
 */
export function monthsHeldForRenewal(agreement, closeDate) {
  const term = Math.max(1, Math.trunc(agreement.termMonths) || 12);
  // The term clock runs from execution (KTD7).
  const start = agreement.executedOn ?? agreement.createdAt;
  let held = term;
  for (let month = 1; month <= term; month += 1) {
    if (addCalendarMonths(start, month) > closeDate) {
      held = month - 1;
      break;
    }
  }
  return Math.max(1, held);
}

/**
 * @param {{ createdAt: string, termMonths: number, amount: number, watchIds?: string[], bookEnd?: { kind?: string } | null, scale?: object, delivery?: string, ownerName?: string, email?: string }} agreement
 * @param {string} closeDate
 * @param {string} [today]
 * @param {object} [successorScale]
 * @returns {{ ok: false, error: string } | { ok: true, end: { kind: "renewed", date: string, amount: number }, successor: { watchIds: string[], amount: number, termMonths: number, delivery: string, ownerName: string, email: string, status: "executed", createdAt: string, executedOn: string, scale?: object } }}
 */
export function planRenewal(agreement, closeDate, today, successorScale) {
  if (!isLiveBookLabel(bookLabel(agreement, today))) {
    return { ok: false, error: "NOT_LIVE" };
  }
  const monthsHeld = monthsHeldForRenewal(agreement, closeDate);
  const scale = agreement.scale ?? agreement.termMonths;
  const amount = repurchaseDollars(agreement.amount, monthsHeld, scale);
  const checked = validateAgreementEnd(agreement, { kind: "renewed", date: closeDate, amount }, today);
  if (!checked.ok) {
    return { ok: false, error: checked.error };
  }
  if (amount == null) {
    return { ok: false, error: "INVALID_AMOUNT" };
  }
  return {
    ok: true,
    end: { kind: "renewed", date: checked.end.date, amount: checked.end.amount },
    successor: {
      watchIds: [...(agreement.watchIds ?? [])],
      amount,
      termMonths: 12,
      delivery: agreement.delivery ?? "Desk arranges intake",
      ownerName: agreement.ownerName ?? "",
      email: agreement.email ?? "",
      // The pieces are already in MAC custody, so a successor opens executed
      // on the day the old repo closed (KTD21) — it is never a request.
      status: "executed",
      createdAt: closeDate,
      executedOn: closeDate,
      scale: successorScale,
    },
  };
}
