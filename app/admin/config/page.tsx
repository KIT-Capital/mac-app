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
          Internal desk settings. Collectors do not see custody location or the pricing scale until
          they send an application. Never present this as a loan.
        </p>
        {(
          [
            ["companyName", "Company name"],
            ["phone", "Phone"],
            ["email", "Info email"],
            ["financingEmail", "Desk email"],
            ["handle", "Handle"],
            ["vaultLocation", "Custody location"],
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
          <Field label="Buyback scale (internal)">
            <input
              type="number"
              step="0.01"
              value={form.startingRate}
              onChange={(e) => setForm({ ...form, startingRate: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Max purchase vs appraisal">
            <input
              type="number"
              step="0.01"
              value={form.maxLtv}
              onChange={(e) => setForm({ ...form, maxLtv: Number(e.target.value) })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Min purchase">
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
        <PillButton type="submit" variant="gold" className="mt-4">
          Save Configuration
        </PillButton>
      </form>
    </AdminChrome>
  );
}
