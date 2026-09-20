import { pathToFileURL } from "node:url";
import { ENDPOINT_BY_APP_ENV, evaluateDatabaseMapping } from "../../lib/env/database-mapping.mjs";

/**
 * Fail closed before GitHub Actions migrates or runs test:db.
 * Secrets are injected as DATABASE_URL / DATABASE_URL_UNPOOLED.
 * Never print a URL, host, or secret.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function evaluateCiDatabase(env) {
  const errors = [];
  const appEnv = String(env.APP_ENV ?? "").trim();
  const neonBranch = String(env.NEON_BRANCH ?? "").trim();
  const hasPooled = Boolean(String(env.DATABASE_URL ?? "").trim());
  const hasUnpooled = Boolean(String(env.DATABASE_URL_UNPOOLED ?? "").trim());

  if (!hasPooled || !hasUnpooled) {
    errors.push("CI_DATABASE_SECRETS_REQUIRED");
  }
  if (appEnv !== "ci") {
    errors.push("CI_APP_ENV_REQUIRED");
  }
  if (neonBranch !== "ci") {
    errors.push("CI_NEON_BRANCH_REQUIRED");
  }

  const mapping = evaluateDatabaseMapping(env, { role: "guard" });
  errors.push(...mapping.errors);
  if (mapping.endpointId && mapping.endpointId !== ENDPOINT_BY_APP_ENV.ci) {
    errors.push("CI_ENV_WRONG_ENDPOINT");
  }

  return {
    ok: errors.length === 0,
    errors: [...new Set(errors)],
    appEnv: mapping.appEnv,
    neonBranch: mapping.neonBranch,
    endpointId: mapping.endpointId,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} env
 */
export function assertCiDatabase(env) {
  const result = evaluateCiDatabase(env);
  if (!result.ok) {
    console.error(JSON.stringify({ ok: false, errors: result.errors }));
    process.exit(1);
  }
  console.log(
    JSON.stringify({
      ok: true,
      appEnv: result.appEnv,
      neonBranch: result.neonBranch,
      endpointId: result.endpointId,
      errors: [],
    }),
  );
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  assertCiDatabase(process.env);
}
