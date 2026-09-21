import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { eq, inArray, sql } from "drizzle-orm";
import {
  GET as verifyGet,
  POST as verifyPost,
} from "../../app/api/collector-session/verify/route";
import { openCollectorSessionId } from "../collector-access.mjs";
import { createDb } from "./client";
import {
  consumeAccessRateLimit,
  consumeDeskLoginCode,
  completeDeskSetPassword,
  createCollectorAccessToken,
  issueCollectorSessionForCustomer,
  redeemCollectorAccessToken,
  resolveCollectorSession,
  revokeCollectorSession,
  sweepCollectorAccessRows,
} from "./collector-sessions";
import { hashAccessCode } from "../access-code.mjs";
import { executeLiveBookOperation } from "./live-book-mutations";
import { deskActor, registerCollector } from "./records";
import {
  accessRateLimits,
  collectorAccessTokens,
  collectorSessions,
  customers,
  staffAccounts,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const customerIds: string[] = [];
const tokenIds: string[] = [];
const sessionIds: string[] = [];
const rateScopes: string[] = [];
const staffIds: string[] = [];
const SECRET = "collector-session-test-secret-with-enough-entropy";

describe("collector access rows", { skip }, () => {
  const db = createDb();
  const issue = (input: Omit<Parameters<typeof createCollectorAccessToken>[1], "secret">) =>
    createCollectorAccessToken(db, { secret: SECRET, ...input });
  const redeem = (
    token: string,
    email: string,
    extra: { sessionId?: string; beforeSessionInsert?: () => Promise<void> } = {},
  ) => redeemCollectorAccessToken(db, token, { secret: SECRET, email, ...extra });

  after(async () => {
    if (staffIds.length) {
      await db.delete(staffAccounts).where(inArray(staffAccounts.id, staffIds));
    }
    if (sessionIds.length) {
      await db.delete(collectorSessions).where(inArray(collectorSessions.id, sessionIds));
    }
    if (tokenIds.length) {
      await db.delete(collectorAccessTokens).where(inArray(collectorAccessTokens.id, tokenIds));
    }
    if (rateScopes.length) {
      await db.delete(accessRateLimits).where(inArray(accessRateLimits.scope, rateScopes));
    }
    if (customerIds.length) {
      await db.delete(customers).where(inArray(customers.id, customerIds));
    }
  });

  async function collector(label: string) {
    const row = await registerCollector(db, {
      name: label,
      email: `${label}.${suffix}@mac.test`,
    });
    customerIds.push(row.id);
    return row;
  }

  it("redeems a login token once and creates a revocable session", async () => {
    const owner = await collector("redeem");
    const issued = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);

    const first = await redeem(issued.token, owner.email);
    sessionIds.push(first.sessionId);
    assert.equal(first.customer.id, owner.id);
    assert.equal(first.redirectPath, "/collection");

    await assert.rejects(
      () => redeem(issued.token, owner.email),
      /ACCESS_TOKEN_INVALID/,
    );
    assert.equal((await resolveCollectorSession(db, first.sessionId))?.customer.id, owner.id);

    await revokeCollectorSession(db, first.sessionId);
    assert.equal(await resolveCollectorSession(db, first.sessionId), null);
  });

  it("opens a collector session from an approved SMS code on the same person", async () => {
    const owner = await registerCollector(db, {
      name: "sms-login",
      email: `sms-login.${suffix}@mac.test`,
      phone: "+1 (212) 555-0147",
    });
    customerIds.push(owner.id);
    const issued = await issueCollectorSessionForCustomer(db, owner.id);
    sessionIds.push(issued.sessionId);
    assert.equal(issued.customer.id, owner.id);
    assert.equal(issued.redirectPath, "/collection");
    assert.equal((await resolveCollectorSession(db, issued.sessionId))?.customer.email, owner.email);

    const previous = {
      MAC_LIVE_BOOK: process.env.MAC_LIVE_BOOK,
      APP_ENV: process.env.APP_ENV,
      COLLECTOR_SESSION_SECRET: process.env.COLLECTOR_SESSION_SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: process.env.COLLECTOR_MAGIC_LINK_ORIGIN,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
      TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID,
      TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN,
      TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID,
    };
    const originalFetch = globalThis.fetch;
    Object.assign(process.env, {
      MAC_LIVE_BOOK: "1",
      COLLECTOR_SESSION_SECRET: SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
      RESEND_API_KEY: "test-api-key",
      TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      TWILIO_AUTH_TOKEN: "test-token",
      TWILIO_VERIFY_SERVICE_SID: "VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    });
    globalThis.fetch = (async () => ({
      ok: true,
      json: async () => ({ status: "approved" }),
    })) as typeof fetch;
    try {
      const response = await verifyPost(new Request(
        "https://mechart.app/api/collector-session/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
          },
          body: JSON.stringify({ phone: "212 555 0147", code: "424242" }),
        },
      ));
      assert.equal(response.status, 200);
      const body = await response.json() as { email?: string; redirect?: string };
      assert.equal(body.email, owner.email);
      assert.equal(body.redirect, "/collection");
      const cookie = response.headers.get("set-cookie") ?? "";
      const signedSession = /mac_collector=([^;]+)/.exec(cookie)?.[1];
      assert.ok(signedSession);
      sessionIds.push(openCollectorSessionId(signedSession, SECRET));
    } finally {
      globalThis.fetch = originalFetch;
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("registers once and treats an existing registration email as login", async () => {
    const email = `register.${suffix}@mac.test`;
    const first = await issue({
      purpose: "register",
      registration: { name: "New Collector", email, phone: "+1 212 555 0199" },
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(first.id);
    const registered = await redeem(first.token, email);
    customerIds.push(registered.customer.id);
    sessionIds.push(registered.sessionId);
    assert.equal(registered.redirectPath, "/collection/setup");

    const second = await issue({
      purpose: "register",
      registration: { name: "Changed Name", email, phone: "" },
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(second.id);
    const existing = await redeem(second.token, email);
    sessionIds.push(existing.sessionId);
    assert.equal(existing.customer.id, registered.customer.id);
    assert.equal(existing.customer.name, "New Collector");
    assert.equal(existing.redirectPath, "/collection");
  });

  it("rolls token consumption back when session creation fails", async () => {
    const owner = await collector("rollback");
    const duplicateSessionId = randomUUID();
    await db.insert(collectorSessions).values({
      id: duplicateSessionId,
      customerId: owner.id,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60_000),
    });
    sessionIds.push(duplicateSessionId);
    const issued = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);

    await assert.rejects(
      () => redeem(issued.token, owner.email, { sessionId: duplicateSessionId }),
    );
    const [stored] = await db
      .select({ consumedAt: collectorAccessTokens.consumedAt })
      .from(collectorAccessTokens)
      .where(eq(collectorAccessTokens.id, issued.id));
    assert.equal(stored.consumedAt, null);
  });

  it("counts one fixed database window atomically", async () => {
    const scope = `test-${suffix}`;
    rateScopes.push(scope);
    const now = new Date();
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () => consumeAccessRateLimit(db, {
        scope,
        key: "person@example.com",
        limit: 3,
        windowMs: 60 * 60_000,
        now,
      })),
    );
    assert.deepEqual(attempts.map((attempt) => attempt.allowed).sort(), [false, true, true, true]);
    const [stored] = await db.select({ hits: accessRateLimits.hits })
      .from(accessRateLimits)
      .where(eq(accessRateLimits.scope, scope));
    assert.equal(stored.hits, 4);
  });

  it("returns the same invalid error for expired and consumed tokens", async () => {
    const owner = await collector("expired");
    const expired = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() - 1),
    });
    tokenIds.push(expired.id);
    await assert.rejects(
      () => redeem(expired.token, owner.email),
      /ACCESS_TOKEN_INVALID/,
    );
  });

  it("keeps every old session revoked after suspension and reactivation", async () => {
    const owner = await collector("suspension");
    const issued = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);
    const redeemed = await redeem(issued.token, owner.email);
    sessionIds.push(redeemed.sessionId);

    const desk = deskActor("appraiser", "desk@mechartcap.com");
    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: owner.id,
      patch: { status: "suspended" },
    });
    assert.equal(await resolveCollectorSession(db, redeemed.sessionId), null);
    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: owner.id,
      patch: { status: "active" },
    });
    assert.equal(await resolveCollectorSession(db, redeemed.sessionId), null);
  });

  it("does not revive old sessions when an active collector is invited again", async () => {
    const owner = await collector("reinvite");
    const firstToken = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(firstToken.id);
    const oldSession = await redeem(firstToken.token, owner.email);
    sessionIds.push(oldSession.sessionId);

    const desk = deskActor("appraiser", "desk@mechartcap.com");
    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: owner.id,
      patch: { status: "invited" },
    });
    const inviteToken = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(inviteToken.id);
    const newSession = await redeem(inviteToken.token, owner.email);
    sessionIds.push(newSession.sessionId);

    assert.equal(await resolveCollectorSession(db, oldSession.sessionId), null);
    assert.equal(
      (await resolveCollectorSession(db, newSession.sessionId))?.customer.id,
      owner.id,
    );
  });

  it("serializes redemption with a concurrent suspension", async () => {
    const owner = await collector("suspension-race");
    const issued = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);

    let enteredResolve!: () => void;
    const entered = new Promise<void>((resolve) => { enteredResolve = resolve; });
    let releaseResolve!: () => void;
    const release = new Promise<void>((resolve) => { releaseResolve = resolve; });
    const redemption = redeem(issued.token, owner.email, {
      beforeSessionInsert: async () => {
        enteredResolve();
        await release;
      },
    });
    try {
      await Promise.race([
        entered,
        delay(5_000).then(() => { throw new Error("REDEEM_HOOK_NOT_REACHED"); }),
      ]);
    } catch (error) {
      releaseResolve();
      await redemption;
      throw error;
    }

    const desk = deskActor("appraiser", "desk@mechartcap.com");
    const applicationName = `mac-suspension-race-${randomUUID()}`;
    const databaseUrl = new URL(String(process.env.DATABASE_URL));
    databaseUrl.searchParams.set("application_name", applicationName);
    const suspensionDb = createDb({
      ...process.env,
      DATABASE_URL: databaseUrl.toString(),
    });
    const suspension = executeLiveBookOperation(suspensionDb, desk, {
      action: "customer.update",
      id: owner.id,
      patch: { status: "suspended" },
    });
    try {
      await waitForRowLock(db, applicationName);
    } finally {
      releaseResolve();
    }
    const redeemed = await redemption;
    sessionIds.push(redeemed.sessionId);
    await suspension;

    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: owner.id,
      patch: { status: "active" },
    });
    assert.equal(await resolveCollectorSession(db, redeemed.sessionId), null);
  });

  it("leaves GET unconsumed and gives every unusable POST the same page", async () => {
    const previous = {
      MAC_LIVE_BOOK: process.env.MAC_LIVE_BOOK,
      APP_ENV: process.env.APP_ENV,
      COLLECTOR_SESSION_SECRET: process.env.COLLECTOR_SESSION_SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: process.env.COLLECTOR_MAGIC_LINK_ORIGIN,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    };
    Object.assign(process.env, {
      MAC_LIVE_BOOK: "1",
      COLLECTOR_SESSION_SECRET: SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
      RESEND_API_KEY: "test-api-key",
    });
    try {
      const owner = await collector("route");
      const issued = await issue({
        purpose: "login",
        customerId: owner.id,
        email: owner.email,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      });
      tokenIds.push(issued.id);

      const getResponse = await verifyGet(new Request(
        `https://mechart.app/api/collector-session/verify?token=${issued.token}`,
      ));
      assert.equal(getResponse.status, 307);
      const [afterGet] = await db.select({ consumedAt: collectorAccessTokens.consumedAt })
        .from(collectorAccessTokens)
        .where(eq(collectorAccessTokens.id, issued.id));
      assert.equal(afterGet.consumedAt, null);

      const firstPost = await verifyPost(verificationRequest(issued.token, owner.email));
      assert.equal(firstPost.status, 303);
      assert.equal(firstPost.headers.get("location"), "http://localhost:43173/collection");
      const cookie = firstPost.headers.get("set-cookie") ?? "";
      const signedSession = /mac_collector=([^;]+)/.exec(cookie)?.[1];
      assert.ok(signedSession);
      sessionIds.push(openCollectorSessionId(signedSession, SECRET));

      const reused = await verifyPost(verificationRequest(issued.token, owner.email));
      const missing = await verifyPost(verificationRequest(""));
      const expired = await issue({
        purpose: "login",
        customerId: owner.id,
        email: owner.email,
        expiresAt: new Date(Date.now() - 1),
      });
      tokenIds.push(expired.id);
      const expiredResponse = await verifyPost(verificationRequest(expired.token, owner.email));
      for (const response of [reused, missing, expiredResponse]) {
        assert.equal(response.status, 303);
        assert.equal(response.headers.get("location"), "https://mechart.app/verify?state=invalid");
      }
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("stops extra collector code guesses after the email window", async () => {
    const previous = {
      MAC_LIVE_BOOK: process.env.MAC_LIVE_BOOK,
      APP_ENV: process.env.APP_ENV,
      COLLECTOR_SESSION_SECRET: process.env.COLLECTOR_SESSION_SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: process.env.COLLECTOR_MAGIC_LINK_ORIGIN,
      RESEND_API_KEY: process.env.RESEND_API_KEY,
    };
    Object.assign(process.env, {
      MAC_LIVE_BOOK: "1",
      COLLECTOR_SESSION_SECRET: SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
      RESEND_API_KEY: "test-api-key",
    });
    try {
      const owner = await collector("guess-limit");
      const code = "424242";
      const id = randomUUID();
      await db.insert(collectorAccessTokens).values({
        id,
        tokenHash: hashAccessCode(SECRET, owner.email, code),
        customerId: owner.id,
        purpose: "login",
        expiresAt: new Date(Date.now() + 15 * 60_000),
      });
      tokenIds.push(id);
      const guess = (value: string) => verifyPost(new Request(
        "https://mechart.app/api/collector-session/verify",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "sec-fetch-site": "same-origin",
            "x-forwarded-for": "198.51.100.24",
          },
          body: JSON.stringify({ email: owner.email, code: value }),
        },
      ));
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const response = await guess("000000");
        assert.equal(response.status, 400);
      }
      const blocked = await guess(code);
      assert.equal(blocked.status, 400);
      const [row] = await db.select({ consumedAt: collectorAccessTokens.consumedAt })
        .from(collectorAccessTokens)
        .where(eq(collectorAccessTokens.id, id));
      assert.equal(row.consumedAt, null);
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("lets two collectors share a six-digit code because hashes bind email", async () => {
    const firstOwner = await collector("code-a");
    const secondOwner = await collector("code-b");
    const code = "424242";
    for (const owner of [firstOwner, secondOwner]) {
      const id = randomUUID();
      await db.insert(collectorAccessTokens).values({
        id,
        tokenHash: hashAccessCode(SECRET, owner.email, code),
        customerId: owner.id,
        purpose: "login",
        expiresAt: new Date(Date.now() + 15 * 60_000),
      });
      tokenIds.push(id);
    }
    const first = await redeem(code, firstOwner.email);
    const second = await redeem(code, secondOwner.email);
    sessionIds.push(first.sessionId, second.sessionId);
    assert.equal(first.customer.id, firstOwner.id);
    assert.equal(second.customer.id, secondOwner.id);
  });

  it("consumes a desk login code once", async () => {
    const staffId = randomUUID();
    const email = `desk-login.${suffix}@mac.test`;
    await db.insert(staffAccounts).values({
      id: staffId,
      name: "Desk Login",
      email,
      role: "admin",
    });
    staffIds.push(staffId);
    const issued = await issue({
      purpose: "desk_login",
      staffId,
      email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);
    const payload = await consumeDeskLoginCode(db, { secret: SECRET, email, code: issued.token });
    assert.equal(payload.staffId, staffId);
    await assert.rejects(
      () => consumeDeskLoginCode(db, { secret: SECRET, email, code: issued.token }),
      /ACCESS_TOKEN_INVALID/,
    );
  });

  it("sets the first desk password and consumes the link in one write", async () => {
    const staffId = randomUUID();
    const email = `desk-set.${suffix}@mac.test`;
    await db.insert(staffAccounts).values({
      id: staffId,
      name: "Desk Set",
      email,
      role: "admin",
    });
    staffIds.push(staffId);
    const issued = await issue({
      purpose: "desk_set_password",
      staffId,
      email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);
    await assert.rejects(
      () => completeDeskSetPassword(db, {
        token: issued.token,
        newPassword: "short",
        clientAddress: "127.0.0.1",
      }),
      /PASSWORD_TOO_WEAK/,
    );
    const [afterWeak] = await db.select({ consumedAt: collectorAccessTokens.consumedAt })
      .from(collectorAccessTokens)
      .where(eq(collectorAccessTokens.id, issued.id));
    assert.equal(afterWeak.consumedAt, null);
    const set = await completeDeskSetPassword(db, {
      token: issued.token,
      newPassword: "first desk password 123",
      clientAddress: "127.0.0.1",
    });
    assert.equal(set.staffId, staffId);
    const [staff] = await db.select().from(staffAccounts).where(eq(staffAccounts.id, staffId));
    assert.ok(staff.passwordHash);
    await assert.rejects(
      () => completeDeskSetPassword(db, {
        token: issued.token,
        newPassword: "another desk password 123",
        clientAddress: "127.0.0.1",
      }),
      /ACCESS_TOKEN_INVALID/,
    );
  });

  it("rate-limits first-password guesses by address before hashing", async () => {
    const staffId = randomUUID();
    const email = `desk-set-limit.${suffix}@mac.test`;
    await db.insert(staffAccounts).values({
      id: staffId,
      name: "Desk Set Limit",
      email,
      role: "admin",
    });
    staffIds.push(staffId);
    const issued = await issue({
      purpose: "desk_set_password",
      staffId,
      email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);
    const address = `203.0.113.${suffix.slice(-2)}`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await assert.rejects(
        () => completeDeskSetPassword(db, {
          token: `wrong-link-${attempt}`,
          newPassword: "first desk password 123",
          clientAddress: address,
        }),
        /ACCESS_TOKEN_INVALID/,
      );
    }
    await assert.rejects(
      () => completeDeskSetPassword(db, {
        token: issued.token,
        newPassword: "first desk password 123",
        clientAddress: address,
      }),
      /ACCESS_TOKEN_INVALID/,
    );
    const [staff] = await db.select().from(staffAccounts).where(eq(staffAccounts.id, staffId));
    assert.equal(staff.passwordHash, null);
  });

  it("sweeps only rows beyond their retention windows", async () => {
    const now = new Date();
    const owner = await collector("sweep");
    const oldToken = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(now.getTime() - 25 * 60 * 60_000),
    });
    tokenIds.push(oldToken.id);
    const retainedToken = await issue({
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    tokenIds.push(retainedToken.id);
    const oldSessionId = randomUUID();
    const retainedSessionId = randomUUID();
    await db.insert(collectorSessions).values({
      id: oldSessionId,
      customerId: owner.id,
      expiresAt: new Date(now.getTime() - 1),
    });
    await db.insert(collectorSessions).values({
      id: retainedSessionId,
      customerId: owner.id,
      expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000),
    });
    sessionIds.push(oldSessionId, retainedSessionId);
    const oldScope = `test-${suffix}-old`;
    const retainedScope = `test-${suffix}-retained`;
    rateScopes.push(oldScope, retainedScope);
    await consumeAccessRateLimit(db, {
      scope: oldScope,
      key: owner.email,
      limit: 3,
      windowMs: 60 * 60_000,
      now: new Date(now.getTime() - 3 * 60 * 60_000),
    });
    await consumeAccessRateLimit(db, {
      scope: retainedScope,
      key: owner.email,
      limit: 3,
      windowMs: 60 * 60_000,
      now,
    });

    const deleted = await sweepCollectorAccessRows(db, now, {
      rateScopePrefix: `test-${suffix}`,
    });
    assert.ok(deleted.tokens >= 1);
    assert.ok(deleted.sessions >= 1);
    assert.equal(deleted.rateWindows, 1);
    assert.equal((await db.select().from(collectorAccessTokens)
      .where(eq(collectorAccessTokens.id, oldToken.id))).length, 0);
    assert.equal((await db.select().from(collectorAccessTokens)
      .where(eq(collectorAccessTokens.id, retainedToken.id))).length, 1);
    assert.equal((await db.select().from(collectorSessions)
      .where(eq(collectorSessions.id, oldSessionId))).length, 0);
    assert.equal((await db.select().from(collectorSessions)
      .where(eq(collectorSessions.id, retainedSessionId))).length, 1);
    assert.equal((await db.select().from(accessRateLimits)
      .where(eq(accessRateLimits.scope, oldScope))).length, 0);
    assert.equal((await db.select().from(accessRateLimits)
      .where(eq(accessRateLimits.scope, retainedScope))).length, 1);
  });
});

function verificationRequest(token: string, email = "") {
  return new Request("https://mechart.app/api/collector-session/verify", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
    },
    body: new URLSearchParams({ token, email }),
  });
}

async function waitForRowLock(db: ReturnType<typeof createDb>, applicationName: string) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await db.execute(sql`
      select 1
      from pg_stat_activity
      where application_name = ${applicationName}
        and wait_event_type = 'Lock'
      limit 1
    `);
    const rows = Array.isArray(result) ? result : result.rows;
    if (rows.length > 0) return;
    await delay(50);
  }
  throw new Error("SUSPENSION_ROW_LOCK_NOT_OBSERVED");
}
