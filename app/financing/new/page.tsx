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
    [watch]
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
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader title="Financing estimator" backHref="/financing" />
      {watch ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={watch.images[0]} alt="" className="h-44 w-full object-cover" />
      ) : null}
      <form onSubmit={onSubmit} className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <Field label="Timepiece">
          <NativeSelect value={watchId} onChange={(e) => setWatchId(e.target.value)}>
            {appraised.length === 0 ? (
              <option className="bg-black">No appraised pieces yet</option>
            ) : (
              appraised.map((w) => (
                <option key={w.id} value={w.id} className="bg-black">
                  {w.brand} {w.model}
                </option>
              ))
            )}
          </NativeSelect>
        </Field>
        <Field label="Term (months)">
          <NativeSelect value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            {TERMS.map((t) => (
              <option key={t} value={t} className="bg-black">
                {t} months
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={`Enter amount up to ${maxAdvance ? money(maxAdvance) : "—"}`}>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder={maxAdvance ? String(Math.min(maxAdvance, 200000)) : "20000"}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <p className="text-[12px] text-white/45">
          Minimum amount for a financial agreement is {money(settings.minAdvance)}.
        </p>
        <Field label="Delivery method">
          <NativeSelect value={delivery} onChange={(e) => setDelivery(e.target.value)}>
            {DELIVERY_METHODS.map((d) => (
              <option key={d} className="bg-black">
                {d}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Email address">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <Field label="Watch owner's name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <label className="flex items-start gap-3 text-sm text-white/75">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1" />
          I confirm that I am at least {settings.ageMinimum} years old
        </label>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <PillButton type="submit">Get estimate</PillButton>
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
