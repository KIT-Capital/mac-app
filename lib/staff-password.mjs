import {
  randomBytes,
  scrypt,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);
const N = 2 ** 17;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const MAXMEM = 256 * 1024 * 1024;
const MAX_CONCURRENT_SCRYPT = 2;
let availableSlots = MAX_CONCURRENT_SCRYPT;
let activeScrypt = 0;
let peakScrypt = 0;
const waiters = [];

async function acquireScryptSlot() {
  if (availableSlots > 0) {
    availableSlots -= 1;
  } else {
    await new Promise((resolve) => waiters.push(resolve));
  }
  activeScrypt += 1;
  peakScrypt = Math.max(peakScrypt, activeScrypt);
}

function releaseScryptSlot() {
  activeScrypt -= 1;
  const next = waiters.shift();
  if (next) next();
  else availableSlots += 1;
}

async function derive(password, salt) {
  await acquireScryptSlot();
  try {
    return Buffer.from(await scryptAsync(password, salt, KEY_LENGTH, {
      N,
      r: R,
      p: P,
      maxmem: MAXMEM,
    }));
  } finally {
    releaseScryptSlot();
  }
}

export function staffScryptConcurrency() {
  return {
    active: activeScrypt,
    peak: peakScrypt,
    limit: MAX_CONCURRENT_SCRYPT,
    waiting: waiters.length,
  };
}

export function parseStaffPasswordHash(serialized) {
  const parts = String(serialized ?? "").split("$");
  if (
    parts.length !== 7 ||
    parts[0] !== "" ||
    parts[1] !== "scrypt" ||
    Number(parts[2]) !== N ||
    Number(parts[3]) !== R ||
    Number(parts[4]) !== P
  ) {
    return null;
  }
  let salt;
  let hash;
  try {
    salt = Buffer.from(parts[5], "base64url");
    hash = Buffer.from(parts[6], "base64url");
  } catch {
    return null;
  }
  if (salt.length !== 16 || hash.length !== KEY_LENGTH) return null;
  return {
    hash: parts[6],
    salt: parts[5],
    params: { N, r: R, p: P, keyLength: KEY_LENGTH, maxmem: MAXMEM },
  };
}

export function serializeStaffPasswordHash(stored) {
  const params = stored?.params;
  if (
    params?.N !== N ||
    params?.r !== R ||
    params?.p !== P ||
    params?.keyLength !== KEY_LENGTH ||
    params?.maxmem !== MAXMEM
  ) {
    return "";
  }
  return ["$scrypt", N, R, P, stored.salt, stored.hash].join("$");
}

export async function hashStaffPassword(password) {
  const value = String(password ?? "");
  if (!value) throw new Error("PASSWORD_REQUIRED");
  const salt = randomBytes(16);
  const derived = await derive(value, salt);
  return [
    "$scrypt",
    String(N),
    String(R),
    String(P),
    salt.toString("base64url"),
    Buffer.from(derived).toString("base64url"),
  ].join("$");
}

export async function verifyStaffPassword(password, serialized) {
  const parsed = parseStaffPasswordHash(serialized);
  if (!parsed) return false;
  const salt = Buffer.from(parsed.salt, "base64url");
  const expected = Buffer.from(parsed.hash, "base64url");
  try {
    const derived = await derive(String(password ?? ""), salt);
    return timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}
