"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { LineField, NativeSelect } from "@/components/field";
import { WatchPhoto } from "@/components/watch-photo";
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
  isDesk,
} from "@/lib/catalog";
import { nextId } from "@/lib/ids";
import { readImageFile } from "@/lib/image";
import { ownerKey } from "@/lib/ownership";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";
import {
  TIMEPIECE_SHOTS,
  formatIntakeList,
  intakePhotoErrors,
  isShotRequired,
  packShots,
  slotsFromExisting,
} from "@/lib/timepiece-shots.mjs";
import type { PhotoKind, Timepiece } from "@/lib/types";

function photoKind(value: string): PhotoKind {
  switch (value) {
    case "front":
    case "back":
    case "left":
    case "right":
    case "clasp":
    case "more":
    case "buckle":
    case "box":
    case "papers":
    case "other":
      return value;
    default:
      throw new Error("UNKNOWN_SHOT_KIND");
  }
}

function AddForm() {
  const params = useSearchParams();
  const editingId = params.get("id");
  const { timepieces, user } = useStore();
  const existing = timepieces.find((w) => {
    if (w.id !== editingId) return false;
    if (isDesk(user)) return true;
    return ownerKey(w.ownerEmail) === ownerKey(user?.email);
  });
  return <AddFormEditor key={existing?.id ?? (editingId ? `pending:${editingId}` : "new")} />;
}

