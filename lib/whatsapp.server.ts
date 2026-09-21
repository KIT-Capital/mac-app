import "server-only";
import { isReservedDeskEmail } from "@/lib/desk-identities.mjs";
import { getDb } from "@/lib/db/client";
import { findCustomerByPhone } from "@/lib/db/records";
import { findRetailWhatsAppRecipient, insertWhatsAppMessage } from "@/lib/db/whatsapp";
import { composeWhatsAppNotice } from "@/lib/whatsapp-notice.mjs";
import {
  readTwilioWhatsAppConfig,
  sendTwilioWhatsApp,
} from "@/lib/twilio-whatsapp.mjs";

export async function dispatchRetailWhatsAppNotice(input: {
  email: string;
  name: string;
  kind: string;
}, env: Record<string, string | undefined> = process.env) {
  if (isReservedDeskEmail(input.email)) return;
  if (!readTwilioWhatsAppConfig(env)) return;
  const db = getDb();
  const recipient = await findRetailWhatsAppRecipient(db, input.email);
  if (!recipient) return;
  const body = composeWhatsAppNotice(input.kind, { name: input.name });
  try {
    const sent = await sendTwilioWhatsApp(recipient.phone, body, env);
    await insertWhatsAppMessage(db, {
      customerId: recipient.customerId,
      direction: "outbound",
      phone: recipient.phone,
      body,
      providerSid: sent.sid,
      kind: input.kind,
    });
  } catch {
    // Email remains the durable notice path.
  }
}

export async function recordInboundWhatsApp(input: {
  from: string;
  body: string;
  providerSid?: string | null;
}) {
  const db = getDb();
  const customer = await findCustomerByPhone(db, input.from);
  if (customer && isReservedDeskEmail(customer.email)) return;
  await insertWhatsAppMessage(db, {
    customerId: customer?.id ?? null,
    direction: "inbound",
    phone: input.from,
    body: input.body,
    providerSid: input.providerSid ?? null,
  });
}
