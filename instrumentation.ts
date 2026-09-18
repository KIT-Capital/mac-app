export async function register() {
  if (process.env.NEXT_RUNTIME && process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  const { assertDatabaseMapping } = await import("./lib/env/database-mapping.mjs");
  assertDatabaseMapping(process.env, { role: "startup" });

  // Production fails closed to live mode: exit on flag-off, log the rest as unavailable.
  const { assertProductionReadiness } = await import("./lib/env/production-readiness.mjs");
  assertProductionReadiness(process.env);
}
