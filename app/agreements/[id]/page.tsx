"use client";

import { useParams } from "next/navigation";
import { useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { buybackPrice, COMPANY, hasApplication, money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const { agreements, timepieces, signAgreement, user, settings } = useStore();
  const agreement = agreements.find((a) => a.id === params.id);
  const watches = timepieces.filter((w) => agreement?.watchIds.includes(w.id));
  const [started, setStarted] = useState(false);
  const applied = hasApplication(user, agreements.length);
  const repurchase = agreement
    ? buybackPrice(agreement.amount, agreement.termMonths, settings.startingRate)
    : 0;

  if (!agreement) {
    return (
      <main className="flex flex-1 items-center justify-center text-mac-faint">Agreement not found.</main>
    );
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Repurchase Agreement" backHref="/agreements" />
      <div className="flex-1 overflow-y-auto px-5 py-5 text-[13px] leading-relaxed text-mac-muted">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-mac-line bg-mac-card p-3">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Status: {agreement.status.replace("_", " ")}</span>
            <p className="text-[12px] text-mac-muted">Contract #{agreement.agreementCode || agreement.id}</p>
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
            This is a sale and repurchase, not a loan. The Seller sells the timepieces listed in
            this agreement, including original box, papers, and verification, to Mechanical Art
            Capital LLC at the Sale Amount. The Seller may buy them back at the repurchase price
            on MAC&apos;s preset scale for the selected term, provided title remains clear and the
            pieces remain in the described condition.
          </p>
          <p>
            Description of timepieces:{" "}
            {watches.map((w) => `${w.brand} ${w.model} (${w.reference || w.id})`).join("; ") ||
              "Selected collection timepieces"}
            .
          </p>
          <p>
            Sale amount (MAC purchases): {money(agreement.amount)}. Term: {agreement.termMonths}{" "}
            months. Repurchase price on the scale: {money(repurchase)}. Delivery:{" "}
            {agreement.delivery}.
            {applied
              ? ` After purchase, the pieces are held in secure custody${settings.vaultLocation ? ` at ${settings.vaultLocation}` : ""} and may be shown by pre-scheduling with MAC.`
              : " Custody details are confirmed after this application is received."}
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
      <div className="border-t border-mac-line bg-mac-card p-4">
        <PillButton
          variant="gold"
          disabled={!started || agreement.status === "signed"}
          onClick={() => signAgreement(agreement.id)}
        >
          {agreement.status === "signed" ? "Executed & Verified" : "Sign Repurchase Agreement"}
        </PillButton>
        <p className="mt-2 text-center text-[11px] text-mac-faint">
          Custody Questions: {COMPANY.phone} · {COMPANY.financingEmail}
        </p>
      </div>
    </main>
  );
}
