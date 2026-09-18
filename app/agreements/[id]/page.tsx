"use client";

import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { WatchPhoto } from "@/components/watch-photo";
import { COMPANY, hasApplication, maxPurchaseAmount, money } from "@/lib/catalog";
import { LIVE_WATCH_CONFLICT, bookLabel, isLiveBookLabel, liveWatchIds } from "@/lib/contract/repo-book.mjs";
import { repurchaseDollars, repurchaseSchedule, resolveScale } from "@/lib/contract/repo-scale.mjs";
import { PENDING_COUNSEL_LABEL, buildAgreementSnapshot } from "@/lib/contract/repo-agreement-snapshot.mjs";
import { useOwnedAssets } from "@/lib/ownership";
import { useStore } from "@/lib/store";

type ListedDocument = {
  id: string;
  version: number;
  status: string;
  checksum?: string | null;
  templateVersion?: string;
};

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
  const { signAgreement, addAgreementWatches, setAgreementAmount, user, settings, shells, agreements: book } =
    useStore();
  const { agreements, timepieces } = useOwnedAssets();
  const agreement = agreements.find((a) => a.id === params.id);
  const watches = timepieces.filter((w) => agreement?.watchIds.includes(w.id));
  const [started, setStarted] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pieceError, setPieceError] = useState("");
  const [raiseAmount, setRaiseAmount] = useState("");
  const [bookMode, setBookMode] = useState<"browser" | "live" | "unavailable">("browser");
  const [documents, setDocuments] = useState<ListedDocument[]>([]);
  const [docError, setDocError] = useState("");
  const [mailBusy, setMailBusy] = useState(false);
  const [mailNote, setMailNote] = useState("");
  const [otherAddress, setOtherAddress] = useState("");
  const [confirmAddress, setConfirmAddress] = useState("");
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
        ...scale,
        saleAmount: agreement.amount,
        termMonths: agreement.termMonths,
        startDate: agreement.createdAt,
      })
    : null;
  const repurchase = agreement && scale
    ? repurchaseDollars(agreement.amount, agreement.termMonths, scale)
    : 0;
  const snapshot = agreement
    ? buildAgreementSnapshot({
        sellerName: agreement.ownerName,
        sellerEmail: agreement.email,
        saleAmount: agreement.amount,
        termMonths: agreement.termMonths,
        startDate: agreement.createdAt,
        delivery: agreement.delivery,
        agreementCode: agreement.agreementCode || agreement.id,
        scale: agreement.scale,
        timepieces: watches.map((watch) => ({
          name: `${watch.brand} ${watch.model}`,
          brand: watch.brand,
          model: watch.model,
          reference: watch.reference,
          condition: watch.condition,
        })),
      })
    : { ok: false, errors: ["AGREEMENT_NOT_FOUND"], value: null };

  useEffect(() => {
    if (!agreement) return;
    let cancelled = false;
    fetch(`/api/agreement-documents?liveAgreementId=${encodeURIComponent(agreement.id)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          mode?: string;
          documents?: ListedDocument[];
        } | null;
        if (cancelled) return;
        if (body?.mode === "live") {
          setBookMode("live");
          setDocuments(Array.isArray(body.documents) ? body.documents : []);
        } else if (body?.mode === "unavailable") {
          // A missing live prerequisite is not browser mode: no preview mint, no stored list.
          setBookMode("unavailable");
          setDocuments([]);
        } else {
          setBookMode("browser");
          setDocuments([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBookMode("browser");
          setDocuments([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agreement]);

  async function openStoredDocument(documentId: string, download: boolean) {
    setDocError("");
    const tab = download ? null : window.open("", "_blank");
    if (tab) tab.opener = null;
    const response = await fetch("/api/agreement-documents", {
      method: "POST",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "url", documentId }),
    });
    const body = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!response.ok || !body?.url) {
      tab?.close();
      setDocError(body?.error === "DOCUMENT_NOT_FOUND" ? "That document is not available." : "Could not open the stored PDF.");
      return;
    }
    if (download) {
      const link = document.createElement("a");
      link.href = body.url;
      link.download = `${agreement?.agreementCode || "mac-repurchase-agreement"}.pdf`;
      link.click();
      return;
    }
    if (!tab) {
      setDocError("Allow pop-ups to view the stored PDF.");
      return;
    }
    tab.location.href = body.url;
  }

  async function emailStoredDocument(documentId: string, recipientKind: "self" | "other") {
    if (mailBusy) return;
    setMailBusy(true);
    setMailNote("");
    setDocError("");
    try {
      const response = await fetch("/api/agreement-documents", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "email",
          documentId,
          recipientKind,
          ...(recipientKind === "other" ? { address: otherAddress, confirmAddress } : {}),
        }),
      });
      const body = (await response.json().catch(() => null)) as { send?: { result?: string }; error?: string } | null;
      if (!response.ok || body?.send?.result !== "accepted") {
        setDocError(
          body?.error === "DOCUMENT_RECIPIENT_UNCONFIRMED"
            ? "Type the same email twice to confirm it."
            : body?.error === "DOCUMENT_SEND_THROTTLED"
              ? "Wait before sending again."
              : "Could not email the stored PDF.",
        );
        return;
      }
      setMailNote("The stored PDF was accepted for delivery.");
      if (recipientKind === "other") {
        setOtherAddress("");
        setConfirmAddress("");
      }
    } catch {
      setDocError("Could not email the stored PDF.");
    } finally {
      setMailBusy(false);
    }
  }

  async function previewPdf(kind: "view" | "download") {
    if (!agreement || pdfBusy) return;
    setPdfBusy(true);
    setPdfError("");
    const tab = kind === "view" ? window.open("", "_blank") : null;
    if (tab) tab.opener = null;
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
      if (!pageOpen.current) {
        tab?.close();
        return;
      }
      if (!response.ok) {
        tab?.close();
        const body = (await response.json().catch(() => null)) as { error?: string } | null;
        setPdfError(body?.error || "Could not create the contract PDF.");
        return;
      }
      const blob = await response.blob();
      if (!pageOpen.current) {
        tab?.close();
        return;
      }
      const url = URL.createObjectURL(blob);
      if (pageOpen.current) setPdfBusy(false);
      if (kind === "view") {
        if (!tab) {
          setPdfError("Allow pop-ups to view the PDF.");
          return;
        }
        tab.location.href = url;
      } else {
        const link = document.createElement("a");
        link.href = url;
        link.download = `${agreement.agreementCode || "mac-repurchase-agreement"}.pdf`;
        link.click();
      }
      window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      tab?.close();
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
  const liveAgreement = agreement;

  const live =
    isLiveBookLabel(bookLabel(liveAgreement)) &&
    liveAgreement.status !== "signed" &&
    !liveAgreement.bookEnd;
  const openShell = shells.find((shell) => shell.status === "open");
  const share = openShell?.ltv || settings.maxLtv;
  const cap = watches.reduce(
    (sum, watch) => sum + maxPurchaseAmount(watch.valueLow, watch.valueHigh, share),
    0,
  );
  const held = liveWatchIds(book);
  const freePieces = timepieces.filter(
    (watch) =>
      watch.status === "appraised" &&
      watch.financeable &&
      !liveAgreement.watchIds.includes(watch.id) &&
      !held.has(watch.id),
  );

  async function addFreePiece(watchId: string) {
    const result = await addAgreementWatches(liveAgreement.id, [watchId]);
    if (!result.ok) {
      setPieceError(
        result.error === LIVE_WATCH_CONFLICT
          ? "That timepiece is already on a live repo."
          : "That timepiece is not free to add to this repo.",
      );
      return;
    }
    setPieceError("");
  }

  async function onRaiseAmount() {
    const n = Number(raiseAmount.replace(/[^0-9.]/g, ""));
    const result = await setAgreementAmount(liveAgreement.id, n);
    if (!result.ok) {
      setPieceError(
        result.error === "OVER_LTV"
          ? `The desk can purchase up to ${money(cap)} on these appraisals.`
          : result.error === "BELOW_CURRENT"
            ? "The sale amount can only be raised."
            : "Enter a sale amount the desk can purchase.",
      );
      return;
    }
    setPieceError("");
    setRaiseAmount("");
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Repurchase Agreement" backHref="/agreements" />
      <div className="flex-1 overflow-y-auto px-5 py-5 text-[13px] leading-relaxed text-mac-muted">
        <div className="mb-4 flex items-center justify-between rounded-xl border border-mac-line bg-mac-card p-3">
          <div>
            <span className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Book: {bookLabel(agreement)}</span>
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

        {live ? (
          <div className="mb-4 space-y-3 rounded-xl border border-mac-line bg-mac-card p-3">
            <p className="text-[12px] text-mac-muted">
              Free appraised timepieces can join this repo. You may raise the sale amount only up to
              the desk purchase cap of {money(cap)}.
            </p>
            {freePieces.length ? (
              <ul className="space-y-2">
                {freePieces.map((watch) => (
                  <li key={watch.id} className="flex items-center justify-between gap-3 text-[13px]">
                    <span>
                      {watch.brand} {watch.model}
                    </span>
                    <button
                      type="button"
                      className="text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                      onClick={() => addFreePiece(watch.id)}
                    >
                      Add to this repo
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="flex gap-2">
              <input
                aria-label="Raise sale amount"
                inputMode="numeric"
                value={raiseAmount}
                onChange={(event) => setRaiseAmount(event.target.value)}
                placeholder={money(Math.min(agreement.amount, cap || agreement.amount))}
                className="min-w-0 flex-1 bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
              />
              <button
                type="button"
                className="text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                onClick={onRaiseAmount}
              >
                Update amount
              </button>
            </div>
            {pieceError ? <p className="text-xs text-red-400">{pieceError}</p> : null}
          </div>
        ) : null}

        <article className="space-y-4 rounded-2xl bg-white p-5 text-[#1a1a1a] shadow-md font-sans">
          <h2 className="text-center text-sm font-semibold tracking-[0.12em] uppercase">
            Repurchase agreement
          </h2>
          <p className="text-center text-[12px] font-semibold text-[#0E2A44]">{PENDING_COUNSEL_LABEL}</p>
          {snapshot.ok && snapshot.value ? (
            <>
              {snapshot.value.facts.map((line) => (
                <p key={line}>{line}</p>
              ))}
              {snapshot.value.clauses.map((clause) => (
                <section key={clause.number}>
                  <h3 className="mb-1 text-xs font-semibold tracking-[0.12em] uppercase">
                    {clause.number}. {clause.heading}
                  </h3>
                  <p>{clause.body}</p>
                </section>
              ))}
              <div>
                <h3 className="mb-2 text-xs font-semibold tracking-[0.12em] uppercase">
                  Monthly repurchase schedule
                </h3>
                <table className="w-full text-left text-[12px]">
                  <thead>
                    <tr>
                      <th className="pb-1">Month</th>
                      <th className="pb-1">Date</th>
                      <th className="pb-1">Price</th>
                      <th className="pb-1">Basis</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.value.schedule.rows.map((row) => (
                      <tr key={row.month}>
                        <td>{row.month}</td>
                        <td>{row.date}</td>
                        <td>{moneyExact(row.price || 0)}</td>
                        <td>{row.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <>
              <p>Missing required facts: {snapshot.errors.join(", ").replaceAll("_", " ").toLowerCase()}.</p>
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
            </>
          )}
          {agreement.status === "signed" ? (
            <p className="font-semibold text-emerald-800">Signed {agreement.signedAt}</p>
          ) : null}
        </article>
        {bookMode === "live" && documents.some((row) => row.status === "stored") ? (
          <section className="mt-4 rounded-xl border border-mac-line bg-mac-card p-3">
            <h3 className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Stored document</h3>
            <p className="mt-1 text-[12px] text-mac-muted">{PENDING_COUNSEL_LABEL}</p>
            <ul className="mt-3 space-y-2">
              {documents.map((row) => (
                <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-mac-muted">
                  <span>
                    Version {row.version} · {row.status}
                    {row.checksum ? ` · ${row.checksum.slice(0, 8)}` : ""}
                  </span>
                  {row.status === "stored" ? (
                    <span className="flex gap-3">
                      <button
                        type="button"
                        className="text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                        onClick={() => void openStoredDocument(row.id, false)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="hidden md:inline text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                        onClick={() => void openStoredDocument(row.id, true)}
                      >
                        Download
                      </button>
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            {documents.some((row) => row.status === "stored") ? (
              <div className="mt-3 space-y-2">
                <button
                  type="button"
                  className="text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                  disabled={mailBusy}
                  onClick={() => void emailStoredDocument(documents.find((row) => row.status === "stored")?.id ?? "", "self")}
                >
                  Email me
                </button>
                <label className="block text-[11px] text-mac-faint">
                  Other email
                  <input
                    className="mt-1 w-full bg-transparent text-[13px] text-mac-fg outline-none"
                    value={otherAddress}
                    onChange={(event) => setOtherAddress(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <label className="block text-[11px] text-mac-faint">
                  Confirm other email
                  <input
                    className="mt-1 w-full bg-transparent text-[13px] text-mac-fg outline-none"
                    value={confirmAddress}
                    onChange={(event) => setConfirmAddress(event.target.value)}
                    autoComplete="off"
                  />
                </label>
                <button
                  type="button"
                  className="text-[11px] font-bold tracking-[0.14em] text-[#FCB040] uppercase"
                  disabled={mailBusy}
                  onClick={() => void emailStoredDocument(documents.find((row) => row.status === "stored")?.id ?? "", "other")}
                >
                  Email this address
                </button>
              </div>
            ) : null}
            {mailNote ? <p className="mt-2 text-[12px] text-mac-muted">{mailNote}</p> : null}
            {docError ? <p className="mt-2 text-xs text-red-400">{docError}</p> : null}
          </section>
        ) : null}
      </div>
      <div className="border-t border-mac-line bg-mac-card p-4">
        {bookMode === "unavailable" ? (
          <p className="mb-3 text-center text-[12px] text-mac-muted">
            Stored agreements are temporarily unavailable. Your agreement is safe. Try again shortly or
            write to info@mechartcap.com.
          </p>
        ) : null}
        {applied && bookMode === "browser" ? (
          <div className="mb-3 flex flex-col gap-2">
            <PillButton variant="navy" disabled={pdfBusy} onClick={() => void previewPdf("view")}>
              {pdfBusy ? "Preparing PDF…" : "View preview"}
            </PillButton>
            <div className="hidden md:block">
              <PillButton variant="navy" disabled={pdfBusy} onClick={() => void previewPdf("download")}>
                {pdfBusy ? "Preparing PDF…" : "Download contract PDF"}
              </PillButton>
            </div>
            <p className="text-center text-[11px] text-mac-faint">
              Temporary preview — not stored. {PENDING_COUNSEL_LABEL}
            </p>
          </div>
        ) : null}
        {pdfError ? <p className="mb-2 text-center text-[12px] text-red-300">{pdfError}</p> : null}
        <p className="mb-2 text-center text-[11px] text-mac-faint">
          Electronic signing is not available.
        </p>
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
