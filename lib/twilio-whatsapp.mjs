import { createHmac, timingSafeEqual } from "node:crypto";

const FROM_RE = /^whatsapp:\+[1-9]\d{7,14}$/;
const ACCOUNT_SID_RE = /^AC[0-9a-f]{32}$/i;

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ accountSid: string, authToken: string, from: string } | null}
 */
export function readTwilioWhatsAppConfig(env = process.env) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN ?? "").trim();
  const from = String(env.TWILIO_WHATSAPP_FROM ?? "").trim();
  if (!accountSid || !authToken || !from) return null;
  if (!ACCOUNT_SID_RE.test(accountSid) || !FROM_RE.test(from)) return null;
  return { accountSid, authToken, from };
}

function authorization(config) {
  return `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
}

/**
 * @param {string} toE164
 * @param {string} body
 * @param {Record<string, string | undefined>} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function sendTwilioWhatsApp(toE164, body, env = process.env, fetchImpl = fetch) {
  const config = readTwilioWhatsAppConfig(env);
  if (!config) throw new Error("WHATSAPP_UNAVAILABLE");
  const to = `whatsapp:${toE164}`;
  let response;
  try {
    response = await fetchImpl(
      `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: authorization(config),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: config.from, Body: body }).toString(),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch {
    throw new Error("WHATSAPP_SEND_FAILED");
  }
  if (!response.ok) throw new Error("WHATSAPP_SEND_FAILED");
  try {
    const payload = await response.json();
    return { sid: typeof payload?.sid === "string" ? payload.sid : null };
  } catch {
    return { sid: null };
  }
}

/**
 * @param {string} url
 * @param {Record<string, string>} params
 * @param {string} signature
 * @param {string} authToken
 */
export function twilioRequestSignatureValid(url, params, signature, authToken) {
  const supplied = String(signature ?? "");
  const token = String(authToken ?? "");
  if (!supplied || !token) return false;
  const sorted = Object.keys(params).sort()
    .reduce((data, key) => data + key + String(params[key] ?? ""), String(url ?? ""));
  const expected = createHmac("sha1", token).update(sorted).digest("base64");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
