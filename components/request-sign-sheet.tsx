import { NativeSelect, PillButton } from "@/components/field";
import { DELIVERY_METHODS } from "@/lib/catalog";
import { INSPECTION_CONDITION } from "@/lib/contract/repo-agreement-snapshot.mjs";

export const INTAKE_DELIVERY = "Desk arranges intake";

export function RequestSignSheet({
  title,
  typedName,
  onTypedNameChange,
  delivery,
  onDeliveryChange,
  busy,
  error,
  onSubmit,
}: {
  title: string;
  typedName: string;
  onTypedNameChange: (value: string) => void;
  delivery: string;
  onDeliveryChange: (value: string) => void;
  busy: boolean;
  error: string;
  onSubmit: () => void;
}) {
  return (
    <form
      className="mt-8 border-t border-[#1a2744]/15 pt-6"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#1a2744]/60 uppercase">
        Acceptance
      </p>
      <h3 className="mt-2 text-[18px] font-semibold text-[#1a2744]">Write your name</h3>
      <p className="mt-2 text-[14px] leading-relaxed text-[#3a342c]">
        Writing your name accepts these terms and moves this request to the next step.
        You and MAC sign the paper agreement when the timepieces are delivered.
      </p>
      <p className="mt-3 text-[13px] leading-relaxed text-[#3a342c]">{INSPECTION_CONDITION}</p>
      <label className="mt-6 block">
        <span className="text-[12px] text-[#6b6258]">Your name</span>
        <input
          value={typedName}
          onChange={(event) => onTypedNameChange(event.target.value)}
          autoComplete="name"
          placeholder="Full name"
          className="mt-1 w-full border-b border-[#1a2744]/35 bg-transparent pb-2 text-[22px] text-[#1a2744] outline-none placeholder:text-[#1a2744]/35"
        />
      </label>
      <label className="mt-5 block">
        <span className="text-[12px] text-[#6b6258]">Delivery method</span>
        <NativeSelect
          value={delivery}
          onChange={(event) => onDeliveryChange(event.target.value)}
          className="text-[#1a2744]"
        >
          {DELIVERY_METHODS.map((item) => (
            <option key={item} className="bg-white text-[#1a2744]">
              {item}
            </option>
          ))}
        </NativeSelect>
      </label>
      {error ? <p className="mt-3 text-[13px] text-red-700">{error}</p> : null}
      <div className="mt-5">
        <PillButton type="submit" variant="gold" disabled={busy || !typedName.trim()}>
          {busy ? "Recording…" : title}
        </PillButton>
      </div>
    </form>
  );
}
