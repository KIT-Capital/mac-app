import { cookies } from "next/headers";
import { DESK_COOKIE, deskCookieOptions, openDeskSession } from "@/lib/desk-session";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { email?: string; password?: string } | null;
  const token = openDeskSession(String(body?.email ?? ""), String(body?.password ?? ""));
  if (!token) {
    return Response.json({ error: "Desk credentials were not recognized." }, { status: 401 });
  }
  const jar = await cookies();
  jar.set(DESK_COOKIE, token, deskCookieOptions());
  return Response.json({ ok: true });
}

export async function DELETE() {
  const jar = await cookies();
  jar.delete(DESK_COOKIE);
  return Response.json({ ok: true });
}
