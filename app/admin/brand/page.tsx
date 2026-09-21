"use client";

import { FormEvent, useMemo, useState } from "react";
import { AdminChrome } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { DEFAULT_TENANT_ID } from "@/lib/tenant.mjs";
import { tenantIdForCode } from "@/lib/tenant-brand.mjs";
import { MAC } from "@/lib/theme";
import { useStore } from "@/lib/store";
import { canEditTenantBrand, isMasterSuperAdmin } from "@/lib/roles.mjs";
import type { TenantBrand } from "@/lib/types";

const EMPTY_CREATE = { code: "", name: "" };

export default function AdminBrandPage() {
  const { tenants, user, createTenant, updateTenantBrand } = useStore();
  const canEdit = canEditTenantBrand(user);
  const canCreate = isMasterSuperAdmin(user);
  const [selectedId, setSelectedId] = useState(tenants[0]?.id ?? DEFAULT_TENANT_ID);
  const selected = tenants.find((row) => row.id === selectedId) ?? tenants[0];
  const [draft, setDraft] = useState<TenantBrand | null>(null);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const form = draft && draft.id === selected?.id ? draft : selected;
  const macLocked = selected?.id === DEFAULT_TENANT_ID;

  const preview = useMemo(
    () => form?.palette ?? { primary: MAC.navy, accent: MAC.gold, soft: MAC.champagne },
    [form],
  );

  async function onSave(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    setNotice("");
    setError("");
    const result = await updateTenantBrand(form.id, {
      name: form.name,
      logoUrl: form.logoUrl,
      palette: form.palette,
      fromName: form.fromName,
    });
    if (!result.ok) {
      setError(result.error ?? "Could not save brand.");
      return;
    }
    setDraft(null);
    setNotice(macLocked ? "From name saved. MAC chrome stays Logo-FF." : "Brand overlay saved.");
  }

  async function onCreate(event: FormEvent) {
    event.preventDefault();
    setNotice("");
    setError("");
    const result = await createTenant(createForm);
    if (!result.ok) {
      setError(result.error ?? "Could not create tenant.");
      return;
    }
    setCreateForm(EMPTY_CREATE);
    setSelectedId(tenantIdForCode(createForm.code.trim().toUpperCase()));
    setNotice("Tenant created. Overlay stays off Mechanical Art Capital.");
  }

  if (!canEdit) {
    return (
      <AdminChrome title="Brand">
        <p className="text-sm text-white/55">Only a super admin can open Brand.</p>
      </AdminChrome>
    );
  }

  return (
    <AdminChrome title="Brand">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        White-label is the same app with a tenant overlay. Mechanical Art Capital keeps Logo-FF and
        the MAC palette. Do not ship third-party marks without a tenant and the right to use them.
      </p>
      {notice ? <p className="mb-3 text-sm text-mac-gold">{notice}</p> : null}
      {error ? <p className="mb-3 text-sm text-red-300">{error}</p> : null}

      <div className="mb-6 flex flex-wrap gap-2">
        {tenants.map((tenant) => (
          <button
            key={tenant.id}
            type="button"
            className={`border px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase ${
              tenant.id === selected?.id ? "border-mac-gold text-mac-gold" : "border-white/20 text-white/70"
            }`}
            onClick={() => {
              setSelectedId(tenant.id);
              setDraft(null);
            }}
          >
            {tenant.code}
          </button>
        ))}
      </div>

      {form ? (
        <form onSubmit={(event) => void onSave(event)} className="max-w-xl space-y-4">
          <Field label="Display name">
            <input
              value={form.name}
              disabled={macLocked || !canCreate}
              onChange={(event) => setDraft({ ...form, name: event.target.value })}
              className="w-full bg-transparent py-1 text-[16px] outline-none disabled:text-white/40"
            />
          </Field>
          <Field label="Member ID prefix">
            <input
              value={form.code}
              disabled
              className="w-full bg-transparent py-1 text-[16px] outline-none text-white/40"
            />
          </Field>
          <Field label="From name">
            <input
              value={form.fromName}
              disabled={!macLocked && !canCreate}
              onChange={(event) => setDraft({ ...form, fromName: event.target.value })}
              className="w-full bg-transparent py-1 text-[16px] outline-none disabled:text-white/40"
            />
          </Field>
          <Field label="Logo URL">
            <input
              value={form.logoUrl}
              disabled={macLocked || !canCreate}
              placeholder={macLocked ? "Logo-FF" : "/brand/mark.svg or https://…"}
              onChange={(event) => setDraft({ ...form, logoUrl: event.target.value })}
              className="w-full bg-transparent py-1 text-[16px] outline-none disabled:text-white/40"
            />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            {(["primary", "accent", "soft"] as const).map((key) => (
              <Field key={key} label={key}>
                <input
                  value={form.palette[key]}
                  disabled={macLocked || !canCreate}
                  onChange={(event) =>
                    setDraft({
                      ...form,
                      palette: { ...form.palette, [key]: event.target.value },
                    })
                  }
                  className="w-full bg-transparent py-1 font-mono text-[14px] outline-none disabled:text-white/40"
                />
              </Field>
            ))}
          </div>
          <div className="flex h-10 overflow-hidden border border-white/15">
            <span className="flex-1" style={{ background: preview.primary }} />
            <span className="flex-1" style={{ background: preview.accent }} />
            <span className="flex-1" style={{ background: preview.soft }} />
          </div>
          {macLocked ? (
            <p className="text-xs text-white/45">
              MAC name, logo, and palette are locked. From name may change for mail and WhatsApp copy.
            </p>
          ) : null}
          <PillButton type="submit">Save overlay</PillButton>
        </form>
      ) : null}

      {canCreate ? (
        <form onSubmit={(event) => void onCreate(event)} className="mt-10 max-w-xl space-y-4 border-t border-white/10 pt-6">
          <p className="text-[11px] tracking-[0.16em] text-white/50 uppercase">New tenant</p>
          <p className="text-sm text-white/55">
            Only the master super admin creates a tenant. Prefix is 2–8 capital letters and never reused.
          </p>
          <Field label="Prefix">
            <input
              value={createForm.code}
              onChange={(event) => setCreateForm({ ...createForm, code: event.target.value.toUpperCase() })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
              maxLength={8}
            />
          </Field>
          <Field label="Display name">
            <input
              value={createForm.name}
              onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          </Field>
          <PillButton type="submit">Create tenant</PillButton>
        </form>
      ) : null}
    </AdminChrome>
  );
}
