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
  createCollectorAccessToken,
  redeemCollectorAccessToken,
  resolveCollectorSession,
  revokeCollectorSession,
  sweepCollectorAccessRows,
} from "./collector-sessions";
import { executeLiveBookOperation } from "./live-book-mutations";
import { deskActor, registerCollector } from "./records";
import {
  accessRateLimits,
  collectorAccessTokens,
  collectorSessions,
  customers,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const customerIds: string[] = [];
const tokenIds: string[] = [];
const sessionIds: string[] = [];
const rateScopes: string[] = [];
const SECRET = "collector-session-test-secret-with-enough-entropy";

describe("collector access rows", { skip }, () => {
  const db = createDb();

  after(async () => {
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
    const issued = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);

    const first = await redeemCollectorAccessToken(db, issued.token);
    sessionIds.push(first.sessionId);
    assert.equal(first.customer.id, owner.id);
    assert.equal(first.redirectPath, "/collection");

    await assert.rejects(
      () => redeemCollectorAccessToken(db, issued.token),
      /ACCESS_TOKEN_INVALID/,
    );
    assert.equal((await resolveCollectorSession(db, first.sessionId))?.customer.id, owner.id);

    await revokeCollectorSession(db, first.sessionId);
    assert.equal(await resolveCollectorSession(db, first.sessionId), null);
  });

  it("registers once and treats an existing registration email as login", async () => {
    const email = `register.${suffix}@mac.test`;
    const first = await createCollectorAccessToken(db, {
      purpose: "register",
      registration: { name: "New Collector", email, phone: "+1 212 555 0199" },
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(first.id);
    const registered = await redeemCollectorAccessToken(db, first.token);
    customerIds.push(registered.customer.id);
    sessionIds.push(registered.sessionId);
    assert.equal(registered.redirectPath, "/collection/setup");

    const second = await createCollectorAccessToken(db, {
      purpose: "register",
      registration: { name: "Changed Name", email, phone: "" },
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(second.id);
    const existing = await redeemCollectorAccessToken(db, second.token);
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
    const issued = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);

    await assert.rejects(
      () => redeemCollectorAccessToken(db, issued.token, { sessionId: duplicateSessionId }),
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
    const expired = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() - 1),
    });
    tokenIds.push(expired.id);
    await assert.rejects(
      () => redeemCollectorAccessToken(db, expired.token),
      /ACCESS_TOKEN_INVALID/,
    );
  });

  it("keeps every old session revoked after suspension and reactivation", async () => {
    const owner = await collector("suspension");
    const issued = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(issued.id);
    const redeemed = await redeemCollectorAccessToken(db, issued.token);
    sessionIds.push(redeemed.sessionId);

    const desk = deskActor("staff", "desk@mechartcap.com");
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
    const firstToken = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(firstToken.id);
    const oldSession = await redeemCollectorAccessToken(db, firstToken.token);
    sessionIds.push(oldSession.sessionId);

    const desk = deskActor("staff", "desk@mechartcap.com");
    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: owner.id,
      patch: { status: "invited" },
    });
    const inviteToken = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(Date.now() + 15 * 60_000),
    });
    tokenIds.push(inviteToken.id);
    const newSession = await redeemCollectorAccessToken(db, inviteToken.token);
    sessionIds.push(newSession.sessionId);

    assert.equal(await resolveCollectorSession(db, oldSession.sessionId), null);
    assert.equal(
      (await resolveCollectorSession(db, newSession.sessionId))?.customer.id,
      owner.id,
    );
  });

  it("serializes redemption with a concurrent suspension", async () => {
    const owner = await collector("suspension-race");
    const issued = await createCollectorAccessToken(db, {
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
    const redemption = redeemCollectorAccessToken(db, issued.token, {
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

    const desk = deskActor("staff", "desk@mechartcap.com");
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
      APP_ENV: "development",
      COLLECTOR_SESSION_SECRET: SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
      RESEND_API_KEY: "test-api-key",
    });
    try {
      const owner = await collector("route");
      const issued = await createCollectorAccessToken(db, {
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

      const firstPost = await verifyPost(verificationRequest(issued.token));
      assert.equal(firstPost.status, 303);
      assert.equal(firstPost.headers.get("location"), "http://localhost:43173/collection");
      const cookie = firstPost.headers.get("set-cookie") ?? "";
      const signedSession = /mac_collector=([^;]+)/.exec(cookie)?.[1];
      assert.ok(signedSession);
      sessionIds.push(openCollectorSessionId(signedSession, SECRET));

      const reused = await verifyPost(verificationRequest(issued.token));
      const missing = await verifyPost(verificationRequest(""));
      const expired = await createCollectorAccessToken(db, {
        purpose: "login",
        customerId: owner.id,
        email: owner.email,
        expiresAt: new Date(Date.now() - 1),
      });
      tokenIds.push(expired.id);
      const expiredResponse = await verifyPost(verificationRequest(expired.token));
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

  it("sweeps only rows beyond their retention windows", async () => {
    const now = new Date();
    const owner = await collector("sweep");
    const oldToken = await createCollectorAccessToken(db, {
      purpose: "login",
      customerId: owner.id,
      email: owner.email,
      expiresAt: new Date(now.getTime() - 25 * 60 * 60_000),
    });
    tokenIds.push(oldToken.id);
    const retainedToken = await createCollectorAccessToken(db, {
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
    assert.deepEqual(deleted, { tokens: 1, sessions: 1, rateWindows: 1 });
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

function verificationRequest(token: string) {
  return new Request("https://mechart.app/api/collector-session/verify", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "sec-fetch-site": "same-origin",
    },
    body: new URLSearchParams({ token }),
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
