import { isDeskRole } from "@/lib/roles.mjs";
import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { createDb } from "@/lib/db/client";
import { commitLivePreview } from "@/lib/db/live-book-import-commit";
import { liveBookFlagOn } from "@/lib/db/live-book-import.mjs";
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

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const resolved = await requestActor();
  if ("error" in resolved) {
    return json(
      { error: resolved.error === "PASSWORD_ROTATION_REQUIRED" ? resolved.error : "Desk session required." },
      resolved.error === "PASSWORD_ROTATION_REQUIRED" ? 409 : 403,
    );
  }
  if (!isDeskRole(resolved.actor.role)) {
    return json({ error: "Desk session required." }, 403);
  }
  if (liveBookFlagOn()) {
    return json({ error: "LIVE_BOOK_FLAG_ON" }, 409);
  }
  const body = (await request.json().catch(() => null)) as {
    timepieceId?: string;
    previewUrl?: string;
    kind?: string;
  } | null;
  if (!body?.timepieceId || !body.previewUrl) {
    return json({ error: "PREVIEW_REQUIRED" }, 400);
  }
  const row = await commitLivePreview(createDb(), resolved.actor, {
    timepieceId: body.timepieceId,
    previewUrl: body.previewUrl,
    kind: body.kind,
  }, { clientAddress: clientAddress(request.headers) });
  return json({ preview: row });
}
