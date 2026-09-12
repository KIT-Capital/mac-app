import Link from "next/link";
import { moneyRange } from "@/lib/catalog";
import type { Timepiece } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<Timepiece["status"], { label: string; className: string }> = {
  appraised: { label: "Appraised", className: "bg-[#0E2A44] text-white" },
  reviewing: { label: "Reviewing", className: "bg-white/15 text-white" },
  not_evaluated: { label: "Not evaluated", className: "bg-black/60 text-white/80" },
};

export function WatchCard({ watch }: { watch: Timepiece }) {
  const status = STATUS[watch.status];

  return (
    <Link href={`/collection/${watch.id}`} className="block">
      <div className="overflow-hidden rounded-sm bg-[#111]">
        <div className="relative aspect-square bg-[#161616]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={watch.images[0]} alt={`${watch.brand} ${watch.model}`} className="h-full w-full object-cover" />
          <span
            className={cn(
              "absolute bottom-0 left-0 px-2 py-1 text-[10px] uppercase tracking-[0.14em]",
              status.className
            )}
          >
            {status.label}
          </span>
        </div>
        <div className="space-y-1 px-1 py-3">
          <p className="text-[13px] leading-tight">{watch.brand}</p>
          <p className="text-[12px] text-white/55">{watch.model}</p>
          <p className="text-[12px] text-white/80">{moneyRange(watch.valueLow, watch.valueHigh)}</p>
        </div>
      </div>
    </Link>
  );
}
