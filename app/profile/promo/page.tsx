"use client";

import { FormEvent, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";

export default function PromoCodesPage() {
  const [code, setCode] = useState("");
  const [applied, setApplied] = useState<string | null>(null);
  const [error, setError] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const next = code.trim().toUpperCase();
    if (!next) {
      setError("Enter a promo code from the desk.");
      return;
    }
    if (next === "HOUSE65") {
      setApplied(next);
      setError("");
      setCode("");
      return;
    }
    setError("That code is not recognized.");
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Promo Codes" backHref="/profile" />
      <form onSubmit={onSubmit} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        <p className="text-[13px] leading-relaxed text-mac-muted">
          Desk partners sometimes issue a code for a complimentary membership month. Codes are
          applied to your account, not to a repurchase.
        </p>

        {applied ? (
          <div className="bg-mac-card px-4 py-4">
            <p className="text-[10px] tracking-[0.16em] text-mac-faint uppercase">Applied</p>
            <p className="mt-1 text-[18px] font-medium tracking-[0.08em]">{applied}</p>
            <p className="mt-2 text-[12px] text-mac-muted">
              Next membership month is complimentary.
            </p>
          </div>
        ) : (
          <div className="bg-mac-card px-4 py-8 text-center">
            <p className="text-[15px] text-mac-fg">No codes applied</p>
            <p className="mt-1 text-[12px] text-mac-muted">
              Ask your desk contact if a partner code is available.
            </p>
          </div>
        )}

        <Field label="Promo Code">
          <input
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError("");
            }}
            placeholder="HOUSE65"
            className="w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint uppercase"
          />
        </Field>
        {error ? <p className="text-[12px] text-red-400">{error}</p> : null}
        <PillButton type="submit">Apply Code</PillButton>
      </form>
    </main>
  );
}
