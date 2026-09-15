"use client";

import { useState } from "react";
import { illustrationFor } from "@/lib/illustrations";
import type { Timepiece } from "@/lib/types";
import { cn } from "@/lib/utils";

type Hint = Partial<Pick<Timepiece, "brand" | "model" | "reference" | "caseType" | "caseMetal" | "dialColor" | "band">>;

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
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const current = photo && failedSrc !== photo ? photo : fallback;
  const illustrated = !photo || failedSrc === photo;

  return (
    <span className="relative block h-full w-full">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={current}
        alt={alt}
        className={cn("h-full w-full object-cover", className)}
        onError={() => {
          if (photo) setFailedSrc(photo);
        }}
      />
      {showCaption && illustrated ? (
        <span className="absolute bottom-2 left-2 rounded-sm bg-black/65 px-1.5 py-0.5 text-[8px] tracking-[0.14em] text-white/85 uppercase">
          Illustration
        </span>
      ) : null}
    </span>
  );
}
