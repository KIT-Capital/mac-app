"use client";

import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { moneyRange } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AdminAssetsPage() {
  const { timepieces, updateTimepiece, removeTimepiece } = useStore();

  return (
    <AdminChrome title="Asset database">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Collector pieces. Match a catalog reference first; if missing, create the asset from the
        photographs and specifications.
      </p>
      <AdminTable
        headers={["Code", "Piece", "Owner", "Status", "Value", ""]}
        rows={timepieces.map((w) => [
          w.assetCode || w.id,
          `${w.brand} ${w.model}`,
          w.ownerEmail || "—",
          w.status.replace("_", " "),
          moneyRange(w.valueLow, w.valueHigh),
          <div key={w.id} className="flex flex-wrap gap-3 text-[#FCB040]">
            <button type="button" onClick={() => updateTimepiece(w.id, { status: "reviewing" })}>
              Review
            </button>
            <button
              type="button"
              onClick={() =>
                updateTimepiece(w.id, {
                  status: "appraised",
                  evaluatedAt: new Date().toISOString().slice(0, 10),
                  valueLow: w.valueLow ?? 40000,
                  valueHigh: w.valueHigh ?? 55000,
                })
              }
            >
              Appraise
            </button>
            <button type="button" onClick={() => removeTimepiece(w.id)}>
              Remove
            </button>
          </div>,
        ])}
      />
    </AdminChrome>
  );
}
