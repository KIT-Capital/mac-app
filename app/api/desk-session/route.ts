import { cookies } from "next/headers";
import { clientAddress } from "@/lib/access-rate-limit.mjs";
import {
  authenticateDeskAccount,
  rotateDeskPasswordRequest,
} from "@/lib/auth.server";
import { COLLECTOR_COOKIE } from "@/lib/collector-access.mjs";
import { revokeCollectorAccessSession } from "@/lib/collector-access.server";
import { getDb } from "@/lib/db/client";
import {
  DESK_COOKIE,
  DESK_SESSION_KEYS_INVALID,
  deskCookieOptions,
  issueDeskToken,
} from "@/lib/desk-session";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
    code?: string;
  } | null;
  const result = await authenticateDeskAccount(
    String(body?.email ?? ""),
    String(body?.password ?? ""),
    clientAddress(request.headers),
    process.env,
    body?.code,
  );
  if ("pending" in result) {
    return Response.json({
      ok: true,
      accepted: true,
      needsCode: true,
    }, { status: 202 });
  }
  const staff = result.staff;
  if (!staff) {
    return Response.json({ error: "Desk credentials were not recognized." }, { status: 401 });
  }
  let token;
  try {
    token = issueDeskToken(staff.email, staff.role, {
      mustRotate: staff.mustRotate,
      now: Math.max(Date.now(), staff.sessionValidAfter.getTime() + 1),
    });
  } catch (error) {
    if (error instanceof Error && error.message === DESK_SESSION_KEYS_INVALID) {
      return unavailableResponse(DESK_SESSION_KEYS_INVALID);
    }
    throw error;
  }
  const jar = await cookies();
  await revokeCollectorAccessSession(jar.get(COLLECTOR_COOKIE)?.value);
  jar.delete(COLLECTOR_COOKIE);
  jar.set(DESK_COOKIE, token, deskCookieOptions());
  return Response.json({
    ok: true,
    role: staff.role,
    mustRotate: staff.mustRotate,
  });
}

export async function PATCH(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const jar = await cookies();
  const body = (await request.json().catch(() => null)) as {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  } | null;
  try {
    const rotated = await rotateDeskPasswordRequest(
      getDb(),
      jar.get(DESK_COOKIE)?.value,
      body ?? {},
      clientAddress(request.headers),
    );
    jar.set(DESK_COOKIE, rotated.token, deskCookieOptions());
    return Response.json({ ok: true, role: rotated.role, email: rotated.email });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PASSWORD_ROTATION_FAILED";
    const status = message === "PASSWORD_TOO_WEAK"
      ? 422
      : message === "DESK_PASSWORD_INVALID"
        ? 400
        : message === "DESK_SESSION_INVALID"
          ? 403
        : 500;
    return Response.json({ error: message }, { status });
  }
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
