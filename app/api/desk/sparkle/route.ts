import { getDb } from "@/lib/db/client";
import { executeLiveBookOperation } from "@/lib/db/live-book-mutations";
import { asDeskActor } from "@/lib/db/records";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { canEditAppraisal } from "@/lib/roles.mjs";
import { requestActor } from "@/lib/server/request-actor";
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
    if (live.enabled && !desk.staffId) return json({ error: "SESSION_INVALID" }, 401);
    const result = await executeLiveBookOperation(getDb(), resolved.actor, {
      action: "catalog.sparkle",
      kind,
      id,
    }) as { suggestion?: unknown };
    return json({ ok: true, suggestion: result?.suggestion ?? null });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ error: failure.error }, failure.status);
  }
}
