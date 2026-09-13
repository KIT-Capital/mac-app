"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { estimateAdvance, money, moneyRange } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function WatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { timepieces, updateTimepiece, removeTimepiece, settings } = useStore();
  const watch = timepieces.find((w) => w.id === params.id);

  if (!watch) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <p className="text-white/60">This timepiece is no longer in the collection.</p>
        <Link href="/collection" className="mt-4 text-[#FCB040]">
          Back to collection
        </Link>
      </main>
    );
  }

  const advance = estimateAdvance(watch.valueLow, watch.valueHigh, settings.maxLtv);
  const locked = watch.status !== "not_evaluated";

  return (
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader title={watch.brand} backHref="/collection" />
      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto pb-8">
        <div className="grid grid-cols-2 gap-px bg-white/5 md:grid-cols-3">
          {watch.images.map((src) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={src} src={src} alt="" className="aspect-square w-full object-cover" />
          ))}
        </div>
        <div className="space-y-4 px-5 py-6">
          <div>
            <p className="text-[11px] tracking-[0.2em] text-[#FCB040] uppercase">{watch.status.replace("_", " ")}</p>
            <h2 className="mt-1 text-3xl font-medium tracking-tight">{watch.model}</h2>
            {watch.reference ? <p className="text-white/50">{watch.reference}</p> : null}
          </div>
          <p className="text-lg">{moneyRange(watch.valueLow, watch.valueHigh)}</p>
          {watch.financeable && watch.status === "appraised" ? (
            <p className="text-sm text-white/60">
              Financing available up to {money(advance)} against this piece ({Math.round(settings.maxLtv * 100)}% of
              liquidation value).
            </p>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            {[
              ["Condition", watch.condition],
              ["Case metal", watch.caseMetal],
              ["Case", `${watch.caseType} · ${watch.caseDiameter}`],
              ["Dial", watch.dialColor],
              ["Band", `${watch.band} · ${watch.bandMaterial}`],
              ["Box & papers", watch.boxPapers],
              ["Complication", watch.complication],
              ["Evaluated", watch.evaluatedAt || "—"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] tracking-[0.12em] text-white/40 uppercase">{k}</dt>
                <dd className="mt-1">{v}</dd>
              </div>
            ))}
          </dl>

          {watch.status === "not_evaluated" ? (
            <PillButton
              onClick={() => {
                updateTimepiece(watch.id, { status: "reviewing" });
                window.setTimeout(() => {
                  updateTimepiece(watch.id, {
                    status: "appraised",
                    evaluatedAt: new Date().toISOString().slice(0, 10),
                    valueLow: watch.valueLow ?? 40000,
                    valueHigh: watch.valueHigh ?? 55000,
                  });
                }, 900);
              }}
            >
              Request appraisal
            </PillButton>
          ) : null}

          {watch.status === "reviewing" ? (
            <p className="border border-[#FCB040]/30 px-4 py-3 text-sm text-[#FCB040]">
              MAC specialists are reviewing this timepiece. Typical turnaround is {settings.closeBusinessDays} business
              days.
            </p>
          ) : null}

          {watch.status === "appraised" && watch.financeable ? (
            <PillButton onClick={() => router.push(`/financing/new?watch=${watch.id}`)}>
              Estimate financing
            </PillButton>
          ) : null}

          <div className="grid grid-cols-2 gap-3 pt-2">
            <PillButton
              variant="ghost"
              disabled={locked}
              onClick={() => router.push("/collection/add")}
            >
              {locked ? "Locked" : "Edit later"}
            </PillButton>
            <PillButton
              variant="ghost"
              onClick={() => {
                removeTimepiece(watch.id);
                router.push("/collection");
              }}
            >
              Remove
            </PillButton>
          </div>
        </div>
      </div>
    </main>
  );
}
