import { cookies } from "next/headers";
import { createDb } from "@/lib/db/client";
import { commitLiveBookImport } from "@/lib/db/live-book-import-commit";
import { liveBookFlagOn, planLiveBookImport } from "@/lib/db/live-book-import.mjs";
import { customers } from "@/lib/db/schema";
import { deskActor } from "@/lib/db/records";
import { deskApiStatus } from "@/lib/desk-guard.mjs";
import { DESK_COOKIE, readDeskToken } from "@/lib/desk-session";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const session = readDeskToken((await cookies()).get(DESK_COOKIE)?.value);
  const status = deskApiStatus(session);
  if (status !== 200 || !session || (session.role !== "admin" && session.role !== "staff")) {
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
  const plan = planLiveBookImport(payload, { existingCustomers, confirmLiveImport });

  if (!body?.commit) {
    return json({ dryRun: true, plan });
  }
  if (!plan.ok) {
    return json({ error: plan.error, plan }, 422);
  }
  const applied = await commitLiveBookImport(
    db,
    deskActor(session.role, session.email),
    payload,
    { confirmLiveImport },
  );
  return json({ committed: true, plan: applied });
}
