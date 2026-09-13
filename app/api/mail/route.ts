import { headers } from "next/headers";
import { allowMailRequest, dispatchMail, listOutbox, mailConfigured, mailFrom, parseMailRequest } from "@/lib/mail";

function clientIp(headerList: Headers) {
  const forwarded = headerList.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || headerList.get("x-real-ip") || "local";
}

export async function GET() {
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
