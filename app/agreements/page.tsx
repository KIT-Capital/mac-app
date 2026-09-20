"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { bookLabel } from "@/lib/contract/repo-book.mjs";
import {
  RETAIL_LIST_WORDS,
  isRequestRow,
  retailListWord,
  retailRequestWord,
  startAgainHref,
} from "@/lib/contract/request-transitions.mjs";
import { useOwnedAssets } from "@/lib/ownership";

export default function AgreementsPage() {
  const { agreements } = useOwnedAssets();
  const groups = RETAIL_LIST_WORDS.map((word) => ({
    word,
    rows: agreements.filter((agreement) => retailListWord(agreement) === word),
  })).filter((group) => group.rows.length);

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Repurchase agreements" backHref="/repurchase" />
      <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
        {agreements.length === 0 ? (
          <div className="rounded-2xl border border-mac-line bg-mac-card p-8 text-center text-sm text-mac-faint">
            No sale-and-repurchase agreements on file yet.
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.word}>
              <h2 className="mb-3 text-[11px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase">
                {group.word}
              </h2>
              <div className="space-y-3">
                {group.rows.map((a) => {
                  const request = isRequestRow(a);
                  const closed = request && retailRequestWord(a) === "Closed";
                  return (
                    <article
                      key={a.id}
                      className="rounded-2xl border border-mac-line bg-mac-card p-4 transition hover:border-[#FCB040]/50"
                    >
                      <Link href={`/agreements/${a.id}`} className="block">
                        <div className="flex justify-between text-[11px] tracking-[0.14em] text-[#E8D5C0] uppercase">
                          <span className="font-bold">{a.agreementCode || a.id}</span>
                          <span className="text-[#FCB040]">{request ? retailRequestWord(a) : bookLabel(a)}</span>
                        </div>
                        <p className="mt-2 text-2xl font-bold text-mac-fg">{money(a.amount)}</p>
                        <p className="mt-1 text-xs text-mac-faint">
                          {request ? `Sent on ${a.createdAt}` : `Executed on ${a.executedOn ?? a.createdAt}`} · {a.termMonths} Months
                        </p>
                      </Link>
                      {closed ? (
                        <Link
                          href={startAgainHref(a)}
                          className="mt-3 inline-block text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                        >
                          Start again
                        </Link>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
