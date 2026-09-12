"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function FinancingPage() {
  const { agreements, timepieces } = useStore();

  return (
    <main className="flex flex-1 flex-col">
      <ScreenHeader
        title="Financing"
        right={
          <Link href="/financing/new" aria-label="New estimate">
            <Plus className="h-5 w-5" />
          </Link>
        }
      />
      <div className="flex-1 space-y-4 px-5 py-5">
        <p className="text-sm leading-6 text-white/60">
          Confidential sale-and-repurchase agreements against selected models. Typical close is two
          business days, including manufacturer verification. Advances start at $10,000 and run at
          18% plus fees, never above 65% of liquidation value.
        </p>
        {agreements.length === 0 ? (
          <div className="rounded-lg border border-white/10 px-4 py-10 text-center text-sm text-white/50">
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
                className="block rounded-lg border border-white/10 bg-[#111] p-4"
              >
                <div className="flex items-center justify-between text-[11px] tracking-[0.16em] uppercase text-white/45">
                  <span>{a.id.toUpperCase()}</span>
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
