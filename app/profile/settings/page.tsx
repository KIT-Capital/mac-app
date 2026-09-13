"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { user, updateProfile } = useStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [saved, setSaved] = useState(false);

  function onSave(e: FormEvent) {
    e.preventDefault();
    updateProfile({ name, email, phone });
    setSaved(true);
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Account Settings" backHref="/profile" />
      <form onSubmit={onSave} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
            Appearance
          </p>
          <AppearanceToggle />
          <p className="mt-2 text-[11px] text-mac-faint">
            Dark and light match the November 2022 collector screens.
          </p>
        </div>
        <Field label="Full Legal Name">
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-transparent text-[15px] text-mac-fg outline-none" />
        </Field>
        <Field label="Direct Email">
          <input value={email} onChange={(e) => setEmail(e.target.value)} className="w-full bg-transparent text-[15px] text-mac-fg outline-none" />
        </Field>
        <Field label="Verified Phone">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full bg-transparent text-[15px] text-mac-fg outline-none" />
        </Field>
        <p className="text-[12px] text-mac-muted">
          Appearance, notices, and contact method live on{" "}
          <Link href="/profile/preferences" className="underline underline-offset-2">
            Preferences
          </Link>
          . Partner codes live on{" "}
          <Link href="/profile/promo" className="underline underline-offset-2">
            Promo Codes
          </Link>
          .
        </p>
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
