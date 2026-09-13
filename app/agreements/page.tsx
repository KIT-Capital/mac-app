"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AgreementsPage() {
  const { agreements } = useStore();

  return (
    <main className="flex flex-1 flex-col bg-[#161616]">
      <ScreenHeader title="Agreements" backHref="/financing" />
      <div className="flex-1 space-y-3 px-5 py-5">
        {agreements.length === 0 ? (
          <p className="py-16 text-center text-sm text-white/50">No repo agreements yet.</p>
        ) : (
          agreements.map((a) => (
            <Link key={a.id} href={`/agreements/${a.id}`} className="block border-b border-white/25 py-4">
              <div className="flex justify-between text-[11px] tracking-[0.14em] text-white/40 uppercase">
                <span>Agreement {a.id}</span>
                <span>{a.status.replace("_", " ")}</span>
              </div>
              <p className="mt-1 text-lg">{money(a.amount)}</p>
              <p className="text-sm text-white/50">{a.createdAt}</p>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
