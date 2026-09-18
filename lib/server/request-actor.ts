import "server-only";
import { cookies } from "next/headers";
import { COLLECTOR_COOKIE } from "@/lib/collector-access.mjs";
import { resolveCollectorAccessSession } from "@/lib/collector-access.server";
import { getDb } from "@/lib/db/client";
import { deskActor, toCollectorActor, type Actor } from "@/lib/db/records";
import { findStaffByEmail } from "@/lib/db/staff-accounts";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";
import { isLiveBookEnabled } from "@/lib/env/live-book-flag.mjs";

export type RequestActorResult = { actor: Actor } | { error: string };

export async function resolveDeskActor(
  deskToken: string | undefined,
): Promise<RequestActorResult | null> {
  const desk = readDeskToken(deskToken);
  if (!desk) return null;
  if (desk.rot) return { error: "PASSWORD_ROTATION_REQUIRED" };
  const appEnv = process.env.APP_ENV?.trim();
  if (
    isLiveBookEnabled(process.env.MAC_LIVE_BOOK) ||
    appEnv === "staging" ||
    appEnv === "production"
  ) {
    const staff = await findStaffByEmail(getDb(), desk.email);
    if (!staff || staff.disabledAt) return { error: "DESK_SESSION_INVALID" };
    if (desk.iat <= staff.sessionValidAfter.getTime()) {
      return { error: "DESK_SESSION_INVALID" };
    }
    if (staff.mustRotate) return { error: "PASSWORD_ROTATION_REQUIRED" };
    return {
      actor: deskActor(
        staff.role as "staff" | "admin",
        staff.email,
        staff.id,
      ),
    };
  }
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

  const desk = await resolveDeskActor(deskToken);
  if (desk) return desk;
  if (deskToken) return { error: "DESK_SESSION_INVALID" };
  const collector = await resolveCollectorActor(collectorToken);
  if ("error" in collector && collectorToken) jar.delete(COLLECTOR_COOKIE);
  return collector;
}
