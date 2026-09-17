import { NextResponse } from "next/server";
import {
  COLLECTOR_COOKIE,
  collectorCookieOptions,
} from "@/lib/collector-access.mjs";
import { verifyCollectorAccess } from "@/lib/collector-access.server";

function errorStatus(message: string) {
  if (message === "COLLECTOR_LIVE_BOOK_DEVELOPMENT_ONLY") return 403;
  if (
    message === "COLLECTOR_LIVE_BOOK_DISABLED" ||
    message === "COLLECTOR_SESSION_SECRET_REQUIRED" ||
    message === "COLLECTOR_MAGIC_LINK_ORIGIN_INVALID" ||
    message === "COLLECTOR_ACCESS_EMAIL_REQUIRED"
  ) {
    return 503;
  }
  if (message.startsWith("TOKEN_")) return 400;
  return 500;
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return Response.json({ error: "TOKEN_REQUIRED" }, { status: 400 });
  }

  try {
    const verified = await verifyCollectorAccess(token);
    const response = NextResponse.redirect(verified.redirectUrl);
    response.cookies.set(
      COLLECTOR_COOKIE,
      verified.sessionToken,
      collectorCookieOptions({ secure: verified.secureCookie }),
    );
    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : "COLLECTOR_VERIFICATION_FAILED";
    return Response.json({ error: message }, { status: errorStatus(message) });
  }
}
