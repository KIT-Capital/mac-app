export const DESK_SESSION_KEYS_INVALID = "DESK_SESSION_KEYS_INVALID";

const DEVELOPMENT_DEFAULT_SECRET = "mac-desk-local";

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ ok: true, keys: Array<{ kid: string, secret: string }> } | { ok: false, error: typeof DESK_SESSION_KEYS_INVALID }}
 */
export function parseDeskSessionKeys(env = process.env) {
  const appEnv = String(env.APP_ENV ?? "").trim();
  const raw = String(env.DESK_SESSION_KEYS ?? "").trim();
  if (!raw && appEnv === "development") {
    const configured = String(env.DESK_SESSION_SECRET ?? "").trim();
    const live = new Set(["1", "true", "on"]).has(
      String(env.MAC_LIVE_BOOK ?? "").trim().toLowerCase(),
    );
    if (!configured && live) {
      return { ok: false, error: DESK_SESSION_KEYS_INVALID };
    }
    return {
      ok: true,
      keys: [{
        kid: "development",
        secret: configured || DEVELOPMENT_DEFAULT_SECRET,
      }],
    };
  }
  if (!raw) return { ok: false, error: DESK_SESSION_KEYS_INVALID };

  const keys = [];
  const seen = new Set();
  for (const entry of raw.split(",")) {
    const separator = entry.indexOf(":");
    if (separator < 1 || separator !== entry.lastIndexOf(":")) {
      return { ok: false, error: DESK_SESSION_KEYS_INVALID };
    }
    const kid = entry.slice(0, separator).trim();
    const secret = entry.slice(separator + 1).trim();
    if (!/^[A-Za-z0-9._-]+$/.test(kid) || seen.has(kid) || secret.length < 32) {
      return { ok: false, error: DESK_SESSION_KEYS_INVALID };
    }
    seen.add(kid);
    keys.push({ kid, secret });
  }
  return keys.length
    ? { ok: true, keys }
    : { ok: false, error: DESK_SESSION_KEYS_INVALID };
}
