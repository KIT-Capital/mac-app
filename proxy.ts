import { NextResponse, type NextRequest } from "next/server";
import { deskPageDisposition } from "@/lib/desk-guard.mjs";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";

export function proxy(request: NextRequest) {
  const session = readDeskToken(request.cookies.get(DESK_COOKIE)?.value);
  const disposition = deskPageDisposition(request.nextUrl.pathname, session);
  if (disposition === "forbid") {
    return NextResponse.json({ error: "Desk session required." }, { status: 403 });
  }
  if (disposition === "rotate") {
    return NextResponse.redirect(new URL("/admin/password", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*"],
};
