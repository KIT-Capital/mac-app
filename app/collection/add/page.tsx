"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useRef, useState } from "react";
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
  STRAP_MATERIALS,
  catalogValuation,
  isDesk,
} from "@/lib/catalog";
import { pickerBrandNames, pickerModelsForBrand } from "@/lib/catalog-retail.mjs";
import { catalogIdForSelection, assertVideoDuration, MAX_VIDEO_SECONDS } from "@/lib/client-pieces";
import { nextId } from "@/lib/ids";
import { fetchWithTimeout } from "@/lib/fetch-timeout.mjs";
import { readImageFile, type ImageReadResult } from "@/lib/image";
import { ownerKey } from "@/lib/ownership";
import { storePhoto } from "@/lib/photo-upload.mjs";
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
  const { addTimepiece, updateTimepiece, bookMode, brands, catalog, user, settings, timepieces } = useStore();
  const light = (user?.preferences.appearance ?? settings.appearance) === "light";
  const editingId = params.get("id");
  const existing = timepieces.find((w) => {
    if (w.id !== editingId) return false;
    if (isDesk(user)) return true;
    return ownerKey(w.ownerEmail) === ownerKey(user?.email);
  });
  const [images, setImages] = useState<string[]>(() => slotsFromExisting(existing?.images, existing?.photoKinds));
  const [uploads, setUploads] = useState<(ImageReadResult | null)[]>(() => TIMEPIECE_SHOTS.map(() => null));
  const [slotStates, setSlotStates] = useState<("selected" | "uploading" | "stored" | "failed")[]>(() =>
    TIMEPIECE_SHOTS.map((_, index) => images[index] ? "stored" : "selected"),
  );
  const [piecePersisted, setPiecePersisted] = useState(Boolean(existing));
  const submissionLock = useRef(false);
  const selectionGenerations = useRef(TIMEPIECE_SHOTS.map(() => 0));
  const uploadLocks = useRef(TIMEPIECE_SHOTS.map(() => false));
  const [submitting, setSubmitting] = useState(false);
  const [hasBox, setHasBox] = useState(() => Boolean(existing));
  const [hasPapers, setHasPapers] = useState(() => Boolean(existing));
  const [videoName, setVideoName] = useState(existing?.videoName ?? "");
  const [videoDurationSeconds, setVideoDurationSeconds] = useState<number | null>(
    existing?.videoDurationSeconds ?? null,
  );
  const deskPicker = isDesk(user);
  const brandNames = pickerBrandNames(brands ?? [], catalog ?? [], deskPicker);
  const [brand, setBrand] = useState(() => {
    const requested = params.get("brand") ?? "";
    if (existing && brandNames.includes(existing.brand)) return existing.brand;
    if (requested && brandNames.includes(requested)) return requested;
    return brandNames[0] ?? "";
  });
  const [customBrand, setCustomBrand] = useState(
    existing && !brandNames.includes(existing.brand) ? existing.brand : "",
  );
  const [model, setModel] = useState(() => {
    const requested = params.get("model") ?? "";
    return existing?.model ?? requested ?? "";
  });
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
    Boolean((existing && !brandNames.includes(existing.brand)) || !brandNames.length),
  );
  const [draftId] = useState(() => nextId("tp"));

  const resolvedBrand = missingBrand ? customBrand.trim() : brand;
  const models = pickerModelsForBrand(brands ?? [], catalog ?? [], brand, deskPicker);

  const persistedImages = images.map((image, index) =>
    bookMode === "live" && slotStates[index] !== "stored" ? "" : image,
  );
  const packedShots = packShots(persistedImages).map((shot) => ({
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
        serial: existing?.serial ?? null,
        catalogId: missingBrand ? null : catalogIdForSelection(catalog ?? [], resolvedBrand, model, reference),
        images: packedShots.map((shot) => shot.url),
        photoKinds: packedShots.map((shot) => shot.kind),
        status: existing?.status ?? "not_evaluated",
        valueLow: existing?.valueLow,
        valueHigh: existing?.valueHigh,
        evaluatedAt: existing?.evaluatedAt,
        financeable:
          existing?.financeable ??
          catalogValuation({ brand: resolvedBrand, model }, catalog).financeable,
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
        videoName: videoName || null,
        videoDurationSeconds,
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
      catalog,
      missingBrand,
      videoName,
      videoDurationSeconds,
      user?.email,
    ]
  );

  async function onPick(index: number, file?: File) {
    if (!file) return;
    selectionGenerations.current[index] += 1;
    const generation = selectionGenerations.current[index];
    try {
      const data = await readImageFile(file);
      if (selectionGenerations.current[index] !== generation) return;
      setImages((prev) => {
        const copy = [...prev];
        copy[index] = data.previewDataUrl;
        return copy;
      });
      if (bookMode === "live") {
        setUploads((prev) => {
          const copy = [...prev];
          copy[index] = data;
          return copy;
        });
        setSlotStates((prev) => {
          const copy = [...prev];
          copy[index] = "selected";
          return copy;
        });
      } else {
        setSlotStates((prev) => {
          const copy = [...prev];
          copy[index] = "stored";
          return copy;
        });
      }
      setError("");
    } catch {
      setError("That photo could not be read.");
    }
  }

  async function uploadSlot(index: number, timepieceId: string) {
    if (uploadLocks.current[index]) return null;
    const image = uploads[index];
    if (!image) return null;
    uploadLocks.current[index] = true;
    setSlotStates((prev) => {
      const copy = [...prev];
      copy[index] = "uploading";
      return copy;
    });
    try {
      const photoId = await storePhoto({
        requestUpload: async () => {
          const response = await fetchWithTimeout("/api/photos", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "request-upload",
              timepieceId,
              kind: TIMEPIECE_SHOTS[index].kind,
              original: {
                size: image.original.size,
                type: image.original.type,
                sha256: image.originalSha256,
              },
              preview: {
                size: image.preview.size,
                type: image.preview.type,
                sha256: image.previewSha256,
              },
            }),
          });
          const body = await response.json().catch(() => null) as {
            upload?: {
              photoId: string;
              status: "pending" | "stored";
              original?: { url: string; headers: Record<string, string> };
              preview?: { url: string; headers: Record<string, string> };
            };
            error?: string;
          } | null;
          if (!response.ok || !body?.upload) throw new Error(body?.error || "PHOTO_UPLOAD_FAILED");
          return body.upload;
        },
        confirmUpload: async (id: string) => {
          const response = await fetchWithTimeout("/api/photos", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "confirm", photoId: id }),
          });
          const body = await response.json().catch(() => null) as {
            photo?: { status?: string };
            error?: string;
          } | null;
          if (!response.ok || !body?.photo) throw new Error(body?.error || "PHOTO_UPLOAD_FAILED");
          return body.photo;
        },
        parts: image,
      });
      setImages((prev) => {
        const copy = [...prev];
        copy[index] = photoId;
        return copy;
      });
      setSlotStates((prev) => {
        const copy = [...prev];
        copy[index] = "stored";
        return copy;
      });
      return photoId;
    } catch {
      setSlotStates((prev) => {
        const copy = [...prev];
        copy[index] = "failed";
        return copy;
      });
      return null;
    } finally {
      uploadLocks.current[index] = false;
    }
  }

  function stampedWatch(watch: Timepiece): Timepiece {
    return {
      ...watch,
      assetCode:
        watch.assetCode ||
        new Date().toISOString().slice(0, 10).replaceAll("-", "") + `-${Date.now().toString().slice(-4)}`,
    };
  }

  function finishPersistence(watch: Timepiece, notify: boolean) {
    if (notify && user) {
      void sendAppEmail({
        kind: "appraisal",
        name: user.name,
        email: user.email,
        phone: user.phone,
        watch: `${watch.brand} ${watch.model}`,
      });
    }
    router.push(onboarding ? "/collection/continue" : `/collection/${watch.id}`);
  }

  async function persistBrowser(watch: Timepiece, notify = false) {
    const stamped = stampedWatch(watch);
    const saved = existing
      ? await updateTimepiece(existing.id, stamped)
      : await addTimepiece(stamped);
    if (!saved.ok) {
      setError(saved.error || "That timepiece could not be saved.");
      return;
    }
    finishPersistence(stamped, notify);
  }

  function missingFields(slots: unknown[] = images) {
    const missing = [
      ...intakePhotoErrors({
        slots,
        hasBox,
        hasPapers,
        requiredPhotoKinds: settings.requiredPhotoKinds,
      }),
    ];
    if (!resolvedBrand) missing.push("a manufacturer");
    if (!model.trim()) missing.push("a model name");
    return missing;
  }

  async function persistLive(status: Timepiece["status"], notify = false) {
    if (!piecePersisted) {
      const initialMissing = missingFields(images);
      if (initialMissing.length) {
        setError(`Add ${formatIntakeList(initialMissing)}.`);
        return;
      }
    }
    const identityMissing = [];
    if (!resolvedBrand) identityMissing.push("a manufacturer");
    if (!model.trim()) identityMissing.push("a model name");
    if (identityMissing.length) {
      setError(`Add ${formatIntakeList(identityMissing)}.`);
      return;
    }

    const metadata = stampedWatch({ ...draft, images: [], photoKinds: [], status: existing?.status ?? "not_evaluated" });
    const saved = piecePersisted
      ? await updateTimepiece(metadata.id, metadata)
      : await addTimepiece(metadata);
    if (!saved.ok) {
      setError(saved.error || "That timepiece could not be saved.");
      return;
    }
    setPiecePersisted(true);

    const results = await Promise.all(
      uploads.map((upload, index) =>
        upload && slotStates[index] !== "stored" ? uploadSlot(index, metadata.id) : null,
      ),
    );
    const nextImages = [...persistedImages];
    const nextStates = [...slotStates];
    results.forEach((photoId, index) => {
      if (photoId) {
        nextImages[index] = photoId;
        nextStates[index] = "stored";
      } else if (uploads[index] && slotStates[index] !== "stored") {
        nextStates[index] = "failed";
      }
    });
    const liveSlots = nextStates.map((slotStatus, index) => ({ status: slotStatus, value: nextImages[index] }));
    const missing = missingFields(liveSlots);
    if (missing.length) {
      setError(`Add ${formatIntakeList(missing)}.`);
      return;
    }

    const shots = packShots(nextImages).map((shot) => ({ url: shot.url, kind: photoKind(shot.kind) }));
    const finalWatch = {
      ...metadata,
      status,
      images: shots.map((shot) => shot.url),
      photoKinds: shots.map((shot) => shot.kind),
    };
    const finalized = await updateTimepiece(metadata.id, finalWatch);
    if (!finalized.ok) {
      setError(finalized.error || "That timepiece could not be saved.");
      return;
    }
    finishPersistence(finalWatch, notify);
  }

  async function submit(status: Timepiece["status"], notify = false) {
    if (submissionLock.current) return;
    submissionLock.current = true;
    setSubmitting(true);
    try {
      if (bookMode === "live") {
        await persistLive(status, notify);
        return;
      }
      const missing = missingFields();
      if (missing.length) {
        setError(`Add ${formatIntakeList(missing)}.`);
        return;
      }
      await persistBrowser({ ...draft, status }, notify);
    } finally {
      submissionLock.current = false;
      setSubmitting(false);
    }
  }

  async function onSave(e: FormEvent) {
    e.preventDefault();
    // Intake only records the piece. A submission is created on the detail
    // screen by `appraisal.submit`, which freezes the evidence (KTD1).
    await submit(existing?.status ?? "not_evaluated");
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
              Upload each required photo so the desk can see the barrel from every side. You must
              confirm you have the box and the original documentation either way.
            </p>
            <div className="mt-4 space-y-3">
              {TIMEPIECE_SHOTS.map((shot, i) => {
                const required = isShotRequired(shot, settings.requiredPhotoKinds);
                return (
                  <label key={shot.kind} className="flex cursor-pointer items-center gap-3">
                    <span className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-mac-line bg-mac-card text-[22px] font-light text-mac-faint">
                      {images[i] ? (
                        <WatchPhoto src={images[i]} watch={draft} alt={shot.prompt} />
                      ) : (
                        <>
                          <WatchPhoto src={null} watch={draft} alt="" className="opacity-55" />
                          <span className="absolute inset-0 flex items-center justify-center text-white">+</span>
                        </>
                      )}
                      {slotStates[i] === "uploading" ? (
                        <span className="absolute inset-0 flex items-center justify-center bg-black/60 text-[9px] tracking-[0.14em] text-white uppercase">
                          Uploading
                        </span>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13px] text-mac-fg">{shot.prompt}</span>
                      <span className="mt-1 block text-[10px] tracking-[0.14em] text-mac-faint uppercase">
                        {slotStates[i] === "failed"
                          ? "Upload failed — choose again or retry"
                          : slotStates[i] === "stored" && images[i]
                            ? "Stored"
                            : required ? "Required" : "Optional"}
                      </span>
                      {bookMode === "live" && slotStates[i] === "failed" && piecePersisted ? (
                        <button
                          type="button"
                          className="mt-1 text-[11px] text-mac-gold underline underline-offset-4"
                          onClick={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            void uploadSlot(i, draft.id);
                          }}
                        >
                          Retry upload
                        </button>
                      ) : null}
                    </span>
                    <input
                      type="file"
                      accept="image/*"
                      aria-label={shot.prompt}
                      disabled={submitting || slotStates[i] === "uploading"}
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
                  className="mt-0.5 accent-mac-navy"
                />
                I have the box
              </label>
              <label className="flex items-start gap-3 text-[13px] text-mac-fg">
                <input
                  type="checkbox"
                  checked={hasPapers}
                  onChange={(e) => setHasPapers(e.target.checked)}
                  className="mt-0.5 accent-mac-navy"
                />
                I have the original documentation
              </label>
            </div>
          </div>

          {settings.allowVideo ? (
            <label className="block cursor-pointer text-[14px] text-mac-fg">
              + Upload video
              {videoName ? (
                <span className="ml-2 text-[12px] text-mac-faint">
                  {videoName}
                  {videoDurationSeconds ? ` · ${Math.round(videoDurationSeconds)}s` : ""}
                </span>
              ) : (
                <span className="ml-2 text-[12px] text-mac-faint">up to {MAX_VIDEO_SECONDS} seconds</span>
              )}
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) {
                    setVideoName("");
                    setVideoDurationSeconds(null);
                    return;
                  }
                  const url = URL.createObjectURL(file);
                  const node = document.createElement("video");
                  node.preload = "metadata";
                  node.onloadedmetadata = () => {
                    URL.revokeObjectURL(url);
                    try {
                      const seconds = assertVideoDuration(node.duration);
                      setVideoName(file.name);
                      setVideoDurationSeconds(seconds);
                      setError("");
                    } catch {
                      setVideoName("");
                      setVideoDurationSeconds(null);
                      setError(`Use a clip of ${MAX_VIDEO_SECONDS} seconds or less.`);
                    }
                  };
                  node.onerror = () => {
                    URL.revokeObjectURL(url);
                    setVideoName("");
                    setVideoDurationSeconds(null);
                    setError("That video could not be read.");
                  };
                  node.src = url;
                }}
              />
            </label>
          ) : null}

          <div>
            <LineField
              label="Manufacturer / Brand"
              onClear={() => {
                setBrand(brandNames[0] ?? "");
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
                    const next = pickerModelsForBrand(brands ?? [], catalog ?? [], e.target.value, deskPicker)[0];
                    if (next) setModel(next);
                  }}
                >
                  {brandNames.map((item) => (
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
                  className="accent-mac-navy"
                />
                Strap
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={band === "bracelet"}
                  onChange={() => setBand("bracelet")}
                  className="accent-mac-navy"
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
            disabled={submitting}
            className={`mac-tap flex h-12 items-center justify-center text-[12px] font-semibold tracking-[0.18em] uppercase ${
              light ? "bg-black text-white" : "bg-white text-black"
            }`}
          >
            Save
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
