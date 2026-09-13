"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AgreementsPage() {
  const { agreements } = useStore();

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Repurchase Vault" backHref="/financing" />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {agreements.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#161B24] p-8 text-center text-sm text-white/50">
            No sale-and-repurchase agreements on file yet.
          </div>
        ) : (
          agreements.map((a) => (
            <Link
              key={a.id}
              href={`/agreements/${a.id}`}
              className="block rounded-2xl border border-white/10 bg-[#161B24] p-4 transition hover:border-[#FCB040]/50"
            >
              <div className="flex justify-between text-[11px] tracking-[0.14em] text-[#E8D5C0] uppercase">
                <span className="font-bold">{a.agreementCode || a.id}</span>
                <span className="text-[#FCB040]">{a.status.replace("_", " ")}</span>
              </div>
              <p className="mt-2 text-2xl font-bold text-white">{money(a.amount)}</p>
              <p className="mt-1 text-xs text-white/50">Originated on {a.createdAt} · {a.termMonths} Months</p>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
