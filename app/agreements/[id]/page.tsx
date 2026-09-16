"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { WatchPhoto } from "@/components/watch-photo";
import { COMPANY, hasApplication, money } from "@/lib/catalog";
import { repurchaseDollars, repurchaseSchedule, resolveScale } from "@/lib/contract/repo-scale.mjs";
import { useOwnedAssets } from "@/lib/ownership";
import { useStore } from "@/lib/store";

function moneyExact(amount: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export default function AgreementDetailPage() {
  const params = useParams<{ id: string }>();
  const { signAgreement, user, settings } = useStore();
  const { agreements, timepieces } = useOwnedAssets();
  const agreement = agreements.find((a) => a.id === params.id);
  const watches = timepieces.filter((w) => agreement?.watchIds.includes(w.id));
  const [started, setStarted] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const pageOpen = useRef(true);
  useEffect(() => () => {
    pageOpen.current = false;
  }, []);
  const applied = hasApplication(user, agreements);
  const scale = agreement
    ? resolveScale(agreement.scale ?? settings, agreement.termMonths)
    : null;
  const schedule = agreement && scale
    ? repurchaseSchedule({
        saleAmount: agreement.amount,
        termMonths: agreement.termMonths,
        startDate: agreement.createdAt,
        ...scale,
      })
    : null;
  const repurchase = agreement && scale
    ? repurchaseDollars(agreement.amount, agreement.termMonths, scale)
    : 0;

  async function downloadPdf() {
    if (!agreement || pdfBusy) return;
    setPdfBusy(true);
    setPdfError("");
    try {
      const response = await fetch("/api/contracts/pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerName: agreement.ownerName,
          sellerEmail: agreement.email,
          sellerPhone: user?.phone,
          saleAmount: agreement.amount,
          termMonths: agreement.termMonths,
          startDate: agreement.createdAt,
          delivery: agreement.delivery,
          agreementCode: agreement.agreementCode || agreement.id,
          scale,
          timepieces: watches.map((watch) => ({
            name: `${watch.brand} ${watch.model}`,
            brand: watch.brand,
            model: watch.model,
            reference: watch.reference,
            condition: watch.condition,
          })),
        }),
      });
      if (!pageOpen.current) return;
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setPdfError(body?.error || "Could not create the contract PDF.");
        return;
      }
      const blob = await response.blob();
      if (!pageOpen.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${agreement.agreementCode || "mac-repurchase-agreement"}.pdf`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (pageOpen.current) setPdfError("Could not create the contract PDF.");
    } finally {
      if (pageOpen.current) setPdfBusy(false);
    }
  }

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
            for the month of repurchase, provided title remains clear and the pieces remain in the
            described condition.
          </p>
          {watches.length ? (
            <div className="flex gap-2">
              {watches.map((w) => (
                <div key={w.id} className="h-16 w-16 overflow-hidden rounded-md bg-black/5">
                  <WatchPhoto src={w.images[0]} watch={w} alt={`${w.brand} ${w.model}`} />
                </div>
              ))}
            </div>
          ) : null}
          <p>
            Description of timepieces:{" "}
            {watches.map((w) => `${w.brand} ${w.model} (${w.reference || w.id})`).join("; ") ||
              "Selected collection timepieces"}
            .
          </p>
          <p>
            Sale amount (MAC purchases): {money(agreement.amount)}. Term: {agreement.termMonths}{" "}
            months. Repurchase price if bought back at term: {money(repurchase || 0)}. Delivery:{" "}
            {agreement.delivery}.
            {applied
              ? ` After purchase, the pieces are held in secure custody${settings.vaultLocation ? ` at ${settings.vaultLocation}` : ""} and may be shown by pre-scheduling with MAC.`
              : " Custody details are confirmed after this application is received."}
          </p>
          {applied && schedule?.ok ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] uppercase">
                Repurchase price by month
              </h3>
              <table className="w-full text-left text-[12px]">
                <thead>
                  <tr>
                    <th className="pb-1">Date</th>
                    <th className="pb-1">Price</th>
                    <th className="pb-1">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.rows.map((row) => (
                    <tr key={row.month}>
                      <td>{row.date}</td>
                      <td>{moneyExact(row.price || 0)}</td>
                      <td>{row.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
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
        {applied ? (
          <PillButton variant="navy" className="mb-3" disabled={pdfBusy} onClick={() => void downloadPdf()}>
            {pdfBusy ? "Preparing PDF…" : "Download contract PDF"}
          </PillButton>
        ) : null}
        {pdfError ? <p className="mb-2 text-center text-[12px] text-red-300">{pdfError}</p> : null}
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
