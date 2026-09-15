import { cookies } from "next/headers";
import { headers } from "next/headers";
import { allowMailRequest, dispatchMail, listOutbox, mailConfigured, mailFrom, parseMailRequest } from "@/lib/mail";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";

const DESK_ONLY = new Set(["invite", "test"]);

function clientIp(headerList: Headers) {
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

async function deskSession() {
  const jar = await cookies();
  return readDeskToken(jar.get(DESK_COOKIE)?.value);
}

export async function GET() {
  if (!(await deskSession())) {
    return Response.json({ error: "Desk session required." }, { status: 401 });
  }
  return Response.json({
    configured: mailConfigured(),
    from: mailFrom(),
    messages: listOutbox(),
  });
}

export async function POST(request: Request) {
  try {
    const headerList = await headers();
    if (!allowMailRequest(clientIp(headerList))) {
      return Response.json({ error: "Too many emails from this device. Try again in a minute." }, { status: 429 });
    }

    const payload = parseMailRequest(await request.json());
    if (DESK_ONLY.has(payload.kind) && !(await deskSession())) {
      return Response.json({ error: "Desk session required." }, { status: 401 });
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
