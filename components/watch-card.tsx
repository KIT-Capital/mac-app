import Link from "next/link";
import { Check, Clock, XCircle } from "lucide-react";
import { WatchPhoto } from "@/components/watch-photo";
import { APPRAISAL_WORDS } from "@/lib/appraisal-words";
import { moneyRange } from "@/lib/catalog";
import type { AppraisalStateWord, Timepiece } from "@/lib/types";

export function WatchCard({
  watch,
  word,
  decisionsUsed,
  expired = false,
}: {
  watch: Timepiece;
  word: AppraisalStateWord;
  decisionsUsed: number;
  expired?: boolean;
}) {
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
        {expired ? "Appraisal expired — send again" : APPRAISAL_WORDS[word]}
        {!expired && word === "accepted" ? <Check className="h-3 w-3" strokeWidth={2.5} /> : null}
        {word === "not_accepted" ? <XCircle className="h-3 w-3" /> : null}
        {word === "with_mac" ? <Clock className="h-3 w-3" /> : null}
        {decisionsUsed > 0 ? <span className="text-mac-faint">{decisionsUsed}/3</span> : null}
      </p>
      <p className="mt-1 text-[13px] leading-tight text-mac-fg">{watch.brand}</p>
      <p className="text-[13px] leading-tight text-mac-fg">{watch.model}</p>
      <p className="mt-0.5 text-[13px] text-mac-muted">{moneyRange(watch.valueLow, watch.valueHigh)}</p>
    </Link>
  );
}
