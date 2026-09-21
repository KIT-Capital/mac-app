/**
 * Application-level isolation for Stage 2 records.
 * WorkOS is not wired; callers pass an explicit actor stub.
 *
 * @typedef {{ role: "collector" | "dealer", customerId: string, email: string }} CollectorActor
 * @typedef {{ role: import("../roles.mjs").DeskRole, email: string, staffId?: string, isMaster?: boolean }} DeskActor
 * @typedef {CollectorActor | DeskActor} Actor
 */
import { isDeskRole, isRetailRole } from "../roles.mjs";

/**
 * @param {Actor | null | undefined} actor
 * @returns {boolean}
 */
export function isDeskActor(actor) {
  return isDeskRole(actor?.role);
}

/**
 * @param {Actor | null | undefined} actor
 * @returns {actor is CollectorActor}
 */
export function isRetailActor(actor) {
  return isRetailRole(actor?.role);
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} customerId
 */
export function canReadCustomer(actor, customerId) {
  if (!actor || !customerId) return false;
  if (isDeskActor(actor)) return true;
  return isRetailActor(actor) && actor.customerId === customerId;
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
 * Attempt rows carry the same customer owner as their timepiece. Desk reads all;
 * retail reads only its own and never learns whether a foreign id exists.
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canReadAppraisalAttempt(actor, ownerCustomerId) {
  return canReadTimepiece(actor, ownerCustomerId);
}

/**
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canReadAgreement(actor, ownerCustomerId) {
  return canReadCustomer(actor, ownerCustomerId);
}

/**
 * Document rows carry their own customer_id. Collectors never learn whether
 * another collector's document exists.
 * @param {Actor | null | undefined} actor
 * @param {string} customerId
 */
export function canReadAgreementDocument(actor, customerId) {
  return canReadCustomer(actor, customerId);
}

/**
 * A retail party may submit an application on their own piece. Desk may not submit as the collector.
 * @param {Actor | null | undefined} actor
 * @param {string} ownerCustomerId
 */
export function canSubmitApplication(actor, ownerCustomerId) {
  if (!actor || !ownerCustomerId) return false;
  return isRetailActor(actor) && actor.customerId === ownerCustomerId;
}

/**
 * Only the desk may freeze an executable version.
 * @param {Actor | null | undefined} actor
 */
export function canPrepareAgreement(actor) {
  return isDeskActor(actor);
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
