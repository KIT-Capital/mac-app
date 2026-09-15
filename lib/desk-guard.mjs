export const DESK_FORBIDDEN = 403;

/**
 * Desk HTML lives under /admin. /administration and /admin-tools are not desk.
 * @param {string} [pathname]
 */
export function isDeskPage(pathname = "") {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/**
 * Only a verified staff/admin session is enough. A raw cookie string is not.
 * @param {unknown} session
 */
export function isDeskSession(session) {
  if (!session || typeof session !== "object") return false;
  const role = "role" in session ? session.role : null;
  const email = "email" in session ? session.email : null;
  return (role === "admin" || role === "staff") && typeof email === "string" && email.length > 0;
}

/**
 * @param {string} pathname
 * @param {unknown} session
 */
export function deskPageStatus(pathname, session) {
  if (!isDeskPage(pathname)) return 200;
  return isDeskSession(session) ? 200 : DESK_FORBIDDEN;
}

/**
 * @param {unknown} session
 */
export function deskApiStatus(session) {
  return isDeskSession(session) ? 200 : DESK_FORBIDDEN;
}
