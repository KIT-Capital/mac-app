"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, NativeSelect, PillButton } from "@/components/field";
import {
  BOX_PAPERS,
  BUCKLES,
  CASE_DIAMETERS,
  CASE_METALS,
  CASE_TYPES,
  COMPLICATIONS,
  CONDITIONS,
  DIAL_COLORS,
  MODELS_BY_BRAND,
  STRAP_MATERIALS,
  TIER_ONE_BRANDS,
} from "@/lib/catalog";
import { readImageFile } from "@/lib/image";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";
import type { Timepiece } from "@/lib/types";

const SLOTS = ["Front", "Back", "Left"] as const;

function AddForm() {
  const router = useRouter();
  const params = useSearchParams();
  const onboarding = params.get("onboarding") === "1";
  const { addTimepiece, updateTimepiece, catalog, user, settings } = useStore();
  const [images, setImages] = useState<string[]>(["", "", ""]);
  const [brand, setBrand] = useState("Audemars Piguet");
  const [model, setModel] = useState("Royal Oak Selfwinding");
  const [reference, setReference] = useState("");
  const [condition, setCondition] = useState("Excellent");
  const [boxPapers, setBoxPapers] = useState("Box and papers");
  const [caseMetal, setCaseMetal] = useState("Steel");
  const [caseType, setCaseType] = useState("Round");
  const [caseDiameter, setCaseDiameter] = useState("41mm");
  const [dialColor, setDialColor] = useState("Blue");
  const [buckle, setBuckle] = useState("Folding clasp");
  const [band, setBand] = useState<"strap" | "bracelet">("bracelet");
  const [bandMaterial, setBandMaterial] = useState("Steel");
  const [complication, setComplication] = useState("Date");
  const [error, setError] = useState("");
  const [missingBrand, setMissingBrand] = useState(false);

  const models = MODELS_BY_BRAND[brand] ?? catalog.filter((c) => c.brand === brand).map((c) => c.model);

  const draft = useMemo(
    () =>
      ({
        id: `tp-${Date.now()}`,
        ownerEmail: user?.email,
        assetCode: new Date().toISOString().slice(0, 10).replaceAll("-", "") + `-${Date.now().toString().slice(-4)}`,
        brand,
        model: model || "Untitled model",
        reference,
        images: images.filter(Boolean),
        status: "not_evaluated" as const,
        financeable: TIER_ONE_BRANDS.includes(brand as (typeof TIER_ONE_BRANDS)[number]),
        condition,
        boxPapers,
        caseMetal,
        caseType,
        caseDiameter,
        dialColor,
        buckle,
        band,
        bandMaterial,
        complication,
      }) satisfies Timepiece,
    [
      band,
      bandMaterial,
      boxPapers,
      brand,
      buckle,
      caseDiameter,
      caseMetal,
      caseType,
      complication,
      condition,
      dialColor,
      images,
      model,
      reference,
      user?.email,
    ]
  );

  async function onPick(index: number, file?: File) {
    if (!file) return;
    try {
      const data = await readImageFile(file);
      setImages((prev) => {
        const copy = [...prev];
        copy[index] = data;
        return copy;
      });
      setError("");
    } catch {
      setError("That photo could not be read.");
    }
  }

  function persist(watch: Timepiece, notify = false) {
    addTimepiece(watch);
    if (notify && user) {
      void sendAppEmail({
        kind: "appraisal",
        name: user.name,
        email: user.email,
        phone: user.phone,
        watch: `${watch.brand} ${watch.model}`,
        deskEmail: settings.financingEmail,
      });
    }
    router.push(onboarding ? "/collection/continue" : `/collection/${watch.id}`);
  }

  function missingFields() {
    const missing: string[] = [];
    const needed = settings.requireFourPhotos ? 3 : 1;
    if (images.filter(Boolean).length < needed) missing.push("front, back, and left photos");
    if (!model.trim()) missing.push("a model name");
    return missing;
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    const missing = missingFields();
    if (missing.length) {
      setError(`Add ${missing.join(" and ")}.`);
      return;
    }
    persist(draft);
  }

  function onAppraise() {
    const missing = missingFields();
    if (missing.length) {
      setError(`Add ${missing.join(" and ")}.`);
      return;
    }
    const watch: Timepiece = { ...draft, status: "reviewing" };
    persist(watch, true);
    window.setTimeout(() => {
      updateTimepiece(watch.id, {
        status: "appraised",
        evaluatedAt: new Date().toISOString().slice(0, 10),
        valueLow: 42000,
        valueHigh: 56000,
      });
    }, 1200);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Add Timepiece" backHref={onboarding ? "/collection/setup" : "/collection"} />
      <form onSubmit={onSave} className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-10">
        <div className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
            <div className="flex items-center justify-between pb-2">
              <span className="text-[11px] font-bold tracking-[0.14em] text-[#E8D5C0] uppercase">
                Intake Photographs (Min. 3 Angles)
              </span>
              <button
                type="button"
                onClick={() => setImages(["/watches/patek-5524g.png", "/watches/patek-nautilus.jpg", "/watches/royal-oak.png"])}
                className="text-[10px] font-semibold text-[#FCB040] hover:underline"
              >
                + Quick Samples
              </button>
            </div>
          <p className="mt-1 text-[12px] text-white/60">
            Please provide clear shots for manufacturer authenticity verification.
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3">
            {SLOTS.map((label, i) => (
              <label key={label} className="group block text-center cursor-pointer">
                <span className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-white/30 bg-[#0F131A] text-white/50 transition group-hover:border-[#FCB040] group-hover:text-white">
                  {images[i] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[i]} alt={label} className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-xl">+</span>
                  )}
                </span>
                <span className="mt-1.5 block text-[10px] font-semibold tracking-wider text-white/60 uppercase">
                  {label}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  className="sr-only"
                  onChange={(e) => onPick(i, e.target.files?.[0])}
                />
              </label>
            ))}
          </div>
        </div>
        {settings.allowVideo ? (
          <button type="button" className="mac-tap w-full text-left text-[13px] text-white/80">
            + Upload video
          </button>
        ) : null}

        <Field label="Manufacturer / Brand">
          <NativeSelect
            value={brand}
            onChange={(e) => {
              setBrand(e.target.value);
              const next = MODELS_BY_BRAND[e.target.value]?.[0];
              if (next) setModel(next);
            }}
          >
            {TIER_ONE_BRANDS.map((b) => (
              <option key={b} value={b} className="bg-black">
                {b}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <button
          type="button"
          onClick={() => setMissingBrand((v) => !v)}
          className="text-[12px] text-white underline underline-offset-4"
        >
          Missing a brand?
        </button>
        {missingBrand ? (
          <p className="text-[12px] text-white/50">
            Email {settings.financingEmail} and the desk will add the manufacturer to the catalog.
          </p>
        ) : null}
        <Field label="Your model (name or number)">
          {models.length ? (
            <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
              {models.map((m) => (
                <option key={m} value={m} className="bg-black">
                  {m}
                </option>
              ))}
            </NativeSelect>
          ) : (
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-transparent py-1 text-[16px] outline-none"
            />
          )}
        </Field>
        <Field label="Reference number (if different)">
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <Field label="Condition">
          <NativeSelect value={condition} onChange={(e) => setCondition(e.target.value)}>
            {CONDITIONS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Box and papers">
          <NativeSelect value={boxPapers} onChange={(e) => setBoxPapers(e.target.value)}>
            {BOX_PAPERS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Case metal">
          <NativeSelect value={caseMetal} onChange={(e) => setCaseMetal(e.target.value)}>
            {CASE_METALS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Case type">
          <NativeSelect value={caseType} onChange={(e) => setCaseType(e.target.value)}>
            {CASE_TYPES.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Case diameter">
          <NativeSelect value={caseDiameter} onChange={(e) => setCaseDiameter(e.target.value)}>
            {CASE_DIAMETERS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Dial color">
          <NativeSelect value={dialColor} onChange={(e) => setDialColor(e.target.value)}>
            {DIAL_COLORS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Buckle">
          <NativeSelect value={buckle} onChange={(e) => setBuckle(e.target.value)}>
            {BUCKLES.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <div className="rounded-xl border border-white/20 bg-[#161B24] p-3">
          <p className="text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">Band Configuration</p>
          <div className="mt-2 flex gap-8 text-[14px]">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={band === "strap"} onChange={() => setBand("strap")} className="accent-[#FCB040]" />
              <span>Leather / Rubber Strap</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="radio" checked={band === "bracelet"} onChange={() => setBand("bracelet")} className="accent-[#FCB040]" />
              <span>Integrated Bracelet</span>
            </label>
          </div>
        </div>
        <Field label={band === "strap" ? "Strap material" : "Bracelet material"}>
          <NativeSelect value={bandMaterial} onChange={(e) => setBandMaterial(e.target.value)}>
            {STRAP_MATERIALS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Complication">
          <NativeSelect value={complication} onChange={(e) => setComplication(e.target.value)}>
            {COMPLICATIONS.map((c) => (
              <option key={c} className="bg-black">
                {c}
              </option>
            ))}
          </NativeSelect>
        </Field>

        <p className="text-[11px] leading-5 text-white/40">
          *Once you click appraise, the timepiece profile can only be modified by contacting us.
        </p>
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        <div className="grid grid-cols-2 gap-3 pt-3">
          <PillButton type="submit" variant="white">
            Save as Draft
          </PillButton>
          <PillButton type="button" variant="gold" onClick={onAppraise}>
            Appraise Now
          </PillButton>
        </div>
      </form>
    </main>
  );
}

export default function AddTimepiecePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-white/40">Loading</div>}>
      <AddForm />
    </Suspense>
  );
}
