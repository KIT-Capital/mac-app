import { cookies } from "next/headers";
import { and, eq } from "drizzle-orm";
import {
  COLLECTOR_COOKIE,
  openCollectorSession,
} from "@/lib/collector-access.mjs";
import { getDb } from "@/lib/db/client";
import { readLiveBookState } from "@/lib/db/live-book-adapter";
import { executeLiveBookOperation } from "@/lib/db/live-book-mutations";
import { deskActor, toCollectorActor, type Actor } from "@/lib/db/records";
import { customers } from "@/lib/db/schema";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function requestActor(): Promise<{ actor: Actor } | { error: string }> {
  const jar = await cookies();
  const deskToken = jar.get(DESK_COOKIE)?.value;
  const collectorToken = jar.get(COLLECTOR_COOKIE)?.value;
  if (deskToken && collectorToken) return { error: "AMBIGUOUS_SESSION" };

  const desk = readDeskToken(deskToken);
  if (desk) return { actor: deskActor(desk.role, desk.email) };
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

async function liveContext() {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) return { mode: "browser" as const };
  if (!config.ok) return { mode: "error" as const, error: config.errors[0] };
  const resolved = await requestActor();
  if ("error" in resolved) return { mode: "unauthorized" as const, error: resolved.error };
  const viewer = resolved.actor.role === "collector"
    ? {
        role: "collector" as const,
        customerId: resolved.actor.customerId,
        email: resolved.actor.email,
      }
    : { role: resolved.actor.role, email: resolved.actor.email };
  return { mode: "live" as const, actor: resolved.actor, viewer };
}

export async function GET() {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const context = await liveContext();
    if (context.mode === "browser") return json({ mode: "browser" });
    if (context.mode === "error") return json({ mode: "live", error: context.error }, 503);
    if (context.mode === "unauthorized") return json({ mode: "live", error: context.error }, 401);
    return json({
      mode: "live",
      viewer: context.viewer,
      book: await readLiveBookState(getDb(), context.actor),
    });
  } catch {
    return json({ mode: "live", error: "LIVE_BOOK_READ_FAILED" }, 503);
  }
}

export async function POST(request: Request) {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const context = await liveContext();
    if (context.mode === "browser") return json({ mode: "browser" });
    if (context.mode === "error") return json({ mode: "live", error: context.error }, 503);
    if (context.mode === "unauthorized") return json({ mode: "live", error: context.error }, 401);
    const input = await request.json().catch(() => null);
    await executeLiveBookOperation(getDb(), context.actor, input);
    return json({ mode: "live", acknowledged: true, viewer: context.viewer });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ mode: "live", error: failure.error }, failure.status);
  }
}
