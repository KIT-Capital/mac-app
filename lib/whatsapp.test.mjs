import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it } from "node:test";
import { REQUEST_NOTICE_KINDS } from "./request-notice-mail.mjs";
import { composeWhatsAppNotice } from "./whatsapp-notice.mjs";
import {
  readTwilioWhatsAppConfig,
  sendTwilioWhatsApp,
  twilioRequestSignatureValid,
} from "./twilio-whatsapp.mjs";

const FORBIDDEN = /\b(loan|lender|interest|debt|financing|paid off|Richard Mille|Nautilus)\b|\$/i;

describe("WhatsApp retail notices", () => {
  it("keeps sale-and-repurchase copy without dollars or piece names", () => {
    for (const kind of REQUEST_NOTICE_KINDS) {
      const text = composeWhatsAppNotice(kind, { name: "Jonathan Hale" });
      assert.match(text, /Jonathan/);
      assert.match(text, /sale and repurchase/i);
      assert.doesNotMatch(text.replaceAll("not a loan", ""), FORBIDDEN);
    }
  });

  it("refuses kinds that are not request notices", () => {
    assert.throws(() => composeWhatsAppNotice("welcome", { name: "Ada" }), /WHATSAPP_NOTICE_KIND_INVALID/);
  });
});

describe("Twilio WhatsApp adapter", () => {
  const env = {
    TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    TWILIO_AUTH_TOKEN: "test-token",
    TWILIO_WHATSAPP_FROM: "whatsapp:+14155238886",
  };

  it("reads complete key names only", () => {
    assert.equal(readTwilioWhatsAppConfig({}), null);
    assert.equal(readTwilioWhatsAppConfig({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID }), null);
    assert.equal(readTwilioWhatsAppConfig({
      ...env,
      TWILIO_WHATSAPP_FROM: "+14155238886",
    }), null);
    assert.equal(readTwilioWhatsAppConfig(env).from, env.TWILIO_WHATSAPP_FROM);
  });

  it("posts a WhatsApp message without putting the token in the URL", async () => {
    const calls = [];
    const sent = await sendTwilioWhatsApp("+12125550100", "hello", env, async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true, json: async () => ({ sid: "SM123" }) };
    });
    assert.equal(sent.sid, "SM123");
    assert.doesNotMatch(calls[0].url, /test-token/);
    assert.match(String(calls[0].init.body), /To=whatsapp%3A%2B12125550100/);
    assert.match(String(calls[0].init.body), /From=whatsapp%3A%2B14155238886/);
  });

  it("rejects a forged Twilio signature and accepts a matching one", () => {
    const url = "https://mechart.app/api/webhooks/twilio-whatsapp";
    const params = { Body: "hi", From: "whatsapp:+12125550100" };
    assert.equal(twilioRequestSignatureValid(url, params, "nope", "test-token"), false);
    const data = Object.keys(params).sort().reduce((acc, key) => acc + key + params[key], url);
    const signature = createHmac("sha1", "test-token").update(data).digest("base64");
    assert.equal(twilioRequestSignatureValid(url, params, signature, "test-token"), true);
  });
});
