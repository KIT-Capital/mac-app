import { cookies } from "next/headers";
import { after } from "next/server";
import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { COLLECTOR_COOKIE } from "@/lib/collector-access.mjs";
import {
  requestCollectorAccess,
  revokeCollectorAccessSession,
} from "@/lib/collector-access.server";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

function errorStatus(message: string) {
  if (
    message === "COLLECTOR_LIVE_BOOK_APP_ENV_INVALID" ||
    message === "COLLECTOR_SESSION_SECRET_REQUIRED" ||
    message === "COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED" ||
    message === "COLLECTOR_MAGIC_LINK_ORIGIN_INVALID" ||
    message === "COLLECTOR_ACCESS_EMAIL_REQUIRED"
    ||
    message === "COLLECTOR_ACCESS_SMS_UNAVAILABLE"
  ) {
    return 503;
  }
  if (message === "COLLECTOR_ACCESS_EMAIL_FAILED" || message === "COLLECTOR_ACCESS_SMS_FAILED") return 502;
  if (
    message === "COLLECTOR_EMAIL_INVALID" ||
    message === "COLLECTOR_PHONE_INVALID" ||
    message === "COLLECTOR_ACTION_INVALID" ||
    message === "RESERVED_DESK_EMAIL" ||
    message.startsWith("REGISTRATION_")
  ) {
    return 400;
  }
  return 500;
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) {
    return Response.json({ ok: true, mode: "browser" });
  }
  if (!config.ok) {
    return Response.json({ error: config.errors[0] }, { status: errorStatus(config.errors[0]) });
  }
  try {
    const input = await request.json();
    const prepared = await requestCollectorAccess(input, clientAddress(request.headers));
    if (prepared.response.rateLimited) {
      return Response.json(
        { error: "Please try again shortly." },
        { status: 429 },
      );
    }
    if (prepared.deferred) after(prepared.deferred);
    return Response.json(prepared.response, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COLLECTOR_ACCESS_FAILED";
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}

export async function DELETE(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const jar = await cookies();
  await revokeCollectorAccessSession(jar.get(COLLECTOR_COOKIE)?.value);
  jar.delete(COLLECTOR_COOKIE);
  return Response.json(
    { ok: true },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
