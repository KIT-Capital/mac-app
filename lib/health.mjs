import { evaluateDatabaseMapping } from "./env/database-mapping.mjs";
import { evaluateLiveBookConfig } from "./env/live-book-flag.mjs";
import { evaluateProductionReadiness } from "./env/production-readiness.mjs";

/**
 * `/api/health` report. Codes only: no URLs, hostnames, secrets, or driver
 * messages ever reach the body. The route supplies the database probe so this
 * helper stays free of the database client.
 *
 * @typedef {{ ok: boolean, appEnv: string | null, checks: { database: string, liveBook: string } }} HealthReport
 */

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ probeDatabase: () => Promise<unknown> }} probes
 * @returns {Promise<HealthReport>}
 */
export async function buildHealthReport(env, probes) {
  const appEnv = String(env.APP_ENV ?? "").trim() || null;
  const mapping = evaluateDatabaseMapping(env, { role: "startup" });
  const readiness = evaluateProductionReadiness(env);
  const config = evaluateLiveBookConfig(env);

  let database = "NOT_CONFIGURED";
  if (!String(env.DATABASE_URL ?? "").trim()) {
    database = "NOT_CONFIGURED";
  } else if (!mapping.ok) {
    database = mapping.errors[0];
  } else {
    try {
      await probes.probeDatabase();
      database = "ok";
    } catch {
      database = "DATABASE_UNREACHABLE";
    }
  }

  const liveErrors = readiness.errors.filter((code) => !mapping.errors.includes(code));
  let liveBook = "ok";
  if (liveErrors.length > 0) {
    liveBook = liveErrors[0];
  } else if (!config.enabled) {
    liveBook = "browser";
  } else if (!config.ok) {
    liveBook = config.errors[0];
  }

  const databaseOk = database === "ok" || database === "NOT_CONFIGURED";
  const liveBookOk = liveBook === "ok" || liveBook === "browser";
  return {
    ok: databaseOk && liveBookOk,
    appEnv,
    checks: { database, liveBook },
  };
}

/**
 * @param {HealthReport} report
 */
export function healthResponse(report) {
  return Response.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
