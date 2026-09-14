"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState } from "react";
import { FileText } from "lucide-react";
import { LineField, NativeSelect } from "@/components/field";
import { ScreenHeader } from "@/components/screen-header";
import { DELIVERY_METHODS, TERMS, estimateAdvance, money } from "@/lib/catalog";
import { WatchPhoto } from "@/components/watch-photo";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

export function ApplicationForm({ backHref = "/collection" }: { backHref?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const { timepieces, user, createAgreement, settings, agreements } = useStore();
  const eligible = timepieces.filter((w) => w.status === "appraised" && w.financeable);
  const initialId = params.get("watch") || eligible[0]?.id || "";
  const [watchId, setWatchId] = useState(initialId);
  const [term, setTerm] = useState(8);
  const [amount, setAmount] = useState("");
  const [delivery, setDelivery] = useState(DELIVERY_METHODS[0]);
  const [email, setEmail] = useState(user?.email || "");
  const [name, setName] = useState(user?.name || "");
  const [adult, setAdult] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const watch = timepieces.find((w) => w.id === watchId) ?? eligible[0];
  const maxPurchase = watch ? estimateAdvance(watch.valueLow, watch.valueHigh, settings.maxLtv) : 0;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const n = Number(amount.replace(/[^0-9]/g, ""));
    if (!watch) {
      setError("Appraise a timepiece before sending an application.");
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
    if (maxPurchase && n > maxPurchase) {
      setError(`The desk can purchase up to ${money(maxPurchase)} on this appraisal.`);
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

      {watch ? (
        <div className="relative h-48 w-full overflow-hidden bg-black">
          <WatchPhoto src={watch.images[0]} watch={watch} alt={`${watch.brand} ${watch.model}`} showCaption />
        </div>
      ) : (
        <div className="flex h-48 items-center justify-center bg-mac-card px-6 text-center text-[13px] text-mac-muted">
          Appraise a timepiece in your collection to send an application.
        </div>
      )}

      <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 overflow-y-auto px-5 py-2">
          {eligible.length > 1 ? (
            <LineField label="Timepiece">
              <NativeSelect value={watch?.id || ""} onChange={(e) => setWatchId(e.target.value)}>
                {eligible.map((item) => (
                  <option key={item.id} value={item.id} className="bg-mac-card">
                    {item.brand} {item.model}
                  </option>
                ))}
              </NativeSelect>
            </LineField>
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
              onChange={(e) => setAmount(e.target.value)}
              placeholder={maxPurchase ? money(Math.min(20000, maxPurchase)) : "$20,000"}
              className="w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
            />
          </LineField>

          <LineField label="Delivery Method">
            <NativeSelect value={delivery} onChange={(e) => setDelivery(e.target.value)}>
              {DELIVERY_METHODS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>

          <LineField label="Email Address">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-transparent text-[15px] text-mac-fg outline-none"
            />
          </LineField>

          <LineField label="Watch Owner's Name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-transparent text-[15px] text-mac-fg outline-none"
            />
          </LineField>

          <label className="mt-5 flex items-center gap-3 text-[13px] text-mac-fg">
            <input
              type="checkbox"
              checked={adult}
              onChange={(e) => setAdult(e.target.checked)}
              className="h-4 w-4 accent-[#0E2A44]"
            />
            I confirm that I am at least 18 years old
          </label>

          {error ? <p className="mt-3 text-center text-xs text-red-400">{error}</p> : null}
        </div>

        <div className="px-5 py-4">
          <button
            type="submit"
            disabled={busy || !watch}
            className="mac-tap flex h-12 w-full items-center justify-center bg-[#0E2A44] text-[12px] font-semibold tracking-[0.18em] text-white uppercase disabled:opacity-40"
          >
            {busy ? "Sending…" : "Send Application"}
          </button>
        </div>
      </form>
    </main>
  );
}
