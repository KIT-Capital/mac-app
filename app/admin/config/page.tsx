"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AdminScaleFields } from "@/components/admin-scale-fields";
import { AdminChrome } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { settingsToTerms } from "@/lib/contract/repo-scale.mjs";
import { isSuperAdmin } from "@/lib/roles.mjs";
import { BRAND_PRESETS, SERVER_SETTING_KEYS } from "@/lib/theme";
import { useStore } from "@/lib/store";
import {
  DEFAULT_REQUIRED_PHOTO_KINDS,
  TIMEPIECE_SHOTS,
  normalizeRequiredPhotoKinds,
} from "@/lib/timepiece-shots.mjs";
import type { AppSettings, PhotoKind } from "@/lib/types";

export default function AdminConfigPage() {
  const { bookMode, settings, updateSettings, user } = useStore();
  const canEditPhotoPolicy = isSuperAdmin(user);
  const [form, setForm] = useState(settings);
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const [busy, setBusy] = useState(false);
  const dirtyFields = useRef(new Set<keyof AppSettings>());
  const scale = settingsToTerms(form, form.typicalTerm);

  useEffect(() => {
    setForm((current) => {
      const next = { ...current };
      for (const key of Object.keys(settings) as (keyof AppSettings)[]) {
        if (!dirtyFields.current.has(key)) {
          (next[key] as AppSettings[typeof key]) = settings[key];
        }
      }
      return next;
    });
  }, [settings]);

  function updateField<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    dirtyFields.current.add(key);
    setResult(null);
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateScale(next: ReturnType<typeof settingsToTerms>) {
    const patch = {
      maxLtv: next.purchaseShare,
      startingRate: next.annualAdjustment,
      setupFee: next.setupFee,
      earlyRepurchaseAmount: next.earlyRepurchaseAmount,
      brokerFee: next.brokerFee,
      minMonths: next.minMonths,
      earlyStartMonth: next.earlyStartMonth,
      earlyUntilMonth: next.earlyUntilMonth,
    };
    for (const [key, value] of Object.entries(patch) as [keyof typeof patch, number][]) {
      if (form[key] !== value) dirtyFields.current.add(key);
    }
    setResult(null);
    setForm((current) => ({ ...current, ...patch }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    try {
      const normalized = {
        ...form,
        maxLtv: scale.purchaseShare,
        startingRate: scale.annualAdjustment,
        setupFee: scale.setupFee,
        earlyRepurchaseAmount: scale.earlyRepurchaseAmount,
        brokerFee: scale.brokerFee,
        minMonths: scale.minMonths,
        earlyStartMonth: scale.earlyStartMonth,
        earlyUntilMonth: scale.earlyUntilMonth,
      };
      const patch = bookMode === "live"
        ? Object.fromEntries(
            SERVER_SETTING_KEYS
              .filter((key) => dirtyFields.current.has(key))
              .map((key) => [key, normalized[key]]),
          ) as Partial<AppSettings>
        : normalized;
      const acknowledgement = await updateSettings(patch);
      if (acknowledgement.ok) dirtyFields.current.clear();
      setResult(acknowledgement.ok ? "saved" : "failed");
    } catch {
      setResult("failed");
    } finally {
      setBusy(false);
    }
  }

  if (bookMode === "unknown") {
    return (
      <AdminChrome title="Configure the app">
        <p className="mx-auto max-w-xl text-sm text-white/55">Loading desk settings…</p>
      </AdminChrome>
    );
  }

  return (
    <AdminChrome title="Configure the app">
      <form onSubmit={onSubmit} className="mx-auto max-w-xl space-y-5">
        <fieldset disabled={busy} className="contents">
        <p className="text-sm text-white/55">
          Internal desk settings. Collectors do not see custody location or the pricing scale until
          they send an application. Never present this as a loan.
        </p>
        {bookMode === "browser" ? (
          [
            ["companyName", "Company name"],
            ["phone", "Phone"],
            ["email", "Info email"],
            ["financingEmail", "Desk email"],
            ["handle", "Handle"],
          ] as const
        ).map(([key, label]) => (
          <Field key={key} label={label}>
            <input
              value={form[key]}
              onChange={(e) => updateField(key, e.target.value)}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
        )) : null}
        <Field label="Custody location">
          <input
            value={form.vaultLocation}
            onChange={(e) => updateField("vaultLocation", e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <h2 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Default repo scale</h2>
        <AdminScaleFields
          value={scale}
          onChange={updateScale}
        />
        <div className="grid grid-cols-2 gap-4">
          {bookMode === "browser" ? (
            <Field label="Min purchase">
              <input
                type="number"
                value={form.minAdvance}
                onChange={(e) => updateField("minAdvance", Number(e.target.value))}
                className="w-full bg-transparent py-1 text-[16px] outline-none"
              />
            </Field>
          ) : null}
          <Field label="Membership $/mo">
            <input
              type="number"
              step="0.01"
              value={form.membershipMonthly}
              onChange={(e) => updateField("membershipMonthly", Number(e.target.value))}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <Field label="Typical term">
            <input
              type="number"
              value={form.typicalTerm}
              onChange={(e) => updateField("typicalTerm", Number(e.target.value))}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          {bookMode === "browser" ? (
            <Field label="Close days">
              <input
                type="number"
                value={form.closeBusinessDays}
                onChange={(e) => updateField("closeBusinessDays", Number(e.target.value))}
                className="w-full bg-transparent py-1 text-[16px] outline-none"
              />
            </Field>
          ) : null}
        </div>
        <fieldset className="space-y-3 border-t border-white/10 pt-5">
          <legend className="text-[11px] tracking-[0.16em] text-white/50 uppercase">
            Branding
          </legend>
          <p className="max-w-2xl text-sm text-white/55">
            {isSuperAdmin(user)
              ? "A preset sets the company name, mark, and palette together. MB&F colors are sampled until official assets arrive."
              : "Only a super admin can change the brand preset."}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {Object.values(BRAND_PRESETS).map((preset) => {
              const selected = form.brandPreset === preset.id;
              return (
                <label
                  key={preset.id}
                  className={`flex flex-col gap-2 border p-3 ${
                    selected ? "border-mac-gold" : "border-white/20"
                  } ${isSuperAdmin(user) ? "cursor-pointer" : "cursor-default opacity-80"}`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="brandPreset"
                      value={preset.id}
                      checked={selected}
                      disabled={!isSuperAdmin(user)}
                      onChange={() => updateField("brandPreset", preset.id)}
                    />
                    <span className="text-sm text-white">{preset.companyName}</span>
                  </span>
                  <span className="flex h-8 gap-1">
                    <span className="flex-1" style={{ background: preset.palette.primary }} />
                    <span className="flex-1" style={{ background: preset.palette.accent }} />
                    <span className="flex-1" style={{ background: preset.palette.soft }} />
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
        <fieldset className="space-y-3 border-t border-white/10 pt-5">
          <legend className="text-[11px] tracking-[0.16em] text-white/50 uppercase">
            Required photographs
          </legend>
          <p className="max-w-2xl text-sm text-white/55">
            {canEditPhotoPolicy
              ? "The five guided shots are always required. Tick any further photograph a collector must supply before they can save a timepiece."
              : "A super admin sets which photographs a collector must supply."}
          </p>
          <div className="flex flex-wrap gap-4">
            {TIMEPIECE_SHOTS.map((shot) => {
              const fixed = DEFAULT_REQUIRED_PHOTO_KINDS.includes(shot.kind);
              const checked = form.requiredPhotoKinds.includes(shot.kind as PhotoKind);
              return (
                <label
                  key={shot.kind}
                  className="flex items-center gap-2 text-sm text-white/70"
                  title={fixed ? "Always required" : undefined}
                >
                  <input
                    type="checkbox"
                    checked={fixed || checked}
                    disabled={fixed || !canEditPhotoPolicy}
                    onChange={(e) =>
                      updateField(
                        "requiredPhotoKinds",
                        normalizeRequiredPhotoKinds(
                          e.target.checked
                            ? [...form.requiredPhotoKinds, shot.kind]
                            : form.requiredPhotoKinds.filter((kind) => kind !== shot.kind),
                        ) as PhotoKind[],
                      )
                    }
                  />
                  {shot.kind}
                  {fixed ? <span className="text-white/35">(always)</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>
        {result === "saved" ? (
          <p className="text-sm text-mac-gold">
            {bookMode === "live"
              ? "Pricing and custody settings saved on the MAC server."
              : "Configuration saved to this device."}
          </p>
        ) : null}
        {result === "failed" ? (
          <p className="text-sm text-red-300">Configuration could not be saved.</p>
        ) : null}
        <PillButton type="submit" variant="gold" className="mt-4">
          {busy ? "Saving…" : "Save Configuration"}
        </PillButton>
        </fieldset>
      </form>
    </AdminChrome>
  );
}
