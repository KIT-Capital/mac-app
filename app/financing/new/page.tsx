"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { DELIVERY_METHODS, TERMS, estimateAdvance, money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

function EstimatorForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { timepieces, user, createAgreement, settings } = useStore();
  const appraised = timepieces.filter((w) => w.status === "appraised" && w.financeable);
  const initialId = params.get("watch") || appraised[0]?.id || "";
  const [watchId, setWatchId] = useState(initialId);
  const [term, setTerm] = useState(12);
  const [amount, setAmount] = useState("");
  const [delivery, setDelivery] = useState(DELIVERY_METHODS[0]);
  const [email, setEmail] = useState(user?.email || "");
  const [name, setName] = useState(user?.name || "");
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState("");

  const watch = timepieces.find((w) => w.id === watchId);
  const maxAdvance = useMemo(
    () => estimateAdvance(watch?.valueLow, watch?.valueHigh, settings.maxLtv),
    [watch, settings.maxLtv]
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[^0-9]/g, ""));
    if (!watch) {
      setError("Select an appraised, financeable timepiece.");
      return;
    }
    if (!adult) {
      setError("Confirm you are at least 18 years old.");
      return;
    }
    if (n < settings.minAdvance) {
      setError(`Minimum amount for a financial agreement is ${money(settings.minAdvance)}.`);
      return;
    }
    if (n > maxAdvance) {
      setError(`Amount cannot exceed ${money(maxAdvance)} for this collateral.`);
      return;
    }
    const agreement = createAgreement({
      watchIds: [watch.id],
      amount: n,
      termMonths: term,
      delivery,
      ownerName: name,
      email,
    });
    router.push(`/agreements/${agreement.id}`);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Financing Estimator" backHref="/financing" />
      {watch ? (
        <div className="relative h-44 w-full bg-[#090C12] overflow-hidden border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={watch.images[0]} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#10141D] via-transparent to-transparent" />
          <div className="absolute bottom-3 left-4">
            <span className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Selected Collateral</span>
            <p className="text-[15px] font-semibold text-white">{watch.brand} {watch.model}</p>
          </div>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <Field label="Selected Timepiece">
          <NativeSelect value={watchId} onChange={(e) => setWatchId(e.target.value)}>
            {appraised.length === 0 ? (
              <option className="bg-[#161B24]">No appraised pieces yet</option>
            ) : (
              appraised.map((w) => (
                <option key={w.id} value={w.id} className="bg-[#161B24]">
                  {w.brand} {w.model}
                </option>
              ))
            )}
          </NativeSelect>
        </Field>
        <Field label="Repurchase Term (Months)">
          <NativeSelect value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            {TERMS.map((t) => (
              <option key={t} value={t} className="bg-[#161B24]">
                {t} Months (Typical liquidity term)
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={`Requested Advance (Max ${maxAdvance ? money(maxAdvance) : "—"})`}>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={maxAdvance ? String(Math.min(maxAdvance, 200000)) : "20000"}
            className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
          />
        </Field>
        <p className="text-[11px] text-white/50">
          Minimum advance is {money(settings.minAdvance)}. Interest begins at {Math.round(settings.startingRate * 100)}% plus custody fees.
        </p>
        <Field label="Custody & Delivery Method">
          <NativeSelect value={delivery} onChange={(e) => setDelivery(e.target.value)}>
            {DELIVERY_METHODS.map((d) => (
              <option key={d} className="bg-[#161B24]">
                {d}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Direct Email Address">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent text-[15px] text-white outline-none"
          />
        </Field>
        <Field label="Beneficial Watch Owner Name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-[15px] text-white outline-none"
          />
        </Field>
        <label className="flex items-start gap-3 text-[13px] text-white/75 cursor-pointer pt-1">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-[#FCB040]" />
          <span>I confirm that I am at least {settings.ageMinimum} years old and authorized to pledge this asset.</span>
        </label>
        {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
        <PillButton type="submit" variant="gold" className="mt-2">
          Generate Agreement Draft
        </PillButton>
      </form>
    </main>
  );
}

export default function NewFinancingPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-white/40">Loading estimator</div>}>
      <EstimatorForm />
    </Suspense>
  );
}
