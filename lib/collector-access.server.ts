import "server-only";
import {
  decideCollectorAccessRequest,
  openCollectorSessionId,
  sealCollectorSessionId,
} from "@/lib/collector-access.mjs";
import { getDb } from "@/lib/db/client";
import {
  consumeAccessRateLimit,
  createCollectorAccessToken,
  issueCollectorSessionForCustomer,
  markCollectorAccessTokenSent,
  redeemCollectorAccessToken,
  resolveCollectorSession,
  revokeCollectorSession,
} from "@/lib/db/collector-sessions";
import { findStaffByEmail } from "@/lib/db/staff-accounts";
import {
  findCustomerByEmail,
  findCustomerByPhone,
} from "@/lib/db/records";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { dispatchCollectorAccessMail } from "@/lib/mail";
import { normalizeCollectorPhone } from "@/lib/phone.mjs";
import {
  checkTwilioSmsVerification,
  startTwilioSmsVerification,
} from "@/lib/twilio-verify.mjs";

export async function requestCollectorAccess(input: unknown, address: string) {
  const db = getDb();
  return decideCollectorAccessRequest(
    input,
    process.env,
    {
      consumeRateLimit: (limit: {
        scope: string;
        key: string;
        limit: number;
        windowMs: number;
        now: Date;
      }) => consumeAccessRateLimit(db, limit),
      findCustomerByEmail: (email: string) => findCustomerByEmail(db, email),
      findCustomerByPhone: (phone: string) => findCustomerByPhone(db, phone),
      findStaffByEmail: (email: string) => findStaffByEmail(db, email),
      createAccessToken: (token: Parameters<typeof createCollectorAccessToken>[1]) =>
        createCollectorAccessToken(db, {
          ...token,
          secret: String(process.env.COLLECTOR_SESSION_SECRET ?? ""),
        }),
      sendAccessEmail: dispatchCollectorAccessMail,
      startSmsVerification: (phone: string) => startTwilioSmsVerification(phone, process.env),
      markAccessTokenSent: (id: string, sent: boolean) =>
        markCollectorAccessTokenSent(db, id, sent),
    },
    { address },
  );
}

export async function verifyCollectorAccess(
  token: string,
  email?: string,
  address = "unknown",
  phone?: string,
) {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) throw new Error("COLLECTOR_LIVE_BOOK_DISABLED");
  if (!config.ok) throw new Error(config.errors[0]);
  const db = getDb();
  const now = new Date();
  const phoneValue = String(phone ?? "").trim();
  if (phoneValue) {
    let normalized;
    try {
      normalized = normalizeCollectorPhone(phoneValue);
    } catch {
      throw new Error("ACCESS_TOKEN_INVALID");
    }
    const [phoneLimit, addressLimit] = await Promise.all([
      consumeAccessRateLimit(db, {
        scope: "collector-code-verify-phone",
        key: normalized,
        limit: 8,
        windowMs: 15 * 60_000,
        now,
      }),
      consumeAccessRateLimit(db, {
        scope: "collector-code-verify-address",
        key: address,
        limit: 20,
        windowMs: 15 * 60_000,
        now,
      }),
    ]);
    if (!phoneLimit.allowed || !addressLimit.allowed) {
      throw new Error("ACCESS_TOKEN_INVALID");
    }
    const approved = await checkTwilioSmsVerification(normalized, token, process.env);
    if (!approved) throw new Error("ACCESS_TOKEN_INVALID");
    const customer = await findCustomerByPhone(db, normalized);
    if (!customer) throw new Error("ACCESS_TOKEN_INVALID");
    const issued = await issueCollectorSessionForCustomer(db, customer.id, { now });
    return {
      sessionToken: sealCollectorSessionId(issued.sessionId, config.secret),
      redirectUrl: new URL(issued.redirectPath, config.origin),
      secureCookie: config.origin.startsWith("https://"),
      email: issued.customer.email,
    };
  }
  const emailKey = String(email ?? "").trim().toLowerCase() || "missing";
  const [emailLimit, addressLimit] = await Promise.all([
    consumeAccessRateLimit(db, {
      scope: "collector-code-verify",
      key: emailKey,
      limit: 8,
      windowMs: 15 * 60_000,
      now,
    }),
    consumeAccessRateLimit(db, {
      scope: "collector-code-verify-address",
      key: address,
      limit: 20,
      windowMs: 15 * 60_000,
      now,
    }),
  ]);
  if (!emailLimit.allowed || !addressLimit.allowed) {
    throw new Error("ACCESS_TOKEN_INVALID");
  }

  const redeemed = await redeemCollectorAccessToken(db, token, {
    secret: config.secret,
    email,
    now,
  });

  return {
    sessionToken: sealCollectorSessionId(redeemed.sessionId, config.secret),
    redirectUrl: new URL(redeemed.redirectPath, config.origin),
    secureCookie: config.origin.startsWith("https://"),
    email: redeemed.customer.email,
  };
}

export async function resolveCollectorAccessSession(token: string | undefined) {
  if (!token) return null;
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled || !config.ok) return null;
  let sessionId;
  try {
    sessionId = openCollectorSessionId(token, config.secret);
  } catch {
    return null;
  }
  return resolveCollectorSession(getDb(), sessionId);
}

export async function revokeCollectorAccessSession(token: string | undefined) {
  if (!token) return;
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled || !config.ok) return;
  let sessionId;
  try {
    sessionId = openCollectorSessionId(token, config.secret);
  } catch {
    // An invalid cookie has no database session to revoke.
    return;
  }
  await revokeCollectorSession(getDb(), sessionId);
}
