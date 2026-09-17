import { createHmac, timingSafeEqual } from "node:crypto";
import { authenticate } from "@/lib/auth";

export const DESK_COOKIE = "mac_desk";

const SECRET = process.env.DESK_SESSION_SECRET?.trim() || "mac-desk-local";

function sign(payload: string) {
  return createHmac("sha256", SECRET).update(payload).digest("base64url");
}

export function issueDeskToken(email: string, role: "admin" | "staff") {
  const payload = Buffer.from(JSON.stringify({ email, role, v: 1 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readDeskToken(token?: string | null) {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
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
