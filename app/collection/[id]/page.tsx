"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, Clock, Edit3, HelpCircle, Shield, Trash2 } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { moneyRange } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function WatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { timepieces, updateTimepiece, removeTimepiece, settings } = useStore();
  const watch = timepieces.find((w) => w.id === params.id);

  if (!watch) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-6 text-center bg-mac-bg">
        <HelpCircle className="h-10 w-10 text-mac-faint" />
        <p className="mt-3 text-[14px] font-medium text-mac-muted">Timepiece Not Found</p>
        <Link
          href="/collection"
          className="mt-4 rounded-xl border border-mac-line bg-white/5 px-4 py-2 text-xs font-semibold text-[#FCB040]"
        >
          Return to Collection
        </Link>
      </main>
    );
  }

  const locked = watch.status !== "not_evaluated";

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title={watch.brand} backHref="/collection" />

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Gallery Hero */}
        <div className="relative aspect-square w-full bg-[#090C12]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={watch.images[0]} alt={watch.model} className="h-full w-full object-cover" />

          {/* Thumbnails if multi-angle */}
          {watch.images.length > 1 ? (
            <div className="absolute bottom-3 left-3 flex gap-2">
              {watch.images.map((src, i) => (
                <div
                  key={src + i}
                  className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white/50 bg-mac-card shadow-md"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt="" className="h-full w-full object-cover" />
                </div>
              ))}
            </div>
          ) : null}

          {/* Status Badge */}
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mac-line bg-black/70 px-3 py-1 text-[10px] font-bold tracking-wider text-[#FCB040] uppercase backdrop-blur-md">
              {watch.status === "appraised" ? <Check className="h-3 w-3" strokeWidth={3} /> : <Clock className="h-3 w-3" />}
              {watch.status.replace("_", " ")}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5">
          {/* Title & Reference */}
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-[#FCB040] uppercase">
              {watch.brand}
            </p>
            <h1 className="mt-0.5 text-[24px] font-semibold text-mac-fg tracking-tight">
              {watch.model}
            </h1>
            {watch.reference ? (
              <p className="text-[13px] text-mac-faint font-mono">Ref. {watch.reference}</p>
            ) : null}
          </div>

          {/* Valuation Card */}
          <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase">
              Certified Valuation
            </p>
            <p className="mt-1 text-[22px] font-bold text-mac-fg">
              {moneyRange(watch.valueLow, watch.valueHigh)}
            </p>

            {watch.status === "appraised" && watch.financeable ? (
              <p className="mt-3 border-t border-mac-line pt-3 text-[12px] text-mac-muted">
                Eligible for a sale-and-repurchase application. MAC would buy this piece; you may
                buy it back on the preset scale. This is not a loan.
              </p>
            ) : null}
          </div>

          {/* Specifications Table */}
          <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
            <h3 className="text-[11px] font-bold tracking-[0.16em] text-mac-faint uppercase pb-2 border-b border-mac-line">
              Technical Specifications
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Condition</dt>
                <dd className="font-medium text-mac-fg">{watch.condition}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Case Metal</dt>
                <dd className="font-medium text-mac-fg">{watch.caseMetal}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Case Diameter</dt>
                <dd className="font-medium text-mac-fg">{watch.caseDiameter}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Dial Color</dt>
                <dd className="font-medium text-mac-fg">{watch.dialColor}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Box & Papers</dt>
                <dd className="font-medium text-mac-fg">{watch.boxPapers}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Complication</dt>
                <dd className="font-medium text-mac-fg">{watch.complication}</dd>
              </div>
            </dl>
          </div>

          {/* Actions depending on state */}
          {watch.status === "not_evaluated" ? (
            <button
              type="button"
              onClick={() => {
                updateTimepiece(watch.id, { status: "reviewing" });
                window.setTimeout(() => {
                  updateTimepiece(watch.id, {
                    status: "appraised",
                    evaluatedAt: new Date().toISOString().slice(0, 10),
                    valueLow: watch.valueLow ?? 42000,
                    valueHigh: watch.valueHigh ?? 58000,
                  });
                }, 900);
              }}
              className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-[#FCB040] text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59]"
            >
              Request Certified Appraisal
            </button>
          ) : null}

          {watch.status === "reviewing" ? (
            <div className="rounded-xl border border-[#FCB040]/30 bg-[#FCB040]/10 p-4 text-center">
              <p className="text-[12px] font-medium text-[#FCB040]">
                ★ Desk specialists are reviewing title & market comparables. Turnaround is {settings.closeBusinessDays} business days.
              </p>
            </div>
          ) : null}

          {watch.status === "appraised" && watch.financeable ? (
            <button
              type="button"
              onClick={() => router.push(`/financing/new?watch=${watch.id}`)}
              className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-[#FCB040] text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59]"
            >
              Apply to Sell &amp; Repurchase
            </button>
          ) : null}

          {/* Secondary Controls */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={locked}
              onClick={() => router.push("/collection/add")}
              className="flex-1 rounded-xl border border-mac-line bg-white/5 py-3 text-[11px] font-semibold tracking-wider text-mac-fg uppercase disabled:opacity-30"
            >
              {locked ? "Locked for Review" : "Edit Details"}
            </button>
            <button
              type="button"
              onClick={() => {
                removeTimepiece(watch.id);
                router.push("/collection");
              }}
              className="flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 transition hover:bg-red-500/20"
              aria-label="Remove watch"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
