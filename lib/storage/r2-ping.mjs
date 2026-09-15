import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { sha256Hex } from "./object-store.mjs";
import { createObjectStore, missingR2Names, r2Configured } from "./r2-object-store.mjs";

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function evaluateR2Ping(env = process.env) {
  const errors = [];
  if ((env.APP_ENV || "").trim() !== "development") errors.push("R2_PING_DEVELOPMENT_ONLY");
  if (!r2Configured(env)) {
    errors.push("R2_NOT_CONFIGURED");
    errors.push(...missingR2Names(env));
  }
  return { ok: errors.length === 0, errors };
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function pingR2(env = process.env) {
  const check = evaluateR2Ping(env);
  if (!check.ok) return check;

  const store = createObjectStore(env);
  const key = `dev-probes/r2-ping/${randomUUID()}.txt`;
  const bytes = new TextEncoder().encode(`mac-r2-ping-${Date.now()}`);
  const checksum = sha256Hex(bytes);

  await store.put(key, bytes, checksum);
  let deleted = false;
  try {
    const found = await store.head(key);
    if (!found) {
      return { ok: false, errors: ["R2_HEAD_MISSING"] };
    }
    await store.remove(key);
    deleted = true;
    return { ok: true, put: true, head: true, deleted: true, errors: [] };
  } catch {
    return { ok: false, errors: ["R2_PING_FAILED"] };
  } finally {
    if (!deleted) {
      try {
        await store.remove(key);
      } catch {
        // Best-effort cleanup so a failed HEAD does not leave a probe.
      }
    }
  }
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const result = await pingR2(process.env);
  const line = JSON.stringify(result);
  if (!result.ok) {
    console.error(line);
    process.exit(1);
  }
  console.log(line);
}
