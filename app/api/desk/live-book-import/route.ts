import { createDb } from "@/lib/db/client";
import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { commitLiveBookImport } from "@/lib/db/live-book-import-commit";
import { liveBookFlagOn, planLiveBookImport } from "@/lib/db/live-book-import.mjs";
import { customers, liveAgreements, timepieces } from "@/lib/db/schema";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  // Production starts empty (R4): the browser-book import never runs there, flag or not.
  if (process.env.APP_ENV?.trim() === "production") {
    return json({ error: "IMPORT_REFUSED_IN_PRODUCTION" }, 403);
  }
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const resolved = await requestActor();
  if ("error" in resolved) {
    return json(
      { error: resolved.error === "PASSWORD_ROTATION_REQUIRED" ? resolved.error : "Desk session required." },
      resolved.error === "PASSWORD_ROTATION_REQUIRED" ? 409 : 403,
    );
  }
  if (resolved.actor.role !== "admin" && resolved.actor.role !== "staff") {
    return json({ error: "Desk session required." }, 403);
  }
  if (liveBookFlagOn()) {
    return json({ error: "LIVE_BOOK_FLAG_ON" }, 409);
  }

  const body = (await request.json().catch(() => null)) as
    | { payload?: unknown; confirmLiveImport?: boolean; commit?: boolean }
    | null;
  const payload = body && typeof body === "object" ? (body.payload ?? body) : null;
  if (!payload || typeof payload !== "object") {
    return json({ error: "INVALID_EXPORT" }, 400);
  }
  const confirmLiveImport = Boolean(body?.confirmLiveImport);
  const db = createDb();
  const existingCustomers = await db.select({ id: customers.id, email: customers.email }).from(customers);
  const existingTimepieces = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces);
  const existingAgreements = await db
    .select({ id: liveAgreements.id, customerId: liveAgreements.customerId })
    .from(liveAgreements);
  const plan = planLiveBookImport(payload, {
    existingCustomers,
    existingTimepieces,
    existingAgreements,
    confirmLiveImport,
  });

  if (!body?.commit) {
    return json({ dryRun: true, plan });
  }
  if (!plan.ok) {
    return json({ error: plan.error, plan }, 422);
  }
  const applied = await commitLiveBookImport(
    db,
    resolved.actor,
    payload,
    { confirmLiveImport, clientAddress: clientAddress(request.headers) },
  );
  return json({ committed: true, plan: applied });
}
