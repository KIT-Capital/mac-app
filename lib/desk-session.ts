import { createHmac, timingSafeEqual } from "node:crypto";
import {
  DESK_SESSION_KEYS_INVALID,
  parseDeskSessionKeys,
} from "@/lib/desk-session-keys.mjs";
import { normalizeDeskRole } from "@/lib/roles.mjs";
import type { DeskRole } from "@/lib/types";

export const DESK_COOKIE = "mac_desk";
export { DESK_SESSION_KEYS_INVALID, parseDeskSessionKeys };
const MAX_TOKEN_LENGTH = 4096;
const MAX_TTL_MS = 12 * 60 * 60_000;

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

type DeskSession = {
  email: string;
  role: DeskRole;
  kid: string;
  iat: number;
  exp: number;
  rot: boolean;
};

export function issueDeskToken(
  email: string,
  role: DeskRole,
  options: {
    env?: Record<string, string | undefined>;
    now?: number;
    ttlMs?: number;
    mustRotate?: boolean;
  } = {},
) {
  const resolved = parseDeskSessionKeys(options.env);
  if (!resolved.ok) throw new Error(resolved.error);
  const active = resolved.keys[0];
  const now = options.now ?? Date.now();
  const ttlMs = Math.min(options.ttlMs ?? MAX_TTL_MS, MAX_TTL_MS);
  const payload = Buffer.from(JSON.stringify({
    email: email.trim().toLowerCase(),
    role,
    kid: active.kid,
    iat: now,
    exp: now + ttlMs,
    rot: Boolean(options.mustRotate),
    v: 2,
  })).toString("base64url");
  return `${payload}.${sign(payload, active.secret)}`;
}

export function readDeskToken(
  token?: string | null,
  options: {
    env?: Record<string, string | undefined>;
    now?: number;
  } = {},
): DeskSession | null {
  if (!token || token.length > MAX_TOKEN_LENGTH) return null;
  const resolved = parseDeskSessionKeys(options.env);
  if (!resolved.ok) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as Partial<DeskSession> & {
      v?: number;
    };
    const key = resolved.keys.find((candidate) => candidate.kid === parsed.kid);
    if (!key) return null;
    const expected = sign(payload, key.secret);
    const left = Buffer.from(sig);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const now = options.now ?? Date.now();
    if (
      parsed.v !== 2 ||
      !Number.isSafeInteger(parsed.iat) ||
      !Number.isSafeInteger(parsed.exp) ||
      Number(parsed.iat) > now + 60_000 ||
      Number(parsed.exp) <= now ||
      Number(parsed.exp) - Number(parsed.iat) > MAX_TTL_MS ||
      typeof parsed.rot !== "boolean"
    ) {
      return null;
    }
    // Tokens minted before the roles migration may still carry "staff".
    const role = normalizeDeskRole(parsed.role);
    if (!role) return null;
    if (!parsed.email) return null;
    return {
      email: parsed.email,
      role,
      kid: key.kid,
      iat: Number(parsed.iat),
      exp: Number(parsed.exp),
      rot: parsed.rot,
    };
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
