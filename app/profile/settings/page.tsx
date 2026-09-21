"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
import { WatchPhoto } from "@/components/watch-photo";
import { isReservedDeskEmail } from "@/lib/auth";
import { isRetailRole } from "@/lib/roles.mjs";
import type { RetailRole } from "@/lib/types";
import { readImagePreview } from "@/lib/image";
import { useStore } from "@/lib/store";

export default function SettingsPage() {
  const { user, updateProfile } = useStore();
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [phone, setPhone] = useState(user?.phone || "");
  const [partyKind, setPartyKind] = useState<RetailRole>(
    isRetailRole(user?.role) ? user.role : "collector",
  );
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [portraitError, setPortraitError] = useState("");

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (isRetailRole(user?.role) && isReservedDeskEmail(email)) {
      setError("That address is reserved.");
      setSaved(false);
      return;
    }
    updateProfile({ name, email, phone, role: partyKind });
    setError("");
    setSaved(true);
  }

  async function onPortrait(file?: File) {
    if (!file) return;
    try {
      const data = await readImagePreview(file);
      updateProfile({ avatar: data.dataUrl });
      setPortraitError("");
    } catch {
      setPortraitError("That portrait could not be read.");
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Account Settings" backHref="/profile" />
      <form onSubmit={onSave} className="flex-1 space-y-4 overflow-y-auto px-6 py-6">
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
            Appearance
          </p>
          <AppearanceToggle />
          <p className="mt-2 text-[11px] text-mac-faint">
            Dark and light match the November 2022 collector screens.
          </p>
        </div>
        <div>
          <p className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
            Portrait
          </p>
          <label className="flex cursor-pointer items-center gap-4">
            <span className="h-16 w-16 overflow-hidden rounded-full border border-mac-line bg-mac-card">
              <WatchPhoto src={user?.avatar} watch={{ band: "bracelet" }} alt="" />
            </span>
            <span className="text-[13px] text-mac-muted">
              Upload a photo. If none is on file, MAC shows a photorealistic illustration.
            </span>
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => onPortrait(e.target.files?.[0])}
            />
          </label>
          {portraitError ? <p className="mt-2 text-[12px] text-red-400">{portraitError}</p> : null}
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
        {isRetailRole(user?.role) ? (
          <fieldset className="space-y-3">
            <legend className="mb-2 text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
              How you use MAC
            </legend>
            <label className="flex items-start gap-3 cursor-pointer text-[13px] text-mac-muted">
              <input
                type="radio"
                name="party-kind"
                checked={partyKind === "collector"}
                onChange={() => setPartyKind("collector")}
                className="mt-1 accent-mac-gold"
              />
              <span>
                <span className="block text-mac-fg">Collector</span>
                Consumer collection. Changing this does not rewrite a repo already signed.
              </span>
            </label>
            <label className="flex items-start gap-3 cursor-pointer text-[13px] text-mac-muted">
              <input
                type="radio"
                name="party-kind"
                checked={partyKind === "dealer"}
                onChange={() => setPartyKind("dealer")}
                className="mt-1 accent-mac-gold"
              />
              <span>
                <span className="block text-mac-fg">Watch business</span>
                Shop or wholesale book raising cash against a collection. Not a loan.
              </span>
            </label>
          </fieldset>
        ) : null}
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
        {error ? (
          <p className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-center text-xs text-red-300">
            {error}
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
