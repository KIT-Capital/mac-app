"use client";

import { FormEvent, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { AgreementShell } from "@/lib/types";

const BLANK: AgreementShell = {
  id: "",
  code: "",
  title: "12-month repurchase",
  termMonths: 12,
  rate: 0.18,
  ltv: 0.65,
  status: "open",
  createdAt: new Date().toISOString().slice(0, 10),
};

export default function AdminAgreementsPage() {
  const { agreements, shells, upsertShell, removeShell, removeAgreement, signAgreement } = useStore();
  const [draft, setDraft] = useState<AgreementShell>(BLANK);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.code) return;
    upsertShell({ ...draft, id: draft.id || `shell-${Date.now()}` });
    setDraft(BLANK);
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
        <PillButton type="submit" variant="gold" className="md:col-span-3">
          Save Agreement Shell
        </PillButton>
      </form>
      <AdminTable
        headers={["Code", "Title", "Term", "Max purchase", ""]}
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
            <button type="button" onClick={() => signAgreement(a.id)}>Mark signed</button>
            <button type="button" onClick={() => removeAgreement(a.id)}>Remove</button>
          </div>,
        ])}
      />
    </AdminChrome>
  );
}
