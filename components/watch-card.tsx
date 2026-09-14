import Link from "next/link";
import { Check } from "lucide-react";
import { WatchPhoto } from "@/components/watch-photo";
import { moneyRange } from "@/lib/catalog";
import type { Timepiece } from "@/lib/types";

const STATUS: Record<Timepiece["status"], string> = {
  appraised: "Appraised",
  reviewing: "Reviewing",
  not_evaluated: "Not evaluated",
};

export function WatchCard({ watch }: { watch: Timepiece }) {
  return (
    <Link href={`/collection/${watch.id}`} className="block">
      <div className="aspect-square w-full overflow-hidden bg-mac-card">
        <WatchPhoto
          src={watch.images[0]}
          watch={watch}
          alt={`${watch.brand} ${watch.model}`}
          showCaption
        />
      </div>
      <p className="mt-2 flex items-center gap-1 text-[10px] tracking-[0.12em] text-mac-faint uppercase">
        {STATUS[watch.status]}
        {watch.status === "appraised" ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
      </p>
      <p className="mt-1 text-[13px] leading-tight text-mac-fg">{watch.brand}</p>
      <p className="text-[13px] leading-tight text-mac-fg">{watch.model}</p>
      <p className="mt-0.5 text-[13px] text-mac-muted">{moneyRange(watch.valueLow, watch.valueHigh)}</p>
    </Link>
  );
}
