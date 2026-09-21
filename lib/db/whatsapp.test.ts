import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { createDb } from "./client";
import { registerVerifiedCollector } from "./records";
import { customers, whatsappMessages } from "./schema";
import {
  findRetailWhatsAppRecipient,
  insertWhatsAppMessage,
  listWhatsAppMessages,
} from "./whatsapp";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];
const createdMessageIds: string[] = [];

describe("retail WhatsApp store", { skip }, () => {
  const db = createDb();

  after(async () => {
    if (createdMessageIds.length) {
      await db.delete(whatsappMessages).where(inArray(whatsappMessages.id, createdMessageIds));
    }
    if (createdCustomerIds.length) {
      await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
    }
  });

  it("sends only to opted-in retail phones and stores inbound unknown numbers", async () => {
    const phone = `555${String(suffix).slice(-7)}`;
    const customer = await registerVerifiedCollector(db, {
      email: `wa.${suffix}@mac.test`,
      name: "WhatsApp Collector",
      phone,
    });
    createdCustomerIds.push(customer.id);

    assert.equal(await findRetailWhatsAppRecipient(db, customer.email), null);

    await db.update(customers).set({
      preferences: {
        appearance: "dark",
        pushNotifications: true,
        emailUpdates: true,
        smsUpdates: false,
        whatsappUpdates: true,
        preferredContact: "whatsapp",
        language: "en",
      },
    }).where(inArray(customers.id, [customer.id]));

    const recipient = await findRetailWhatsAppRecipient(db, customer.email);
    assert.equal(recipient?.customerId, customer.id);
    assert.match(recipient?.phone ?? "", /^\+1/);

    const outboundId = await insertWhatsAppMessage(db, {
      customerId: customer.id,
      direction: "outbound",
      phone: recipient!.phone,
      body: "MAC has your request.",
      providerSid: `SM${suffix}`,
      kind: "request_submitted",
    });
    createdMessageIds.push(outboundId);

    const inboundId = await insertWhatsAppMessage(db, {
      direction: "inbound",
      phone: "+12125550999",
      body: "When can I bring the pieces?",
      providerSid: `SM-in-${suffix}`,
    });
    createdMessageIds.push(inboundId);

    const listed = await listWhatsAppMessages(db, 20);
    assert.ok(listed.some((row) => row.id === outboundId && row.customerId === customer.id));
    assert.ok(listed.some((row) => row.id === inboundId && row.customerId === null));
  });
});
