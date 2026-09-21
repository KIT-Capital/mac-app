import { NextResponse } from "next/server";
import {
  COLLECTOR_COOKIE,
  collectorCookieOptions,
} from "@/lib/collector-access.mjs";
import { verifyCollectorAccess } from "@/lib/collector-access.server";
import { DESK_COOKIE } from "@/lib/desk-session";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

function invalidRedirect(request: Request) {
  return NextResponse.redirect(new URL("/verify?state=invalid", request.url), 303);
}

function unavailableRedirect(request: Request) {
  return NextResponse.redirect(new URL("/verify?state=unavailable", request.url), 303);
}

export async function GET(request: Request) {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const token = new URL(request.url).searchParams.get("token");
  if (!token) return invalidRedirect(request);
  const page = new URL("/verify", request.url);
  page.searchParams.set("token", token);
  return NextResponse.redirect(page);
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const contentType = request.headers.get("content-type") ?? "";
  let token = "";
  let email = "";
  if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { email?: string; code?: string; token?: string } | null;
    token = String(body?.code ?? body?.token ?? "");
    email = String(body?.email ?? "");
  } else {
    const form = await request.formData();
    token = String(form.get("token") ?? "");
    email = String(form.get("email") ?? "");
  }
  const wantsJson = contentType.includes("application/json");
  if (!token || (/^\d{6}$/.test(token.replace(/\s+/g, "")) && !email.trim())) {
    if (wantsJson) return Response.json({ error: "ACCESS_TOKEN_INVALID" }, { status: 400 });
    return invalidRedirect(request);
  }
  try {
    const verified = await verifyCollectorAccess(token, email);
    if (wantsJson) {
      const response = NextResponse.json({
        ok: true,
        redirect: verified.redirectUrl.pathname,
      });
      response.cookies.set(
        COLLECTOR_COOKIE,
        verified.sessionToken,
        collectorCookieOptions({ secure: verified.secureCookie }),
      );
      response.cookies.delete(DESK_COOKIE);
      return response;
    }
    const response = NextResponse.redirect(verified.redirectUrl, 303);
    response.cookies.set(
      COLLECTOR_COOKIE,
      verified.sessionToken,
      collectorCookieOptions({ secure: verified.secureCookie }),
    );
    response.cookies.delete(DESK_COOKIE);
    return response;
  } catch (error) {
    if (contentType.includes("application/json")) {
      return Response.json({ error: "ACCESS_TOKEN_INVALID" }, { status: 400 });
    }
    return error instanceof Error && error.message === "ACCESS_TOKEN_INVALID"
      ? invalidRedirect(request)
      : unavailableRedirect(request);
  }
}
