"use client";

import { useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { catalogAppraisalPatch, moneyRange } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AdminAssetsPage() {
  const { timepieces, catalog, updateTimepiece, removeTimepiece } = useStore();
  const [error, setError] = useState("");

  async function save(operation: Promise<{ ok: boolean; error?: string }>) {
    const result = await operation;
    setError(result.ok ? "" : result.error || "The asset change could not be saved.");
  }

  return (
    <AdminChrome title="Asset database">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Collector pieces. Match a catalog reference first; if missing, create the asset from the
        photographs and specifications.
      </p>
      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}
      <AdminTable
        headers={["Code", "Piece", "Owner", "Status", "Value", ""]}
        rows={timepieces.map((w) => [
          w.assetCode || w.id,
          `${w.brand} ${w.model}`,
          w.ownerEmail || "—",
          w.status.replace("_", " "),
          moneyRange(w.valueLow, w.valueHigh),
          <div key={w.id} className="flex flex-wrap gap-3 text-[#FCB040]">
            <button type="button" onClick={() => void save(updateTimepiece(w.id, { status: "reviewing" }))}>
              Review
            </button>
            <button
              type="button"
              onClick={() => {
                const patch = catalogAppraisalPatch(
                  w,
                  catalog,
                  new Date().toISOString().slice(0, 10),
                );
                void save(updateTimepiece(w.id, patch));
              }}
            >
              Appraise
            </button>
            <button type="button" onClick={() => void save(removeTimepiece(w.id))}>
              Remove
            </button>
          </div>,
        ])}
      />
    </AdminChrome>
  );
}
