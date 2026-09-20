const ENABLED_VALUES = new Set(["1", "true", "on"]);

/** APP_ENV values that may run the live book when `MAC_LIVE_BOOK` is on. */
export const LIVE_BOOK_APP_ENVS = ["development", "staging", "ci", "production"];

/** Local isolation and GitHub Actions `test:db` may skip a signed desk session. */
export function isFixtureAppEnv(appEnv) {
  return appEnv === "development" || appEnv === "ci";
}

/**
 * @typedef {"development" | "staging" | "production"} LiveBookAppEnv
 * @typedef {{ enabled: false, mode: "browser" }} BrowserMode
 * @typedef {{ enabled: true, mode: "live", ok: false, errors: string[] }} InvalidLiveMode
 * @typedef {{ enabled: true, mode: "live", ok: true, errors: [], appEnv: LiveBookAppEnv, secret: string, origin: string }} ValidLiveMode
 */

export function isLiveBookEnabled(value) {
  return ENABLED_VALUES.has(String(value ?? "").trim().toLowerCase());
}

/**
 * @param {string} appEnv
 * @returns {appEnv is LiveBookAppEnv}
 */
export function isLiveBookAppEnv(appEnv) {
  return LIVE_BOOK_APP_ENVS.includes(appEnv);
}

/**
 * HTTPS everywhere. HTTP is allowed only for localhost in development.
 */
function validMagicLinkOrigin(raw, appEnv) {
  try {
    const url = new URL(String(raw ?? ""));
    if (url.username || url.password || url.search || url.hash) return false;
    if (url.pathname !== "/") return false;
    if (url.protocol === "https:") return true;
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return isFixtureAppEnv(appEnv) && url.protocol === "http:" && local;
  } catch {
    return false;
  }
}

/** @returns {BrowserMode | InvalidLiveMode | ValidLiveMode} */
export function evaluateLiveBookConfig(env = process.env) {
  if (!isLiveBookEnabled(env.MAC_LIVE_BOOK)) {
    return { enabled: false, mode: "browser" };
  }

  const errors = [];
  const appEnv = String(env.APP_ENV ?? "").trim();
  const secret = String(env.COLLECTOR_SESSION_SECRET ?? "").trim();
  const origin = String(env.COLLECTOR_MAGIC_LINK_ORIGIN ?? "").trim();
  const resendApiKey = String(env.RESEND_API_KEY ?? "").trim();

  if (!isLiveBookAppEnv(appEnv)) {
    errors.push("COLLECTOR_LIVE_BOOK_APP_ENV_INVALID");
  }
  if (!secret) {
    errors.push("COLLECTOR_SESSION_SECRET_REQUIRED");
  }
  if (!origin) {
    errors.push("COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED");
  } else if (!validMagicLinkOrigin(origin, appEnv)) {
    errors.push("COLLECTOR_MAGIC_LINK_ORIGIN_INVALID");
  }
  if (!resendApiKey) {
    errors.push("COLLECTOR_ACCESS_EMAIL_REQUIRED");
  }

  if (errors.length > 0) {
    return { enabled: true, mode: "live", ok: false, errors };
  }
  return {
    enabled: true,
    mode: "live",
    ok: true,
    errors: [],
    appEnv: /** @type {LiveBookAppEnv} */ (appEnv),
    secret,
    origin: new URL(origin).origin,
  };
}
