"use client";

import { FormEvent, useRef, useState } from "react";
import { AdminScaleFields } from "@/components/admin-scale-fields";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { money } from "@/lib/catalog";
import { bookLabel, utcToday, validateAgreementEnd } from "@/lib/contract/repo-book.mjs";
import { repurchaseDollars, settingsToTerms } from "@/lib/contract/repo-scale.mjs";
import { useStore } from "@/lib/store";
import type { Agreement, AgreementEnd, AgreementShell, BookEndKind } from "@/lib/types";

function blankShell(termMonths = 12): AgreementShell {
  const scale = settingsToTerms({}, termMonths);
  return {
    id: "",
    code: "",
    title: "12-month repurchase",
    termMonths,
    rate: scale.annualAdjustment,
    ltv: scale.purchaseShare,
    setupFee: scale.setupFee,
    earlyRepurchaseAmount: scale.earlyRepurchaseAmount,
    brokerFee: scale.brokerFee,
    minMonths: scale.minMonths,
    earlyStartMonth: scale.earlyStartMonth,
    earlyUntilMonth: scale.earlyUntilMonth,
    status: "open",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

const END_KIND_OPTIONS: { value: BookEndKind; label: string }[] = [
  { value: "bought_back", label: "Bought back" },
  { value: "in_liquidation", label: "In liquidation" },
  { value: "liquidated", label: "Liquidated" },
];

const END_ERRORS: Record<string, string> = {
  MISSING_DATE: "Enter the end date.",
  DATE_BEFORE_CREATED: "End date cannot be before the agreement date.",
  DATE_AFTER_TODAY: "End date cannot be after today.",
  INVALID_AMOUNT: "Enter a dollar amount of zero or more.",
  INVALID_KIND: "Choose bought back, in liquidation, or liquidated.",
};

function endDraftFrom(agreement: Agreement) {
  return {
    kind: agreement.bookEnd?.kind ?? "bought_back",
    date: agreement.bookEnd?.date ?? utcToday(),
    amount: agreement.bookEnd ? String(agreement.bookEnd.amount) : "",
  };
}

export default function AdminAgreementsPage() {
  const {
    agreements,
    shells,
    settings,
    upsertShell,
    removeShell,
    removeAgreement,
    signAgreement,
    updateAgreement,
    recordAgreementEnd,
    clearAgreementEnd,
  } = useStore();
  const [draft, setDraft] = useState<AgreementShell>(blankShell(settings.typicalTerm));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [endDraft, setEndDraft] = useState({ kind: "bought_back" as BookEndKind, date: "", amount: "" });
  const [endError, setEndError] = useState("");
  const selected = agreements.find((item) => item.id === selectedId) ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.code) return;
    upsertShell({ ...draft, id: draft.id || `shell-${Date.now()}` });
    setDraft(blankShell(settings.typicalTerm));
  }

  const scaleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveContractScale(agreement: Agreement, scale: ReturnType<typeof settingsToTerms>) {
    if (agreement.status === "signed") return;
    if (scaleSaveTimer.current) clearTimeout(scaleSaveTimer.current);
    scaleSaveTimer.current = setTimeout(() => {
      updateAgreement(agreement.id, {
        scale,
        termMonths: agreement.termMonths,
      });
    }, 400);
  }

  function selectLiveRow(agreement: Agreement) {
    setSelectedId((current) => {
      const next = current === agreement.id ? null : agreement.id;
      if (next) {
        setEndDraft(endDraftFrom(agreement));
        setEndError("");
      }
      return next;
    });
  }

  function onRecordEnd(e: FormEvent, agreement: Agreement) {
    e.preventDefault();
    const amount = endDraft.amount === "" ? Number.NaN : Number(endDraft.amount);
    const input: AgreementEnd = { kind: endDraft.kind, date: endDraft.date, amount };
    const checked = validateAgreementEnd(agreement, input, utcToday());
    if (!checked.ok) {
      setEndError(END_ERRORS[checked.error] ?? "Enter a date and amount.");
      return;
    }
    if (!recordAgreementEnd(agreement.id, checked.end as AgreementEnd)) {
      setEndError(END_ERRORS.INVALID_AMOUNT);
      return;
    }
    setEndError("");
    setEndDraft({ kind: checked.end.kind as BookEndKind, date: checked.end.date, amount: String(checked.end.amount) });
  }

  return (
    <AdminChrome title="Agreement databases">
      <h2 className="mb-3 text-[11px] tracking-[0.16em] text-white/40 uppercase">Agreement shells</h2>
      <form onSubmit={onSubmit} className="mb-6 grid gap-4 md:grid-cols-3">
        <Field label="Code">
          <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Title">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Status">
          <NativeSelect value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as AgreementShell["status"] })}>
            <option className="bg-black" value="open">Open</option>
            <option className="bg-black" value="assigned">Assigned</option>
            <option className="bg-black" value="closed">Closed</option>
          </NativeSelect>
        </Field>
        <Field label="Term months">
          <input
            type="number"
            value={draft.termMonths}
            onChange={(e) => setDraft({ ...draft, termMonths: Number(e.target.value) })}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <div className="md:col-span-3">
          <AdminScaleFields
            value={settingsToTerms(draft, draft.termMonths)}
            onChange={(next) =>
              setDraft({
                ...draft,
                ltv: next.purchaseShare,
                rate: next.annualAdjustment,
                setupFee: next.setupFee,
                earlyRepurchaseAmount: next.earlyRepurchaseAmount,
                brokerFee: next.brokerFee,
                minMonths: next.minMonths,
                earlyStartMonth: next.earlyStartMonth,
                earlyUntilMonth: next.earlyUntilMonth,
              })
            }
          />
        </div>
        <PillButton type="submit" variant="gold" className="md:col-span-3">
          Save Agreement Shell
        </PillButton>
      </form>
      <AdminTable
        headers={["Code", "Title", "Term", "Max purchase", "Status", ""]}
        rows={shells.map((s) => [
          s.code,
          s.title,
          `${s.termMonths} mo`,
          `${Math.round(s.ltv * 100)}%`,
          s.status === "open" ? "Open" : s.status === "assigned" ? "Assigned" : "Closed",
          <div key={s.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setDraft(s)}>Edit</button>
            <button type="button" onClick={() => removeShell(s.id)}>Remove</button>
          </div>,
        ])}
      />

      <h2 className="mt-8 mb-3 text-[11px] tracking-[0.16em] text-white/40 uppercase">Live agreements</h2>
      <AdminTable
        headers={["Code", "Owner", "Amount", "Signature", "Book", ""]}
        selectedRow={agreements.findIndex((a) => a.id === selectedId)}
        onRowSelect={(index) => {
          const agreement = agreements[index];
          if (agreement) selectLiveRow(agreement);
        }}
        rows={agreements.map((a) => [
          a.agreementCode || a.id,
          a.ownerName,
          money(a.amount),
          a.status.replace("_", " "),
          bookLabel(a),
          <div key={a.id} className="flex gap-3 text-[#FCB040]" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => signAgreement(a.id)}>Mark signed</button>
            <button type="button" onClick={() => removeAgreement(a.id)}>Remove</button>
          </div>,
        ])}
        expandedRows={agreements.map((a) => {
          if (a.id !== selectedId) return null;
          const scale = settingsToTerms(a.scale ?? settings, a.termMonths);
          const scalePrice = repurchaseDollars(a.amount, a.termMonths, scale);
          return (
            <form
              key={`${a.id}-end`}
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => onRecordEnd(event, a)}
              className="grid gap-4 md:grid-cols-3"
            >
              <Field label="End">
                <NativeSelect
                  value={endDraft.kind}
                  onChange={(e) => setEndDraft({ ...endDraft, kind: e.target.value as BookEndKind })}
                >
                  {END_KIND_OPTIONS.map((option) => (
                    <option key={option.value} className="bg-black" value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={endDraft.date}
                  onChange={(e) => setEndDraft({ ...endDraft, date: e.target.value })}
                  className="w-full bg-transparent py-1 text-[16px] outline-none"
                />
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={endDraft.amount}
                  onChange={(e) => setEndDraft({ ...endDraft, amount: e.target.value })}
                  className="w-full bg-transparent py-1 text-[16px] outline-none"
                />
              </Field>
              <p className="md:col-span-3 text-[12px] text-white/50">
                This month&apos;s repurchase on the scale is {scalePrice == null ? "—" : money(scalePrice)}. Staff type the dollars.
              </p>
              {endError ? <p className="md:col-span-3 text-sm text-red-400">{endError}</p> : null}
              {a.bookEnd ? (
                <p className="md:col-span-3 text-[12px] text-white/60">
                  Recorded {bookLabel(a)} on {a.bookEnd.date} for {money(a.bookEnd.amount)}.
                </p>
              ) : null}
              <div className="md:col-span-3 flex flex-wrap gap-3">
                <PillButton type="submit" variant="gold" className="md:w-auto px-6">
                  {a.bookEnd ? "Overwrite end" : "Record end"}
                </PillButton>
                {a.bookEnd ? (
                  <button
                    type="button"
                    className="text-[12px] font-bold tracking-[0.18em] text-[#FCB040] uppercase"
                    onClick={() => {
                      clearAgreementEnd(a.id);
                      setEndError("");
                      setEndDraft(endDraftFrom({ ...a, bookEnd: undefined }));
                    }}
                  >
                    Clear end
                  </button>
                ) : null}
              </div>
            </form>
          );
        })}
      />

      {selected ? (
        <section className="mt-6 space-y-4 border border-white/25 bg-[#222] p-4">
          <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">
            Contract terms — {selected.agreementCode || selected.id}
          </h3>
          <p className="text-sm text-white/55">
            These fees apply only to this repo. Defaults stay on Configure the app.
          </p>
          <AdminScaleFields
            value={settingsToTerms(selected.scale ?? settings, selected.termMonths)}
            onChange={(next) => saveContractScale(selected, next)}
          />
        </section>
      ) : null}
    </AdminChrome>
  );
}
