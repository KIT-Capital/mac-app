import { evaluateProductionReadiness } from "./env/production-readiness.mjs";

/**
 * One body for every live route when a staging or production prerequisite is
 * missing. The store maps it to the `unavailable` mode and the app renders the
 * unavailable page instead of a route. Never cached.
 *
 * @param {string} error prerequisite code, never a value
 */
export function unavailableResponse(error) {
  return Response.json(
    { mode: "unavailable", error },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}

/**
 * First missing live prerequisite in staging or production, else null.
 * Null in development, so browser-mode behavior there is unchanged.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {string | null}
 */
export function liveUnavailability(env = process.env) {
  const readiness = evaluateProductionReadiness(env);
  if (readiness.ok) return null;
  return readiness.errors[0] ?? "LIVE_BOOK_UNAVAILABLE";
}
