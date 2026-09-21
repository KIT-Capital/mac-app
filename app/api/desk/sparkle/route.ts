import { getDb } from "@/lib/db/client";
import { SPARKLE_DAILY_LIMIT, SPARKLE_SCOPE, SPARKLE_WINDOW_MS } from "@/lib/db/catalog";
import { consumeAccessRateLimit } from "@/lib/db/collector-sessions";
import { executeLiveBookOperation } from "@/lib/db/live-book-mutations";
import { asDeskActor } from "@/lib/db/records";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { canEditAppraisal } from "@/lib/roles.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { researchCatalog } from "@/lib/sparkle/research.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const resolved = await requestActor();
  if ("error" in resolved) {
    const failure = liveBookErrorResponse(new Error(resolved.error));
    return json({ error: failure.error }, failure.status);
  }
  const desk = asDeskActor(resolved.actor);
  if (!desk) return json({ error: "DESK_REQUIRED" }, 403);
  if (!canEditAppraisal(desk)) return json({ error: "ROLE_FORBIDDEN" }, 403);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const kind = body?.kind === "model" ? "model" : body?.kind === "brand" ? "brand" : "";
  const id = String(body?.id ?? "").trim();
  if (!kind || !id) return json({ error: "CATALOG_ENTRY_INVALID" }, 422);
  const live = evaluateLiveBookConfig(process.env);
  try {
    if (live.enabled) {
      if (!desk.staffId) return json({ error: "SESSION_INVALID" }, 401);
      const result = await executeLiveBookOperation(getDb(), resolved.actor, {
        action: "catalog.sparkle",
        kind,
        id,
      }) as { suggestion?: unknown };
      return json({ ok: true, suggestion: result?.suggestion ?? null });
    }
    const query = String(body?.query ?? "").trim();
    if (!query) return json({ error: "CATALOG_ENTRY_INVALID" }, 422);
    try {
      const throttle = await consumeAccessRateLimit(getDb(), {
        scope: SPARKLE_SCOPE,
        key: desk.staffId ?? desk.email,
        limit: SPARKLE_DAILY_LIMIT,
        windowMs: SPARKLE_WINDOW_MS,
      });
      if (!throttle.allowed) return json({ error: "THROTTLED" }, 429);
    } catch {
      // Browser mode still researches when the rate-limit table is unreachable.
    }
    const suggestion = await researchCatalog({ kind, id, query }, process.env);
    return json({ ok: true, suggestion });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ error: failure.error }, failure.status);
  }
}
