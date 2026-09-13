"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function FinancingPage() {
  const { agreements, timepieces, settings } = useStore();

  return (
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader
        title="Financing"
        right={
          <Link href="/financing/new" aria-label="New estimate" className="mac-tap flex items-center justify-center">
            <Plus className="h-5 w-5" strokeWidth={1.5} />
          </Link>
        }
      />
      <div className="mx-auto w-full max-w-xl flex-1 space-y-4 px-5 py-5">
        <p className="text-sm leading-6 text-white/60">
          Confidential sale-and-repurchase agreements against selected models. Typical close is{" "}
          {settings.closeBusinessDays} business days, including manufacturer verification. Advances start at $
          {settings.minAdvance.toLocaleString()} and run at {Math.round(settings.startingRate * 100)}% plus fees, never
          above {Math.round(settings.maxLtv * 100)}% of liquidation value.
        </p>
        {agreements.length === 0 ? (
          <div className="border border-white/10 px-4 py-10 text-center text-sm text-white/50">
            No financing requests yet.
            <Link href="/financing/new" className="mt-3 block text-[#FCB040]">
              Open the estimator
            </Link>
          </div>
        ) : (
          agreements.map((a) => {
            const watches = timepieces.filter((w) => a.watchIds.includes(w.id));
            return (
              <Link
                key={a.id}
                href={`/agreements/${a.id}`}
                className="block border-b border-white/10 py-4"
              >
                <div className="flex items-center justify-between text-[11px] tracking-[0.16em] uppercase text-white/45">
                  <span>{a.agreementCode || a.id}</span>
                  <span>{a.status.replace("_", " ")}</span>
                </div>
                <p className="mt-2 text-xl">{money(a.amount)}</p>
                <p className="text-sm text-white/55">
                  {a.termMonths} months · {a.delivery}
                </p>
                <p className="mt-2 text-sm text-white/70">
                  {watches.map((w) => `${w.brand} ${w.model}`).join(" · ") || "Selected timepieces"}
                </p>
              </Link>
            );
          })
        )}
        <Link
          href="/agreements"
          className="block pt-2 text-center text-[12px] tracking-[0.16em] text-[#E8D5C0] uppercase"
        >
          Open agreements
        </Link>
      </div>
    </main>
  );
}
