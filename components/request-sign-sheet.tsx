import { LineField, NativeSelect, PillButton } from "@/components/field";
import { DELIVERY_METHODS } from "@/lib/catalog";
import { INSPECTION_CONDITION } from "@/lib/contract/repo-agreement-snapshot.mjs";

export const INTAKE_DELIVERY = "Desk arranges intake";

export function RequestSignSheet({
  title,
  typedName,
  onTypedNameChange,
  attested,
  onAttestedChange,
  delivery,
  onDeliveryChange,
  busy,
  error,
  onSubmit,
  onCancel,
}: {
  title: string;
  typedName: string;
  onTypedNameChange: (value: string) => void;
  attested: boolean;
  onAttestedChange: (value: boolean) => void;
  delivery: string;
  onDeliveryChange: (value: string) => void;
  busy: boolean;
  error: string;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-3 space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <h3 className="text-[13px] font-semibold text-mac-fg">{title}</h3>
      <p className="text-[12px] text-mac-muted">{INSPECTION_CONDITION}</p>
      <LineField label="Typed name">
        <input
          value={typedName}
          onChange={(event) => onTypedNameChange(event.target.value)}
          autoComplete="name"
          className="w-full bg-transparent text-[15px] text-mac-fg outline-none"
        />
      </LineField>
      <LineField label="Delivery method">
        <NativeSelect value={delivery} onChange={(event) => onDeliveryChange(event.target.value)}>
          {DELIVERY_METHODS.map((item) => (
            <option key={item} className="bg-mac-card">
              {item}
            </option>
          ))}
        </NativeSelect>
      </LineField>
      <label className="flex items-center gap-3 text-[13px] text-mac-fg">
        <input
          type="checkbox"
          checked={attested}
          onChange={(event) => onAttestedChange(event.target.checked)}
          className="h-4 w-4 accent-mac-navy"
        />
        I have read this agreement and I am signing it
      </label>
      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      <PillButton type="submit" variant="gold" disabled={busy || !attested || !typedName.trim()}>
        {busy ? "Signing…" : title}
      </PillButton>
      <button
        type="button"
        className="text-[11px] font-bold tracking-[0.14em] text-mac-gold uppercase"
        onClick={onCancel}
      >
        Cancel
      </button>
    </form>
  );
}
