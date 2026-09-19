import { isDeskRole } from "@/lib/roles.mjs";
import { headers } from "next/headers";
import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { getDb } from "@/lib/db/client";
import { consumeAccessRateLimit } from "@/lib/db/collector-sessions";
import { allowMailRequest, dispatchMail, listOutbox, mailConfigured, mailFrom, parseMailRequest } from "@/lib/mail";
import { isLiveBookEnabled } from "@/lib/env/live-book-flag.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

const DESK_ONLY = new Set(["invite", "test"]);

function clientIp(headerList: Headers) {
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

async function deskSession() {
  const resolved = await requestActor();
  if ("error" in resolved) return resolved;
  return isDeskRole(resolved.actor.role)
    ? resolved
    : { error: "DESK_SESSION_REQUIRED" };
}

function deskFailure(error: string) {
  return Response.json(
    { error: error === "PASSWORD_ROTATION_REQUIRED" ? error : "Desk session required." },
    { status: error === "PASSWORD_ROTATION_REQUIRED" ? 409 : 403 },
  );
}

export async function GET() {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const desk = await deskSession();
  if ("error" in desk) return deskFailure(desk.error);
  return Response.json({
    configured: mailConfigured(),
    from: mailFrom(),
    messages: listOutbox(),
  });
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const headerList = await headers();
    const payload = parseMailRequest(await request.json());
    if (payload.kind === "inquiry" && isLiveBookEnabled(process.env.MAC_LIVE_BOOK)) {
      const [emailLimit] = await Promise.all([
        consumeAccessRateLimit(getDb(), {
          scope: "mail-inquiry-email",
          key: payload.email,
          limit: 5,
          windowMs: 60 * 60_000,
        }),
        consumeAccessRateLimit(getDb(), {
          scope: "mail-inquiry-address",
          key: clientAddress(headerList),
          limit: 20,
          windowMs: 60 * 60_000,
        }),
      ]);
      if (!emailLimit.allowed) {
        return Response.json({ ok: true, preview: !mailConfigured(), ids: [] });
      }
    } else if (!allowMailRequest(clientIp(headerList))) {
      return Response.json({ error: "Too many emails from this device. Try again in a minute." }, { status: 429 });
    }
    if (DESK_ONLY.has(payload.kind)) {
      const desk = await deskSession();
      if ("error" in desk) return deskFailure(desk.error);
    }

    const result = await dispatchMail(payload);
    return Response.json({
      ok: true,
      preview: result.preview,
      ids: result.messages.map((message) => message.resendId || message.id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected mail error";
    const status = message.startsWith("Unknown") || message.startsWith("Enter") || message.startsWith("Write") || message.startsWith("Missing") || message.startsWith("Desk")
      ? 400
      : 502;
    return Response.json({ error: message, preview: !mailConfigured() }, { status });
  }
}
