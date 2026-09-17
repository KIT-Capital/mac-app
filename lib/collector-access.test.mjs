import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLLECTOR_COOKIE,
  collectorCookieOptions,
  decideCollectorAccessRequest,
  normalizeCollectorEmail,
  openCollectorSession,
  openVerificationToken,
  sealCollectorSession,
  sealVerificationToken,
  validateRegistrationInput,
  requireActiveCollector,
} from "./collector-access.mjs";
import { evaluateLiveBookConfig } from "./env/live-book-flag.mjs";

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

  it("fails closed without prerequisites or outside development", () => {
    assert.deepEqual(
      evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "true",
        APP_ENV: "development",
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://localhost.test",
        RESEND_API_KEY: "test-api-key",
      }).errors,
      ["COLLECTOR_SESSION_SECRET_REQUIRED"],
    );
    assert.ok(
      evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "on",
        APP_ENV: "production",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://mechart.app",
        RESEND_API_KEY: "test-api-key",
      }).errors.includes("COLLECTOR_LIVE_BOOK_DEVELOPMENT_ONLY"),
    );
  });

  it("requires a fixed safe absolute origin", () => {
    for (const origin of ["", "not-a-url", "http://example.com", "https://user@example.com"]) {
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
    assert.equal(
      evaluateLiveBookConfig({
        MAC_LIVE_BOOK: "1",
        APP_ENV: "development",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "http://localhost:43173",
        RESEND_API_KEY: "test-api-key",
      }).ok,
      true,
    );
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

describe("collector verification tokens", () => {
  it("normalizes email and binds login tokens to action, customer, and email", () => {
    assert.equal(normalizeCollectorEmail("  Person@Example.COM "), "person@example.com");
    const token = sealVerificationToken(
      { action: "login", customerId: "customer-1", email: "Person@Example.com" },
      SECRET,
      { now: NOW, ttlMs: 10 * 60_000 },
    );
    assert.equal(
      openVerificationToken(token, SECRET, {
        now: NOW + 1,
        action: "login",
        customerId: "customer-1",
        email: "person@example.com",
      }).customerId,
      "customer-1",
    );
    assert.throws(
      () => openVerificationToken(token, SECRET, { now: NOW, action: "register" }),
      /TOKEN_ACTION_MISMATCH/,
    );
    assert.throws(
      () =>
        openVerificationToken(token, SECRET, {
          now: NOW,
          action: "login",
          customerId: "customer-2",
        }),
      /TOKEN_CUSTOMER_MISMATCH/,
    );
    assert.throws(
      () =>
        openVerificationToken(token, SECRET, {
          now: NOW,
          action: "login",
          email: "other@example.com",
        }),
      /TOKEN_EMAIL_MISMATCH/,
    );
  });

  it("rejects tampering and expiry", () => {
    const token = sealVerificationToken(
      { action: "login", customerId: "customer-1", email: "person@example.com" },
      SECRET,
      { now: NOW, ttlMs: 1000 },
    );
    assert.throws(() => openVerificationToken(`${token}x`, SECRET, { now: NOW }), /TOKEN_INVALID/);
    assert.throws(() => openVerificationToken(token, SECRET, { now: NOW + 1001 }), /TOKEN_EXPIRED/);
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

  it("uses a signed expiring session-only HttpOnly cookie", () => {
    const token = sealCollectorSession(
      { customerId: "customer-1", email: "Person@Example.com" },
      SECRET,
      { now: NOW, ttlMs: 12 * 60 * 60_000 },
    );
    assert.deepEqual(openCollectorSession(token, SECRET, { now: NOW + 1 }), {
      customerId: "customer-1",
      email: "person@example.com",
    });
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
        sendAccessEmail: async () => {
          mailCalls += 1;
        },
      },
    );
    assert.deepEqual(result, { ok: true, mode: "browser" });
    assert.equal(databaseCalls, 0);
    assert.equal(mailCalls, 0);
  });

  it("refuses live access outside development before side effects", async () => {
    let calls = 0;
    await assert.rejects(
      () =>
        decideCollectorAccessRequest(
          { action: "login", email: "person@example.com" },
          {
            MAC_LIVE_BOOK: "true",
            APP_ENV: "staging",
            COLLECTOR_SESSION_SECRET: SECRET,
            COLLECTOR_MAGIC_LINK_ORIGIN: "https://staging.example.com",
            RESEND_API_KEY: "test-api-key",
          },
          {
            findCustomerByEmail: async () => {
              calls += 1;
              return null;
            },
            sendAccessEmail: async () => {
              calls += 1;
            },
          },
        ),
      /COLLECTOR_LIVE_BOOK_DEVELOPMENT_ONLY/,
    );
    assert.equal(calls, 0);
  });

  it("gives known and unknown login emails the same outward response", async () => {
    const sent = [];
    const env = {
      MAC_LIVE_BOOK: "1",
      APP_ENV: "development",
      COLLECTOR_SESSION_SECRET: SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
      RESEND_API_KEY: "test-api-key",
    };
    const deps = {
      findCustomerByEmail: async (email) =>
        email === "known@example.com" ? { id: "customer-1", email } : null,
      sendAccessEmail: async (message) => sent.push(message),
    };
    const known = await decideCollectorAccessRequest(
      { action: "login", email: "known@example.com" },
      env,
      deps,
      { now: NOW },
    );
    const unknown = await decideCollectorAccessRequest(
      { action: "login", email: "unknown@example.com" },
      env,
      deps,
      { now: NOW },
    );
    assert.deepEqual(known, unknown);
    assert.deepEqual(known, { ok: true, mode: "live", accepted: true });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "known@example.com");
    assert.match(sent[0].url, /^https:\/\/development\.example\.com\/api\/collector-session\/verify\?token=/);
  });

  it("does not send login mail for a suspended collector", async () => {
    let sent = 0;
    const result = await decideCollectorAccessRequest(
      { action: "login", email: "suspended@example.com" },
      {
        MAC_LIVE_BOOK: "1",
        APP_ENV: "development",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
        RESEND_API_KEY: "test-api-key",
      },
      {
        findCustomerByEmail: async () => ({
          id: "customer-suspended",
          email: "suspended@example.com",
          status: "suspended",
        }),
        sendAccessEmail: async () => { sent += 1; },
      },
      { now: NOW },
    );
    assert.deepEqual(result, { ok: true, mode: "live", accepted: true });
    assert.equal(sent, 0);
    assert.throws(
      () => requireActiveCollector({ status: "suspended" }),
      /COLLECTOR_INACTIVE/,
    );
  });

  it("sends the same verified login flow to an invited collector", async () => {
    const sent = [];
    const result = await decideCollectorAccessRequest(
      { action: "login", email: "invited@example.com" },
      {
        MAC_LIVE_BOOK: "1",
        APP_ENV: "development",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
        RESEND_API_KEY: "test-api-key",
      },
      {
        findCustomerByEmail: async () => ({
          id: "customer-invited",
          email: "invited@example.com",
          name: "Invited",
          status: "invited",
        }),
        sendAccessEmail: async (message) => sent.push(message),
      },
      { now: NOW },
    );
    assert.deepEqual(result, { ok: true, mode: "live", accepted: true });
    assert.equal(sent.length, 1);
  });

  it("signs registration details without creating or looking up a customer", async () => {
    let databaseCalls = 0;
    const sent = [];
    const result = await decideCollectorAccessRequest(
      {
        action: "register",
        name: "Future Collector",
        email: "future@example.com",
        phone: "+1 212 555 0199",
      },
      {
        MAC_LIVE_BOOK: "true",
        APP_ENV: "development",
        COLLECTOR_SESSION_SECRET: SECRET,
        COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
        RESEND_API_KEY: "test-api-key",
      },
      {
        findCustomerByEmail: async () => {
          databaseCalls += 1;
          return null;
        },
        sendAccessEmail: async (message) => sent.push(message),
      },
      { now: NOW },
    );
    assert.deepEqual(result, { ok: true, mode: "live", accepted: true });
    assert.equal(databaseCalls, 0);
    const token = new URL(sent[0].url).searchParams.get("token");
    const payload = openVerificationToken(token, SECRET, {
      now: NOW + 1,
      action: "register",
    });
    assert.equal(payload.name, "Future Collector");
    assert.equal(payload.phone, "+1 212 555 0199");
  });

  it("rejects reserved desk identities before signing or sending registration", async () => {
    let mailCalls = 0;
    const env = {
      MAC_LIVE_BOOK: "true",
      APP_ENV: "development",
      COLLECTOR_SESSION_SECRET: SECRET,
      COLLECTOR_MAGIC_LINK_ORIGIN: "https://development.example.com",
      RESEND_API_KEY: "test-api-key",
    };
    for (const email of ["admin@mechartcap.com", "desk@mechartcap.com"]) {
      await assert.rejects(
        () =>
          decideCollectorAccessRequest(
            { action: "register", name: "Reserved", email, phone: "" },
            env,
            {
              findCustomerByEmail: async () => null,
              sendAccessEmail: async () => {
                mailCalls += 1;
              },
            },
          ),
        /RESERVED_DESK_EMAIL/,
      );
    }
    assert.equal(mailCalls, 0);
  });
});
