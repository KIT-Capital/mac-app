import "server-only";
import { cookies } from "next/headers";
import { COLLECTOR_COOKIE } from "@/lib/collector-access.mjs";
import { resolveCollectorAccessSession } from "@/lib/collector-access.server";
import { deskActor, toCollectorActor, type Actor } from "@/lib/db/records";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";

export type RequestActorResult = { actor: Actor } | { error: string };

/** U4 replaces this adapter. Desk tokens stay source-signed until then. */
export function resolveDeskActor(deskToken: string | undefined): RequestActorResult | null {
  const desk = readDeskToken(deskToken);
  if (!desk) return null;
  return { actor: deskActor(desk.role, desk.email) };
}

export async function resolveCollectorActor(
  collectorToken: string | undefined,
): Promise<RequestActorResult> {
  if (!collectorToken) return { error: "SESSION_REQUIRED" };
  const resolved = await resolveCollectorAccessSession(collectorToken);
  if (!resolved) return { error: "SESSION_INVALID" };
  return { actor: toCollectorActor(resolved.customer) };
}

export async function requestActor(): Promise<RequestActorResult> {
  const jar = await cookies();
  const deskToken = jar.get(DESK_COOKIE)?.value;
  const collectorToken = jar.get(COLLECTOR_COOKIE)?.value;
  if (deskToken && collectorToken) return { error: "AMBIGUOUS_SESSION" };

  const desk = resolveDeskActor(deskToken);
  if (desk) return desk;
  const collector = await resolveCollectorActor(collectorToken);
  if ("error" in collector && collectorToken) jar.delete(COLLECTOR_COOKIE);
  return collector;
}
