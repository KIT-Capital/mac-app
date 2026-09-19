"use client";

import { useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { catalogAppraisalPatch, moneyRange } from "@/lib/catalog";
import { canEditAppraisal } from "@/lib/roles.mjs";
import { useStore } from "@/lib/store";

const APPRAISER_REQUIRED = "Appraiser or super admin required";

export default function AdminAssetsPage() {
  const { timepieces, catalog, updateTimepiece, removeTimepiece, user } = useStore();
  const canAppraise = canEditAppraisal(user);
  const [error, setError] = useState("");

  async function save(operation: Promise<{ ok: boolean; error?: string }>) {
    const result = await operation;
    if (result.ok) {
      setError("");
      return;
    }
    setError(
      result.error === "ROLE_FORBIDDEN"
        ? `${APPRAISER_REQUIRED} to appraise.`
        : result.error || "The asset change could not be saved.",
    );
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
              disabled={!canAppraise}
              title={canAppraise ? undefined : APPRAISER_REQUIRED}
              className="disabled:cursor-not-allowed disabled:opacity-40"
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
