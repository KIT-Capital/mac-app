"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { FileText } from "lucide-react";
import { LineField, NativeSelect } from "@/components/field";
import { OfferSchedule } from "@/components/offer-schedule";
import { ScreenHeader } from "@/components/screen-header";
import { INTAKE_DELIVERY } from "@/components/request-sign-sheet";
import { TERMS, maxPurchaseAmount, money } from "@/lib/catalog";
import { WatchPhoto } from "@/components/watch-photo";
import {
  deskToday,
  heldWatchIds,
  isAppraisalCurrent,
  isUnderReview,
} from "@/lib/contract/repo-book.mjs";
import { applicationPurchaseShare } from "@/lib/contract/repo-scale.mjs";
import { useOwnedAssets } from "@/lib/ownership";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

const EMPTY_COPY = "Appraise a timepiece in your collection to send an application.";

function parseAmount(raw: string) {
  return Number(String(raw).replace(/[^0-9]/g, ""));
}

export function RequestBuilder({ backHref = "/collection" }: { backHref?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const {
    user,
    submitRequest,
    settings,
    shells,
    agreements: book,
    appraisalAttempts,
    applicationPurchaseShares,
  } = useStore();
  const { timepieces, agreements } = useOwnedAssets();
  const today = deskToday();
  const held = heldWatchIds(book, today);
  const restartIds = (params.get("watches") || "").split(",").filter(Boolean);
  const requestedId = params.get("watch") || restartIds[0] || "";
  // Only a fresh Accept (seven days, R42) on a free piece can be ticked. The
  // piece the collector arrived from leads, so the hero shows it first.
  const eligible = timepieces
    .filter(
      (w) =>
        w.status === "appraised" &&
        w.financeable &&
        !held.has(w.id) &&
        !isUnderReview(appraisalAttempts, w.id) &&
        isAppraisalCurrent(appraisalAttempts, w.id, today, w),
    )
    .sort((a, b) => Number(b.id === requestedId) - Number(a.id === requestedId));
  const expired = timepieces.filter(
    (w) =>
      w.status === "appraised" &&
      !held.has(w.id) &&
      !isAppraisalCurrent(appraisalAttempts, w.id, today, w),
  );
  // Start again names pieces that are now reserved elsewhere (R31).
  const omitted = restartIds
    .map((id) => timepieces.find((item) => item.id === id))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .filter((item) => !eligible.some((row) => row.id === item.id));
  const openShell = shells.find((s) => s.status === "open");
  // Everything eligible is ticked until the collector unticks it, so the set
  // survives pieces arriving after the first render. Start again still opens
  // with every free accepted piece selected (R30) and only notes omissions.
  const [unticked, setUnticked] = useState<string[]>([]);
  const [term, setTerm] = useState(settings.typicalTerm || 12);
  const [typedAmount, setTypedAmount] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const ticked = eligible.filter((w) => !unticked.includes(w.id));
  const hero = ticked[0] ?? eligible[0];
  const purchaseShare = applicationPurchaseShare(
    applicationPurchaseShares,
    settings,
    openShell,
    term,
  );
  const maxPurchase = ticked.reduce(
    (sum, w) => sum + maxPurchaseAmount(w.valueLow, w.valueHigh, purchaseShare),
    0,
  );
  const parsedTyped = typedAmount == null ? null : parseAmount(typedAmount);
  // null = still following the maximum; a cleared or zero field stays empty
  // so Apply can ask for an amount instead of sending the cap.
  const amountNumber = parsedTyped == null
    ? maxPurchase
    : Math.min(parsedTyped || 0, maxPurchase || 0);
  const amount = parsedTyped == null
    ? (maxPurchase ? maxPurchase.toLocaleString("en-US") : "")
    : (amountNumber ? amountNumber.toLocaleString("en-US") : "");

  function toggle(id: string, checked: boolean) {
    setUnticked((prev) => (checked ? prev.filter((item) => item !== id) : [...prev, id]));
  }

  function onAmountChange(raw: string) {
    const digits = raw.replace(/[^0-9]/g, "");
    if (!digits) {
      setTypedAmount("");
      return;
    }
    const n = Number(digits);
    setTypedAmount(Math.min(n, maxPurchase || n).toLocaleString("en-US"));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = amountNumber;
    if (!ticked.length) {
      setError("Tick at least one timepiece to send a request.");
      return;
    }
    if (!n) {
      setError("Enter the sale amount you are proposing.");
      return;
    }
    if (maxPurchase && n > maxPurchase) {
      setError(`The desk can purchase up to ${money(maxPurchase)} on this appraisal.`);
      return;
    }
    setBusy(true);
    setError("");
    const result = await submitRequest({
      watchIds: ticked.map((w) => w.id),
      amount: n,
      termMonths: term,
      delivery: INTAKE_DELIVERY,
      note: note.trim() || undefined,
    });
    if (!result.ok || !result.agreementId) {
      setBusy(false);
      setError(
        result.error === "LIVE_WATCH_CONFLICT"
          ? "That timepiece is already on a live repo."
          : result.error === "APPRAISAL_EXPIRED"
            ? "One of these appraisals expired. Send it for appraisal again."
            : result.error === "AMOUNT_ABOVE_CAP"
              ? `The desk can purchase up to ${money(maxPurchase)} on this appraisal.`
              : result.error === "AMOUNT_BELOW_MINIMUM"
                ? `The minimum sale amount is ${money(settings.minAdvance || 1000)}.`
                : result.error === "THROTTLED"
                  ? "Too many requests today. Try again tomorrow."
                  : "The request could not be sent.",
      );
      return;
    }
    if (user) {
      await sendAppEmail({
        kind: "repurchase",
        name: user.name,
        email: user.email,
        watch: ticked.map((w) => `${w.brand} ${w.model}`).join("; "),
        amount: String(n),
        termMonths: term,
        delivery: INTAKE_DELIVERY,
      });
    }
    setBusy(false);
    router.push(`/agreements/${result.agreementId}`);
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader
        title="Sale & Repurchase"
        backHref={backHref}
        right={
          agreements.length ? (
            <Link
              href="/agreements"
              aria-label="Agreements"
              className="mac-tap -mr-1 flex items-center justify-center text-white/80"
            >
              <FileText className="h-5 w-5" />
            </Link>
          ) : null
        }
      />

      {hero ? (
        <div className="relative h-48 w-full overflow-hidden bg-black">
          <WatchPhoto src={hero.images[0]} watch={hero} alt={`${hero.brand} ${hero.model}`} showCaption />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center bg-mac-card px-6 text-center text-[13px] text-mac-muted">
          {EMPTY_COPY}
        </div>
      )}

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {omitted.length ? (
            <p className="border-b border-mac-line py-2.5 text-[13px] text-mac-muted">
              {omitted.length === 1
                ? `${omitted[0].brand} ${omitted[0].model} is already on another request.`
                : "Some of those pieces are already on another request."}
            </p>
          ) : null}

          {eligible.length ? (
            <fieldset className="border-b border-mac-line py-2.5">
              <legend className="text-[12px] text-mac-faint">Timepieces</legend>
              <ul className="mt-1 space-y-2">
                {eligible.map((item) => (
                  <li key={item.id}>
                    <label className="flex items-center gap-3 text-[15px] text-mac-fg">
                      <input
                        type="checkbox"
                        checked={!unticked.includes(item.id)}
                        onChange={(e) => toggle(item.id, e.target.checked)}
                        className="h-4 w-4 accent-[#0E2A44]"
                      />
                      {item.brand} {item.model}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          ) : null}

          {expired.length ? (
            <ul className="border-b border-mac-line py-2.5 text-[13px] text-mac-muted">
              {expired.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-1">
                  <span>
                    {item.brand} {item.model}
                  </span>
                  <span className="text-[12px] text-mac-faint">Appraisal expired — send again</span>
                </li>
              ))}
            </ul>
          ) : null}

          <LineField label="Term (months)">
            <NativeSelect value={term} onChange={(e) => setTerm(Number(e.target.value))}>
              {TERMS.map((item) => (
                <option key={item} value={item} className="bg-mac-card">
                  {item} months
                </option>
              ))}
            </NativeSelect>
          </LineField>

          <LineField label={maxPurchase ? `Enter Amount Up to ${money(maxPurchase)}` : "Enter Amount"}>
            <input
              inputMode="numeric"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder={maxPurchase ? money(maxPurchase) : "$20,000"}
              className="w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
            />
          </LineField>

          <div className="border-b border-mac-line py-2.5">
            <label
              htmlFor="request-note"
              className="text-[10px] font-semibold tracking-[0.16em] text-mac-faint uppercase"
            >
              Anything MAC should know?
            </label>
            <textarea
              id="request-note"
              value={note}
              maxLength={256}
              rows={3}
              onChange={(event) => setNote(event.target.value)}
              className="mt-2 w-full rounded-xl border border-mac-line bg-white/5 p-3 text-[13px] text-mac-fg"
              placeholder="Optional"
            />
          </div>

          {error ? <p className="mt-3 text-center text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="sticky bottom-0 border-t border-mac-line bg-mac-bg px-5 pt-3">
          <OfferSchedule
            amount={amountNumber}
            maxPurchase={maxPurchase}
            termMonths={term}
            startDate={today}
            scale={openShell
              ? { ...settings, ...openShell, purchaseShare }
              : { ...settings, purchaseShare }}
          />
          <div className="py-4">
            <button
              type="submit"
              disabled={busy || !ticked.length}
              className="mac-tap flex h-12 w-full items-center justify-center bg-[#0E2A44] text-[12px] font-semibold tracking-[0.18em] text-white uppercase disabled:opacity-40"
            >
              {busy ? "Sending…" : "Apply"}
            </button>
          </div>
        </div>
      </form>
    </main>
  );
}

export const ApplicationForm = RequestBuilder;
