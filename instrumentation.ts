import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
    return;
  }

  await import("./sentry.server.config");

  const { assertDatabaseMapping } = await import("./lib/env/database-mapping.mjs");
  assertDatabaseMapping(process.env, { role: "startup" });

  // Production fails closed to live mode: exit on flag-off, log the rest as unavailable.
  const { assertProductionReadiness } = await import("./lib/env/production-readiness.mjs");
  assertProductionReadiness(process.env);
}

export const onRequestError = Sentry.captureRequestError;
