"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { FINAL_PHRASE, PROVISIONAL_PHRASE } from "@/lib/appraisal-words";
import { COMPANY, money } from "@/lib/catalog";
import { appraisalView } from "@/lib/contract/repo-book.mjs";
import { MacLogoMark } from "@/components/mac-logo";
import { WatchPhoto } from "@/components/watch-photo";
import { useOwnedAssets } from "@/lib/ownership";
import { useStore } from "@/lib/store";

export default function AppraisalPage() {
  const { user, appraisalAttempts } = useStore();
  const { timepieces } = useOwnedAssets();
  const appraised = timepieces
    .map((w) => ({ watch: w, view: appraisalView(appraisalAttempts, w.id, w) }))
    .filter((row) => row.view.word === "accepted");

  return (
    <main className="flex flex-1 flex-col bg-white text-[#10141D]">
      <div className="bg-[#0E2A44] text-white">
        <ScreenHeader title="Certified Valuation" backHref="/collection" />
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <div className="flex items-start justify-between border-b border-black/10 pb-4">
          <div className="w-24">
            <MacLogoMark className="p-1" />
          </div>
          <div className="text-right text-[11px] leading-4 text-black/60">
            <p className="font-bold text-[#0E2A44] uppercase">Mechanical Art Capital LLC</p>
            <p>Certified Valuation Schedule</p>
            <p>Issued: {new Date().toLocaleDateString()}</p>
          </div>
        </div>

        {appraised.length === 0 ? (
          <p className="mt-16 text-center text-sm text-black/50">
            No accepted timepieces yet. Send a piece for appraisal from the collection.
          </p>
        ) : (
          <ol className="mt-8 space-y-8">
            {appraised.map(({ watch: w, view }, i) => (
              <li key={w.id} className="border-t border-black/10 pt-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {i + 1}. {w.brand} {w.model}
                    </p>
                    <p className="text-lg">
                      {typeof view.value === "number" ? money(view.value) : "Pending"}
                    </p>
                    <p className="text-[12px] text-black/60">
                      {view.latestDecision?.finalizedAt ? FINAL_PHRASE : PROVISIONAL_PHRASE}
                    </p>
                    <p className="text-[12px] text-black/50">
                      Evaluated {w.evaluatedAt || "—"}
                      {w.reference ? ` · ${w.reference}` : ""}
                    </p>
                    <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[12px]">
                      <div>Condition: {w.condition}</div>
                      <div>Case metal: {w.caseMetal}</div>
                      <div>Form: {w.caseType}</div>
                      <div>Width: {w.caseDiameter}</div>
                      <div>Dial: {w.dialColor}</div>
                      <div>Box & papers: {w.boxPapers}</div>
                    </dl>
                  </div>
                  <div className="h-24 w-24 overflow-hidden bg-black/5">
                    <WatchPhoto src={w.images[0]} watch={w} alt="" />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}

        <p className="mt-10 text-center text-[12px] text-black/45">
          Please contact us at {COMPANY.phone}
          <br />
          {COMPANY.financingEmail}
        </p>
        <p className="mt-4 text-center text-[11px] text-black/35">Prepared for {user?.name}</p>
      </div>
      <div className="flex justify-end gap-3 p-4 border-t border-black/10 bg-slate-50 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="mac-tap flex h-11 items-center gap-2 rounded-xl border border-black/15 px-5 text-xs font-bold uppercase tracking-wider text-[#0E2A44] shadow-sm"
        >
          Print / PDF
        </button>
        <Link
          href="/collection"
          className="mac-tap flex h-11 items-center gap-2 rounded-xl bg-[#0E2A44] px-5 text-xs font-bold uppercase tracking-wider text-white shadow-sm"
        >
          <Pencil className="h-4 w-4" />
          Edit Collection
        </Link>
      </div>
    </main>
  );
}
