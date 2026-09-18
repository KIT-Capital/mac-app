import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { getDb } from "@/lib/db/client";
import {
  addStaffAccount,
  listStaffAccounts,
  resetStaffPassword,
  setStaffDisabled,
  type StaffActor,
} from "@/lib/db/staff-accounts";
import { dispatchMail } from "@/lib/mail";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function adminActor(): Promise<StaffActor | { error: string } | { mode: "browser" }> {
  const resolved = await requestActor();
  if ("error" in resolved) return resolved;
  if (resolved.actor.role !== "admin") return { error: "ADMIN_REQUIRED" };
  if (!resolved.actor.staffId) return { mode: "browser" };
  return {
    id: resolved.actor.staffId,
    email: resolved.actor.email,
    role: "admin",
  };
}

function actorError(error: string) {
  return json(
    { error },
    error === "PASSWORD_ROTATION_REQUIRED" ? 409 : 403,
  );
}

export async function GET() {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const actor = await adminActor();
  if ("error" in actor) return actorError(actor.error);
  if ("mode" in actor) return json({ mode: "browser", members: [] });
  const members = await listStaffAccounts(getDb(), actor);
  return json({ mode: "live", members });
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  const actor = await adminActor();
  if ("error" in actor) return actorError(actor.error);
  if ("mode" in actor) return json({ mode: "browser" });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const action = String(body?.action ?? "");
  try {
    if (action === "add") {
      const role = body?.role === "admin" ? "admin" : "staff";
      const added = await addStaffAccount(getDb(), actor, {
        name: String(body?.name ?? ""),
        email: String(body?.email ?? ""),
        role,
        clientAddress: clientAddress(request.headers),
      });
      let mailWarning = false;
      try {
        const delivery = await dispatchMail({
          kind: "invite",
          name: added.row.name,
          email: added.row.email,
          role,
        });
        mailWarning = delivery.messages.some((message) => message.status === "failed");
      } catch {
        mailWarning = true;
      }
      return json({
        ok: true,
        temporaryPassword: added.temporaryPassword,
        ...(mailWarning ? { warning: "INVITE_EMAIL_FAILED" } : {}),
      });
    }
    const id = String(body?.id ?? "");
    if (!id) return json({ error: "STAFF_NOT_FOUND" }, 404);
    if (action === "disable" || action === "enable") {
      await setStaffDisabled(
        getDb(),
        actor,
        id,
        action === "disable",
        clientAddress(request.headers),
      );
      return json({ ok: true });
    }
    if (action === "reset") {
      const reset = await resetStaffPassword(
        getDb(),
        actor,
        id,
        clientAddress(request.headers),
      );
      return json({
        ok: true,
        temporaryPassword: reset.temporaryPassword,
      });
    }
    return json({ error: "STAFF_ACTION_INVALID" }, 400);
  } catch (error) {
    const code = error instanceof Error ? error.message : "STAFF_ACTION_FAILED";
    const status = code === "SESSION_INVALID" || code === "ADMIN_REQUIRED" ? 403
      : code === "PASSWORD_ROTATION_REQUIRED" ? 409
        : code === "STAFF_EXISTS" || code === "LAST_ACTIVE_ADMIN_REQUIRED" ? 409
      : code === "STAFF_EMAIL_RESERVED" || code.endsWith("_INVALID") ? 422
        : code === "STAFF_NOT_FOUND" ? 404
          : 500;
    return json({ error: code }, status);
  }
}
