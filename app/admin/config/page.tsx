"use client";

import { FormEvent, useState } from "react";
import { AdminChrome } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { useStore } from "@/lib/store";

export default function AdminConfigPage() {
  const { settings, updateSettings } = useStore();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    updateSettings(form);
    setSaved(true);
  }

  return (
    <AdminChrome title="Configure the app">
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5">
        <p className="text-sm text-white/55">
          These values drive the collector app: LTV caps, minimum advance, membership price, vault copy, and
          contact lines.
        </p>
        {(
          [
            ["companyName", "Company name"],
            ["phone", "Phone"],
            ["email", "Info email"],
            ["financingEmail", "Financing email"],
            ["handle", "Handle"],
            ["vaultLocation", "Vault"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              value={form[key]}
              onChange={(e) => setForm({ ...form, [key]: e.target.value })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
        ))}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Starting rate">
            <input
              type="number"
              step="0.01"
              value={form.startingRate}
              onChange={(e) => setForm({ ...form, startingRate: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Max LTV">
            <input
              type="number"
              step="0.01"
              value={form.maxLtv}
              onChange={(e) => setForm({ ...form, maxLtv: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Min advance">
            <input
              type="number"
              value={form.minAdvance}
              onChange={(e) => setForm({ ...form, minAdvance: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Membership $/mo">
            <input
              type="number"
              step="0.01"
              value={form.membershipMonthly}
              onChange={(e) => setForm({ ...form, membershipMonthly: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Typical term">
            <input
              type="number"
              value={form.typicalTerm}
              onChange={(e) => setForm({ ...form, typicalTerm: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Close days">
            <input
              type="number"
              value={form.closeBusinessDays}
              onChange={(e) => setForm({ ...form, closeBusinessDays: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
        </div>
        <label className="flex items-center gap-3 text-sm text-white/70">
          <input
            type="checkbox"
            checked={form.requireFourPhotos}
            onChange={(e) => setForm({ ...form, requireFourPhotos: e.target.checked })}
          />
          Require front / back / left photos
        </label>
        {saved ? <p className="text-sm text-[#FCB040]">Configuration saved to this device.</p> : null}
        <PillButton type="submit">Save configuration</PillButton>
      </form>
    </AdminChrome>
  );
}
