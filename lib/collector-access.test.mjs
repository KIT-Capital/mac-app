import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLLECTOR_COOKIE,
  collectorCookieOptions,
  decideCollectorAccessRequest,
  normalizeCollectorPhone,
  openCollectorSessionId,
  sealCollectorSessionId,
  validateRegistrationInput,
  requireActiveCollector,
} from "./collector-access.mjs";
import { evaluateLiveBookConfig } from "./env/live-book-flag.mjs";
import { LOGIN_SMS_NOTICE } from "./login-copy.mjs";

const SECRET = "test-secret-with-enough-entropy-for-hmac";
const NOW = 1_800_000_000_000;

describe("live-book collector access config", () => {
  it("enables only explicit 1, true, or on values", () => {
    for (const value of ["1", "true", "TRUE", "on", " On "]) {
      assert.equal(evaluateLiveBookConfig({ MAC_LIVE_BOOK: value }).enabled, true);
    }
    for (const value of [undefined, "", "0", "false", "yes", "enabled"]) {
      assert.deepEqual(evaluateLiveBookConfig({ MAC_LIVE_BOOK: value }), {
        enabled: false,
        mode: "browser",
      });
    }
  });

  it("fails closed without prerequisites or outside a known APP_ENV", () => {
    assert.deepEqual(
      evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "true",
        APP_ENV: "development",
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://localhost.test",
        RESEND_API_KEY: "test-api-key",
      }).errors,
      ["COLLECTOR_SESSION_SECRET_REQUIRED"],
    );
    for (const appEnv of ["", "preview", "qa"]) {
      assert.ok(
        evaluateLiveBookConfig({
          MAC_LIVE_BOOK: "on",
          APP_ENV: appEnv,
          COLLECTOR_SESSION_SECRET: SECRET,
          COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
          RESEND_API_KEY: "test-api-key",
        }).errors.includes("COLLECTOR_LIVE_BOOK_APP_ENV_INVALID"),
      );
    }
  });

  it("accepts staging and production with an HTTPS origin", () => {
    for (const [appEnv, origin] of [
      ["staging", "https://mac-app-staging.up.railway.app"],
      ["production", "https://mechart.app"],
    ]) {
      const result = evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "on",
        APP_ENV: appEnv,
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: origin,
        RESEND_API_KEY: "test-api-key",
      });
      assert.equal(result.ok, true);
      assert.equal(result.appEnv, appEnv);
      assert.equal(result.origin, origin);
    }
  });

  it("allows HTTP localhost in development only", () => {
    for (const appEnv of ["staging", "production"]) {
      const result = evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "1",
        APP_ENV: appEnv,
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
        RESEND_API_KEY: "test-api-key",
      });
      assert.equal(result.ok, false);
      assert.deepEqual(result.errors, ["COLLECTOR_MAGIC_LINK_ORIGIN_INVALID"]);
    }
  });

  it("names a missing origin separately from a malformed one", () => {
    assert.deepEqual(
      evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "1",
        APP_ENV: "production",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "",
        RESEND_API_KEY: "test-api-key",
      }).errors,
      ["COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED"],
    );
  });

  it("requires a fixed safe absolute origin", () => {
    for (const origin of ["not-a-url", "http://example.com", "https://user@example.com"]) {
      assert.ok(
        evaluateLiveBookConfig({
          MAC_LIVE_BOOK: "1",
          APP_ENV: "development",
          COLLECTOR_SESSION_SECRET: SECRET,
          COLLECTOR_MAGIC_LINK_ORIGIN: origin,
          RESEND_API_KEY: "test-api-key",
        }).errors.includes("COLLECTOR_MAGIC_LINK_ORIGIN_INVALID"),
      );
    }
    for (const appEnv of ["development", "ci"]) {
      assert.equal(
        evaluateLiveBookConfig({
          MAC_LIVE_BOOK: "1",
          APP_ENV: appEnv,
          COLLECTOR_SESSION_SECRET: SECRET,
          COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
          RESEND_API_KEY: "test-api-key",
        }).ok,
        true,
        appEnv,
      );
    }
  });

  it("requires real email delivery before live collector access can be enabled", () => {
    assert.ok(
      evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "true",
        APP_ENV: "development",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
      }).errors.includes("COLLECTOR_ACCESS_EMAIL_REQUIRED"),
    );
  });
});

