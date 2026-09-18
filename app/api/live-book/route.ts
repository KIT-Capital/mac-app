import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { getDb } from "@/lib/db/client";
import { readLiveBookState } from "@/lib/db/live-book-adapter";
import { executeLiveBookOperation } from "@/lib/db/live-book-mutations";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function liveContext() {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) return { mode: "browser" as const };
  if (!config.ok) return { mode: "error" as const, error: config.errors[0] };
  const resolved = await requestActor();
  if ("error" in resolved) return { mode: "unauthorized" as const, error: resolved.error };
  const viewer = resolved.actor.role === "collector"
    ? {
        role: "collector" as const,
        customerId: resolved.actor.customerId,
        email: resolved.actor.email,
      }
    : { role: resolved.actor.role, email: resolved.actor.email };
  return { mode: "live" as const, actor: resolved.actor, viewer };
}

export async function GET() {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const context = await liveContext();
    if (context.mode === "browser") return json({ mode: "browser" });
    if (context.mode === "error") return json({ mode: "live", error: context.error }, 503);
    if (context.mode === "unauthorized") {
      const failure = liveBookErrorResponse(new Error(context.error));
      return json({ mode: "live", error: failure.error }, failure.status);
    }
    return json({
      mode: "live",
      viewer: context.viewer,
      book: await readLiveBookState(getDb(), context.actor),
    });
  } catch {
    return json({ mode: "live", error: "LIVE_BOOK_READ_FAILED" }, 503);
  }
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const context = await liveContext();
    if (context.mode === "browser") return json({ mode: "browser" });
    if (context.mode === "error") return json({ mode: "live", error: context.error }, 503);
    if (context.mode === "unauthorized") {
      const failure = liveBookErrorResponse(new Error(context.error));
      return json({ mode: "live", error: failure.error }, failure.status);
    }
    const input = await request.json().catch(() => null);
    await executeLiveBookOperation(getDb(), context.actor, input, {
      clientAddress: clientAddress(request.headers),
    });
    return json({ mode: "live", acknowledged: true, viewer: context.viewer });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ mode: "live", error: failure.error }, failure.status);
  }
}
