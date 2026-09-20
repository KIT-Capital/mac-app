/** @typedef {"development" | "staging" | "preview" | "ci" | "production"} AppEnv */
/** @typedef {"app" | "migrate" | "guard" | "startup"} ProcessRole */

export const NEON_PROJECT_ID = "withered-lake-05570428";
export const EXPECTED_DATABASE = "neondb";
const NEON_HOST_SUFFIX = ".us-east-2.aws.neon.tech";

/** Endpoint ids verified 2026-09-19. Host allowlist is the control; neon.branch_name is unset. */
export const ENDPOINT_BY_APP_ENV = {
  development: "ep-red-union-a5fze04l",
  staging: "ep-calm-heart-a5ttpc4d",
  ci: "ep-tiny-poetry-a59fn11f",
  production: "ep-wild-fire-a5a5m53v",
};

export const APP_ENVS = ["development", "staging", "preview", "ci", "production"];
export const MAPPED_APP_ENVS = Object.keys(ENDPOINT_BY_APP_ENV);
export const ALLOWED_ENDPOINTS = new Set(Object.values(ENDPOINT_BY_APP_ENV));

/**
 * @param {string | undefined} endpointId
 * @returns {string | null}
 */
export function appEnvForEndpoint(endpointId) {
  if (!endpointId) return null;
  for (const [appEnv, id] of Object.entries(ENDPOINT_BY_APP_ENV)) {
    if (id === endpointId) return appEnv;
  }
  return null;
}

/**
 * @param {string | undefined} raw
 * @returns {{ present: false } | { present: true, parseError: true } | { present: true, parseError?: false, host: string, endpointId: string, pooled: boolean, database: string }}
 */
export function parseDatabaseUrl(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { present: false };
  }
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname;
    const pooledSuffix = `-pooler${NEON_HOST_SUFFIX}`;
    const pooled = host.endsWith(pooledSuffix);
    const endpointId = pooled
      ? host.slice(0, -pooledSuffix.length)
      : host.endsWith(NEON_HOST_SUFFIX)
        ? host.slice(0, -NEON_HOST_SUFFIX.length)
        : "";
    return {
      present: true,
      host,
      endpointId,
      pooled,
      database: parsed.pathname.replace(/^\//, "").split("?")[0] || "",
    };
  } catch {
    return { present: true, parseError: true };
  }
}

/**
 * @param {{ present: boolean, parseError?: boolean, endpointId?: string, database?: string, pooled?: boolean }} parsed
 * @param {string} label
 * @param {string | null} appEnv
 * @param {string[]} errors
 */
function collectUrlErrors(parsed, label, appEnv, errors) {
  if (!parsed.present || parsed.parseError) return;
  if (!parsed.endpointId || !ALLOWED_ENDPOINTS.has(parsed.endpointId)) {
    errors.push("UNKNOWN_ENDPOINT");
    return;
  }
  const expectedEndpoint = appEnv ? ENDPOINT_BY_APP_ENV[appEnv] : null;
  if (expectedEndpoint && parsed.endpointId !== expectedEndpoint) {
    errors.push(
      appEnv === "production"
        ? "PRODUCTION_ENV_WRONG_ENDPOINT"
        : appEnv === "staging"
          ? "STAGING_ENV_WRONG_ENDPOINT"
          : appEnv === "ci"
            ? "CI_ENV_WRONG_ENDPOINT"
            : "DEVELOPMENT_ENV_WRONG_ENDPOINT",
    );
  }
  if (parsed.database !== EXPECTED_DATABASE) {
    errors.push("DATABASE_NAME_MISMATCH");
  }
  if (label === "pooled" && !parsed.pooled) {
    errors.push("DATABASE_URL_NOT_POOLED");
  }
  if (label === "unpooled" && parsed.pooled) {
    errors.push("DATABASE_URL_UNPOOLED_IS_POOLED");
  }
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ role?: ProcessRole, allowProductionMigrations?: boolean }} [options]
 */
