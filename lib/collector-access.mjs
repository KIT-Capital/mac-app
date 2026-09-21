import {
  createHmac,
  timingSafeEqual,
} from "node:crypto";
import { isReservedDeskEmail } from "./desk-identities.mjs";
import { evaluateLiveBookConfig } from "./env/live-book-flag.mjs";
import { normalizeCollectorPhone } from "./phone.mjs";
import { isRetailRole } from "./roles.mjs";

export { normalizeCollectorPhone } from "./phone.mjs";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

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
  const role = isRetailRole(input?.role) ? input.role : "collector";
  if (isReservedDeskEmail(email)) {
    throw new Error("RESERVED_DESK_EMAIL");
  }
  if (name.length < 1 || name.length > 120) {
    throw new Error("REGISTRATION_NAME_INVALID");
  }
  if (phone.length > 40) {
    throw new Error("REGISTRATION_PHONE_INVALID");
  }
  return { name, email, phone, role };
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

function openSigned(token, secret) {
  const [encoded, signature, extra] = String(token ?? "").split(".");
  if (!encoded || !signature || extra) throw new Error("SESSION_INVALID");

  let supplied;
  let expected;
  try {
    supplied = Buffer.from(signature, "base64url");
    expected = Buffer.from(sign(encoded, secret), "base64url");
  } catch {
    throw new Error("SESSION_INVALID");
  }
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error("SESSION_INVALID");
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
  } catch {
    throw new Error("SESSION_INVALID");
  }
}

export function sealCollectorSessionId(sessionId, secret) {
  const id = String(sessionId ?? "").trim();
  if (!id) throw new Error("SESSION_ID_REQUIRED");
  return seal({ v: 2, purpose: "collector-session", sessionId: id }, secret);
}

export function openCollectorSessionId(token, secret) {
  const payload = openSigned(token, secret);
  if (
    payload?.v !== 2 ||
    payload.purpose !== "collector-session" ||
    typeof payload.sessionId !== "string" ||
    !payload.sessionId.trim()
  ) {
    throw new Error("SESSION_INVALID");
  }
  return payload.sessionId;
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
  if (!config.enabled) {
    return { response: { ok: true, mode: "browser" }, deferred: null };
  }
  if (!config.ok) throw new Error(config.errors[0]);

  const action = String(input?.action ?? "");
  const now = options.now ?? new Date();
  const address = String(options.address ?? "unknown");
  const oneHour = 60 * 60_000;
  const consume = (scope, key, limit) =>
    deps.consumeRateLimit({ scope, key, limit, windowMs: oneHour, now });

  let customer = null;
  let registration = null;
  let email;
  let name;
  let phone = null;

  if (action === "login" && String(input?.phone ?? "").trim() && !String(input?.email ?? "").trim()) {
    phone = normalizeCollectorPhone(input.phone);
    const [phoneLimit] = await Promise.all([
      consume("collector-link-phone", phone, 3),
      consume("collector-link-address", address, 10),
      consume("collector-link-global", "login", 100),
    ]);
    customer = await deps.findCustomerByPhone?.(phone) ?? null;
    if (!phoneLimit.allowed) customer = null;
    if (customer && !["active", "invited"].includes(customer.status)) customer = null;
    name = customer?.name || "Collector";
  } else if (action === "login") {
    email = requireEmail(input?.email);
    const [emailLimit] = await Promise.all([
      consume("collector-link-email", email, 3),
      consume("collector-link-address", address, 10),
      consume("collector-link-global", "login", 100),
    ]);
    customer = await deps.findCustomerByEmail(email);
    if (customer && normalizeCollectorEmail(customer.email) !== email) {
      throw new Error("CUSTOMER_EMAIL_MISMATCH");
    }
    // Until U10 proves Railway owns the forwarded hop, address limits are
    // recorded for visibility but the email limit remains the hard control.
    if (!emailLimit.allowed) customer = null;
    if (customer && !["active", "invited"].includes(customer.status)) customer = null;
    name = customer?.name || "Collector";
  } else if (action === "register") {
    registration = validateRegistrationInput(input);
    email = registration.email;
    name = registration.name;
    if (await deps.findStaffByEmail?.(email)) {
      throw new Error("RESERVED_DESK_EMAIL");
    }
    const [emailLimit] = await Promise.all([
      consume("collector-link-email", email, 3),
      consume("collector-link-address", address, 10),
    ]);
    if (!emailLimit.allowed) registration = null;
    if (!registration) {
      return {
        response: { ok: true, mode: "live", accepted: true },
        deferred: async () => {},
      };
    }
    const globalLimit = await consume("collector-link-global", "register", 100);
    if (!globalLimit.allowed) {
      return {
        response: { ok: false, mode: "live", rateLimited: true },
        deferred: null,
      };
    }
  } else {
    throw new Error("COLLECTOR_ACTION_INVALID");
  }

  const deferred = async () => {
    if (action === "login" && !customer) return;
    if (action === "register" && !registration) return;

    if (phone) {
      const sms = Boolean(deps.smsConfigured?.());
      if (!customer || !sms || !deps.createSmsChallenge || !deps.startSmsVerification) {
        return;
      }
      try {
        await deps.createSmsChallenge({
          customerId: customer.id,
          phone,
          expiresAt: new Date(now.getTime() + 15 * 60_000),
        });
        await deps.startSmsVerification(phone);
      } catch {
        // Same generic accepted response; email login stays available.
      }
      return;
    }

    const issued = await deps.createAccessToken({
      purpose: action,
      customerId: customer?.id,
      email,
      registration,
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    });
    try {
      await deps.sendAccessEmail({
        to: email,
        name,
        action,
        code: issued.token,
        tokenId: issued.id,
      });
      await deps.markAccessTokenSent(issued.id, true);
    } catch {
      await deps.markAccessTokenSent(issued.id, false);
    }
  };

  return {
    response: {
      ok: true,
      mode: "live",
      accepted: true,
      ...(phone ? { sms: Boolean(deps.smsConfigured?.()) } : {}),
    },
    deferred,
  };
}
