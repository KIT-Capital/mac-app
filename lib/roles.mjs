/**
 * Roles for Mechanical Art Capital.
 *
 * Two planes that never share an email: retail (front of the app) and desk.
 * Plan: docs/plans/2026-09-19-roles-identity-repo-parties-plan.md
 * Contract: docs/workflows.md
 *
 * @typedef {"collector" | "dealer"} RetailRole
 * @typedef {"admin" | "appraiser" | "super_admin"} DeskRole
 * @typedef {RetailRole | DeskRole} Role
 * @typedef {{ role?: string | null, isMaster?: boolean | null } | null | undefined} RoleActor
 */

/** @type {readonly RetailRole[]} */
export const RETAIL_ROLES = Object.freeze(["collector", "dealer"]);

/** @type {readonly DeskRole[]} */
export const DESK_ROLES = Object.freeze(["admin", "appraiser", "super_admin"]);

/** The one row nobody but its owner (or a code change) may alter. */
export const MASTER_SUPER_ADMIN_EMAIL = "rc@mechartcap.com";

/**
 * Day-one desk people. Emails and names only — never a password.
 * Each sets their own password on first sign-in.
 */
export const SEEDED_DESK_ACCOUNTS = Object.freeze([
  Object.freeze({
    id: "seed-desk-rc",
    name: "Ricardo Cidale",
    email: MASTER_SUPER_ADMIN_EMAIL,
    role: /** @type {DeskRole} */ ("super_admin"),
    isMaster: true,
  }),
  Object.freeze({
    id: "seed-desk-dov",
    name: "Dov Tuzman",
    email: "dov@mechartcap.com",
    role: /** @type {DeskRole} */ ("admin"),
    isMaster: false,
  }),
  Object.freeze({
    id: "seed-desk-rosario",
    name: "Rosario David",
    email: "rosario@mechartcap.com",
    role: /** @type {DeskRole} */ ("admin"),
    isMaster: false,
  }),
]);

const LABELS = Object.freeze({
  collector: "Collector",
  dealer: "Dealer",
  admin: "Admin",
  appraiser: "Appraiser",
  super_admin: "Super admin",
});

/**
 * @param {unknown} role
 * @returns {role is RetailRole}
 */
export function isRetailRole(role) {
  return typeof role === "string" && RETAIL_ROLES.includes(/** @type {RetailRole} */ (role));
}

/**
 * @param {unknown} role
 * @returns {role is DeskRole}
 */
export function isDeskRole(role) {
  return typeof role === "string" && DESK_ROLES.includes(/** @type {DeskRole} */ (role));
}

/**
 * Accepts the retired `staff` role (mapped to admin) and current desk roles.
 * @param {unknown} role
 * @returns {DeskRole | null}
 */
export function normalizeDeskRole(role) {
  if (role === "staff") return "admin";
  return isDeskRole(role) ? role : null;
}

/**
 * @param {string} role
 */
export function roleLabel(role) {
  return LABELS[/** @type {keyof typeof LABELS} */ (role)] ?? role;
}

/**
 * @param {RoleActor} actor
 */
function deskActor(actor) {
  return actor && isDeskRole(actor.role)
    ? { role: /** @type {DeskRole} */ (actor.role), isMaster: Boolean(actor.isMaster) }
    : null;
}

/**
 * Admin and appraiser may add admins. Only a super admin adds appraisers or
 * other super admins.
 * @param {RoleActor} actor
 * @param {unknown} targetRole
 */
export function canCreateDeskRole(actor, targetRole) {
  const desk = deskActor(actor);
  if (!desk || !isDeskRole(targetRole)) return false;
  if (targetRole === "admin") return true;
  return desk.role === "super_admin";
}

/**
 * Edit, disable, enable, or reset an existing desk row.
 * - Admin and appraiser: admin rows only.
 * - Super admin: admin and appraiser rows.
 * - Master: every row except the master row itself.
 * @param {RoleActor} actor
 * @param {RoleActor} target
 */
export function canManageDeskAccount(actor, target) {
  const desk = deskActor(actor);
  const row = deskActor(target);
  if (!desk || !row) return false;
  if (row.isMaster) return false;
  if (row.role === "admin") return true;
  if (row.role === "appraiser") return desk.role === "super_admin";
  return desk.isMaster;
}

/**
 * Super-admin rows are listed only to super admins.
 * @param {RoleActor} actor
 * @param {RoleActor} target
 */
export function canSeeDeskAccount(actor, target) {
  const desk = deskActor(actor);
  const row = deskActor(target);
  if (!desk || !row) return false;
  if (row.role === "super_admin") return desk.role === "super_admin";
  return true;
}

/**
 * Every desk role may lock, unlock, or reset collector and dealer accounts.
 * @param {RoleActor} actor
 */
export function canManageRetailAccount(actor) {
  return deskActor(actor) !== null;
}

/**
 * Catalog ranges and per-piece appraised numbers.
 * @param {RoleActor} actor
 */
export function canEditAppraisal(actor) {
  const desk = deskActor(actor);
  return desk !== null && desk.role !== "admin";
}

/**
 * MAC signs last, and only through an appraiser or super admin.
 * @param {RoleActor} actor
 */
export function canSignForMac(actor) {
  return canEditAppraisal(actor);
}

/**
 * Any desk role may work the request queue: confirm, lower, decline, flag.
 * @param {RoleActor} actor
 */
export function canReviewRequest(actor) {
  return deskActor(actor) !== null;
}

/**
 * Inspection, amendment, and the MAC signature share one fence.
 * @param {RoleActor} actor
 */
export function canInspect(actor) {
  return canSignForMac(actor);
}

/**
 * Desk patch fields on a timepiece that carry appraisal meaning. A patch that
 * touches any of these, or sets `status` to `appraised`, needs `canEditAppraisal`.
 */
export const APPRAISAL_PATCH_FIELDS = Object.freeze([
  "valueLow",
  "valueHigh",
  "financeable",
  "evaluatedAt",
]);

/**
 * @param {Record<string, unknown> | null | undefined} patch
 */
export function patchNeedsAppraisal(patch) {
  if (!patch || typeof patch !== "object") return false;
  if (patch.status === "appraised") return true;
  return APPRAISAL_PATCH_FIELDS.some((field) => patch[field] !== undefined);
}