function AddFormEditor() {
  const router = useRouter();
  const params = useSearchParams();
  const onboarding = params.get("onboarding") === "1";
  const { addTimepiece, updateTimepiece, catalog, user, settings, timepieces } = useStore();
  const light = (user?.preferences.appearance ?? settings.appearance) === "light";
  const editingId = params.get("id");
  const existing = timepieces.find((w) => {
    if (w.id !== editingId) return false;
    if (isDesk(user)) return true;
    return ownerKey(w.ownerEmail) === ownerKey(user?.email);
  });
  const [images, setImages] = useState<string[]>(() => slotsFromExisting(existing?.images, existing?.photoKinds));
  const [hasBox, setHasBox] = useState(() => Boolean(existing));
  const [hasPapers, setHasPapers] = useState(() => Boolean(existing));
  const [videoName, setVideoName] = useState("");
  const [brand, setBrand] = useState(
    existing && TIER_ONE_BRANDS.includes(existing.brand as (typeof TIER_ONE_BRANDS)[number])
      ? existing.brand
      : "Audemars Piguet",
  );
  const [customBrand, setCustomBrand] = useState(
    existing && !TIER_ONE_BRANDS.includes(existing.brand as (typeof TIER_ONE_BRANDS)[number])
      ? existing.brand
      : "",
  );
  const [model, setModel] = useState(existing?.model ?? "Royal Oak Selfwinding");
  const [reference, setReference] = useState(existing?.reference || "");
  const [condition, setCondition] = useState(existing?.condition ?? "Like new");
  const [boxPapers, setBoxPapers] = useState(existing?.boxPapers ?? "Box and papers");
  const [caseMetal, setCaseMetal] = useState(existing?.caseMetal ?? "Titanium");
  const [caseType, setCaseType] = useState(existing?.caseType ?? "Round");
  const [caseDiameter, setCaseDiameter] = useState(existing?.caseDiameter ?? "40mm");
  const [dialColor, setDialColor] = useState(existing?.dialColor ?? "Grey");
  const [buckle, setBuckle] = useState(existing?.buckle ?? "Pin buckle");
  const [band, setBand] = useState<"strap" | "bracelet">(existing?.band ?? "strap");
  const [bandMaterial, setBandMaterial] = useState(existing?.bandMaterial ?? "Leather");
  const [complication, setComplication] = useState(existing?.complication ?? "I don't know");
  const [error, setError] = useState("");
  const [missingBrand, setMissingBrand] = useState(
    Boolean(existing && !TIER_ONE_BRANDS.includes(existing.brand as (typeof TIER_ONE_BRANDS)[number])),
  );
  const [draftId] = useState(() => nextId("tp"));

  const resolvedBrand = missingBrand ? customBrand.trim() : brand;
  const models = MODELS_BY_BRAND[brand] ?? catalog.filter((c) => c.brand === brand).map((c) => c.model);

  const packedShots = packShots(images).map((shot) => ({
    url: shot.url,
    kind: photoKind(shot.kind),
  }));
  const draft = useMemo(
    () =>
      ({
        id: existing?.id ?? draftId,
        ownerEmail: user?.email,
        assetCode: existing?.assetCode ?? "",
        brand: resolvedBrand || "Untitled manufacturer",
        model: model || "Untitled model",
        reference,
        images: packedShots.map((shot) => shot.url),
        photoKinds: packedShots.map((shot) => shot.kind),
        status: existing?.status ?? "not_evaluated",
        valueLow: existing?.valueLow,
        valueHigh: existing?.valueHigh,
        evaluatedAt: existing?.evaluatedAt,
        financeable:
          existing?.financeable ??
          TIER_ONE_BRANDS.includes(resolvedBrand as (typeof TIER_ONE_BRANDS)[number]),
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
      buckle,
      caseDiameter,
      caseMetal,
      caseType,
      condition,
      dialColor,
      draftId,
      existing,
      complication,
      packedShots,
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
    const stamped: Timepiece = {
      ...watch,
      assetCode:
        watch.assetCode ||
        new Date().toISOString().slice(0, 10).replaceAll("-", "") + `-${Date.now().toString().slice(-4)}`,
    };
    if (existing) updateTimepiece(existing.id, stamped);
    else addTimepiece(stamped);
    if (notify && user) {
      void sendAppEmail({
        kind: "appraisal",
        name: user.name,
        email: user.email,
        phone: user.phone,
        watch: `${stamped.brand} ${stamped.model}`,
      });
    }
    router.push(onboarding ? "/collection/continue" : `/collection/${stamped.id}`);
  }

  function missingFields() {
    const missing = [
      ...intakePhotoErrors({
        slots: images,
        hasBox,
        hasPapers,
        requireFourPhotos: settings.requireFourPhotos,
      }),
    ];
    if (!resolvedBrand) missing.push("a manufacturer");
    if (!model.trim()) missing.push("a model name");
    return missing;
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    const missing = missingFields();
    if (missing.length) {
      setError(`Add ${formatIntakeList(missing)}.`);
      return;
    }
    persist(draft);
  }

  function onAppraise() {
    const missing = missingFields();
    if (missing.length) {
      setError(`Add ${formatIntakeList(missing)}.`);
      return;
    }
    persist({ ...draft, status: "reviewing" }, true);
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader
        title={existing ? "Edit Timepiece" : "Add a Timepiece"}
        backHref={onboarding ? "/collection/setup" : "/collection"}
      />
      <form onSubmit={onSave} className="flex min-h-0 flex-1 flex-col">
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5 pb-6">
          <div>
            <p className="text-[13px] text-mac-muted">
              Take each required photo so the desk can see the barrel from every side. Box and original
              documentation photos are optional, but you must confirm you have both.
            </p>
            <div className="mt-4 space-y-3">
              {TIMEPIECE_SHOTS.map((shot, i) => {
                const required = isShotRequired(shot, settings.requireFourPhotos);
                return (
                  <label key={shot.kind} className="flex cursor-pointer items-center gap-3">
                    <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-mac-line bg-mac-card text-[22px] font-light text-mac-faint">
                      {images[i] ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={images[i]} alt={shot.prompt} className="h-full w-full object-cover" />
                      ) : (
                        <>
                          <WatchPhoto src={null} watch={draft} alt="" className="opacity-55" />
                          <span className="absolute inset-0 flex items-center justify-center text-white">+</span>
                        </>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-mac-fg">{shot.prompt}</span>
                      <span className="mt-1 block text-[10px] tracking-[0.14em] text-mac-faint uppercase">
                        {required ? "Required" : "Optional"}
                      </span>
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      aria-label={shot.prompt}
                      className="sr-only"
                      onChange={(e) => onPick(i, e.target.files?.[0])}
                    />
                  </label>
                );
              })}
            </div>
            <div className="mt-4 space-y-3 border-t border-mac-line pt-4">
              <label className="flex items-start gap-3 text-[13px] text-mac-fg">
                <input
                  type="checkbox"
                  checked={hasBox}
                  onChange={(e) => setHasBox(e.target.checked)}
                  className="mt-0.5 accent-[#0E2A44]"
                />
                I have the box
              </label>
              <label className="flex items-start gap-3 text-[13px] text-mac-fg">
                <input
                  type="checkbox"
                  checked={hasPapers}
                  onChange={(e) => setHasPapers(e.target.checked)}
                  className="mt-0.5 accent-[#0E2A44]"
                />
                I have the original documentation
              </label>
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

          <LineField label="Complication">
            <NativeSelect value={complication} onChange={(e) => setComplication(e.target.value)}>
              {COMPLICATIONS.map((item) => (
                <option key={item} className="bg-mac-card">
                  {item}
                </option>
              ))}
            </NativeSelect>
          </LineField>

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
