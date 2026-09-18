export const REQUEST_ORIGIN_FORBIDDEN = "REQUEST_ORIGIN_FORBIDDEN";

function headerValue(headers, name) {
  if (headers && typeof headers.get === "function") return headers.get(name);
  const record = /** @type {Record<string, string>} */ (headers ?? {});
  return record[name] ?? record[name.toLowerCase()] ?? null;
}

/**
 * Same-origin browser calls, or an Origin that exactly matches
 * COLLECTOR_MAGIC_LINK_ORIGIN. Host headers are never the allowlist.
 *
 * @param {{ env?: NodeJS.ProcessEnv, headers?: Headers | Record<string, string> }} input
 * @returns {{ ok: true } | { ok: false, status: 403, code: typeof REQUEST_ORIGIN_FORBIDDEN }}
 */
export function evaluateRequestOrigin({ env = process.env, headers = {} } = {}) {
  if (headerValue(headers, "sec-fetch-site") === "same-origin") {
    return { ok: true };
  }
  const origin = String(headerValue(headers, "origin") ?? "").trim();
  const allow = String(env.COLLECTOR_MAGIC_LINK_ORIGIN ?? "").trim();
  if (!origin || !allow) {
    return { ok: false, status: 403, code: REQUEST_ORIGIN_FORBIDDEN };
  }
  try {
    if (new URL(origin).origin === new URL(allow).origin) {
      return { ok: true };
    }
  } catch {
    return { ok: false, status: 403, code: REQUEST_ORIGIN_FORBIDDEN };
  }
  return { ok: false, status: 403, code: REQUEST_ORIGIN_FORBIDDEN };
}

/**
 * Refuse a cross-site mutation before the handler reads the body.
 *
 * @param {Request} request
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Response | null}
 */
export function refuseCrossSiteMutation(request, env = process.env) {
  const policy = evaluateRequestOrigin({ env, headers: request.headers });
  if (policy.ok) return null;
  return Response.json(
    {
      error: "This change can only be made from the Mechanical Art Capital app.",
      code: REQUEST_ORIGIN_FORBIDDEN,
    },
    { status: 403 },
  );
}
