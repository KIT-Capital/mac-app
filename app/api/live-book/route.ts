import { after } from "next/server";
import { clientAddress } from "@/lib/access-rate-limit.mjs";
import { getDb } from "@/lib/db/client";
import { readLiveBookState } from "@/lib/db/live-book-adapter";
import { executeLiveBookOperation } from "@/lib/db/live-book-mutations";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { agreementDocumentStore } from "@/lib/storage/object-store.mjs";
import { createObjectStore } from "@/lib/storage/r2-object-store.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

/**
 * The same store the documents route uses. When R2 is not configured the
 * render job records the document as failed with `DOCUMENT_STORE_UNAVAILABLE`
 * instead of the request itself failing.
 */
function documentStore() {
  try {
    return agreementDocumentStore(createObjectStore());
  } catch {
    return undefined;
  }
}

type AfterCommit = Array<() => Promise<unknown>>;

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
    if (context.mode === "unauthorized") {
      const failure = liveBookErrorResponse(new Error(context.error));
      return json({ mode: "live", error: failure.error }, failure.status);
    }
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
    const result = await executeLiveBookOperation(getDb(), context.actor, input, {
      clientAddress: clientAddress(request.headers),
      documentStore: documentStore(),
    });
    const { afterCommit, ...body } = (
      result && typeof result === "object" ? result : {}
    ) as { afterCommit?: AfterCommit } & Record<string, unknown>;
    if (afterCommit?.length) {
      // One chain, in order, after the response is sent (KTD27).
      after(async () => {
        for (const job of afterCommit) await job();
      });
    }
    return json({
      mode: "live",
      acknowledged: true,
      viewer: context.viewer,
      ...body,
    });
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ mode: "live", error: failure.error }, failure.status);
  }
}
