import { NextResponse, type NextRequest } from "next/server";
import { deskPageStatus } from "@/lib/desk-guard.mjs";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";

export function proxy(request: NextRequest) {
  const session = readDeskToken(request.cookies.get(DESK_COOKIE)?.value);
  const status = deskPageStatus(request.nextUrl.pathname, session);
  if (status === 403) {
    return NextResponse.json({ error: "Desk session required." }, { status: 403 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
