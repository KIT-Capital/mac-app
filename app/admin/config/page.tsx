"use client";

import { FormEvent, useState } from "react";
import { AdminScaleFields } from "@/components/admin-scale-fields";
import { AdminChrome } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { settingsToTerms } from "@/lib/contract/repo-scale.mjs";
import { useStore } from "@/lib/store";

export default function AdminConfigPage() {
  const { settings, updateSettings } = useStore();
  const [form, setForm] = useState(settings);
  const [saved, setSaved] = useState(false);
  const scale = settingsToTerms(form, form.typicalTerm);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    updateSettings({
      ...form,
      maxLtv: scale.purchaseShare,
      startingRate: scale.annualAdjustment,
      setupFee: scale.setupFee,
      earlyRepurchaseAmount: scale.earlyRepurchaseAmount,
      brokerFee: scale.brokerFee,
      minMonths: scale.minMonths,
      earlyStartMonth: scale.earlyStartMonth,
      earlyUntilMonth: scale.earlyUntilMonth,
    });
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
        <h2 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Default repo scale</h2>
        <AdminScaleFields
          value={scale}
          onChange={(next) =>
            setForm({
              ...form,
              maxLtv: next.purchaseShare,
              startingRate: next.annualAdjustment,
              setupFee: next.setupFee,
              earlyRepurchaseAmount: next.earlyRepurchaseAmount,
              brokerFee: next.brokerFee,
              minMonths: next.minMonths,
              earlyStartMonth: next.earlyStartMonth,
              earlyUntilMonth: next.earlyUntilMonth,
            })
          }
        />
        <div className="grid grid-cols-2 gap-4">
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
          Require the five guided shots (front, back, left, right, clasp)
        </label>
        {saved ? <p className="text-sm text-[#FCB040]">Configuration saved to this device.</p> : null}
        <PillButton type="submit" variant="gold" className="mt-4">
          Save Configuration
        </PillButton>
      </form>
    </AdminChrome>
  );
}
