"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
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
  STRAP_MATERIALS,
  TIER_ONE_BRANDS,
} from "@/lib/catalog";
import { useStore } from "@/lib/store";
import type { Timepiece } from "@/lib/types";

const IMAGE_OPTIONS = [
  "/watches/richard-mille.jpg",
  "/watches/patek-nautilus.jpg",
  "/watches/royal-oak.png",
  "/watches/romain-gauthier.jpg",
  "/watches/patek-5524g.png",
];

export default function AddTimepiecePage() {
  const router = useRouter();
  const { addTimepiece, updateTimepiece } = useStore();
  const [images, setImages] = useState<string[]>(["", "", "", ""]);
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

  const draft = useMemo(
    () =>
      ({
        id: `tp-${Date.now()}`,
        brand,
        model: model || "Untitled model",
        reference,
        images: images.filter(Boolean).length ? images.filter(Boolean) : ["/watches/royal-oak.png"],
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
    ]
  );

  function setSlotImage(index: number) {
    const next = IMAGE_OPTIONS[index % IMAGE_OPTIONS.length];
    setImages((prev) => {
      const copy = [...prev];
      while (copy.length <= index) copy.push("");
      copy[index] = next;
      return copy;
    });
    if (error) setError("");
  }

  function persist(watch: Timepiece) {
    addTimepiece(watch);
    router.push(`/collection/${watch.id}`);
  }

  function missingFields() {
    const missing: string[] = [];
    if (!images.some(Boolean)) missing.push("at least one image");
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
    const watch: Timepiece = {
      ...draft,
      status: "reviewing",
    };
    persist(watch);
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
    <main className="flex flex-1 flex-col">
      <ScreenHeader title="Add a timepiece" backHref="/collection" />
      <form onSubmit={onSave} className="flex-1 space-y-6 overflow-y-auto px-5 py-5 pb-10">
        <p className="text-[12px] text-white/50">Please upload at least 4 images of the timepiece</p>
        <div className="grid grid-cols-4 gap-2">
          {["Front", "Back", "Left", "Buckle"].map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => setSlotImage(i)}
              className="aspect-square overflow-hidden rounded-sm bg-[#161616] text-[10px] text-white/40"
            >
              {images[i] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={images[i]} alt={label} className="h-full w-full object-cover" />
              ) : (
                <span className="flex h-full flex-col items-center justify-center gap-1">
                  +<span>{label}</span>
                </span>
              )}
            </button>
          ))}
        </div>
        <button type="button" className="text-[13px] text-[#E8D5C0]">
          + Upload video
        </button>

        <Field label="Manufacturer / Brand">
          <NativeSelect value={brand} onChange={(e) => setBrand(e.target.value)}>
            {TIER_ONE_BRANDS.map((b) => (
              <option key={b} value={b} className="bg-black">
                {b}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Your model (name or number)">
          <input
            value={model}
            onChange={(e) => setModel(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
            placeholder="Royal Oak Selfwinding"
          />
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
        <div className="space-y-3 border-b border-white/12 pb-3">
          <p className="text-[11px] tracking-[0.14em] text-white/45">Band</p>
          <div className="flex gap-8 text-[15px]">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={band === "strap"}
                onChange={() => setBand("strap")}
              />
              Strap
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={band === "bracelet"}
                onChange={() => setBand("bracelet")}
              />
              Metal bracelet
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
        <div className="grid grid-cols-2 gap-3 pt-2">
          <PillButton type="submit" variant="white">
            Save
          </PillButton>
          <PillButton type="button" variant="navy" onClick={onAppraise}>
            Appraise
          </PillButton>
        </div>
      </form>
    </main>
  );
}
