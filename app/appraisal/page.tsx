"use client";

import { Pencil } from "lucide-react";
import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { COMPANY, money } from "@/lib/catalog";
import { MacLogoMark } from "@/components/mac-logo";
import { useStore } from "@/lib/store";

export default function AppraisalPage() {
  const { timepieces, user } = useStore();
  const appraised = timepieces.filter((w) => w.status === "appraised");

  return (
    <main className="flex flex-1 flex-col bg-white text-black">
      <div className="bg-black text-white">
        <ScreenHeader title="Collection appraisal" backHref="/collection" />
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-6">
        <div className="flex items-start justify-between">
          <div className="w-24">
            <MacLogoMark className="p-1" />
          </div>
          <p className="text-right text-[11px] leading-4 text-black/50">
            Evaluated by Mechanical Art Capital
            <br />
            Created {new Date().toLocaleDateString()}
          </p>
        </div>

        {appraised.length === 0 ? (
          <p className="mt-16 text-center text-sm text-black/50">
            No appraised timepieces yet. Request an appraisal from the collection.
          </p>
        ) : (
          <ol className="mt-8 space-y-8">
            {appraised.map((w, i) => (
              <li key={w.id} className="border-t border-black/10 pt-5">
                <div className="flex justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">
                      {i + 1}. {w.brand}
                    </p>
                    <p className="text-lg">
                      {w.valueLow && w.valueHigh
                        ? `${money(w.valueLow)} – ${money(w.valueHigh)}`
                        : "Pending"}
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
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={w.images[0]} alt="" className="h-24 w-24 object-contain" />
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
      <div className="flex justify-end p-4">
        <Link
          href="/collection"
          className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0E2A44] text-white"
          aria-label="Return to collection"
        >
          <Pencil className="h-5 w-5" />
        </Link>
      </div>
    </main>
  );
}
