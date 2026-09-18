import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { buildHealthReport, healthResponse } from "@/lib/health.mjs";

export const dynamic = "force-dynamic";

const PROBE_TIMEOUT_MS = 3_000;

/**
 * Trivial query through the shared pool, bounded by a short timeout. Any
 * driver error or timeout is reported by `buildHealthReport` as
 * `DATABASE_UNREACHABLE`; the message never reaches the body.
 */
async function probeDatabase() {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("DATABASE_PROBE_TIMEOUT")), PROBE_TIMEOUT_MS);
  });
  try {
    await Promise.race([getDb().execute(sql`select 1`), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function GET() {
  const report = await buildHealthReport(process.env, { probeDatabase });
  return healthResponse(report);
}
