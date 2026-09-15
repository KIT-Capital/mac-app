/**
 * Store UI dollar amounts as integer cents. This is a unit conversion, not a valuation formula.
 *
 * @param {number | null | undefined} dollars
 * @returns {number | null}
 */
export function dollarsToCents(dollars) {
  if (dollars === null || dollars === undefined) return null;
  if (typeof dollars !== "number" || !Number.isFinite(dollars)) {
    throw new Error("INVALID_DOLLAR_AMOUNT");
  }
  return Math.round(dollars * 100);
}

/**
 * @param {number | null | undefined} cents
 * @returns {number | undefined}
 */
export function centsToDollars(cents) {
  if (cents === null || cents === undefined) return undefined;
  return cents / 100;
}
