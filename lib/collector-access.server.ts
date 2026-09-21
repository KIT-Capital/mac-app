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
  markCollectorAccessTokenSent,
  redeemCollectorAccessToken,
  resolveCollectorSession,
  revokeCollectorSession,
} from "@/lib/db/collector-sessions";
import { findStaffByEmail } from "@/lib/db/staff-accounts";
import {
  findCustomerByEmail,
} from "@/lib/db/records";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { dispatchCollectorAccessMail } from "@/lib/mail";

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
      findStaffByEmail: (email: string) => findStaffByEmail(db, email),
      createAccessToken: (token: Parameters<typeof createCollectorAccessToken>[1]) =>
        createCollectorAccessToken(db, {
          ...token,
          secret: String(process.env.COLLECTOR_SESSION_SECRET ?? ""),
        }),
      sendAccessEmail: dispatchCollectorAccessMail,
      markAccessTokenSent: (id: string, sent: boolean) =>
        markCollectorAccessTokenSent(db, id, sent),
    },
    { address },
  );
}

export async function verifyCollectorAccess(token: string, email?: string) {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) throw new Error("COLLECTOR_LIVE_BOOK_DISABLED");
  if (!config.ok) throw new Error(config.errors[0]);

  const redeemed = await redeemCollectorAccessToken(getDb(), token, {
    secret: config.secret,
    email,
  });

  return {
    sessionToken: sealCollectorSessionId(redeemed.sessionId, config.secret),
    redirectUrl: new URL(redeemed.redirectPath, config.origin),
    secureCookie: config.origin.startsWith("https://"),
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
