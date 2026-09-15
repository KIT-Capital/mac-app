import { evaluateDatabaseMapping } from "./database-mapping.mjs";

/**
 * Stage 1 migrations run only against Neon development.
 * Production stays rejected by the mapping guard; staging is also refused here.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function evaluateDevelopmentMigration(env) {
  const result = evaluateDatabaseMapping(env, { role: "migrate" });
  const errors = [...result.errors];
  if (result.appEnv && result.appEnv !== "development") {
    errors.push("DEVELOPMENT_MIGRATION_ONLY");
  }
  return {
    ...result,
    ok: errors.length === 0,
    errors: [...new Set(errors)],
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function assertDevelopmentMigration(env) {
  const result = evaluateDevelopmentMigration(env);
  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, errors: result.errors }));
    process.exit(1);
  }
  return result;
}
