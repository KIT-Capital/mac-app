"use client";

import { FormEvent, useState } from "react";
import { AdminScaleFields } from "@/components/admin-scale-fields";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { money } from "@/lib/catalog";
import { settingsToTerms } from "@/lib/contract/repo-scale.mjs";
import { useStore } from "@/lib/store";
import type { Agreement, AgreementShell } from "@/lib/types";

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

export default function AdminAgreementsPage() {
  const { agreements, shells, settings, upsertShell, removeShell, removeAgreement, signAgreement, updateAgreement } =
    useStore();
  const [draft, setDraft] = useState<AgreementShell>(blankShell(settings.typicalTerm));
  const [selectedId, setSelectedId] = useState<string>("");
  const selected = agreements.find((item) => item.id === selectedId) ?? null;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.code) return;
    upsertShell({ ...draft, id: draft.id || `shell-${Date.now()}` });
    setDraft(blankShell(settings.typicalTerm));
  }

  function saveContractScale(agreement: Agreement, scale: ReturnType<typeof settingsToTerms>) {
    updateAgreement(agreement.id, {
      scale,
      termMonths: agreement.termMonths,
    });
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
        headers={["Code", "Title", "Term", "LTV", ""]}
        rows={shells.map((s) => [
          s.code,
          s.title,
          `${s.termMonths} mo`,
          `${Math.round(s.ltv * 100)}%`,
          <div key={s.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setDraft(s)}>Edit</button>
            <button type="button" onClick={() => removeShell(s.id)}>Remove</button>
          </div>,
        ])}
      />

      <h2 className="mt-8 mb-3 text-[11px] tracking-[0.16em] text-white/40 uppercase">Live agreements</h2>
      <AdminTable
        headers={["Code", "Owner", "Amount", "Status", ""]}
        rows={agreements.map((a) => [
          a.agreementCode || a.id,
          a.ownerName,
          money(a.amount),
          a.status.replace("_", " "),
          <div key={a.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setSelectedId(a.id)}>Terms</button>
            <button type="button" onClick={() => signAgreement(a.id)}>Mark signed</button>
            <button type="button" onClick={() => removeAgreement(a.id)}>Remove</button>
          </div>,
        ])}
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
