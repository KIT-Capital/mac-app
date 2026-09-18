import { cookies } from "next/headers";
import { COLLECTOR_COOKIE } from "@/lib/collector-access.mjs";
import { revokeCollectorAccessSession } from "@/lib/collector-access.server";
import {
  DESK_COOKIE,
  DESK_SESSION_SECRET_REQUIRED,
  deskCookieOptions,
  openDeskSession,
} from "@/lib/desk-session";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  let token: string | null;
  try {
    token = openDeskSession(String(body?.email ?? ""), String(body?.password ?? ""));
  } catch (error) {
    if (error instanceof Error && error.message === DESK_SESSION_SECRET_REQUIRED) {
      return unavailableResponse(DESK_SESSION_SECRET_REQUIRED);
    }
    throw error;
  }
  if (!token) {
    return Response.json({ error: "Desk credentials were not recognized." }, { status: 401 });
  }
  const jar = await cookies();
  await revokeCollectorAccessSession(jar.get(COLLECTOR_COOKIE)?.value);
  jar.delete(COLLECTOR_COOKIE);
  jar.set(DESK_COOKIE, token, deskCookieOptions());
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const jar = await cookies();
  await revokeCollectorAccessSession(jar.get(COLLECTOR_COOKIE)?.value);
  jar.delete(COLLECTOR_COOKIE);
  jar.delete(DESK_COOKIE);
  return Response.json({ ok: true });
}
