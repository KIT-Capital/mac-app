"use client";

import { Field } from "@/components/field";
import type { RepoScaleTerms } from "@/lib/types";

function percent(value: number) {
  return Math.round(value * 1000) / 10;
}

export function AdminScaleFields({
  value,
  onChange,
}: {
  value: RepoScaleTerms;
  onChange: (next: RepoScaleTerms) => void;
}) {
  function setPercent(key: keyof RepoScaleTerms, raw: string) {
    if (!raw.trim()) return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    onChange({ ...value, [key]: next / 100 });
  }

  function setCount(key: keyof RepoScaleTerms, raw: string) {
    if (!raw.trim()) return;
    const next = Number(raw);
    if (!Number.isFinite(next) || next < 0) return;
    onChange({ ...value, [key]: next });
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      <Field label="Default LTV %">
        <input
          type="number"
          step="0.1"
          value={percent(value.purchaseShare)}
          onChange={(e) => setPercent("purchaseShare", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Setup fee %">
        <input
          type="number"
          step="0.1"
          value={percent(value.setupFee)}
          onChange={(e) => setPercent("setupFee", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Monthly-add annual %">
        <input
          type="number"
          step="0.1"
          value={percent(value.annualAdjustment)}
          onChange={(e) => setPercent("annualAdjustment", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Early repurchase %">
        <input
          type="number"
          step="0.1"
          value={percent(value.earlyRepurchaseAmount)}
          onChange={(e) => setPercent("earlyRepurchaseAmount", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Brokerage %">
        <input
          type="number"
          step="0.1"
          value={percent(value.brokerFee)}
          onChange={(e) => setPercent("brokerFee", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Minimum months">
        <input
          type="number"
          value={value.minMonths}
          onChange={(e) => setCount("minMonths", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Early amount starts month">
        <input
          type="number"
          value={value.earlyStartMonth}
          onChange={(e) => setCount("earlyStartMonth", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
      <Field label="Early amount ends month">
        <input
          type="number"
          value={value.earlyUntilMonth}
          onChange={(e) => setCount("earlyUntilMonth", e.target.value)}
          className="w-full bg-transparent py-1 text-[16px] outline-none"
        />
      </Field>
    </div>
  );
}
