import Link from "next/link";
import { Check } from "lucide-react";
import { moneyRange } from "@/lib/catalog";
import type { Timepiece } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS: Record<Timepiece["status"], { label: string; badgeClass: string }> = {
  appraised: {
    label: "Appraised",
    badgeClass: "bg-[#0E2A44] text-white border-t border-r border-[#FCB040]/30",
  },
  reviewing: {
    label: "Reviewing",
    badgeClass: "bg-[#252C38] text-white/90 border-t border-r border-white/20",
  },
  not_evaluated: {
    label: "Not Evaluated",
    badgeClass: "bg-black/80 text-white/70 border-t border-r border-white/10",
  },
};

export function WatchCard({ watch }: { watch: Timepiece }) {
  const status = STATUS[watch.status];

  return (
    <Link
      href={`/collection/${watch.id}`}
      className="group block overflow-hidden rounded-2xl border border-white/10 bg-[#161B24] shadow-sm transition hover:border-[#FCB040]/50 hover:shadow-md"
    >
      <div className="relative aspect-square w-full bg-[#0D1017]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={watch.images[0]}
          alt={`${watch.brand} ${watch.model}`}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        {/* Status Badge */}
        <span
          className={cn(
            "absolute bottom-0 left-0 flex items-center gap-1 rounded-tr-lg px-2.5 py-1 text-[10px] font-semibold tracking-[0.14em] uppercase shadow-sm",
            status.badgeClass,
          )}
        >
          {status.label}
          {watch.status === "appraised" ? <Check className="h-3 w-3 text-[#FCB040]" strokeWidth={3} /> : null}
        </span>
      </div>

      <div className="p-3">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-[#FCB040] uppercase">
          {watch.brand}
        </p>
        <p className="line-clamp-1 text-[14px] font-medium text-white">
          {watch.model}
        </p>
        <p className="mt-1 text-[13px] font-semibold text-white/80">
          {moneyRange(watch.valueLow, watch.valueHigh)}
        </p>
      </div>
    </Link>
  );
}
