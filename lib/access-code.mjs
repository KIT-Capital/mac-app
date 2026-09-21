import { createHmac, randomInt } from "node:crypto";

const CODE_RE = /^\d{6}$/;

export function normalizeAccessCode(value) {
  const code = String(value ?? "").replace(/\s+/g, "");
  if (!CODE_RE.test(code)) throw new Error("ACCESS_CODE_INVALID");
  return code;
}

export function generateAccessCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function hashAccessCode(secret, email, code) {
  const key = String(secret ?? "").trim();
  if (!key) throw new Error("COLLECTOR_SESSION_SECRET_REQUIRED");
  const digest = createHmac("sha256", key)
    .update(`${String(email ?? "").trim().toLowerCase()}:${normalizeAccessCode(code)}`)
    .digest("hex");
  return digest;
}
