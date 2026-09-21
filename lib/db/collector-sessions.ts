import "server-only";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull, like, lt, sql } from "drizzle-orm";
import { generateAccessCode, hashAccessCode, normalizeAccessCode } from "../access-code.mjs";
import { hashRateLimitKey, rateWindowStart } from "../access-rate-limit.mjs";
import { hashStaffPassword, parseStaffPasswordHash } from "../staff-password.mjs";
import type { Database } from "./client";
import { DEFAULT_TENANT_ID } from "../tenant.mjs";
import { allocateMemberIdIn, customerEmailOnDefaultTenant } from "./tenants";
import {
  accessRateLimits,
  collectorAccessTokens,
  collectorSessions,
  customers,
  deskAuditLog,
  staffAccounts,
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
  purpose: "login" | "register" | "desk_login" | "desk_set_password";
  secret: string;
  customerId?: string;
  email?: string;
  staffId?: string;
  registration?: RegistrationPayload;
  expiresAt: Date;
};

function linkHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function digestFor(input: { secret: string; email?: string; token: string }) {
  try {
    return hashAccessCode(input.secret, input.email, normalizeAccessCode(input.token));
  } catch {
    return linkHash(input.token);
  }
}

export async function createCollectorAccessToken(db: Database, input: CreateTokenInput) {
  const id = randomUUID();
  if (input.purpose === "desk_set_password") {
    const email = String(input.email ?? "").trim().toLowerCase();
    if (!input.staffId || !email) throw new Error("STAFF_REQUIRED");
    const token = randomBytes(32).toString("base64url");
    await db.insert(collectorAccessTokens).values({
      id,
      tokenHash: linkHash(token),
      customerId: null,
      registrationPayload: { staffId: input.staffId, email },
      purpose: input.purpose,
      expiresAt: input.expiresAt,
    });
    return { id, token, expiresAt: input.expiresAt };
  }
  const email = String(input.email ?? input.registration?.email ?? "").trim().toLowerCase();
  if (!email) throw new Error("COLLECTOR_EMAIL_INVALID");
  if (input.purpose === "desk_login" && !input.staffId) throw new Error("STAFF_REQUIRED");
  const token = generateAccessCode();
  const deskPayload = input.purpose === "desk_login"
    ? { staffId: input.staffId, email }
    : null;
  await db.insert(collectorAccessTokens).values({
    id,
    tokenHash: hashAccessCode(input.secret, email, token),
    customerId: input.customerId ?? null,
    registrationPayload: input.registration ?? deskPayload,
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
    secret: string;
    email?: string;
    now?: Date;
    sessionId?: string;
    beforeSessionInsert?: () => Promise<void>;
  },
) {
  const now = options.now ?? new Date();
  const tokenHash = digestFor({
    secret: options.secret,
    email: options.email,
    token,
  });
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(collectorAccessTokens)
      .where(and(
        eq(collectorAccessTokens.tokenHash, tokenHash),
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
        .where(and(
          eq(customers.id, access.customerId),
          eq(customers.tenantId, DEFAULT_TENANT_ID),
        ))
        .for("update")
        .limit(1);
      redirectPath = "/collection";
    } else if (access.purpose === "register") {
      const registration = candidate.registrationPayload as RegistrationPayload | null;
      if (!registration) throw new Error("ACCESS_TOKEN_INVALID");
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${registration.email}))`);
      const [staff] = await tx.select({ id: staffAccounts.id }).from(staffAccounts)
        .where(eq(staffAccounts.email, registration.email))
        .limit(1);
      if (staff) throw new Error("ACCESS_TOKEN_INVALID");
      const memberId = await allocateMemberIdIn(tx);
      [customer] = await tx
        .insert(customers)
        .values({
          id: randomUUID(),
          tenantId: DEFAULT_TENANT_ID,
          email: registration.email,
          name: registration.name,
          phone: registration.phone,
          role: "collector",
          memberId,
          preferences: DEFAULT_PREFERENCES,
        })
        .onConflictDoNothing({ target: [customers.tenantId, customers.email] })
        .returning();
      const created = Boolean(customer);
      if (!customer) {
        [customer] = await tx
          .select()
          .from(customers)
          .where(customerEmailOnDefaultTenant(registration.email))
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
        customerEmailOnDefaultTenant(invited.email),
        eq(customers.status, "invited"),
      )).returning();
      if (!customer) {
        [customer] = await tx.select().from(customers).where(and(
          eq(customers.id, invited.id),
          customerEmailOnDefaultTenant(invited.email),
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

export async function consumeDeskLoginCode(
  db: Database,
  input: { secret: string; email: string; code: string; now?: Date },
) {
  const now = input.now ?? new Date();
  const tokenHash = hashAccessCode(input.secret, input.email, input.code);
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(collectorAccessTokens)
      .where(and(
        eq(collectorAccessTokens.tokenHash, tokenHash),
        eq(collectorAccessTokens.purpose, "desk_login"),
        isNull(collectorAccessTokens.consumedAt),
        gt(collectorAccessTokens.expiresAt, now),
      ))
      .limit(1);
    if (!candidate) throw new Error("ACCESS_TOKEN_INVALID");
    const [access] = await tx
      .update(collectorAccessTokens)
      .set({ consumedAt: now, registrationPayload: null, updatedAt: now })
      .where(and(
        eq(collectorAccessTokens.id, candidate.id),
        isNull(collectorAccessTokens.consumedAt),
      ))
      .returning({ id: collectorAccessTokens.id });
    if (!access) throw new Error("ACCESS_TOKEN_INVALID");
    return candidate.registrationPayload as { staffId?: string; email?: string };
  });
}

export async function completeDeskSetPassword(
  db: Database,
  input: { token: string; newPassword: string; clientAddress: string; now?: Date },
) {
  const newPassword = String(input.newPassword ?? "");
  if (newPassword.length < 12) throw new Error("PASSWORD_TOO_WEAK");
  if (!String(input.clientAddress ?? "").trim()) throw new Error("CLIENT_ADDRESS_REQUIRED");
  const serialized = await hashStaffPassword(newPassword);
  const parsed = parseStaffPasswordHash(serialized);
  if (!parsed) throw new Error("STAFF_PASSWORD_HASH_INVALID");
  const now = input.now ?? new Date();
  return db.transaction(async (tx) => {
    const [candidate] = await tx
      .select()
      .from(collectorAccessTokens)
      .where(and(
        eq(collectorAccessTokens.tokenHash, linkHash(input.token)),
        eq(collectorAccessTokens.purpose, "desk_set_password"),
        isNull(collectorAccessTokens.consumedAt),
        gt(collectorAccessTokens.expiresAt, now),
      ))
      .for("update")
      .limit(1);
    if (!candidate) throw new Error("ACCESS_TOKEN_INVALID");
    const payload = candidate.registrationPayload as { staffId?: string } | null;
    if (!payload?.staffId) throw new Error("ACCESS_TOKEN_INVALID");
    const [row] = await tx.select().from(staffAccounts)
      .where(and(eq(staffAccounts.id, payload.staffId), isNull(staffAccounts.disabledAt)))
      .for("update")
      .limit(1);
    if (!row) throw new Error("ACCESS_TOKEN_INVALID");
    if (row.passwordHash) throw new Error("PASSWORD_ALREADY_SET");
    if (newPassword.toLowerCase().includes(row.email.toLowerCase())) {
      throw new Error("PASSWORD_TOO_WEAK");
    }
    const [updated] = await tx.update(staffAccounts).set({
      passwordHash: parsed.hash,
      passwordSalt: parsed.salt,
      passwordParams: parsed.params,
      passwordSetAt: now,
      mustRotate: false,
      sessionValidAfter: now,
      updatedAt: now,
    }).where(eq(staffAccounts.id, row.id)).returning();
    if (!updated) throw new Error("STAFF_NOT_FOUND");
    const [access] = await tx
      .update(collectorAccessTokens)
      .set({ consumedAt: now, registrationPayload: null, updatedAt: now })
      .where(and(
        eq(collectorAccessTokens.id, candidate.id),
        isNull(collectorAccessTokens.consumedAt),
      ))
      .returning({ id: collectorAccessTokens.id });
    if (!access) throw new Error("ACCESS_TOKEN_INVALID");
    await tx.insert(deskAuditLog).values({
      id: randomUUID(),
      actorEmail: updated.email,
      actorRole: updated.role,
      action: "staff.password.set",
      targetId: updated.id,
      clientAddress: input.clientAddress,
      detail: {},
    });
    return { staffId: updated.id, email: updated.email, role: updated.role };
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

export async function clearAccessRateLimit(db: Database, scope: string, key: string) {
  await db.delete(accessRateLimits).where(and(
    eq(accessRateLimits.scope, scope),
    eq(accessRateLimits.keyHash, hashRateLimitKey(key)),
  ));
}

export async function releaseAccessRateLimit(
  db: Database,
  input: {
    scope: string;
    key: string;
    windowMs: number;
    now?: Date;
  },
) {
  const now = input.now ?? new Date();
  const windowStart = rateWindowStart(now, input.windowMs);
  const where = and(
    eq(accessRateLimits.scope, input.scope),
    eq(accessRateLimits.keyHash, hashRateLimitKey(input.key)),
    eq(accessRateLimits.windowStart, windowStart),
  );
  const decremented = await db.update(accessRateLimits)
    .set({
      hits: sql`${accessRateLimits.hits} - 1`,
      updatedAt: now,
    })
    .where(and(where, gt(accessRateLimits.hits, 1)))
    .returning({ hits: accessRateLimits.hits });
  if (!decremented.length) {
    await db.delete(accessRateLimits).where(and(
      where,
      eq(accessRateLimits.hits, 1),
    ));
  }
}

export async function peekAccessRateLimit(
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
  const [row] = await db.select({ hits: accessRateLimits.hits })
    .from(accessRateLimits)
    .where(and(
      eq(accessRateLimits.scope, input.scope),
      eq(accessRateLimits.keyHash, hashRateLimitKey(input.key)),
      eq(accessRateLimits.windowStart, windowStart),
    ))
    .limit(1);
  const hits = row?.hits ?? 0;
  return { allowed: hits < input.limit, hits, windowStart };
}

export async function sweepCollectorAccessRows(
  db: Database,
  now = new Date(),
  options: { rateScopePrefix?: string } = {},
) {
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
    .where(and(
      lt(accessRateLimits.windowStart, rateCutoff),
      options.rateScopePrefix
        ? like(accessRateLimits.scope, `${options.rateScopePrefix}%`)
        : sql`true`,
    ))
    .returning({ scope: accessRateLimits.scope });
  return {
    tokens: deletedTokens.length,
    sessions: deletedSessions.length,
    rateWindows: deletedRateWindows.length,
  };
}
