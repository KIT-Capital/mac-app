import { evaluateDatabaseMapping } from "./database-mapping.mjs";

export const MIGRATION_TARGETS = ["development", "staging", "production"];

/**
 * Widen the development-only migrate guard (plan 2026-09-17-003, KTD2).
 * Default target is development. Staging and production need an explicit
 * `--target`. Production also needs `--confirm-production`.
 *
 * @param {string[]} argv
 * @returns {{ target: string, confirmProduction: boolean, generate: boolean, schemaCheck: boolean }}
 */
export function parseMigrationArgs(argv) {
  let target = "development";
  let confirmProduction = false;
  let generate = false;
  let schemaCheck = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--target") {
      target = String(argv[i + 1] ?? "");
      i += 1;
    } else if (arg.startsWith("--target=")) {
      target = arg.slice("--target=".length);
    } else if (arg === "--confirm-production") {
      confirmProduction = true;
    } else if (arg === "--generate") {
      generate = true;
    } else if (arg === "--schema-check") {
      schemaCheck = true;
    }
  }
  return { target, confirmProduction, generate, schemaCheck };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ target?: string, confirmProduction?: boolean }} [options]
 */
export function evaluateMigrationTarget(env, options = {}) {
  const target = options.target ?? "development";
  const confirmProduction = Boolean(options.confirmProduction);
  if (!MIGRATION_TARGETS.includes(target)) {
    return {
      ok: false,
      errors: ["MIGRATION_TARGET_INVALID"],
      appEnv: String(env.APP_ENV ?? "").trim() || null,
      endpointId: null,
      neonBranch: String(env.NEON_BRANCH ?? "").trim() || null,
      idle: false,
      target,
    };
  }

  if (target === "production" && !confirmProduction) {
    return {
      ok: false,
      errors: ["PRODUCTION_MIGRATION_NOT_CONFIRMED"],
      appEnv: String(env.APP_ENV ?? "").trim() || null,
      endpointId: null,
      neonBranch: String(env.NEON_BRANCH ?? "").trim() || null,
      idle: false,
      target,
    };
  }

  const result = evaluateDatabaseMapping(env, {
    role: "migrate",
    allowProductionMigrations: target === "production" && confirmProduction,
  });
  const errors = [...result.errors];
  if (target === "development" && result.appEnv && result.appEnv !== "development") {
    errors.push("DEVELOPMENT_MIGRATION_ONLY");
  }
  if (target !== "development" && result.appEnv && result.appEnv !== target) {
    errors.push("MIGRATION_TARGET_APP_ENV_MISMATCH");
  }

  return {
    ...result,
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    target,
  };
}

/**
 * Stage 1 name: development-only migrate. Same as the default target.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function evaluateDevelopmentMigration(env) {
  return evaluateMigrationTarget(env, { target: "development" });
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ target?: string, confirmProduction?: boolean }} [options]
 */
export function assertMigrationTarget(env, options = {}) {
  const result = evaluateMigrationTarget(env, options);
  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, errors: result.errors }));
    process.exit(1);
  }
  return result;
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function assertDevelopmentMigration(env) {
  return assertMigrationTarget(env, { target: "development" });
}
