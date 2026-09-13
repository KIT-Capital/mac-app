"use client";

import { FormEvent, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { CatalogEntry } from "@/lib/types";

const BLANK: CatalogEntry = {
  id: "",
  brand: "",
  model: "",
  reference: "",
  caseMetal: "Steel",
  caseDiameter: "40mm",
  typicalLow: 40000,
  typicalHigh: 55000,
  financeable: true,
  notes: "",
};

export default function AdminCatalogPage() {
  const { catalog, upsertCatalog, removeCatalog } = useStore();
  const [draft, setDraft] = useState<CatalogEntry>(BLANK);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.brand || !draft.model) return;
    upsertCatalog({ ...draft, id: draft.id || `cat-${Date.now()}` });
    setDraft(BLANK);
  }

  return (
    <AdminChrome title="Timepiece database">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Master catalog used by the add-timepiece dropdowns. Staff research a reference here before a
        collector asset is created.
      </p>
      <form onSubmit={onSubmit} className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Brand">
          <input value={draft.brand} onChange={(e) => setDraft({ ...draft, brand: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Model">
          <input value={draft.model} onChange={(e) => setDraft({ ...draft, model: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Reference">
          <input value={draft.reference} onChange={(e) => setDraft({ ...draft, reference: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Typical low">
          <input type="number" value={draft.typicalLow} onChange={(e) => setDraft({ ...draft, typicalLow: Number(e.target.value) })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Typical high">
          <input type="number" value={draft.typicalHigh} onChange={(e) => setDraft({ ...draft, typicalHigh: Number(e.target.value) })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Notes">
          <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <PillButton type="submit">{draft.id ? "Update reference" : "Add reference"}</PillButton>
      </form>
      <AdminTable
        headers={["Brand", "Model", "Reference", "Range", ""]}
        rows={catalog.map((c) => [
          c.brand,
          c.model,
          c.reference,
          `${money(c.typicalLow)} – ${money(c.typicalHigh)}`,
          <div key={c.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setDraft(c)}>Edit</button>
            <button type="button" onClick={() => removeCatalog(c.id)}>Remove</button>
          </div>,
        ])}
      />
    </AdminChrome>
  );
}
