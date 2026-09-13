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
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Repurchase Agreement" backHref="/agreements" />
      <div className="flex-1 overflow-y-auto px-5 py-5 text-[13px] leading-relaxed text-white/80">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-[#161B24] p-3">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Status: {agreement.status.replace("_", " ")}</span>
            <p className="text-[12px] text-white/70">Contract #{agreement.agreementCode || agreement.id}</p>
          </div>
          {agreement.status !== "signed" ? (
            <button
              onClick={() => setStarted(true)}
              className="rounded-lg bg-[#FCB040] px-4 py-2 text-[11px] font-bold tracking-[0.16em] text-[#0A0D14] uppercase shadow-sm"
            >
              {started ? "Ready to Sign" : "Review Terms"}
            </button>
          ) : null}
        </div>

        <article className="space-y-4 rounded-2xl bg-white p-5 text-[#1a1a1a] shadow-md font-sans">
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
      <div className="border-t border-white/10 bg-[#161B24] p-4">
        <PillButton
          variant="gold"
          disabled={!started || agreement.status === "signed"}
          onClick={() => signAgreement(agreement.id)}
        >
          {agreement.status === "signed" ? "Executed & Verified" : "Sign Repurchase Agreement"}
        </PillButton>
        <p className="mt-2 text-center text-[11px] text-white/50">
          Custody Questions: {COMPANY.phone} · {COMPANY.financingEmail}
        </p>
      </div>
    </main>
  );
}
