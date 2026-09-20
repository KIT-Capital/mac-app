"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AdminScaleFields } from "@/components/admin-scale-fields";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, NativeSelect, PillButton } from "@/components/field";
import { isDesk, money } from "@/lib/catalog";
import { bookLabel, deskToday, validateAgreementEnd } from "@/lib/contract/repo-book.mjs";
import { repurchaseDollars, settingsToTerms } from "@/lib/contract/repo-scale.mjs";
import { persistableState } from "@/lib/session-persist.mjs";
import { useStore } from "@/lib/store";
import type { Agreement, AgreementEnd, AgreementShell, AppState, BookEndKind } from "@/lib/types";

function blankShell(termMonths = 12): AgreementShell {
  const scale = settingsToTerms({}, termMonths);
  return {
    id: "",
    code: "",
    title: "12-month repurchase",
    termMonths,
    rate: scale.annualAdjustment,
    ltv: scale.purchaseShare,
    setupFee: scale.setupFee,
    earlyRepurchaseAmount: scale.earlyRepurchaseAmount,
    brokerFee: scale.brokerFee,
    minMonths: scale.minMonths,
    earlyStartMonth: scale.earlyStartMonth,
    earlyUntilMonth: scale.earlyUntilMonth,
    status: "open",
    createdAt: new Date().toISOString().slice(0, 10),
  };
}

const END_KIND_OPTIONS: { value: BookEndKind; label: string }[] = [
  { value: "bought_back", label: "Bought back" },
  { value: "in_liquidation", label: "In liquidation" },
  { value: "liquidated", label: "Liquidated" },
];

const END_ERRORS: Record<string, string> = {
  MISSING_DATE: "Enter the end date.",
  DATE_BEFORE_CREATED: "End date cannot be before the agreement date.",
  DATE_AFTER_TODAY: "End date cannot be after today.",
  INVALID_AMOUNT: "Enter a dollar amount of zero or more.",
  INVALID_KIND: "Choose bought back, in liquidation, or liquidated.",
  NOT_LIVE: "Only an open, past due, or in-liquidation repo can be renewed.",
  NOT_FOUND: "That repo is no longer on the desk.",
  LIVE_WATCH_CONFLICT: "Those timepieces are already on another live repo.",
};

function exportableBook(state: AppState) {
  return persistableState({
    hydrated: state.hydrated,
    user: null,
    timepieces: state.timepieces.map((watch) => ({
      ...watch,
      images: (watch.images ?? []).filter((image) => !String(image).startsWith("data:")),
    })),
    agreements: state.agreements,
    users: state.users,
    catalog: state.catalog,
    shells: state.shells,
    photos: [],
    settings: state.settings,
    profiles: state.profiles,
  });
}

function LiveBookImportPanel() {
  const store = useStore();
  const [confirmLiveImport, setConfirmLiveImport] = useState(false);
  const [report, setReport] = useState("");
  const [busy, setBusy] = useState(false);

  async function post(commit: boolean) {
    setBusy(true);
    setReport("");
    try {
      const response = await fetch("/api/desk/live-book-import", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          payload: exportableBook(store),
          confirmLiveImport,
          commit,
        }),
      });
      const body = (await response.json()) as {
        error?: string;
        plan?: { customers?: unknown[]; timepieces?: unknown[]; agreements?: unknown[]; rejects?: unknown[] };
      };
      if (!response.ok) {
        setReport(body.error || "Import could not run.");
        return;
      }
      let previewCount = 0;
      if (commit) {
        for (const watch of store.timepieces) {
          const previewUrl = (watch.images ?? []).find((image) => String(image).startsWith("data:"));
          if (!previewUrl) continue;
          const preview = await fetch("/api/desk/live-book-preview", {
            method: "POST",
            credentials: "include",
            cache: "no-store",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ timepieceId: watch.id, previewUrl, kind: "legacy_preview" }),
          });
          if (preview.ok) previewCount += 1;
        }
      }
      setReport(
        `${commit ? "Imported" : "Dry-run"}: ${body.plan?.customers?.length ?? 0} people, ${body.plan?.timepieces?.length ?? 0} pieces, ${body.plan?.agreements?.length ?? 0} repos${
          commit && previewCount ? `, ${previewCount} previews` : ""
        }. The collector screen still reads this browser.`,
      );
    } catch {
      setReport("Import could not run.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-10 space-y-3 border border-white/25 bg-[#222] p-4">
      <h2 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Development book import</h2>
      <p className="text-[12px] text-white/55">
        Staff can copy this browser book onto Neon development. Preview photos that are still data URLs
        stay off the main request and follow one at a time after a successful import. The owner flag stays
        off.
      </p>
      <label className="flex items-center gap-2 text-[12px] text-white/70">
        <input
          type="checkbox"
          checked={confirmLiveImport}
          onChange={(event) => setConfirmLiveImport(event.target.checked)}
        />
        This is the live book, not the in-memory demo.
      </label>
      <div className="flex flex-wrap gap-3">
        <PillButton type="button" variant="navy" className="md:w-auto px-6" disabled={busy} onClick={() => void post(false)}>
          Dry-run import
        </PillButton>
        <PillButton type="button" variant="gold" className="md:w-auto px-6" disabled={busy} onClick={() => void post(true)}>
          Import to development
        </PillButton>
      </div>
      {report ? <p className="text-[12px] text-white/60">{report}</p> : null}
    </section>
  );
}

