import {
  buildAgreementDocument,
  listAgreementDocumentSends,
  listAgreementDocuments,
  mintAgreementDocumentUrl,
  sendAgreementDocument,
} from "@/lib/db/agreement-documents";
import { listAgreementEvents } from "@/lib/db/request-events";
import { previewClientIp } from "@/lib/contract/pdf-request-policy.mjs";
import { allowMailRequest } from "@/lib/mail-rate.mjs";
import { getDb } from "@/lib/db/client";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { agreementDocumentStore } from "@/lib/storage/object-store.mjs";
import { createObjectStore } from "@/lib/storage/r2-object-store.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

function publicDocument(row: Record<string, unknown>) {
  const { objectKey: _objectKey, ...safe } = row;
  return safe;
}

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

async function liveContext() {
  const config = evaluateLiveBookConfig(process.env);
  if (!config.enabled) return { mode: "browser" as const };
  if (!config.ok) return { mode: "error" as const, error: config.errors[0] };
  const resolved = await requestActor();
  if ("error" in resolved) return { mode: "unauthorized" as const, error: resolved.error };
  return { mode: "live" as const, actor: resolved.actor };
}

function documentStore() {
  return agreementDocumentStore(createObjectStore());
}

export async function GET(request: Request) {
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const context = await liveContext();
    if (context.mode === "browser") return json({ mode: "browser" });
    if (context.mode === "error") return json({ mode: "live", error: context.error }, 503);
    if (context.mode === "unauthorized") {
      const failure = liveBookErrorResponse(new Error(context.error));
      return json({ mode: "live", error: failure.error }, failure.status);
    }
    const url = new URL(request.url);
    // Passing the store lets a building or failed stage row render on read (KTD11).
    const documents = await listAgreementDocuments(getDb(), context.actor, {
      liveAgreementId: url.searchParams.get("liveAgreementId") ?? undefined,
      customerId: url.searchParams.get("customerId") ?? undefined,
    }, documentStore());
    const sends = context.actor.role === "collector"
      ? []
      : await listAgreementDocumentSends(getDb(), context.actor, {
        liveAgreementId: url.searchParams.get("liveAgreementId") ?? undefined,
      });
    const liveAgreementId = url.searchParams.get("liveAgreementId");
    let events: Array<{
      action: string;
      toStatus: string;
      createdAt: string;
      note: string;
    }> = [];
    if (liveAgreementId) {
      try {
        events = (await listAgreementEvents(getDb(), context.actor, liveAgreementId)).map((row) => ({
          action: row.action,
          toStatus: row.toStatus,
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
          note: row.note,
        }));
      } catch (error) {
        if (!(error instanceof Error) || error.message !== "AGREEMENT_NOT_FOUND") throw error;
      }
    }
    return json({
      mode: "live",
      documents: documents.map((row) => publicDocument(row as Record<string, unknown>)),
      sends,
      events,
    });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ mode: "live", error: failure.error }, failure.status);
  }
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const context = await liveContext();
    if (context.mode === "browser") return json({ mode: "browser" });
    if (context.mode === "error") return json({ mode: "live", error: context.error }, 503);
    if (context.mode === "unauthorized") {
      const failure = liveBookErrorResponse(new Error(context.error));
      return json({ mode: "live", error: failure.error }, failure.status);
    }
    const input = await request.json().catch(() => null);
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return json({ mode: "live", error: "DOCUMENT_BODY_INVALID" }, 400);
    }
    const body = input as Record<string, unknown>;
    const action = String(body.action ?? "build");
    if (action === "email") {
      if (context.actor.role !== "collector") {
        return json({ mode: "live", error: "DOCUMENT_NOT_FOUND" }, 404);
      }
      if (Object.keys(body).some((key) => !["action", "documentId", "recipientKind", "address", "confirmAddress"].includes(key))) {
        return json({ mode: "live", error: "DOCUMENT_BODY_INVALID" }, 400);
      }
      if (!allowMailRequest(previewClientIp(request.headers))) {
        return json({ mode: "live", error: "DOCUMENT_SEND_THROTTLED" }, 429);
      }
      const sent = await sendAgreementDocument(
        getDb(),
        context.actor,
        {
          documentId: String(body.documentId ?? ""),
          recipientKind: String(body.recipientKind ?? ""),
          address: typeof body.address === "string" ? body.address : undefined,
          confirmAddress: typeof body.confirmAddress === "string" ? body.confirmAddress : undefined,
        },
        documentStore(),
      );
      return json({ mode: "live", send: sent });
    }
    if (action === "url") {
      if (Object.keys(body).some((key) => key !== "action" && key !== "documentId")) {
        return json({ mode: "live", error: "DOCUMENT_BODY_INVALID" }, 400);
      }
      const minted = await mintAgreementDocumentUrl(
        getDb(),
        context.actor,
        { documentId: String(body.documentId ?? "") },
        documentStore(),
      );
      return json({ mode: "live", ...minted });
    }
    if (action !== "build") {
      return json({ mode: "live", error: "DOCUMENT_BODY_INVALID" }, 400);
    }
    if (Object.keys(body).some((key) => key !== "action" && key !== "liveAgreementId")) {
      return json({ mode: "live", error: "DOCUMENT_BODY_INVALID" }, 400);
    }
    const document = await buildAgreementDocument(
      getDb(),
      context.actor,
      { liveAgreementId: String(body.liveAgreementId ?? "") },
      documentStore(),
    );
    return json({ mode: "live", document: publicDocument(document as Record<string, unknown>) });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ mode: "live", error: failure.error }, failure.status);
  }
}
