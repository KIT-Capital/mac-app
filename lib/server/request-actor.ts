import "server-only";
import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import {
  COLLECTOR_COOKIE,
  openCollectorSession,
} from "@/lib/collector-access.mjs";
import { getDb } from "@/lib/db/client";
import { deskActor, toCollectorActor, type Actor } from "@/lib/db/records";
import { customers } from "@/lib/db/schema";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";

export type RequestActorResult = { actor: Actor } | { error: string };

/** U4 replaces this adapter. Desk tokens stay source-signed until then. */
export function resolveDeskActor(deskToken: string | undefined): RequestActorResult | null {
  const desk = readDeskToken(deskToken);
  if (!desk) return null;
  return { actor: deskActor(desk.role, desk.email) };
}

/** U3 replaces this adapter with a session-row lookup. */
export async function resolveCollectorActor(
  collectorToken: string | undefined,
): Promise<RequestActorResult> {
  if (!collectorToken) return { error: "SESSION_REQUIRED" };

  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled || !config.ok) return { error: "LIVE_BOOK_CONFIG_INVALID" };
  let session;
  try {
    session = openCollectorSession(collectorToken, config.secret);
  } catch {
    return { error: "SESSION_INVALID" };
  }
  const db = getDb();
  const [customer] = await db.select().from(customers).where(and(
    eq(customers.id, session.customerId),
    eq(customers.email, session.email),
    eq(customers.status, "active"),
  )).limit(1);
  if (!customer) return { error: "SESSION_INVALID" };
  return { actor: toCollectorActor(customer) };
}

export async function requestActor(): Promise<RequestActorResult> {
  const jar = await cookies();
  const deskToken = jar.get(DESK_COOKIE)?.value;
  const collectorToken = jar.get(COLLECTOR_COOKIE)?.value;
  if (deskToken && collectorToken) return { error: "AMBIGUOUS_SESSION" };

  const desk = resolveDeskActor(deskToken);
  if (desk) return desk;
  return resolveCollectorActor(collectorToken);
}
