import { createHash } from "node:crypto";

export function clientAddress(headers) {
  const forwarded = String(headers?.get?.("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.at(-1) || "unknown";
}

export function hashRateLimitKey(value) {
  return createHash("sha256")
    .update(String(value ?? "").trim().toLowerCase())
    .digest("hex");
}

export function rateWindowStart(now, windowMs) {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}
