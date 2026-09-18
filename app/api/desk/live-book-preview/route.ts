import { cookies } from "next/headers";
import { createDb } from "@/lib/db/client";
import { commitLivePreview } from "@/lib/db/live-book-import-commit";
import { liveBookFlagOn } from "@/lib/db/live-book-import.mjs";
import { deskActor } from "@/lib/db/records";
import { deskApiStatus } from "@/lib/desk-guard.mjs";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const session = readDeskToken((await cookies()).get(DESK_COOKIE)?.value);
  const status = deskApiStatus(session);
  if (status !== 200 || !session || (session.role !== "admin" && session.role !== "staff")) {
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
  const row = await commitLivePreview(createDb(), deskActor(session.role, session.email), {
    timepieceId: body.timepieceId,
    previewUrl: body.previewUrl,
    kind: body.kind,
  });
  return json({ preview: row });
}
