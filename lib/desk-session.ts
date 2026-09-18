import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticate } from "@/lib/auth";

export const DESK_COOKIE = "mac_desk";
export const DESK_SESSION_SECRET_REQUIRED = "DESK_SESSION_SECRET_REQUIRED";

const DEVELOPMENT_DEFAULT_SECRET = "mac-desk-local";

/**
 * The `mac-desk-local` default exists for development only. Everywhere else a
 * missing `DESK_SESSION_SECRET` fails closed: no token is issued and no token
 * verifies. Resolved per call so `next build` (no APP_ENV) can import this
 * module. U4 replaces the single secret with `DESK_SESSION_KEYS`.
 */
export function deskSessionSecret(
  env: Record<string, string | undefined> = process.env,
): { ok: true; secret: string } | { ok: false; error: typeof DESK_SESSION_SECRET_REQUIRED } {
  const configured = env.DESK_SESSION_SECRET?.trim();
  if (configured) return { ok: true, secret: configured };
  if (env.APP_ENV?.trim() === "development") return { ok: true, secret: DEVELOPMENT_DEFAULT_SECRET };
  return { ok: false, error: DESK_SESSION_SECRET_REQUIRED };
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function issueDeskToken(email: string, role: "admin" | "staff") {
  const resolved = deskSessionSecret();
  if (!resolved.ok) throw new Error(resolved.error);
  const payload = Buffer.from(JSON.stringify({ email, role, v: 1 })).toString("base64url");
  return `${payload}.${sign(payload, resolved.secret)}`;
}

export function readDeskToken(token?: string | null): { email: string; role: "admin" | "staff" } | null {
  if (!token) return null;
  const resolved = deskSessionSecret();
  if (!resolved.ok) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload, resolved.secret);
  const left = Buffer.from(sig);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as {
      email?: string;
      role?: string;
    };
    if (parsed.role !== "admin" && parsed.role !== "staff") return null;
    if (!parsed.email) return null;
    return { email: parsed.email, role: parsed.role };
  } catch {
    return null;
  }
}

export function deskCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    // Session cookie: omit maxAge and expires so the desk login dies with the browser.
  };
}

export function openDeskSession(email: string, password: string) {
  const result = authenticate(email, password);
  if (!result.ok || (result.role !== "admin" && result.role !== "staff")) {
    return null;
  }
  return issueDeskToken(email.trim().toLowerCase(), result.role);
}
