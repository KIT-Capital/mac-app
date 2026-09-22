import path from "node:path";
import { fileURLToPath } from "node:url";
import { createDb } from "../lib/db/client.ts";
import { sweepCollectorAccessRows } from "../lib/db/collector-sessions.ts";
import { sweepPendingPhotos } from "../lib/db/photos.ts";
import { createObjectStore } from "../lib/storage/r2-object-store.mjs";

/**
 * One-shot cleanup. Closes the Neon pool on success and on failure so a
 * scheduled run can exit. Does not use the long-lived server pool.
 * @param {{
 *   createDatabase?: () => { $client: { end: () => Promise<void> } },
 *   sweepAccess?: (db: object) => Promise<unknown>,
 *   sweepPhotos?: (db: object) => Promise<unknown>,
 *   log?: (line: string) => void,
 *   logError?: (line: string) => void,
 * }} [deps]
 */
export async function runDailySweeps(deps = {}) {
  const createDatabase = deps.createDatabase ?? createDb;
  const sweepAccess = deps.sweepAccess ?? sweepCollectorAccessRows;
  const sweepPhotos = deps.sweepPhotos ?? ((db) => sweepPendingPhotos(db, createObjectStore()));
  const log = deps.log ?? ((line) => console.log(line));
  const logError = deps.logError ?? ((line) => console.error(line));
  const db = createDatabase();
  try {
    const access = await sweepAccess(db);
    const photos = await sweepPhotos(db);
    log(JSON.stringify({ ok: true, access, photos }));
  } catch (error) {
    const code = error instanceof Error && error.message ? error.message : "DAILY_SWEEP_FAILED";
    logError(JSON.stringify({ ok: false, error: code }));
    process.exitCode = 1;
  } finally {
    await db.$client.end();
  }
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  await runDailySweeps();
}
