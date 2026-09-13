import Link from "next/link";
import { Check } from "lucide-react";
import { moneyRange } from "@/lib/catalog";
import type { Timepiece } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<Timepiece["status"], { label: string; className: string }> = {
  appraised: { label: "Appraised", className: "bg-[#0E2A44] text-white" },
  reviewing: { label: "Reviewing", className: "bg-[#5c5c5c] text-white" },
  not_evaluated: { label: "Not evaluated", className: "bg-black/70 text-white/80" },
};

export function WatchCard({ watch }: { watch: Timepiece }) {
  const status = STATUS[watch.status];

  return (
    <Link href={`/collection/${watch.id}`} className="block">
      <div className="overflow-hidden bg-[#161616]">
        <div className="relative aspect-square bg-[#111]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={watch.images[0]} alt={`${watch.brand} ${watch.model}`} className="h-full w-full object-cover" />
          <span
            className={cn(
              "absolute bottom-0 left-0 flex items-center gap-1 px-2 py-1 text-[10px] tracking-[0.16em] uppercase",
              status.className,
            )}
          >
            {status.label}
            {watch.status === "appraised" ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
          </span>
        </div>
        <div className="space-y-0.5 px-0.5 pt-3 pb-1">
          <p className="text-[14px] font-medium tracking-tight">{watch.brand}</p>
          <p className="text-[13px] text-white/80">{watch.model}</p>
          <p className="text-[13px] text-white/70">{moneyRange(watch.valueLow, watch.valueHigh)}</p>
        </div>
      </div>
    </Link>
  );
}
