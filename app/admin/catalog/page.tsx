"use client";

import { FormEvent, useMemo, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { money } from "@/lib/catalog";
import { catalogBrandSlug } from "@/lib/catalog-seed.mjs";
import { canEditAppraisal } from "@/lib/roles.mjs";
import { useStore } from "@/lib/store";
import type { CatalogBrand, CatalogEntry } from "@/lib/types";

const APPRAISER_REQUIRED_COPY = "Appraiser or super admin required to change ranges.";

const BLANK_BRAND: CatalogBrand = {
  id: "",
  name: "",
  tier: 1,
  slug: "",
  logoAssetKey: null,
  retailVisible: false,
  sortOrder: 1,
};

const BLANK_MODEL: CatalogEntry = {
  id: "",
  brandId: "",
  brand: "",
  model: "",
  reference: "",
  caseMetal: "Steel",
  caseDiameter: "40mm",
  typicalLow: 0,
  typicalHigh: 0,
  financeable: false,
  notes: "",
  retailVisible: false,
  photoObjectKey: null,
  photoSourceUrl: "",
  photoLicense: "",
  photoAttribution: "",
  marketSourceUrls: [],
  marketRetrievedOn: null,
  lastEditedByStaffId: null,
};

type SparkleSuggestion = {
  models?: Array<{
    name: string;
    reference: string;
    typicalLow: number;
    typicalHigh: number;
    photoSourceUrl: string;
    photoLicense: string;
    photoAttribution: string;
  }>;
  range?: { typicalLow: number; typicalHigh: number };
  photos?: Array<{ sourceUrl: string; license: string; attribution: string }>;
  marketSourceUrls?: string[];
  marketRetrievedOn?: string;
};

export default function AdminCatalogPage() {
  const { brands, catalog, upsertBrand, upsertCatalog, removeCatalog, sparkleCatalog, user } = useStore();
  const canEdit = canEditAppraisal(user);
  const [brandDraft, setBrandDraft] = useState<CatalogBrand>(BLANK_BRAND);
  const [draft, setDraft] = useState<CatalogEntry>(BLANK_MODEL);
  const [selectedBrandId, setSelectedBrandId] = useState("");
  const [error, setError] = useState("");
  const [sparkle, setSparkle] = useState<SparkleSuggestion | null>(null);
  const [sparkleTarget, setSparkleTarget] = useState<{ kind: "brand" | "model"; id: string } | null>(null);
  const [pickedModels, setPickedModels] = useState<Record<number, boolean>>({});

  const sortedBrands = useMemo(
    () => [...brands].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    [brands],
  );
  const selectedBrand = sortedBrands.find((brand) => brand.id === selectedBrandId) ?? null;
  const models = catalog.filter((entry) =>
    selectedBrand ? entry.brandId === selectedBrand.id || entry.brand === selectedBrand.name : true,
  );

  async function onSubmitBrand(event: FormEvent) {
    event.preventDefault();
    if (!brandDraft.name) return;
    setError("");
    const slug = brandDraft.slug || catalogBrandSlug(brandDraft.name);
    const result = await upsertBrand({
      ...brandDraft,
      id: brandDraft.id || `brand-${slug}`,
      slug,
      sortOrder: brandDraft.sortOrder || sortedBrands.length + 1,
    });
    if (!result.ok) {
      setError(result.error === "ROLE_FORBIDDEN" ? APPRAISER_REQUIRED_COPY : "The brand could not be saved.");
      return;
    }
    setBrandDraft(BLANK_BRAND);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!draft.brand || !draft.model) return;
    setError("");
    const brand = sortedBrands.find((row) => row.name === draft.brand);
    const result = await upsertCatalog({
      ...draft,
      id: draft.id || `model-${catalogBrandSlug(draft.brand)}-${catalogBrandSlug(draft.model)}`,
      brandId: draft.brandId || brand?.id || "",
    });
    if (!result.ok) {
      setError(
        result.error === "ROLE_FORBIDDEN"
          ? APPRAISER_REQUIRED_COPY
          : result.error === "PHOTO_REQUIRED"
            ? "A retail-visible model needs a photo MAC may use or a recorded photo link."
            : "The catalog reference could not be saved.",
      );
      return;
    }
    setDraft(BLANK_MODEL);
  }

  async function onRemove(id: string) {
    setError("");
    const result = await removeCatalog(id);
    if (!result.ok) {
      setError(result.error === "ROLE_FORBIDDEN" ? APPRAISER_REQUIRED_COPY : "The catalog reference could not be removed.");
    }
  }

  async function runSparkle(kind: "brand" | "model", id: string, query: string) {
    setError("");
    setSparkleTarget({ kind, id });
    const result = await sparkleCatalog({ kind, id, query });
    if (!result.ok) {
      setError(
        result.error === "ROLE_FORBIDDEN"
          ? APPRAISER_REQUIRED_COPY
          : result.error === "THROTTLED"
            ? "Sparkle is limited to ten researches a day."
            : "Sparkle is unavailable until a research key is set.",
      );
      setSparkle(null);
      return;
    }
    setSparkle((result.suggestion ?? null) as SparkleSuggestion | null);
    setPickedModels({});
  }

  async function saveSparkleModels() {
    if (!selectedBrand || !sparkle?.models) return;
    const retrievedOn = sparkle.marketRetrievedOn ?? null;
    const urls = sparkle.marketSourceUrls ?? [];
    for (const [index, model] of sparkle.models.entries()) {
      if (!pickedModels[index]) continue;
      const photo = sparkle.photos?.[index];
      await upsertCatalog({
        ...BLANK_MODEL,
        id: `model-${selectedBrand.slug}-${catalogBrandSlug(model.name)}-${index}`,
        brandId: selectedBrand.id,
        brand: selectedBrand.name,
        model: model.name,
        reference: model.reference,
        typicalLow: model.typicalLow,
        typicalHigh: model.typicalHigh,
        photoSourceUrl: model.photoSourceUrl || photo?.sourceUrl || "",
        photoLicense: model.photoLicense || photo?.license || "",
        photoAttribution: model.photoAttribution || photo?.attribution || "",
        photoObjectKey: null,
        marketSourceUrls: urls,
        marketRetrievedOn: retrievedOn,
      });
    }
    setSparkle(null);
  }

  async function applySparkleRange() {
    if (!sparkle?.range || sparkleTarget?.kind !== "model") return;
    const entry = catalog.find((row) => row.id === sparkleTarget.id);
    if (!entry) return;
    const photo = sparkle.photos?.[0];
    const result = await upsertCatalog({
      ...entry,
      typicalLow: sparkle.range.typicalLow,
      typicalHigh: sparkle.range.typicalHigh,
      photoSourceUrl: entry.photoSourceUrl || photo?.sourceUrl || "",
      photoLicense: entry.photoLicense || photo?.license || "",
      photoAttribution: entry.photoAttribution || photo?.attribution || "",
      marketSourceUrls: sparkle.marketSourceUrls ?? entry.marketSourceUrls,
      marketRetrievedOn: sparkle.marketRetrievedOn ?? entry.marketRetrievedOn,
    });
    if (!result.ok) {
      setError(result.error === "PHOTO_REQUIRED"
        ? "A retail-visible model needs a photo MAC may use or a recorded photo link."
        : "The catalog reference could not be saved.");
      return;
    }
    setSparkle(null);
    setSparkleTarget(null);
  }

  return (
    <AdminChrome title="Timepiece database">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Brands MAC accepts and the main models under each. Collectors only see rows you mark retail-visible.
      </p>
      {!canEdit ? (
        <p className="mb-4 text-sm text-mac-champagne" data-testid="catalog-read-only">
          {APPRAISER_REQUIRED_COPY} Admins can read every reference.
        </p>
      ) : null}

      <div className="mb-8 grid gap-3 md:grid-cols-2">
        {sortedBrands.map((brand) => (
          <div
            key={brand.id}
            className={`rounded-lg border px-4 py-3 text-left ${
              selectedBrandId === brand.id ? "border-mac-gold bg-white/5" : "border-white/10"
            }`}
          >
            <button
              type="button"
              className="block w-full text-left"
              onClick={() => {
                setSelectedBrandId(brand.id);
                setDraft((current) => ({ ...current, brand: brand.name, brandId: brand.id }));
              }}
            >
              <p className="text-sm text-white">{brand.name}</p>
              <p className="text-xs text-white/45">Tier {brand.tier}</p>
            </button>
            <label className="mt-2 flex items-center gap-2 text-xs text-white/70">
              <input
                type="checkbox"
                data-testid={`brand-retail-${brand.slug}`}
                checked={brand.retailVisible}
                disabled={!canEdit}
                onChange={(event) => {
                  void upsertBrand({ ...brand, retailVisible: event.target.checked });
                }}
              />
              Retail-visible
            </label>
          </div>
        ))}
      </div>

      {canEdit && selectedBrand ? (
        <div className="mb-6 flex flex-wrap gap-3">
          <PillButton
            type="button"
            onClick={() => void runSparkle("brand", selectedBrand.id, `${selectedBrand.name} watch models references`)}
          >
            Suggest main models
          </PillButton>
        </div>
      ) : null}

      {sparkle && (sparkle.models?.length || sparkle.range) ? (
        <div className="mb-8 rounded-lg border border-white/10 p-4">
          <p className="mb-3 text-sm text-white/70">Sparkle suggestions — nothing is written until you save.</p>
          {sparkle.range ? (
            <p className="mb-3 text-sm text-white/80">
              Suggested range {money(sparkle.range.typicalLow)} – {money(sparkle.range.typicalHigh)}
            </p>
          ) : null}
          {sparkleTarget?.kind === "model" && sparkle.range ? (
            <PillButton type="button" variant="gold" onClick={() => void applySparkleRange()}>
              Apply suggested range
            </PillButton>
          ) : null}
          {sparkle.models?.length ? (
            <>
              {sparkle.models.map((model, index) => (
                <label key={`${model.name}-${index}`} className="mb-2 flex items-start gap-3 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={Boolean(pickedModels[index])}
                    onChange={(event) => setPickedModels((current) => ({ ...current, [index]: event.target.checked }))}
                  />
                  <span>
                    {model.name} {model.reference ? `· ${model.reference}` : ""}
                    {sparkle.photos?.[index]?.license === "unknown"
                      ? " · photo as link only"
                      : ""}
                  </span>
                </label>
              ))}
              <PillButton type="button" variant="gold" onClick={() => void saveSparkleModels()}>
                Save selected
              </PillButton>
            </>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={onSubmitBrand} className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3" hidden={!canEdit}>
        <Field label="Manufacturer">
          <input value={brandDraft.name} onChange={(e) => setBrandDraft({ ...brandDraft, name: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Tier">
          <select
            value={brandDraft.tier}
            onChange={(e) => setBrandDraft({ ...brandDraft, tier: Number(e.target.value) === 2 ? 2 : 1 })}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          >
            <option value={1}>Tier One</option>
            <option value={2}>Tier Two</option>
          </select>
        </Field>
        <PillButton type="submit" variant="gold">Save brand</PillButton>
      </form>

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
        <Field label="Photo source">
          <input value={draft.photoSourceUrl} onChange={(e) => setDraft({ ...draft, photoSourceUrl: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
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
        <Field label="Retail visible">
          <label className="flex min-h-8 items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={draft.retailVisible}
              onChange={(e) => setDraft({ ...draft, retailVisible: e.target.checked })}
            />
            Show this model to collectors
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
        headers={["Brand", "Model", "Reference", "Range", "Eligible", "Retail", ""]}
        rows={models.map((entry) => [
          entry.brand,
          entry.model,
          entry.reference,
          `${money(entry.typicalLow)} – ${money(entry.typicalHigh)}`,
          entry.financeable ? "Yes" : "No",
          entry.retailVisible ? "Yes" : "No",
          <div key={entry.id} className="flex gap-3 text-mac-gold">
            {canEdit ? (
              <>
                <button type="button" onClick={() => setDraft(entry)}>Edit</button>
                <button
                  type="button"
                  onClick={() => void runSparkle("model", entry.id, `${entry.brand} ${entry.model} ${entry.reference} market price`)}
                >
                  Sparkle
                </button>
                <button type="button" onClick={() => void onRemove(entry.id)}>Remove</button>
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
