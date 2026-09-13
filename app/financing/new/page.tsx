"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { DELIVERY_METHODS, TERMS } from "@/lib/catalog";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

function ApplicationForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { timepieces, user, createAgreement, settings } = useStore();
  const eligible = timepieces.filter((w) => w.status === "appraised" && w.financeable);
  const initialId = params.get("watch") || eligible[0]?.id || "";
  const [watchId, setWatchId] = useState(initialId);
  const [term, setTerm] = useState(12);
  const [amount, setAmount] = useState("");
  const [delivery, setDelivery] = useState(DELIVERY_METHODS[0]);
  const [email, setEmail] = useState(user?.email || "");
  const [name, setName] = useState(user?.name || "");
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const watch = timepieces.find((w) => w.id === watchId);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[^0-9]/g, ""));
    if (!watch) {
      setError("Select an appraised timepiece that is eligible for repurchase.");
      return;
    }
    if (!adult) {
      setError("Confirm you are at least 18 years old.");
      return;
    }
    if (!n) {
      setError("Enter the sale amount you are proposing.");
      return;
    }
    setBusy(true);
    const agreement = createAgreement({
      watchIds: [watch.id],
      amount: n,
      termMonths: term,
      delivery,
      ownerName: name,
      email,
    });
    await sendAppEmail({
      kind: "financing",
      name,
      email,
      watch: `${watch.brand} ${watch.model}`,
      amount: String(n),
      termMonths: term,
      delivery,
      deskEmail: settings.financingEmail,
    });
    setBusy(false);
    router.push(`/agreements/${agreement.id}`);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Repurchase application" backHref="/financing" />
      {watch ? (
        <div className="relative h-44 w-full bg-[#090C12] overflow-hidden border-b border-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={watch.images[0]} alt="" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#10141D] via-transparent to-transparent" />
          <div className="absolute bottom-3 left-4">
            <span className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Timepiece to sell</span>
            <p className="text-[15px] font-semibold text-white">{watch.brand} {watch.model}</p>
          </div>
        </div>
      ) : null}
      <form onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <p className="text-[12px] leading-relaxed text-white/65">
          MAC would purchase this timepiece. You may buy it back later on our preset scale. This
          application is not a loan request. The desk confirms the buyback price and custody after
          it arrives.
        </p>
        <Field label="Selected Timepiece">
          <NativeSelect value={watchId} onChange={(e) => setWatchId(e.target.value)}>
            {eligible.length === 0 ? (
              <option className="bg-[#161B24]">No appraised pieces yet</option>
            ) : (
              eligible.map((w) => (
                <option key={w.id} value={w.id} className="bg-[#161B24]">
                  {w.brand} {w.model}
                </option>
              ))
            )}
          </NativeSelect>
        </Field>
        <Field label="Proposed repurchase term">
          <NativeSelect value={term} onChange={(e) => setTerm(Number(e.target.value))}>
            {TERMS.map((t) => (
              <option key={t} value={t} className="bg-[#161B24]">
                {t} Months
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Proposed sale amount (what MAC would pay)">
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount in USD"
            className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
          />
        </Field>
        <Field label="How you will deliver the piece">
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
        <Field label="Legal seller name">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent text-[15px] text-white outline-none"
          />
        </Field>
        <label className="flex items-start gap-3 text-[13px] text-white/75 cursor-pointer pt-1">
          <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-0.5 h-4 w-4 rounded accent-[#FCB040]" />
          <span>
            I confirm that I am at least {settings.ageMinimum} years old and authorized to sell this
            timepiece to Mechanical Art Capital.
          </span>
        </label>
        {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
        <PillButton type="submit" variant="gold" className="mt-2" disabled={busy}>
          {busy ? "Sending application…" : "Send Application"}
        </PillButton>
      </form>
    </main>
  );
}

export default function NewFinancingPage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-white/40">Loading application</div>}>
      <ApplicationForm />
    </Suspense>
  );
}
