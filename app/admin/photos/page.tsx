"use client";

import { useState } from "react";
import { AdminChrome } from "@/components/admin-chrome";
import { NativeSelect } from "@/components/field";
import { readImageFile } from "@/lib/image";
import { useStore } from "@/lib/store";
import type { PhotoKind } from "@/lib/types";

export default function AdminPhotosPage() {
  const { photos, timepieces, upsertPhoto, removePhoto, user } = useStore();
  const [kind, setKind] = useState<PhotoKind>("front");
  const [assetId, setAssetId] = useState(timepieces[0]?.id || "");

  async function onUpload(file?: File) {
    if (!file) return;
    const url = await readImageFile(file);
    upsertPhoto({
      id: `ph-${Date.now()}`,
      url,
      kind,
      assetId: assetId || undefined,
      caption: file.name,
      uploadedAt: new Date().toISOString().slice(0, 10),
      ownerEmail: user?.email || "",
    });
  }

  return (
    <AdminChrome title="Photo library">
      <div className="mb-5 flex flex-wrap items-end gap-4">
        <label className="text-[12px] text-white/50">
          Kind
          <NativeSelect value={kind} onChange={(e) => setKind(e.target.value as PhotoKind)} className="mt-1 block w-40 border-b border-white/15">
            {["front", "back", "left", "buckle", "papers", "other"].map((k) => (
              <option key={k} value={k} className="bg-black">
                {k}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="text-[12px] text-white/50">
          Asset
          <NativeSelect value={assetId} onChange={(e) => setAssetId(e.target.value)} className="mt-1 block w-56 border-b border-white/15">
            <option value="" className="bg-black">Unassigned</option>
            {timepieces.map((w) => (
              <option key={w.id} value={w.id} className="bg-black">
                {w.brand} {w.model}
              </option>
            ))}
          </NativeSelect>
        </label>
        <label className="mac-tap flex h-11 items-center rounded-xl bg-[#FCB040] px-5 text-[12px] font-bold tracking-[0.16em] text-[#0A0D14] uppercase shadow-sm cursor-pointer hover:bg-[#ffbe59]">
          Upload Photo
          <input type="file" accept="image/*" className="sr-only" onChange={(e) => onUpload(e.target.files?.[0])} />
        </label>
      </div>
      {photos.length === 0 ? (
        <p className="text-sm text-white/45">No photographs yet. Restore the demo collection or upload one.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {photos.map((photo) => (
            <figure key={photo.id} className="bg-[#111]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption} className="aspect-square w-full object-cover" />
              <figcaption className="flex items-center justify-between px-2 py-2 text-[11px] text-white/55">
                <span className="uppercase">{photo.kind}</span>
                <button type="button" className="text-[#FCB040]" onClick={() => removePhoto(photo.id)}>
                  Remove
                </button>
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </AdminChrome>
  );
}
