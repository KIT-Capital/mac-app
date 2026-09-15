/**
 * Application-level isolation for Stage 2 records.
 * WorkOS is not wired; callers pass an explicit actor stub.
 *
 * @typedef {{ role: "collector", customerId: string, email: string }} CollectorActor
 * @typedef {{ role: "staff" | "admin", email: string }} DeskActor
 * @typedef {CollectorActor | DeskActor} Actor
 */

/**
 * @param {Actor | null | undefined} actor
 * @returns {boolean}
 */
export function isDeskActor(actor) {
  return actor?.role === "staff" || actor?.role === "admin";
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} customerId
 */
export function canReadCustomer(actor, customerId) {
  if (!actor || !customerId) return false;
  if (isDeskActor(actor)) return true;
  return actor.role === "collector" && actor.customerId === customerId;
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} customerId
 */
export function canWriteCustomer(actor, customerId) {
  return canReadCustomer(actor, customerId);
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canReadTimepiece(actor, ownerCustomerId) {
  return canReadCustomer(actor, ownerCustomerId);
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canWriteTimepiece(actor, ownerCustomerId) {
  return canReadCustomer(actor, ownerCustomerId);
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canReadPhoto(actor, ownerCustomerId) {
  return canReadTimepiece(actor, ownerCustomerId);
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canWritePhoto(actor, ownerCustomerId) {
  return canWriteTimepiece(actor, ownerCustomerId);
}

/**
 * @param {boolean} allowed
 * @param {string} [code]
 */
export function assertIsolation(allowed, code = "ISOLATION_DENIED") {
  if (!allowed) {
    const error = new Error(code);
    error.name = "IsolationError";
    throw error;
  }
}