describe("collector registration and session", () => {
  it("bounds the signed registration payload", () => {
    assert.deepEqual(
      validateRegistrationInput({
        name: "  Ricardo Cidale ",
        email: " OWNER@EXAMPLE.COM ",
        phone: " +1 212 555 0100 ",
      }),
      {
        name: "Ricardo Cidale",
        email: "owner@example.com",
        phone: "+1 212 555 0100",
        role: "collector",
      },
    );
    assert.throws(
      () => validateRegistrationInput({ name: "x".repeat(121), email: "a@example.com", phone: "" }),
      /REGISTRATION_NAME_INVALID/,
    );
    assert.throws(
      () => validateRegistrationInput({ name: "A", email: "a@example.com", phone: "x".repeat(41) }),
      /REGISTRATION_PHONE_INVALID/,
    );
  });

  it("normalizes US and E.164 phones and rejects junk", () => {
    assert.equal(normalizeCollectorPhone("212 555 0100"), "+12125550100");
    assert.equal(normalizeCollectorPhone("+1 (212) 555-0100"), "+12125550100");
    assert.throws(() => normalizeCollectorPhone("not-a-phone"), /COLLECTOR_PHONE_INVALID/);
    assert.doesNotMatch(LOGIN_SMS_NOTICE, /MAC|Mechanical Art|Norfolk|\+\d{8,}/i);
  });

  it("puts only a signed opaque session id in the HttpOnly cookie", () => {
    const token = sealCollectorSessionId("session-row-1", SECRET);
    assert.equal(openCollectorSessionId(token, SECRET), "session-row-1");
    assert.doesNotMatch(token, /customer|example/i);
    assert.throws(() => openCollectorSessionId(`${token}x`, SECRET), /SESSION_INVALID/);
    assert.equal(COLLECTOR_COOKIE, "mac_collector");
    const options = collectorCookieOptions({ secure: true });
    assert.equal(options.httpOnly, true);
    assert.equal(options.sameSite, "lax");
    assert.equal(options.path, "/");
    assert.equal(options.secure, true);
    assert.equal("expires" in options, false);
    assert.equal("maxAge" in options, false);
  });
});

