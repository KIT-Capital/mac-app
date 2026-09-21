import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { normalizeCollectorPhone } from "@/lib/phone.mjs";
import {
  readTwilioWhatsAppConfig,
  twilioRequestSignatureValid,
} from "@/lib/twilio-whatsapp.mjs";
import { recordInboundWhatsApp } from "@/lib/whatsapp.server";

export async function POST(request: Request) {
  const config = readTwilioWhatsAppConfig(process.env);
  const live = evaluateLiveBookConfig(process.env);
  if (!config || !live.enabled || !live.ok) {
    return new Response(null, { status: 204 });
  }
  const form = await request.formData();
  const params: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    params[key] = String(value);
  }
  const origin = String(process.env.COLLECTOR_MAGIC_LINK_ORIGIN ?? "").replace(/\/$/, "");
  if (!origin) return new Response(null, { status: 204 });
  const url = `${origin}/api/webhooks/twilio-whatsapp`;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  if (!twilioRequestSignatureValid(url, params, signature, config.authToken)) {
    return new Response(null, { status: 403 });
  }
  const fromRaw = String(params.From ?? "").replace(/^whatsapp:/, "");
  const body = String(params.Body ?? "").trim();
  const sid = String(params.MessageSid ?? "").trim() || null;
  if (!body) return new Response(null, { status: 204 });
  let from;
  try {
    from = normalizeCollectorPhone(fromRaw);
  } catch {
    return new Response(null, { status: 204 });
  }
  await recordInboundWhatsApp({ from, body, providerSid: sid });
  return new Response(null, { status: 204 });
}
