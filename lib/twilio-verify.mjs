const ACCOUNT_SID_RE = /^AC[0-9a-f]{32}$/i;
const SERVICE_SID_RE = /^VA[0-9a-f]{32}$/i;

/**
 * @param {Record<string, string | undefined>} [env]
 * @returns {{ accountSid: string, authToken: string, serviceSid: string } | null}
 */
export function readTwilioVerifyConfig(env = process.env) {
  const accountSid = String(env.TWILIO_ACCOUNT_SID ?? "").trim();
  const authToken = String(env.TWILIO_AUTH_TOKEN ?? "").trim();
  const serviceSid = String(env.TWILIO_VERIFY_SERVICE_SID ?? "").trim();
  if (!accountSid || !authToken || !serviceSid) return null;
  if (!ACCOUNT_SID_RE.test(accountSid) || !SERVICE_SID_RE.test(serviceSid)) return null;
  return { accountSid, authToken, serviceSid };
}

function authorization(config) {
  return `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64")}`;
}

async function twilioForm(url, config, fields, fetchImpl) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: authorization(config),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(fields).toString(),
    signal: AbortSignal.timeout(10_000),
  });
  return response;
}

/**
 * @param {string} to
 * @param {Record<string, string | undefined>} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function startTwilioSmsVerification(to, env = process.env, fetchImpl = fetch) {
  const config = readTwilioVerifyConfig(env);
  if (!config) throw new Error("COLLECTOR_ACCESS_SMS_UNAVAILABLE");
  try {
    const response = await twilioForm(
      `https://verify.twilio.com/v2/Services/${config.serviceSid}/Verifications`,
      config,
      { To: to, Channel: "sms" },
      fetchImpl,
    );
    if (!response.ok) throw new Error("COLLECTOR_ACCESS_SMS_FAILED");
  } catch (error) {
    if (error instanceof Error && error.message === "COLLECTOR_ACCESS_SMS_UNAVAILABLE") throw error;
    throw new Error("COLLECTOR_ACCESS_SMS_FAILED");
  }
}

/**
 * @param {string} to
 * @param {string} code
 * @param {Record<string, string | undefined>} [env]
 * @param {typeof fetch} [fetchImpl]
 */
export async function checkTwilioSmsVerification(to, code, env = process.env, fetchImpl = fetch) {
  const config = readTwilioVerifyConfig(env);
  if (!config) return false;
  let response;
  try {
    response = await twilioForm(
      `https://verify.twilio.com/v2/Services/${config.serviceSid}/VerificationCheck`,
      config,
      { To: to, Code: String(code ?? "").replace(/\s+/g, "") },
      fetchImpl,
    );
  } catch {
    return false;
  }
  if (!response.ok) return false;
  try {
    const body = await response.json();
    return body?.status === "approved";
  } catch {
    return false;
  }
}
