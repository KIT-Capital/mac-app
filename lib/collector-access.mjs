import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { evaluateLiveBookConfig } from "./env/live-book-flag.mjs";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const VERIFICATION_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 12 * 60 * 60_000;
const RESERVED_DESK_EMAILS = new Set([
  "admin@mechartcap.com",
  "desk@mechartcap.com",
]);

export const COLLECTOR_COOKIE = "mac_collector";

export function normalizeCollectorEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function requireActiveCollector(customer) {
  if (!customer || customer.status !== "active") {
    throw new Error("COLLECTOR_INACTIVE");
  }
  return customer;
}

function requireEmail(value) {
  const email = normalizeCollectorEmail(value);
  if (!EMAIL_RE.test(email) || email.length > 254) {
    throw new Error("COLLECTOR_EMAIL_INVALID");
  }
  return email;
}

export function validateRegistrationInput(input) {
  const name = String(input?.name ?? "").trim();
  const email = requireEmail(input?.email);
  const phone = String(input?.phone ?? "").trim();
  if (RESERVED_DESK_EMAILS.has(email)) {
    throw new Error("RESERVED_DESK_EMAIL");
  }
  if (name.length < 1 || name.length > 120) {
    throw new Error("REGISTRATION_NAME_INVALID");
  }
  if (phone.length > 40) {
    throw new Error("REGISTRATION_PHONE_INVALID");
  }
  return { name, email, phone };
}

function sign(encoded, secret) {
  if (!String(secret ?? "").trim()) {
    throw new Error("COLLECTOR_SESSION_SECRET_REQUIRED");
  }
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

function seal(payload, secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${sign(encoded, secret)}`;
}

function open(token, secret, now) {
  const [encoded, signature, extra] = String(token ?? "").split(".");
  if (!encoded || !signature || extra) throw new Error("TOKEN_INVALID");

  let supplied;
  let expected;
  try {
    supplied = Buffer.from(signature, "base64url");
    expected = Buffer.from(sign(encoded, secret), "base64url");
  } catch {
    throw new Error("TOKEN_INVALID");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("TOKEN_INVALID");
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("TOKEN_INVALID");
  }
  if (
    !payload ||
    typeof payload !== "object" ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.exp <= now ||
    payload.iat > now + 60_000
  ) {
    if (payload?.exp <= now) throw new Error("TOKEN_EXPIRED");
    throw new Error("TOKEN_INVALID");
  }
  return payload;
}

export function sealVerificationToken(input, secret, options = {}) {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? VERIFICATION_TTL_MS;
  if (input?.action === "login") {
    const customerId = String(input.customerId ?? "").trim();
    if (!customerId) throw new Error("TOKEN_CUSTOMER_REQUIRED");
    return seal(
      {
        v: 1,
        purpose: "collector-verification",
        action: "login",
        customerId,
        email: requireEmail(input.email),
        iat: now,
        exp: now + ttlMs,
      },
      secret,
    );
  }
  if (input?.action === "register") {
    const registration = validateRegistrationInput(input);
    return seal(
      {
        v: 1,
        purpose: "collector-verification",
        action: "register",
        ...registration,
        iat: now,
        exp: now + ttlMs,
      },
      secret,
    );
  }
  throw new Error("TOKEN_ACTION_INVALID");
}

export function openVerificationToken(token, secret, options = {}) {
  const payload = open(token, secret, options.now ?? Date.now());
  if (
    payload.v !== 1 ||
    payload.purpose !== "collector-verification" ||
    !["login", "register"].includes(payload.action)
  ) {
    throw new Error("TOKEN_INVALID");
  }
  if (options.action && payload.action !== options.action) {
    throw new Error("TOKEN_ACTION_MISMATCH");
  }

  payload.email = requireEmail(payload.email);
  if (payload.action === "login") {
    if (typeof payload.customerId !== "string" || !payload.customerId.trim()) {
      throw new Error("TOKEN_INVALID");
    }
  } else {
    const registration = validateRegistrationInput(payload);
    payload.name = registration.name;
    payload.phone = registration.phone;
  }

  if (options.customerId && payload.customerId !== options.customerId) {
    throw new Error("TOKEN_CUSTOMER_MISMATCH");
  }
  if (options.email && payload.email !== requireEmail(options.email)) {
    throw new Error("TOKEN_EMAIL_MISMATCH");
  }
  return payload;
}

export function sealCollectorSession(input, secret, options = {}) {
  const now = options.now ?? Date.now();
  const ttlMs = options.ttlMs ?? SESSION_TTL_MS;
  const customerId = String(input?.customerId ?? "").trim();
  if (!customerId) throw new Error("SESSION_CUSTOMER_REQUIRED");
  return seal(
    {
      v: 1,
      purpose: "collector-session",
      customerId,
      email: requireEmail(input.email),
      iat: now,
      exp: now + ttlMs,
    },
    secret,
  );
}

export function openCollectorSession(token, secret, options = {}) {
  const payload = open(token, secret, options.now ?? Date.now());
  if (
    payload.v !== 1 ||
    payload.purpose !== "collector-session" ||
    typeof payload.customerId !== "string" ||
    !payload.customerId.trim()
  ) {
    throw new Error("SESSION_INVALID");
  }
  return {
    customerId: payload.customerId,
    email: requireEmail(payload.email),
  };
}

/**
 * @param {{ secure?: boolean }} [options]
 * @returns {{ httpOnly: true, sameSite: "lax", secure: boolean, path: "/" }}
 */
export function collectorCookieOptions(options = {}) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure ?? true,
    path: "/",
  };
}

export async function decideCollectorAccessRequest(input, env, deps, options = {}) {
  const config = evaluateLiveBookConfig(env);
  if (!config.enabled) return { ok: true, mode: "browser" };
  if (!config.ok) throw new Error(config.errors[0]);

  const action = String(input?.action ?? "");
  let token;
  let to;
  let name;

  if (action === "login") {
    const email = requireEmail(input?.email);
    const customer = await deps.findCustomerByEmail(email);
    if (!customer || customer.status === "suspended") {
      return { ok: true, mode: "live", accepted: true };
    }
    if (normalizeCollectorEmail(customer.email) !== email) {
      throw new Error("CUSTOMER_EMAIL_MISMATCH");
    }
    token = sealVerificationToken(
      { action, customerId: customer.id, email },
      config.secret,
      { now: options.now },
    );
    to = email;
    name = customer.name || "Collector";
  } else if (action === "register") {
    const registration = validateRegistrationInput(input);
    token = sealVerificationToken(
      { action, ...registration },
      config.secret,
      { now: options.now },
    );
    to = registration.email;
    name = registration.name;
  } else {
    throw new Error("COLLECTOR_ACTION_INVALID");
  }

  const verifyUrl = new URL("/api/collector-session/verify", config.origin);
  verifyUrl.searchParams.set("token", token);
  await deps.sendAccessEmail({ to, name, action, url: verifyUrl.toString() });
  return { ok: true, mode: "live", accepted: true };
}
