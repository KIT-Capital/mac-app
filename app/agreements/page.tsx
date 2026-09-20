"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { bookLabel } from "@/lib/contract/repo-book.mjs";
import { isRequestRow, retailRequestWord } from "@/lib/contract/request-transitions.mjs";
import { useOwnedAssets } from "@/lib/ownership";

export default function AgreementsPage() {
  const { agreements } = useOwnedAssets();

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Repurchase agreements" backHref="/repurchase" />
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-5">
        {agreements.length === 0 ? (
          <div className="rounded-2xl border border-mac-line bg-mac-card p-8 text-center text-sm text-mac-faint">
            No sale-and-repurchase agreements on file yet.
          </div>
        ) : (
          agreements.map((a) => {
            // A repo on the book reads its book label; a request reads one of
            // the four retail words and never an internal state (R29).
            const request = isRequestRow(a);
            return (
              <Link
                key={a.id}
                href={`/agreements/${a.id}`}
                className="block rounded-2xl border border-mac-line bg-mac-card p-4 transition hover:border-[#FCB040]/50"
              >
                <div className="flex justify-between text-[11px] tracking-[0.14em] text-[#E8D5C0] uppercase">
                  <span className="font-bold">{a.agreementCode || a.id}</span>
                  <span className="text-[#FCB040]">{request ? retailRequestWord(a) : bookLabel(a)}</span>
                </div>
                <p className="mt-2 text-2xl font-bold text-mac-fg">{money(a.amount)}</p>
                <p className="mt-1 text-xs text-mac-faint">
                  {request ? `Sent on ${a.createdAt}` : `Executed on ${a.executedOn ?? a.createdAt}`} · {a.termMonths} Months
                </p>
              </Link>
            );
          })
        )}
      </div>
    </main>
  );
}
