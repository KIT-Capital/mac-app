import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { completeDeskSetPassword } from "@/lib/db/collector-sessions";
import { getDb } from "@/lib/db/client";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const body = (await request.json().catch(() => null)) as {
    token?: string;
    newPassword?: string;
    confirmPassword?: string;
  } | null;
  const token = String(body?.token ?? "");
  const newPassword = String(body?.newPassword ?? "");
  if (!token || newPassword !== String(body?.confirmPassword ?? "")) {
    return Response.json({ error: "DESK_PASSWORD_INVALID" }, { status: 400 });
  }
  try {
    const staff = await completeDeskSetPassword(getDb(), {
      token,
      newPassword,
      clientAddress: clientAddress(request.headers),
    });
    return Response.json({ ok: true, email: staff.email, role: staff.role });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ACCESS_TOKEN_INVALID";
    const status = message === "PASSWORD_TOO_WEAK" ? 422 : 400;
    return Response.json({ error: message }, { status });
  }
}
