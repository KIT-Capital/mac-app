"use client";

import { useEffect, useState } from "react";
import { illustrationFor } from "@/lib/illustrations";
import {
  fetchPhotoPreview,
  setBoundedPreviewCache,
  shouldRefetchExpiredPreview,
} from "@/lib/photo-preview.mjs";
import type { Timepiece } from "@/lib/types";
import { cn } from "@/lib/utils";

type Hint = Partial<Pick<Timepiece, "brand" | "model" | "reference" | "caseType" | "caseMetal" | "dialColor" | "band">>;

type CachedPreview = { url: string; expiresAt: number };

const previewCache = new Map<string, CachedPreview>();
const previewRequests = new Map<string, Promise<CachedPreview>>();

function requestPreview(photo: string) {
  const inFlight = previewRequests.get(photo);
  if (inFlight) return inFlight;
  const request: Promise<CachedPreview> = fetchPhotoPreview(photo).then((preview) => {
    setBoundedPreviewCache(previewCache, photo, preview);
    return preview;
  }).finally(() => {
    if (previewRequests.get(photo) === request) previewRequests.delete(photo);
  });
  previewRequests.set(photo, request);
  return request;
}

function isPhotoId(value: string) {
  return Boolean(value) && !/^(?:data:|blob:|https?:|\/)/.test(value);
}

export function WatchPhoto({
  src,
  watch,
  alt,
  className,
  showCaption = false,
}: {
  src?: string | null;
  watch?: Hint | null;
  alt: string;
  className?: string;
  showCaption?: boolean;
}) {
  const fallback = illustrationFor(watch);
  const photo = src?.trim() || "";
  const stored = isPhotoId(photo);
  const [request, setRequest] = useState({
    photo: "",
    url: "",
    expiresAt: 0,
    failed: false,
    refresh: 0,
  });
  const active = request.photo === photo
    ? request
    : { photo, url: "", expiresAt: 0, failed: false, refresh: 0 };

  useEffect(() => {
    let ignore = false;
    if (!stored) return;
    const cached = previewCache.get(photo);
    if (cached && cached.expiresAt > Date.now() + 1_000) {
      queueMicrotask(() => {
        if (!ignore) setRequest({ photo, url: cached.url, expiresAt: cached.expiresAt, failed: false, refresh: active.refresh });
      });
      return () => {
        ignore = true;
      };
    }
    if (cached) previewCache.delete(photo);
    void requestPreview(photo).then((preview) => {
      if (!ignore) {
        setRequest({
          photo,
          url: preview.url,
          expiresAt: preview.expiresAt,
          failed: false,
          refresh: active.refresh,
        });
      }
    }).catch(() => {
      if (!ignore) setRequest({ photo, url: "", expiresAt: 0, failed: true, refresh: active.refresh });
    });
    return () => {
      ignore = true;
    };
  }, [active.refresh, photo, stored]);

  if (stored && !active.url && !active.failed) {
    return <span aria-label={alt || "Loading photo"} className={cn("block h-full w-full bg-mac-card", className)} />;
  }

  const illustrated = !photo || active.failed;
  const current = illustrated ? fallback : stored ? active.url : photo;

  return (
    <span className="relative block h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
        onError={() => {
          if (stored && shouldRefetchExpiredPreview(active.expiresAt, active.refresh)) {
            previewCache.delete(photo);
            setRequest({ photo, url: "", expiresAt: 0, failed: false, refresh: 1 });
          } else if (photo) {
            setRequest({ photo, url: "", expiresAt: active.expiresAt, failed: true, refresh: active.refresh });
          }
        }}
      />
      {showCaption && (illustrated || photo.startsWith("data:")) ? (
        <span className="absolute bottom-2 left-2 rounded-sm bg-black/65 px-1.5 py-0.5 text-[8px] tracking-[0.14em] text-white/85 uppercase">
          {illustrated ? "Illustration" : "Preview"}
        </span>
      ) : null}
    </span>
  );
}