function endDraftFrom(agreement: Agreement) {
  return {
    kind: agreement.bookEnd?.kind ?? "bought_back",
    date: agreement.bookEnd?.date ?? deskToday(),
    amount: agreement.bookEnd ? String(agreement.bookEnd.amount) : "",
  };
}

export default function AdminAgreementsPage() {
  const {
    agreements,
    shells,
    settings,
    upsertShell,
    removeShell,
    removeAgreement,
    signAgreement,
    updateAgreement,
    recordAgreementEnd,
    renewAgreement,
    clearAgreementEnd,
    user,
  } = useStore();
  const [draft, setDraft] = useState<AgreementShell>(blankShell(settings.typicalTerm));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [endDraft, setEndDraft] = useState({ kind: "bought_back" as BookEndKind, date: "", amount: "" });
  const [endError, setEndError] = useState("");
  const [shellError, setShellError] = useState("");
  const [documentNote, setDocumentNote] = useState<{ id: string; text: string } | null>(null);
  const [sendHistory, setSendHistory] = useState<{ id: string; rows: { actorKind: string; recipientKind: string; result: string }[] } | null>(null);
  const selected = agreements.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId) return;
    const id = selectedId;
    let cancelled = false;
    fetch(`/api/agreement-documents?liveAgreementId=${encodeURIComponent(id)}`, {
      credentials: "include",
      cache: "no-store",
    })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as {
          mode?: string;
          error?: string;
          documents?: { version?: number; status?: string; checksum?: string | null }[];
          sends?: { actorKind?: string; recipientKind?: string; result?: string }[];
        } | null;
        if (cancelled) return;
        if (body?.error === "PASSWORD_ROTATION_REQUIRED") {
          window.location.replace("/admin/password");
          return;
        }
        if (!response.ok) {
          setDocumentNote({ id, text: "Could not check this document." });
          setSendHistory({ id, rows: [] });
          return;
        }
        if (body?.mode !== "live") {
          setDocumentNote({ id, text: "No stored document in browser mode." });
          setSendHistory({ id, rows: [] });
          return;
        }
        const newest = body.documents?.find((row) => row.status === "stored") ?? body.documents?.[0];
        setDocumentNote({
          id,
          text: newest
            ? `Version ${newest.version} · ${newest.status}${newest.checksum ? ` · ${newest.checksum.slice(0, 8)}` : ""}`
            : "No stored document for this repo.",
        });
        setSendHistory({
          id,
          rows: (body.sends ?? []).map((row) => ({
            actorKind: row.actorKind ?? "collector",
            recipientKind: row.recipientKind ?? "self",
            result: row.result ?? "",
          })),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setDocumentNote({ id, text: "Could not check this document." });
          setSendHistory({ id, rows: [] });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.code) return;
    setShellError("");
    const result = await upsertShell({ ...draft, id: draft.id || `shell-${Date.now()}` });
    if (!result.ok) {
      setShellError("The agreement shell could not be saved.");
      return;
    }
    setDraft(blankShell(settings.typicalTerm));
  }

  async function onRemoveShell(id: string) {
    setShellError("");
    const result = await removeShell(id);
    if (!result.ok) setShellError("The agreement shell could not be removed.");
  }

  const scaleSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function saveContractScale(agreement: Agreement, scale: ReturnType<typeof settingsToTerms>) {
    if (agreement.signedAt) return;
    if (scaleSaveTimer.current) clearTimeout(scaleSaveTimer.current);
    scaleSaveTimer.current = setTimeout(() => {
      updateAgreement(agreement.id, {
        scale,
        termMonths: agreement.termMonths,
      });
    }, 400);
  }

  function selectLiveRow(agreement: Agreement) {
    setSelectedId((current) => {
      const next = current === agreement.id ? null : agreement.id;
      if (next) {
        setEndDraft(endDraftFrom(agreement));
        setEndError("");
      }
      return next;
    });
  }

  async function onRecordEnd(e: FormEvent, agreement: Agreement) {
    e.preventDefault();
    const amount = endDraft.amount === "" ? Number.NaN : Number(endDraft.amount);
    const input: AgreementEnd = { kind: endDraft.kind, date: endDraft.date, amount };
    const checked = validateAgreementEnd(agreement, input, deskToday());
    if (!checked.ok) {
      setEndError(END_ERRORS[checked.error] ?? "Enter a date and amount.");
      return;
    }
    const recorded = await recordAgreementEnd(agreement.id, checked.end as AgreementEnd);
    if (!recorded.ok) {
      setEndError(END_ERRORS[recorded.error] ?? "Enter a date and amount.");
      return;
    }
    setEndError("");
    setEndDraft({ kind: checked.end.kind as BookEndKind, date: checked.end.date, amount: String(checked.end.amount) });
  }

  async function onRenew(agreement: Agreement) {
    const closeDate = endDraft.date || deskToday();
    const result = await renewAgreement(agreement.id, closeDate);
    if (!result.ok) {
      setEndError(END_ERRORS[result.error] ?? "Renewal could not be recorded.");
      return;
    }
    setEndError("");
    setSelectedId(result.successor.id);
    setEndDraft(endDraftFrom(result.successor));
  }

  return (
    <AdminChrome title="Agreement databases">
      <h2 className="mb-3 text-[11px] tracking-[0.16em] text-white/40 uppercase">Agreement shells</h2>
      <form onSubmit={onSubmit} className="mb-6 grid gap-4 md:grid-cols-3">
        <Field label="Code">
          <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Title">
          <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} className="w-full bg-transparent py-1 text-[16px] outline-none" />
        </Field>
        <Field label="Status">
          <NativeSelect value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as AgreementShell["status"] })}>
            <option className="bg-black" value="open">Open</option>
            <option className="bg-black" value="assigned">Assigned</option>
            <option className="bg-black" value="closed">Closed</option>
          </NativeSelect>
        </Field>
        <Field label="Term months">
          <input
            type="number"
            value={draft.termMonths}
            onChange={(e) => setDraft({ ...draft, termMonths: Number(e.target.value) })}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <div className="md:col-span-3">
          <AdminScaleFields
            value={settingsToTerms(draft, draft.termMonths)}
            onChange={(next) =>
              setDraft({
                ...draft,
                ltv: next.purchaseShare,
                rate: next.annualAdjustment,
                setupFee: next.setupFee,
                earlyRepurchaseAmount: next.earlyRepurchaseAmount,
                brokerFee: next.brokerFee,
                minMonths: next.minMonths,
                earlyStartMonth: next.earlyStartMonth,
                earlyUntilMonth: next.earlyUntilMonth,
              })
            }
          />
        </div>
        <PillButton type="submit" variant="gold" className="md:col-span-3">
          Save Agreement Shell
        </PillButton>
      </form>
      {shellError ? <p className="mb-4 text-sm text-red-300">{shellError}</p> : null}
      <AdminTable
        headers={["Code", "Title", "Term", "Max purchase", "Status", ""]}
        rows={shells.map((s) => [
          s.code,
          s.title,
          `${s.termMonths} mo`,
          `${Math.round(s.ltv * 100)}%`,
          s.status === "open" ? "Open" : s.status === "assigned" ? "Assigned" : "Closed",
          <div key={s.id} className="flex gap-3 text-[#FCB040]">
            <button type="button" onClick={() => setDraft(s)}>Edit</button>
            <button type="button" onClick={() => void onRemoveShell(s.id)}>Remove</button>
          </div>,
        ])}
      />

      <h2 className="mt-8 mb-3 text-[11px] tracking-[0.16em] text-white/40 uppercase">Live agreements</h2>
      <AdminTable
        headers={["Code", "Owner", "Amount", "Signature", "Book", ""]}
        selectedRow={agreements.findIndex((a) => a.id === selectedId)}
        onRowSelect={(index) => {
          const agreement = agreements[index];
          if (agreement) selectLiveRow(agreement);
        }}
        rows={agreements.map((a) => [
          a.agreementCode || a.id,
          a.ownerName,
          money(a.amount),
          a.signedAt ? "signed" : a.status.replace("_", " "),
          bookLabel(a),
          <div key={a.id} className="flex gap-3 text-[#FCB040]" onClick={(event) => event.stopPropagation()}>
            <button type="button" onClick={() => void signAgreement(a.id)}>Mark signed</button>
            {!a.signedAt && !a.bookEnd ? (
              <button type="button" onClick={() => void removeAgreement(a.id)}>Remove</button>
            ) : null}
          </div>,
        ])}
        expandedRows={agreements.map((a) => {
          if (a.id !== selectedId) return null;
          const scale = settingsToTerms(a.scale ?? settings, a.termMonths);
          const scalePrice = repurchaseDollars(a.amount, a.termMonths, scale);
          return (
            <form
              key={`${a.id}-end`}
              onClick={(event) => event.stopPropagation()}
              onSubmit={(event) => onRecordEnd(event, a)}
              className="grid gap-4 md:grid-cols-3"
            >
              <Field label="End">
                <NativeSelect
                  aria-label="End"
                  value={endDraft.kind}
                  onChange={(e) => setEndDraft({ ...endDraft, kind: e.target.value as BookEndKind })}
                >
                  {END_KIND_OPTIONS.map((option) => (
                    <option key={option.value} className="bg-black" value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="End date">
                <input
                  type="date"
                  value={endDraft.date}
                  onChange={(e) => setEndDraft({ ...endDraft, date: e.target.value })}
                  className="w-full bg-transparent py-1 text-[16px] outline-none"
                />
              </Field>
              <Field label="Amount">
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={endDraft.amount}
                  onChange={(e) => setEndDraft({ ...endDraft, amount: e.target.value })}
                  className="w-full bg-transparent py-1 text-[16px] outline-none"
                />
              </Field>
              <p className="md:col-span-3 text-[12px] text-white/50">
                This month&apos;s repurchase on the scale is {scalePrice == null ? "—" : money(scalePrice)}. Staff type the dollars.
              </p>
              {endError ? <p className="md:col-span-3 text-sm text-red-400">{endError}</p> : null}
              {a.bookEnd ? (
                <p className="md:col-span-3 text-[12px] text-white/60">
                  Recorded {bookLabel(a)} on {a.bookEnd.date} for {money(a.bookEnd.amount)}.
                </p>
              ) : null}
              <div className="md:col-span-3 flex flex-wrap gap-3">
                <PillButton type="submit" variant="gold" className="md:w-auto px-6">
                  {a.bookEnd ? "Overwrite end" : "Record end"}
                </PillButton>
                {isDesk(user) && (!a.bookEnd || a.bookEnd.kind === "in_liquidation") ? (
                  <PillButton
                    type="button"
                    variant="navy"
                    className="md:w-auto px-6"
                    onClick={() => onRenew(a)}
                  >
                    Renew
                  </PillButton>
                ) : null}
                {a.bookEnd ? (
                  <button
                    type="button"
                    className="text-[12px] font-bold tracking-[0.18em] text-[#FCB040] uppercase"
                    onClick={async () => {
                      if (!await clearAgreementEnd(a.id)) {
                        setEndError(END_ERRORS.LIVE_WATCH_CONFLICT);
                        return;
                      }
                      setEndError("");
                      setEndDraft(endDraftFrom({ ...a, bookEnd: undefined }));
                    }}
                  >
                    Clear end
                  </button>
                ) : null}
              </div>
            </form>
          );
        })}
      />

      {selected ? (
        <section className="mt-6 space-y-2 border border-white/25 bg-[#222] p-4">
          <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">
            Document — {selected.agreementCode || selected.id}
          </h3>
          <p className="text-[12px] text-white/60">
            {documentNote?.id === selected.id ? documentNote.text : "Checking document…"}
          </p>
          {sendHistory?.id === selected.id && sendHistory.rows.length ? (
            <ul className="space-y-1 text-[12px] text-white/55">
              {sendHistory.rows.map((row, index) => (
                <li key={`${row.actorKind}-${row.recipientKind}-${row.result}-${index}`}>
                  {row.actorKind} · {row.recipientKind} · {row.result}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {selected && !selected.signedAt && !selected.bookEnd ? (
        <section className="mt-6 space-y-4 border border-white/25 bg-[#222] p-4">
          <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">
            Contract terms — {selected.agreementCode || selected.id}
          </h3>
          <p className="text-sm text-white/55">
            These fees apply only to this repo. Defaults stay on Configure the app.
          </p>
          <AdminScaleFields
            value={settingsToTerms(selected.scale ?? settings, selected.termMonths)}
            onChange={(next) => saveContractScale(selected, next)}
          />
        </section>
      ) : null}
      <LiveBookImportPanel />
    </AdminChrome>
  );
}