export function evaluateDatabaseMapping(env, options = {}) {
  const role = options.role ?? "guard";
  const errors = [];
  const appEnvRaw = (env.APP_ENV ?? "").trim();
  const neonBranch = (env.NEON_BRANCH ?? "").trim();
  const pooled = parseDatabaseUrl(env.DATABASE_URL);
  const unpooled = parseDatabaseUrl(env.DATABASE_URL_UNPOOLED);
  const hasPooled = pooled.present;
  const hasUnpooled = unpooled.present;

  if (!hasPooled && !hasUnpooled) {
    if (role === "migrate") {
      errors.push("MIGRATE_REQUIRES_UNPOOLED");
    }
    return {
      ok: errors.length === 0,
      errors,
      appEnv: appEnvRaw || null,
      endpointId: null,
      neonBranch: neonBranch || null,
      idle: true,
    };
  }

  if (!appEnvRaw) {
    errors.push("APP_ENV_REQUIRED");
  } else if (!APP_ENVS.includes(appEnvRaw)) {
    errors.push("APP_ENV_INVALID");
  } else if (!MAPPED_APP_ENVS.includes(appEnvRaw)) {
    errors.push("UNMAPPED_APP_ENV_HAS_DATABASE_URL");
  }

  if (pooled.parseError) errors.push("DATABASE_URL_UNPARSEABLE");
  if (unpooled.parseError) errors.push("DATABASE_URL_UNPOOLED_UNPARSEABLE");

  const mappedAppEnv = MAPPED_APP_ENVS.includes(appEnvRaw) ? appEnvRaw : null;
  collectUrlErrors(pooled, "pooled", mappedAppEnv, errors);
  collectUrlErrors(unpooled, "unpooled", mappedAppEnv, errors);

  if (
    hasPooled &&
    hasUnpooled &&
    !pooled.parseError &&
    !unpooled.parseError
  ) {
    if (pooled.endpointId !== unpooled.endpointId) {
      errors.push("POOLED_UNPOOLED_ENDPOINT_MISMATCH");
    }
    if (pooled.database !== unpooled.database) {
      errors.push("POOLED_UNPOOLED_DATABASE_MISMATCH");
    }
    const pooledBranch = appEnvForEndpoint(pooled.endpointId);
    const unpooledBranch = appEnvForEndpoint(unpooled.endpointId);
    if (pooledBranch && unpooledBranch && pooledBranch !== unpooledBranch) {
      errors.push("POOLED_UNPOOLED_BRANCH_MISMATCH");
    }
  }

  if (neonBranch) {
    if (mappedAppEnv && neonBranch !== mappedAppEnv) {
      errors.push("NEON_BRANCH_MISMATCH");
    }
    if (appEnvRaw && appEnvRaw !== "production" && neonBranch === "production") {
      errors.push("NON_PRODUCTION_NEON_BRANCH_PRODUCTION");
    }
  }

  if ((role === "app" || role === "startup") && appEnvRaw === "ci") {
    errors.push("CI_RUNTIME_NOT_ALLOWED");
  }
  if (role === "app" && hasUnpooled) {
    errors.push("MIGRATION_CREDENTIALS_ON_APP");
  }
  if (role === "migrate") {
    if (!hasUnpooled) errors.push("MIGRATE_REQUIRES_UNPOOLED");
    if (appEnvRaw === "production" && !options.allowProductionMigrations) {
      errors.push("PRODUCTION_MIGRATION_NOT_ALLOWED");
    }
  }

  const endpointId =
    (pooled.present && !pooled.parseError && pooled.endpointId) ||
    (unpooled.present && !unpooled.parseError && unpooled.endpointId) ||
    null;

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    appEnv: appEnvRaw || null,
    endpointId,
    neonBranch: neonBranch || null,
    idle: false,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 * @param {{ role?: ProcessRole, allowProductionMigrations?: boolean }} [options]
 */
export function assertDatabaseMapping(env, options = {}) {
  const result = evaluateDatabaseMapping(env, options);
  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, errors: result.errors }));
    process.exit(1);
  }
  return result;
}
