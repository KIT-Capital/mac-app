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
    <main className="flex flex-1 flex-col">
      <ScreenHeader title="Settings" backHref="/profile" />
      <form onSubmit={onSave} className="flex-1 space-y-6 px-6 py-8">
        <Field label="Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Promo code">
          <input
            value={promo}
            onChange={(e) => setPromo(e.target.value)}
            placeholder="HOUSE65"
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <button
          type="button"
          onClick={() =>
            setPromoMsg(
              promo.trim().toUpperCase() === "HOUSE65"
                ? "Code applied. Next repo desk fee is waived."
                : "That code is not recognized."
            )
          }
          className="text-[12px] text-[#FCB040]"
        >
          Apply code
        </button>
        {promoMsg ? <p className="text-sm text-white/70">{promoMsg}</p> : null}
        {saved ? <p className="text-sm text-[#FCB040]">Profile saved.</p> : null}
        <PillButton type="submit">Save profile</PillButton>
      </form>
    </main>
  );
}
