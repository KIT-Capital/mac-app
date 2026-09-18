import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { hashRateLimitKey, rateWindowStart } from "../access-rate-limit.mjs";
import type { Database } from "./client";
import {
  accessRateLimits,
  collectorAccessTokens,
  collectorSessions,
  customers,
} from "./schema";

const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const DEFAULT_PREFERENCES = {
  appearance: "dark",
  pushNotifications: true,
  emailUpdates: true,
  smsUpdates: false,
  preferredContact: "email",
  language: "en",
};

type RegistrationPayload = {
  name: string;
  email: string;
  phone: string;
};

type CreateTokenInput = {
  purpose: "login" | "register";
  customerId?: string;
  email?: string;
  registration?: RegistrationPayload;
  expiresAt: Date;
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createCollectorAccessToken(db: Database, input: CreateTokenInput) {
  const token = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await db.insert(collectorAccessTokens).values({
    id,
    tokenHash: tokenHash(token),
    customerId: input.customerId ?? null,
    registrationPayload: input.registration ?? null,
    purpose: input.purpose,
    expiresAt: input.expiresAt,
  });
  return { id, token, expiresAt: input.expiresAt };
}

export async function markCollectorAccessTokenSent(
  db: Database,
  tokenId: string,
  sent: boolean,
) {
  await db.update(collectorAccessTokens).set({
    sendStatus: sent ? "sent" : "send_failed",
    updatedAt: new Date(),
  }).where(eq(collectorAccessTokens.id, tokenId));
}

export async function redeemCollectorAccessToken(
  db: Database,
  token: string,
  options: {
    now?: Date;
    sessionId?: string;
    beforeSessionInsert?: () => Promise<void>;
  } = {},
) {
  const now = options.now ?? new Date();
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(collectorAccessTokens)
      .where(and(
        eq(collectorAccessTokens.tokenHash, tokenHash(token)),
        isNull(collectorAccessTokens.consumedAt),
        gt(collectorAccessTokens.expiresAt, now),
      ))
      .limit(1);
    if (!candidate) throw new Error("ACCESS_TOKEN_INVALID");

    const [access] = await tx
      .update(collectorAccessTokens)
      .set({
        consumedAt: now,
        registrationPayload: null,
        updatedAt: now,
      })
      .where(and(
        eq(collectorAccessTokens.id, candidate.id),
        isNull(collectorAccessTokens.consumedAt),
        gt(collectorAccessTokens.expiresAt, now),
      ))
      .returning();
    if (!access) throw new Error("ACCESS_TOKEN_INVALID");

    let customer;
    let redirectPath: "/collection" | "/collection/setup";
    if (access.purpose === "login" && access.customerId) {
      [customer] = await tx
        .select()
        .from(customers)
        .where(eq(customers.id, access.customerId))
        .for("update")
        .limit(1);
      redirectPath = "/collection";
    } else if (access.purpose === "register") {
      const registration = candidate.registrationPayload as RegistrationPayload | null;
      if (!registration) throw new Error("ACCESS_TOKEN_INVALID");
      [customer] = await tx
        .insert(customers)
        .values({
          id: randomUUID(),
          email: registration.email,
          name: registration.name,
          phone: registration.phone,
          role: "collector",
          preferences: DEFAULT_PREFERENCES,
        })
        .onConflictDoNothing({ target: customers.email })
        .returning();
      const created = Boolean(customer);
      if (!customer) {
        [customer] = await tx
          .select()
          .from(customers)
          .where(eq(customers.email, registration.email))
          .for("update")
          .limit(1);
      }
      redirectPath = created ? "/collection/setup" : "/collection";
    } else {
      throw new Error("ACCESS_TOKEN_INVALID");
    }
    if (!customer || !["active", "invited"].includes(customer.status)) {
      throw new Error("ACCESS_TOKEN_INVALID");
    }
    if (customer.status === "invited") {
      const invited = customer;
      [customer] = await tx.update(customers).set({
        status: "active",
        updatedAt: now,
      }).where(and(
        eq(customers.id, invited.id),
        eq(customers.email, invited.email),
        eq(customers.status, "invited"),
      )).returning();
      if (!customer) {
        [customer] = await tx.select().from(customers).where(and(
          eq(customers.id, invited.id),
          eq(customers.email, invited.email),
          eq(customers.status, "active"),
        )).limit(1);
      }
      if (!customer) throw new Error("ACCESS_TOKEN_INVALID");
    }

    await options.beforeSessionInsert?.();
    const sessionId = options.sessionId ?? randomUUID();
    await tx.insert(collectorSessions).values({
      id: sessionId,
      customerId: customer.id,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
    });
    return { customer, sessionId, redirectPath };
  });
}

export async function resolveCollectorSession(
  db: Database,
  sessionId: string,
  now = new Date(),
) {
  const [row] = await db
    .select({ session: collectorSessions, customer: customers })
    .from(collectorSessions)
    .innerJoin(customers, eq(customers.id, collectorSessions.customerId))
    .where(and(
      eq(collectorSessions.id, sessionId),
      isNull(collectorSessions.revokedAt),
      gt(collectorSessions.expiresAt, now),
      eq(customers.status, "active"),
    ))
    .limit(1);
  return row ?? null;
}

export async function revokeCollectorSession(db: Database, sessionId: string) {
  await db.update(collectorSessions).set({
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(collectorSessions.id, sessionId),
    isNull(collectorSessions.revokedAt),
  ));
}

export async function revokeCollectorSessionsForCustomer(db: Database, customerId: string) {
  await db.update(collectorSessions).set({
    revokedAt: new Date(),
    updatedAt: new Date(),
  }).where(and(
    eq(collectorSessions.customerId, customerId),
    isNull(collectorSessions.revokedAt),
  ));
}

export async function consumeAccessRateLimit(
  db: Database,
  input: {
    scope: string;
    key: string;
    limit: number;
    windowMs: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const windowStart = rateWindowStart(now, input.windowMs);
  const [row] = await db
    .insert(accessRateLimits)
    .values({
      scope: input.scope,
      keyHash: hashRateLimitKey(input.key),
      windowStart,
      hits: 1,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        accessRateLimits.scope,
        accessRateLimits.keyHash,
        accessRateLimits.windowStart,
      ],
      set: {
        hits: sql`${accessRateLimits.hits} + 1`,
        updatedAt: now,
      },
    })
    .returning({ hits: accessRateLimits.hits });
  return { allowed: row.hits <= input.limit, hits: row.hits, windowStart };
}

export async function sweepCollectorAccessRows(db: Database, now = new Date()) {
  const tokenCutoff = new Date(now.getTime() - 24 * 60 * 60_000);
  const rateCutoff = new Date(now.getTime() - 2 * 60 * 60_000);
  const deletedTokens = await db
    .delete(collectorAccessTokens)
    .where(lt(collectorAccessTokens.expiresAt, tokenCutoff))
    .returning({ id: collectorAccessTokens.id });
  const deletedSessions = await db
    .delete(collectorSessions)
    .where(lt(collectorSessions.expiresAt, now))
    .returning({ id: collectorSessions.id });
  const deletedRateWindows = await db
    .delete(accessRateLimits)
    .where(lt(accessRateLimits.windowStart, rateCutoff))
    .returning({ scope: accessRateLimits.scope });
  return {
    tokens: deletedTokens.length,
    sessions: deletedSessions.length,
    rateWindows: deletedRateWindows.length,
  };
}