describe("collector access request decisions", () => {
  const liveEnv = {
    MAC_LIVE_BOOK: "1",
    APP_ENV: "development",
    COLLECTOR_SESSION_SECRET: SECRET,
    COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
    RESEND_API_KEY: "test-api-key",
  };

  function deps(overrides = {}) {
    const created = [];
    const sent = [];
    const marked = [];
    return {
      created,
      sent,
      marked,
      value: {
        consumeRateLimit: async () => ({ allowed: true }),
        findCustomerByEmail: async () => null,
        createAccessToken: async (input) => {
          created.push(input);
          return { id: `token-row-${created.length}`, token: `raw-token-${created.length}` };
        },
        sendAccessEmail: async (message) => {
          sent.push(message);
        },
        markAccessTokenSent: async (id, ok) => {
          marked.push({ id, ok });
        },
        ...overrides,
      },
    };
  }

  it("returns browser mode before any database or mail dependency", async () => {
    let databaseCalls = 0;
    let mailCalls = 0;
    const result = await decideCollectorAccessRequest(
      { action: "login", email: "person@example.com" },
      { MAC_LIVE_BOOK: "off" },
      {
        findCustomerByEmail: async () => {
          databaseCalls += 1;
          return null;
        },
        consumeRateLimit: async () => {
          databaseCalls += 1;
          return { allowed: true };
        },
        createAccessToken: async () => {
          databaseCalls += 1;
          return { id: "unused", token: "unused" };
        },
        sendAccessEmail: async () => {
          mailCalls += 1;
        },
        markAccessTokenSent: async () => {
          databaseCalls += 1;
        },
      },
    );
    assert.deepEqual(result, { response: { ok: true, mode: "browser" }, deferred: null });
    assert.equal(databaseCalls, 0);
    assert.equal(mailCalls, 0);
  });

  it("refuses live access on an unknown APP_ENV before side effects", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        decideCollectorAccessRequest(
          { action: "login", email: "person@example.com" },
          {
            MAC_LIVE_BOOK: "true",
            APP_ENV: "preview",
            COLLECTOR_SESSION_SECRET: SECRET,
            COLLECTOR_MAGIC_LINK_ORIGIN: "https://staging.example.com",
            RESEND_API_KEY: "test-api-key",
          },
          {
            consumeRateLimit: async () => {
              calls += 1;
              return { allowed: true };
            },
            findCustomerByEmail: async () => {
              calls += 1;
              return null;
            },
            createAccessToken: async () => {
              calls += 1;
              return { id: "unused", token: "unused" };
            },
            sendAccessEmail: async () => {
              calls += 1;
            },
            markAccessTokenSent: async () => {
              calls += 1;
            },
          },
        ),
      /COLLECTOR_LIVE_BOOK_APP_ENV_INVALID/,
    );
    assert.equal(calls, 0);
  });

  it("gives known and unknown login emails the same outward response", async () => {
    const knownDeps = deps({
      findCustomerByEmail: async (email) =>
        ({ id: "customer-1", email, name: "Known", status: "active" }),
    });
    const unknownDeps = deps();
    const known = await decideCollectorAccessRequest(
      { action: "login", email: "known@example.com" },
      liveEnv,
      knownDeps.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    const unknown = await decideCollectorAccessRequest(
      { action: "login", email: "unknown@example.com" },
      liveEnv,
      unknownDeps.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(known.response, unknown.response);
    assert.deepEqual(known.response, { ok: true, mode: "live", accepted: true });
    assert.equal(knownDeps.created.length, 0);
    assert.equal(knownDeps.sent.length, 0);
    await known.deferred();
    await unknown.deferred();
    assert.equal(knownDeps.sent.length, 1);
    assert.equal(unknownDeps.sent.length, 0);
    assert.equal(knownDeps.sent[0].to, "known@example.com");
    assert.equal(knownDeps.sent[0].tokenId, "token-row-1");
    assert.equal(knownDeps.sent[0].code, "raw-token-1");
    assert.equal(knownDeps.sent[0].url, undefined);
  });

  it("does not send login mail for a suspended collector", async () => {
    const suspended = deps({
      findCustomerByEmail: async () => ({
        id: "customer-suspended",
        email: "suspended@example.com",
        status: "suspended",
      }),
    });
    const result = await decideCollectorAccessRequest(
      { action: "login", email: "suspended@example.com" },
      liveEnv,
      suspended.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(result.response, { ok: true, mode: "live", accepted: true });
    await result.deferred();
    assert.equal(suspended.sent.length, 0);
    assert.equal(suspended.created.length, 0);
    assert.throws(
      () => requireActiveCollector({ status: "suspended" }),
      /COLLECTOR_INACTIVE/,
    );
  });

  it("stores registration details behind an opaque token", async () => {
    let databaseCalls = 0;
    const registration = deps({
      findCustomerByEmail: async () => {
        databaseCalls += 1;
        return null;
      },
    });
    const result = await decideCollectorAccessRequest(
      {
        action: "register",
        name: "Future Collector",
        email: "future@example.com",
        phone: "+1 212 555 0199",
      },
      liveEnv,
      registration.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(result.response, { ok: true, mode: "live", accepted: true });
    assert.equal(databaseCalls, 0);
    await result.deferred();
    assert.deepEqual(registration.created[0].registration, {
      name: "Future Collector",
      email: "future@example.com",
      phone: "+1 212 555 0199",
      role: "collector",
    });
    assert.equal(registration.sent[0].code, "raw-token-1");
    assert.equal(registration.sent[0].url, undefined);
    assert.equal(String(registration.sent[0].code).includes("Future"), false);
  });

  it("stores a dealer registration tag on the opaque token", async () => {
    const registration = deps();
    const result = await decideCollectorAccessRequest(
      {
        action: "register",
        name: "47th Street Books",
        email: "books@example.com",
        phone: "+1 212 555 0147",
        role: "dealer",
      },
      liveEnv,
      registration.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    await result.deferred();
    assert.equal(registration.created[0].registration.role, "dealer");
  });

  it("rejects reserved desk identities before signing or sending registration", async () => {
    const blocked = deps();
    for (const email of ["admin@mechartcap.com", "desk@mechartcap.com"]) {
      await assert.rejects(
        () =>
          decideCollectorAccessRequest(
            { action: "register", name: "Reserved", email, phone: "" },
            liveEnv,
            blocked.value,
          ),
        /RESERVED_DESK_EMAIL/,
      );
    }
    assert.equal(blocked.sent.length, 0);
  });

  it("accepts an email-limited request without creating or sending a token", async () => {
    const limited = deps({
      consumeRateLimit: async ({ scope }) => ({ allowed: scope !== "collector-link-email" }),
      findCustomerByEmail: async (email) => ({
        id: "customer-1",
        email,
        name: "Known",
        status: "active",
      }),
    });
    const result = await decideCollectorAccessRequest(
      { action: "login", email: "known@example.com" },
      liveEnv,
      limited.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(result.response, { ok: true, mode: "live", accepted: true });
    await result.deferred();
    assert.equal(limited.created.length, 0);
    assert.equal(limited.sent.length, 0);
  });

  it("marks a token failed without leaking the deferred mail error", async () => {
    const failed = deps({
      findCustomerByEmail: async (email) => ({
        id: "customer-1",
        email,
        name: "Known",
        status: "active",
      }),
      sendAccessEmail: async () => {
        throw new Error("provider detail");
      },
    });
    const result = await decideCollectorAccessRequest(
      { action: "login", email: "known@example.com" },
      liveEnv,
      failed.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    await result.deferred();
    assert.deepEqual(failed.marked, [{ id: "token-row-1", ok: false }]);
  });

  it("uses one generic response when the global registration window is full", async () => {
    const limited = deps({
      consumeRateLimit: async ({ scope, key }) => ({
        allowed: !(scope === "collector-link-global" && key === "register"),
      }),
    });
    const result = await decideCollectorAccessRequest(
      { action: "register", name: "Ada Locke", email: "ada@example.com", phone: "" },
      liveEnv,
      limited.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(result, {
      response: { ok: false, mode: "live", rateLimited: true },
      deferred: null,
    });
    assert.equal(limited.created.length, 0);
    assert.equal(limited.sent.length, 0);
  });

  it("leaves live collector access valid when Twilio Verify is unset", () => {
    const result = evaluateLiveBookConfig(liveEnv);
    assert.equal(result.ok, true);
  });

  it("gives known and unknown login phones the same outward response", async () => {
    const knownDeps = deps({
      findCustomerByPhone: async () => ({
        id: "customer-1",
        email: "known@example.com",
        phone: "+12125550100",
        name: "Known",
        status: "active",
      }),
    });
    const unknownDeps = deps();
    const known = await decideCollectorAccessRequest(
      { action: "login", phone: "212 555 0100" },
      liveEnv,
      knownDeps.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    const unknown = await decideCollectorAccessRequest(
      { action: "login", phone: "+1 212 555 0199" },
      liveEnv,
      unknownDeps.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(known.response, unknown.response);
    assert.deepEqual(known.response, { ok: true, mode: "live", accepted: true, sms: false });
    await known.deferred();
    await unknown.deferred();
    assert.equal(knownDeps.created.length, 0);
    assert.equal(unknownDeps.created.length, 0);
    assert.equal(knownDeps.sent.length, 0);
    assert.equal(unknownDeps.sent.length, 0);
  });

  it("texts a known collector when Twilio Verify is wired and leaves email login independent", async () => {
    const sms = [];
    const challenges = [];
    const known = deps({
      findCustomerByPhone: async () => ({
        id: "customer-1",
        email: "known@example.com",
        phone: "+12125550100",
        status: "active",
      }),
      smsConfigured: () => true,
      createSmsChallenge: async (challenge) => {
        challenges.push(challenge);
      },
      startSmsVerification: async (phone) => {
        sms.push(phone);
      },
    });
    const emailed = deps({
      findCustomerByEmail: async (email) => ({
        id: "customer-1",
        email,
        name: "Known",
        status: "active",
      }),
      startSmsVerification: async () => {
        throw new Error("SMS should not run for email login");
      },
    });
    const texted = await decideCollectorAccessRequest(
      { action: "login", phone: "+1 (212) 555-0100" },
      liveEnv,
      known.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    await texted.deferred();
    assert.deepEqual(sms, ["+12125550100"]);
    assert.equal(challenges[0].customerId, "customer-1");
    assert.equal(texted.response.sms, true);
    const mailed = await decideCollectorAccessRequest(
      { action: "login", email: "known@example.com" },
      liveEnv,
      emailed.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    await mailed.deferred();
    assert.equal(emailed.sent.length, 1);
    assert.equal(emailed.created.length, 1);
  });

  it("does not send SMS when Twilio Verify is missing or the collector is suspended", async () => {
    let started = 0;
    const missing = deps({
      findCustomerByPhone: async () => ({
        id: "customer-1",
        phone: "+12125550100",
        status: "active",
      }),
    });
    const suspended = deps({
      findCustomerByPhone: async () => ({
        id: "customer-suspended",
        phone: "+12125550100",
        status: "suspended",
      }),
      startSmsVerification: async () => {
        started += 1;
      },
    });
    const unset = await decideCollectorAccessRequest(
      { action: "login", phone: "+12125550100" },
      liveEnv,
      missing.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    await unset.deferred();
    const blocked = await decideCollectorAccessRequest(
      { action: "login", phone: "+12125550100" },
      liveEnv,
      suspended.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    await blocked.deferred();
    assert.equal(started, 0);
    assert.equal(missing.created.length, 0);
  });

  it("does not let one limited phone consume a later send", async () => {
    const limited = deps({
      consumeRateLimit: async ({ scope }) => ({ allowed: scope !== "collector-link-phone" }),
      findCustomerByPhone: async () => ({
        id: "customer-1",
        phone: "+12125550100",
        status: "active",
      }),
      startSmsVerification: async () => {
        throw new Error("limited phone must not text");
      },
    });
    const result = await decideCollectorAccessRequest(
      { action: "login", phone: "+12125550100" },
      liveEnv,
      limited.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(result.response, { ok: true, mode: "live", accepted: true, sms: false });
    await result.deferred();
  });

  it("does not text when SMS is unset even if a customer matches", async () => {
    let started = 0;
    const configuredOff = deps({
      findCustomerByPhone: async () => ({
        id: "customer-1",
        phone: "+12125550100",
        status: "active",
      }),
      smsConfigured: () => false,
      createSmsChallenge: async () => {
        throw new Error("unset SMS must not store a challenge");
      },
      startSmsVerification: async () => {
        started += 1;
      },
    });
    const result = await decideCollectorAccessRequest(
      { action: "login", phone: "+12125550100" },
      liveEnv,
      configuredOff.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.equal(result.response.sms, false);
    await result.deferred();
    assert.equal(started, 0);
  });

  it("does not let one limited email consume the global registration window", async () => {
    const scopes = [];
    const limited = deps({
      consumeRateLimit: async ({ scope }) => {
        scopes.push(scope);
        return { allowed: scope !== "collector-link-email" };
      },
    });
    const result = await decideCollectorAccessRequest(
      { action: "register", name: "Ada Locke", email: "ada@example.com", phone: "" },
      liveEnv,
      limited.value,
      { now: new Date(NOW), address: "127.0.0.1" },
    );
    assert.deepEqual(result.response, { ok: true, mode: "live", accepted: true });
    assert.equal(scopes.includes("collector-link-global"), false);
  });
});
