import { parseDeskSessionKeys } from "../desk-session-keys.mjs";
import { evaluateDatabaseMapping } from "./database-mapping.mjs";
import { evaluateLiveBookConfig, isLiveBookEnabled } from "./live-book-flag.mjs";

/**
 * Production fails closed to live mode (plan 2026-09-17-003, KTD1).
 *
 * Two classes of failure:
 * - exit: `APP_ENV=production` with `MAC_LIVE_BOOK` off, or a failed database
 *   mapping. The process must not serve.
 * - unavailable: any other missing live prerequisite in staging or production.
 *   The process stays up and every live route answers `mode: "unavailable"`.
 *
 * Development is never governed here; browser mode stays the default there.
 * This module imports no database client so it is safe in every runtime.
 *
 * @typedef {{ ok: boolean, exit: boolean, errors: string[], unavailable: string[], appEnv: string | null }} ProductionReadiness
 */

const GOVERNED_APP_ENVS = new Set(["staging", "production"]);

/**
 * Mirrors `r2Configured` in `lib/storage/r2-object-store.mjs` without importing
 * the S3 client into the startup harness.
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
function r2NamesPresent(env) {
  const endpoint = String(env.R2_S3_ENDPOINT ?? "").trim() || String(env.R2_ACCOUNT_ID ?? "").trim();
  return Boolean(
    endpoint &&
    String(env.R2_BUCKET ?? "").trim() &&
    String(env.R2_ACCESS_KEY_ID ?? "").trim() &&
    String(env.R2_SECRET_ACCESS_KEY ?? "").trim(),
  );
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @returns {ProductionReadiness}
 */
export function evaluateProductionReadiness(env = process.env) {
  const appEnv = String(env.APP_ENV ?? "").trim();
  const flagOn = isLiveBookEnabled(env.MAC_LIVE_BOOK);
  /** @type {string[]} */
  const exitErrors = [];
  /** @type {string[]} */
  const unavailable = [];

  if (appEnv === "production" && !flagOn) {
    exitErrors.push("PRODUCTION_REQUIRES_LIVE_BOOK");
  }

  const mapping = evaluateDatabaseMapping(env, { role: "startup" });
  if (!mapping.ok) {
    exitErrors.push(...mapping.errors);
  }

  if (GOVERNED_APP_ENVS.has(appEnv) && flagOn) {
    const live = evaluateLiveBookConfig(env);
    if (live.enabled && !live.ok) {
      unavailable.push(...live.errors);
    }
    const deskKeys = parseDeskSessionKeys(env);
    if (!deskKeys.ok) {
      unavailable.push(deskKeys.error);
    }
    if (!r2NamesPresent(env)) {
      unavailable.push("R2_REQUIRED");
    }
    if (!String(env.DATABASE_URL ?? "").trim()) {
      unavailable.push("DATABASE_URL_REQUIRED");
    }
  }

  const errors = [...new Set([...exitErrors, ...unavailable])];
  return {
    ok: errors.length === 0,
    exit: exitErrors.length > 0,
    errors,
    unavailable: [...new Set(unavailable)],
    appEnv: appEnv || null,
  };
}

/**
 * Logs JSON codes only and exits only for the exit class. Mirrors
 * `assertDatabaseMapping`; `deps` exist so tests never call `process.exit`.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ exit?: (code: number) => void, log?: (line: string) => void }} [deps]
 */
export function assertProductionReadiness(env = process.env, deps = {}) {
  const exit = deps.exit ?? ((code) => process.exit(code));
  const log = deps.log ?? ((line) => console.error(line));
  const result = evaluateProductionReadiness(env);
  if (result.exit) {
    log(JSON.stringify({ ok: false, errors: result.errors }));
    exit(1);
    return result;
  }
  if (!result.ok) {
    log(JSON.stringify({ ok: false, unavailable: result.unavailable }));
  }
  return result;
}
