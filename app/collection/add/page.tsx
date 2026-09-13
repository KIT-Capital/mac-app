"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { LineField, NativeSelect } from "@/components/field";
import {
  BOX_PAPERS,
  BUCKLES,
  CASE_DIAMETERS,
  CASE_METALS,
  CASE_TYPES,
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
  const light = settings.appearance === "light";
  const [images, setImages] = useState<string[]>(["", "", ""]);
  const [videoName, setVideoName] = useState("");
  const [brand, setBrand] = useState("Audemars Piguet");
  const [customBrand, setCustomBrand] = useState("");
  const [model, setModel] = useState("Royal Oak Selfwinding");
  const [reference, setReference] = useState("");
  const [condition, setCondition] = useState("Like new");
  const [boxPapers, setBoxPapers] = useState("Box and papers");
  const [caseMetal, setCaseMetal] = useState("Titanium");
  const [caseType, setCaseType] = useState("Round");
  const [caseDiameter, setCaseDiameter] = useState("40mm");
  const [dialColor, setDialColor] = useState("Grey");
  const [buckle, setBuckle] = useState("Pin buckle");
  const [band, setBand] = useState<"strap" | "bracelet">("strap");
  const [bandMaterial, setBandMaterial] = useState("Leather");
  const [error, setError] = useState("");
  const [missingBrand, setMissingBrand] = useState(false);

  const resolvedBrand = missingBrand ? customBrand.trim() : brand;
  const models = MODELS_BY_BRAND[brand] ?? catalog.filter((c) => c.brand === brand).map((c) => c.model);

  const draft = useMemo(
    () =>
      ({
        id: `tp-${Date.now()}`,
        ownerEmail: user?.email,
        assetCode: new Date().toISOString().slice(0, 10).replaceAll("-", "") + `-${Date.now().toString().slice(-4)}`,
        brand: resolvedBrand || "Untitled manufacturer",
        model: model || "Untitled model",
        reference,
        images: images.filter(Boolean),
        status: "not_evaluated" as const,
        financeable: TIER_ONE_BRANDS.includes(resolvedBrand as (typeof TIER_ONE_BRANDS)[number]),
        condition,
        boxPapers,
        caseMetal,
        caseType,
        caseDiameter,
        dialColor,
        buckle,
        band,
        bandMaterial,
        complication: "I don't know",
      }) satisfies Timepiece,
    [
      band,
      bandMaterial,
      boxPapers,
      buckle,
      caseDiameter,
      caseMetal,
      caseType,
      condition,
      dialColor,
      images,
      model,
      reference,
      resolvedBrand,
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
    if (images.filter(Boolean).length < 3) missing.push("front, back, and left photos");
    if (!resolvedBrand) missing.push("a manufacturer");
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
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Add a Timepiece" backHref={onboarding ? "/collection/setup" : "/collection"} />
      <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-6">
          <div>
            <p className="text-[13px] text-mac-muted">Please upload at least 4 images of the timepiece</p>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {SLOTS.map((label, i) => (
                <label key={label} className="group block cursor-pointer text-center">
                  <span className="flex aspect-square items-center justify-center overflow-hidden rounded-md border border-mac-line bg-mac-card text-[28px] font-light text-mac-faint">
                    {images[i] ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={images[i]} alt={label} className="h-full w-full object-cover" />
                    ) : (
                      "+"
                    )}
                  </span>
                  <span className="mt-1.5 block text-[9px] tracking-[0.16em] text-mac-faint uppercase">
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
            <label className="block cursor-pointer text-[14px] text-mac-fg">
              + Upload video
              {videoName ? <span className="ml-2 text-[12px] text-mac-faint">{videoName}</span> : null}
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => setVideoName(e.target.files?.[0]?.name || "")}
              />
            </label>
          ) : null}

          <div>
            <LineField
              label="Manufacturer / Brand"
              onClear={() => {
                setBrand(TIER_ONE_BRANDS[0]);
                setCustomBrand("");
                setMissingBrand(false);
              }}
            >
              {missingBrand ? (
                <input
                  value={customBrand}
                  onChange={(e) => setCustomBrand(e.target.value)}
                  placeholder="Manufacturer name"
                  className="w-full bg-transparent text-[15px] text-mac-fg outline-none"
                />
              ) : (
                <NativeSelect
                  value={brand}
                  onChange={(e) => {
                    setBrand(e.target.value);
                    const next = MODELS_BY_BRAND[e.target.value]?.[0];
                    if (next) setModel(next);
                  }}
                >
                  {TIER_ONE_BRANDS.map((item) => (
                    <option key={item} value={item} className="bg-mac-card">
                      {item}
                    </option>
                  ))}
                </NativeSelect>
              )}
            </LineField>
            <button
              type="button"
              onClick={() => setMissingBrand((v) => !v)}
              className="mt-2 text-[12px] text-mac-muted underline underline-offset-4"
            >
              Missing a brand?
            </button>
          </div>

          <LineField label="Your Model (Name or Number)">
            {!missingBrand && models.length ? (
              <NativeSelect value={model} onChange={(e) => setModel(e.target.value)}>
                {models.map((item) => (
                  <option key={item} value={item} className="bg-mac-card">
                    {item}
                  </option>
                ))}
              </NativeSelect>
            ) : (
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-transparent text-[15px] text-mac-fg outline-none"
              />
            )}
          </LineField>
          <LineField label="Reference Number (if different from model)">
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full bg-transparent text-[15px] text-mac-fg outline-none"
            />
          </LineField>
          <LineField label="Condition">
            <NativeSelect value={condition} onChange={(e) => setCondition(e.target.value)}>
              {CONDITIONS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>
          <LineField label="Box and Papers">
            <NativeSelect value={boxPapers} onChange={(e) => setBoxPapers(e.target.value)}>
              {BOX_PAPERS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>
          <LineField label="Case Metal">
            <NativeSelect value={caseMetal} onChange={(e) => setCaseMetal(e.target.value)}>
              {CASE_METALS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>
          <LineField label="Case Type">
            <NativeSelect value={caseType} onChange={(e) => setCaseType(e.target.value)}>
              {CASE_TYPES.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>
          <LineField label="Case Diameter">
            <NativeSelect value={caseDiameter} onChange={(e) => setCaseDiameter(e.target.value)}>
              {CASE_DIAMETERS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>
          <LineField label="Dial Color">
            <NativeSelect value={dialColor} onChange={(e) => setDialColor(e.target.value)}>
              {DIAL_COLORS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>
          <LineField label="Buckle">
            <NativeSelect value={buckle} onChange={(e) => setBuckle(e.target.value)}>
              {BUCKLES.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>

          <div className="border-b border-mac-line py-3">
            <p className="text-[12px] text-mac-faint">Band</p>
            <div className="mt-2 flex gap-8 text-[14px]">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={band === "strap"}
                  onChange={() => setBand("strap")}
                  className="accent-[#0E2A44]"
                />
                Strap
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={band === "bracelet"}
                  onChange={() => setBand("bracelet")}
                  className="accent-[#0E2A44]"
                />
                Metal Bracelet
              </label>
            </div>
          </div>

          <LineField label={band === "strap" ? "Strap Material" : "Bracelet Material"}>
            <NativeSelect value={bandMaterial} onChange={(e) => setBandMaterial(e.target.value)}>
              {STRAP_MATERIALS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>

          <p className="pt-1 text-[11px] leading-5 text-mac-faint">
            *Once you click appraise, the timepiece profile can only be modified by contacting us.
          </p>
          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </div>

        <div className="grid grid-cols-2 gap-3 border-t border-mac-line bg-mac-bg px-5 py-4">
          <button
            type="submit"
            className={`mac-tap flex h-12 items-center justify-center text-[12px] font-semibold tracking-[0.18em] uppercase ${
              light ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            Save
          </button>
          <button
            type="button"
            onClick={onAppraise}
            className="mac-tap flex h-12 items-center justify-center bg-[#0E2A44] text-[12px] font-semibold tracking-[0.18em] text-white uppercase"
          >
            Appraise
          </button>
        </div>
      </form>
    </main>
  );
}

export default function AddTimepiecePage() {
  return (
    <Suspense fallback={<div className="flex flex-1 items-center justify-center text-mac-faint">Loading</div>}>
      <AddForm />
    </Suspense>
  );
}
