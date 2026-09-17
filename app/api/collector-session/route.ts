import { requestCollectorAccess } from "@/lib/collector-access.server";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { allowMailRequest } from "@/lib/mail";

function clientIp(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "local";
}

function errorStatus(message: string) {
  if (message === "COLLECTOR_LIVE_BOOK_DEVELOPMENT_ONLY") return 403;
  if (
    message === "COLLECTOR_SESSION_SECRET_REQUIRED" ||
    message === "COLLECTOR_MAGIC_LINK_ORIGIN_INVALID" ||
    message === "COLLECTOR_ACCESS_EMAIL_REQUIRED"
  ) {
    return 503;
  }
  if (message === "COLLECTOR_ACCESS_EMAIL_FAILED") return 502;
  if (
    message === "COLLECTOR_EMAIL_INVALID" ||
    message === "COLLECTOR_ACTION_INVALID" ||
    message.startsWith("REGISTRATION_")
  ) {
    return 400;
  }
  return 500;
}

export async function POST(request: Request) {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) {
    return Response.json({ ok: true, mode: "browser" });
  }
  if (!config.ok) {
    return Response.json({ error: config.errors[0] }, { status: errorStatus(config.errors[0]) });
  }
  if (!allowMailRequest(clientIp(request))) {
    return Response.json(
      { error: "Too many access requests from this device. Try again in a minute." },
      { status: 429 },
    );
  }

  try {
    const input = await request.json();
    return Response.json(await requestCollectorAccess(input), { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COLLECTOR_ACCESS_FAILED";
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}
