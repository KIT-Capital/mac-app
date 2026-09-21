import { isDeskRole } from "@/lib/roles.mjs";
import { getDb } from "@/lib/db/client";
import { listWhatsAppMessages } from "@/lib/db/whatsapp";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";
import { readTwilioWhatsAppConfig } from "@/lib/twilio-whatsapp.mjs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function GET() {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const resolved = await requestActor();
  if ("error" in resolved || !isDeskRole(resolved.actor.role)) {
    return json({ error: "Desk session required." }, 403);
  }
  const live = evaluateLiveBookConfig(process.env);
  if (!live.enabled) {
    return json({ configured: Boolean(readTwilioWhatsAppConfig()), messages: [] });
  }
  if (!live.ok) {
    return json({ error: live.errors[0] }, 503);
  }
  const messages = await listWhatsAppMessages(getDb());
  return json({
    configured: Boolean(readTwilioWhatsAppConfig()),
    messages: messages.map((row) => ({
      id: row.id,
      direction: row.direction,
      phone: row.phone,
      body: row.body,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
    })),
  });
}
