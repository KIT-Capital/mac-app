"use client";

import { FormEvent, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { money } from "@/lib/catalog";
import { canEditAppraisal } from "@/lib/roles.mjs";
import { useStore } from "@/lib/store";
import type { CatalogEntry } from "@/lib/types";

const APPRAISER_REQUIRED_COPY = "Appraiser or super admin required to change ranges.";

const BLANK: CatalogEntry = {
  id: "",
  brand: "",
  model: "",
  reference: "",
  caseMetal: "Steel",
  caseDiameter: "40mm",
  typicalLow: 40000,
  typicalHigh: 55000,
  financeable: false,
  notes: "",
};

export default function AdminCatalogPage() {
  const { catalog, upsertCatalog, removeCatalog, user } = useStore();
  const canEdit = canEditAppraisal(user);
  const [draft, setDraft] = useState<CatalogEntry>(BLANK);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.brand || !draft.model) return;
    setError("");
    const result = await upsertCatalog({ ...draft, id: draft.id || `cat-${Date.now()}` });
    if (!result.ok) {
      setError(result.error === "ROLE_FORBIDDEN" ? APPRAISER_REQUIRED_COPY : "The catalog reference could not be saved.");
      return;
    }
    setDraft(BLANK);
  }

  async function onRemove(id: string) {
    setError("");
    const result = await removeCatalog(id);
    if (!result.ok) {
      setError(result.error === "ROLE_FORBIDDEN" ? APPRAISER_REQUIRED_COPY : "The catalog reference could not be removed.");
    }
  }

  return (
    <AdminChrome title="Timepiece database">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Master catalog used by the add-timepiece dropdowns. Staff research a reference here before a
        collector asset is created.
      </p>
      {!canEdit ? (
        <p className="mb-4 text-sm text-[#E8D5C0]" data-testid="catalog-read-only">
          {APPRAISER_REQUIRED_COPY} Admins can read every reference.
        </p>
      ) : null}
      <form onSubmit={onSubmit} className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" hidden={!canEdit}>
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
        <Field label="Application eligibility">
          <label className="flex min-h-8 items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={draft.financeable}
              onChange={(e) => setDraft({ ...draft, financeable: e.target.checked })}
            />
            Eligible for sale-and-repurchase applications
          </label>
        </Field>
        <Field label="Notes">
          <input value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <PillButton type="submit" variant="gold" className="md:col-span-2 xl:col-span-3">
          {draft.id ? "Update Reference" : "Add Reference"}
        </PillButton>
      </form>
      {error ? <p className="mb-4 text-sm text-red-300">{error}</p> : null}
      <AdminTable
        headers={["Brand", "Model", "Reference", "Range", "Eligible", ""]}
        rows={catalog.map((c) => [
          c.brand,
          c.model,
          c.reference,
          `${money(c.typicalLow)} – ${money(c.typicalHigh)}`,
          c.financeable ? "Yes" : "No",
          <div key={c.id} className="flex gap-3 text-[#FCB040]">
            {canEdit ? (
              <>
                <button type="button" onClick={() => setDraft(c)}>Edit</button>
                <button type="button" onClick={() => void onRemove(c.id)}>Remove</button>
              </>
            ) : (
              <span className="text-white/45">Read only</span>
            )}
          </div>,
        ])}
      />
    </AdminChrome>
  );
}
