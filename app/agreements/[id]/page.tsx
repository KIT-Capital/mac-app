"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { COMPANY, money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const { agreements, timepieces, signAgreement } = useStore();
  const agreement = agreements.find((a) => a.id === params.id);
  const watches = timepieces.filter((w) => agreement?.watchIds.includes(w.id));
  const [started, setStarted] = useState(false);

  if (!agreement) {
    return (
      <main className="flex flex-1 items-center justify-center text-white/50">Agreement not found.</main>
    );
  }

  return (
    <main className="flex flex-1 flex-col">
      <ScreenHeader title="Repurchase agreement" backHref="/agreements" />
      <div className="flex-1 overflow-y-auto px-5 py-5 text-[13px] leading-6 text-white/80">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] tracking-[0.16em] text-white/40 uppercase">
            Select start to begin
          </p>
          <button
            onClick={() => setStarted(true)}
            className="rounded-full bg-[#FCB040] px-4 py-1.5 text-[11px] font-semibold tracking-[0.16em] text-black uppercase"
          >
            Start
          </button>
        </div>

        <article className="space-y-4 rounded-md bg-white px-4 py-5 text-[#1a1a1a]">
          <h2 className="text-center text-sm font-semibold tracking-[0.12em] uppercase">
            Repurchase agreement
          </h2>
          <p>
            Agreement date: {agreement.createdAt}
            <br />
            Transaction number: {agreement.id.replace(/\D/g, "") || "31419"}
            <br />
            Seller name: {agreement.ownerName}
            <br />
            Buyer name: Mechanical Art Capital LLC
          </p>
          <p>
            The Buyer and the Seller agree that the Seller sells the timepieces listed in this
            agreement, including original box, papers, and verification, at the Sale Amount, and
            may repurchase them at the same Sale Amount at the conclusion of the term, provided
            title remains clear and the pieces remain in the described condition.
          </p>
          <p>
            Description of assets:{" "}
            {watches.map((w) => `${w.brand} ${w.model} (${w.reference || w.id})`).join("; ") ||
              "Selected collection timepieces"}
            .
          </p>
          <p>
            Sale amount: {money(agreement.amount)} ({agreement.termMonths} months). Delivery:{" "}
            {agreement.delivery}. Assets are stored in a secure Manhattan facility and may be shown
            to prospective buyers by pre-scheduling with MAC.
          </p>
          <p>
            Authorized seller: {agreement.ownerName}
            <br />
            Authorized buyer: Mechanical Art Capital LLC
          </p>
          {agreement.status === "signed" ? (
            <p className="font-semibold text-emerald-800">Signed {agreement.signedAt}</p>
          ) : null}
        </article>
      </div>
      <div className="border-t border-white/10 p-4">
        <PillButton
          disabled={!started || agreement.status === "signed"}
          onClick={() => signAgreement(agreement.id)}
        >
          {agreement.status === "signed" ? "Finished" : "Finish"}
        </PillButton>
        <p className="mt-2 text-center text-[11px] text-white/35">
          Questions: {COMPANY.phone} · {COMPANY.financingEmail}
        </p>
      </div>
    </main>
  );
}
