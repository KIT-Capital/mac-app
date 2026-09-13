"use client";

import { FormEvent, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { user, updateProfile } = useStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [promo, setPromo] = useState("");
  const [saved, setSaved] = useState(false);
  const [promoMsg, setPromoMsg] = useState("");

  function onSave(e: FormEvent) {
    e.preventDefault();
    updateProfile({ name, email, phone });
    setSaved(true);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Account Settings" backHref="/profile" />
      <form onSubmit={onSave} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        <Field label="Full Legal Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent text-[15px] text-white outline-none" />
        </Field>
        <Field label="Direct Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent text-[15px] text-white outline-none" />
        </Field>
        <Field label="Verified Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-transparent text-[15px] text-white outline-none" />
        </Field>
        <Field label="Partner / Desk Promo Code">
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="e.g. HOUSE65"
            className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/30 uppercase"
          />
        </Field>
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() =>
              setPromoMsg(
                promo.trim().toUpperCase() === "HOUSE65"
                  ? "✓ Code verified: Next repo origination fee is 100% waived."
                  : "Code not recognized by New York desk."
              )
            }
            className="text-[12px] font-semibold text-[#FCB040] hover:underline"
          >
            Verify Promo Code
          </button>
        </div>
        {promoMsg ? (
          <p className="rounded-xl border border-white/10 bg-[#161B24] p-3 text-xs text-white/80">
            {promoMsg}
          </p>
        ) : null}
        {saved ? (
          <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-center text-xs text-emerald-300">
            Profile successfully updated.
          </p>
        ) : null}
        <div className="pt-2">
          <PillButton type="submit" variant="gold">Save Changes</PillButton>
        </div>
      </form>
    </main>
  );
}
