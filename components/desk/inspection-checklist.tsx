"use client";

import { Field, PillButton } from "@/components/field";

export const INSPECTION_CHECKLIST = [
  { key: "identityVerified", label: "Identity verified" },
  { key: "serialsMatch", label: "Serials match" },
  { key: "conditionMatches", label: "Condition matches" },
  { key: "termAgreed", label: "Term agreed" },
  { key: "inCustody", label: "In MAC custody" },
] as const;

export type ChecklistKey = (typeof INSPECTION_CHECKLIST)[number]["key"];

export function InspectionChecklist({
  checklist,
  onToggle,
  paymentReference,
  onPaymentReference,
  typedName,
  onTypedName,
  disabled,
  reason,
  canExecute,
  onSign,
  busy,
}: {
  checklist: Record<string, boolean>;
  onToggle: (key: ChecklistKey) => void;
  paymentReference: string;
  onPaymentReference: (value: string) => void;
  typedName: string;
  onTypedName: (value: string) => void;
  disabled: boolean;
  reason: string;
  canExecute: boolean;
  onSign: () => void;
  busy: boolean;
}) {
  return (
    <section className="space-y-4 rounded-2xl border border-white/10 bg-[#161B24] p-4">
      <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">MAC sign</h3>
      {reason ? <p className="text-[13px] text-mac-gold">{reason}</p> : null}
      <ul className="space-y-2">
        {INSPECTION_CHECKLIST.map((item) => (
          <li key={item.key}>
            <label className="flex items-center gap-2 text-[13px] text-white/80">
              <input
                type="checkbox"
                checked={checklist[item.key] === true}
                disabled={disabled}
                onChange={() => onToggle(item.key)}
              />
              {item.label}
            </label>
          </li>
        ))}
      </ul>
      <Field label="Payment reference">
        <input
          value={paymentReference}
          disabled={disabled}
          onChange={(event) => onPaymentReference(event.target.value)}
          className="w-full bg-transparent py-1 text-[16px] text-white outline-none disabled:opacity-40"
        />
      </Field>
      <Field label="Typed name">
        <input
          value={typedName}
          disabled={disabled}
          onChange={(event) => onTypedName(event.target.value)}
          className="w-full bg-transparent py-1 text-[16px] text-white outline-none disabled:opacity-40"
        />
      </Field>
      <PillButton
        type="button"
        variant="gold"
        disabled={disabled || !canExecute || busy}
        onClick={onSign}
      >
        Sign for MAC
      </PillButton>
    </section>
  );
}
