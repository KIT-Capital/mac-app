const hits = new Map();

/**
 * Shared per-IP window used by mail and the browser PDF preview.
 * @param {string} ip
 * @param {NodeJS.ProcessEnv} [env]
 */
export function allowMailRequest(ip, env = process.env) {
  const now = Date.now();
  const limit = env.RESEND_API_KEY?.trim() ? 8 : 80;
  const slot = hits.get(ip);
  if (!slot || now > slot.reset) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (slot.n >= limit) return false;
  slot.n += 1;
  return true;
}
