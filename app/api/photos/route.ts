import { getDb } from "@/lib/db/client";
import {
  confirmPhotoUpload,
  mintPhotoPreviewUrl,
  requestPhotoUpload,
} from "@/lib/db/photos";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { liveBookErrorResponse } from "@/lib/live-book-errors.mjs";
import { refuseCrossSiteMutation } from "@/lib/request-origin.mjs";
import { requestActor } from "@/lib/server/request-actor";
import { createObjectStore } from "@/lib/storage/r2-object-store.mjs";
import { liveUnavailability, unavailableResponse } from "@/lib/unavailable-response.mjs";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}

function uploadPart(value: unknown) {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PHOTO_UPLOAD_INVALID");
  }
  const part = value as Record<string, unknown>;
  if (Object.keys(part).some((key) => !["size", "type", "sha256"].includes(key))) {
    throw new Error("PHOTO_UPLOAD_INVALID");
  }
  return {
    size: Number(part.size),
    type: String(part.type ?? ""),
    sha256: String(part.sha256 ?? ""),
  };
}

function assertAllowedKeys(body: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new Error("PHOTO_UPLOAD_INVALID");
  }
}

export async function POST(request: Request) {
  const origin = refuseCrossSiteMutation(request);
  if (origin) return origin;
  const unavailable = liveUnavailability(process.env);
  if (unavailable) return unavailableResponse(unavailable);
  try {
    const config = evaluateLiveBookConfig(process.env);
    if (!config.enabled) return json({ mode: "browser" });
    if (!config.ok) return json({ mode: "live", error: config.errors[0] }, 503);

    const resolved = await requestActor();
    if ("error" in resolved) throw new Error(resolved.error);

    const input = await request.json().catch(() => null);
    if (input == null || typeof input !== "object" || Array.isArray(input)) {
      return json({ mode: "live", error: "PHOTO_UPLOAD_INVALID" }, 400);
    }
    const body = input as Record<string, unknown>;
    const action = String(body.action ?? "");
    const store = createObjectStore();

    if (action === "request-upload") {
      assertAllowedKeys(body, ["action", "timepieceId", "kind", "original", "preview"]);
      const upload = await requestPhotoUpload(
        getDb(),
        store,
        resolved.actor,
        {
          timepieceId: String(body.timepieceId ?? ""),
          kind: String(body.kind ?? ""),
          original: uploadPart(body.original),
          preview: uploadPart(body.preview),
        },
      );
      return json({ mode: "live", upload });
    }

    if (action === "confirm") {
      assertAllowedKeys(body, ["action", "photoId"]);
      const photo = await confirmPhotoUpload(getDb(), store, resolved.actor, String(body.photoId ?? ""));
      return json({ mode: "live", photo: { id: photo.id, status: photo.status } });
    }

    if (action === "preview-url") {
      assertAllowedKeys(body, ["action", "photoId"]);
      const minted = await mintPhotoPreviewUrl(getDb(), store, resolved.actor, String(body.photoId ?? ""));
      return json({ mode: "live", ...minted });
    }

    throw new Error("PHOTO_UPLOAD_INVALID");
  } catch (error) {
    const failure = liveBookErrorResponse(error);
    return json({ mode: "live", error: failure.error }, failure.status);
  }
}
