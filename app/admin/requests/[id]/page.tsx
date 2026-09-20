"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AdminChrome } from "@/components/admin-chrome";
import {
  InspectionChecklist,
  INSPECTION_CHECKLIST,
  type ChecklistKey,
} from "@/components/desk/inspection-checklist";
import { DeskRequestThread, type DeskThreadEvent } from "@/components/desk/request-thread";
import { Field, PillButton } from "@/components/field";
import { APPRAISAL_WORDS } from "@/lib/appraisal-words";
import { money } from "@/lib/catalog";
import { appraisalView } from "@/lib/contract/repo-book.mjs";
import {
  forbiddenCopyWarning,
  hasRecordReturn,
  inspectPreview,
  isRequestRow,
  nextAllowedActions,
} from "@/lib/contract/request-transitions.mjs";
import { canInspect, isDeskRole } from "@/lib/roles.mjs";
import { hashSnapshot } from "@/lib/snapshot-hash";
import { useStore } from "@/lib/store";
import type { Timepiece } from "@/lib/types";

const APPRAISER_REQUIRED = "Appraiser or super admin required";

type ListedDocument = {
  id: string;
  version: number;
  status: string;
  checksum?: string | null;
  snapshotHash?: string;
};

type LoadedDocuments = {
  mode: "browser" | "live" | "unavailable";
  documents: ListedDocument[];
  events: DeskThreadEvent[];
};

type PieceDecision = "confirm" | "refuse" | "drop";

type PieceDraft = {
  decision: PieceDecision;
  inspectedValue: string;
  serialMatch: boolean;
  conditionMatch: boolean;
};

async function fetchAgreementDocuments(agreementId: string): Promise<LoadedDocuments> {
  const response = await fetch(`/api/agreement-documents?liveAgreementId=${encodeURIComponent(agreementId)}`, {
    credentials: "include",
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as {
    mode?: string;
    error?: string;
    documents?: ListedDocument[];
    events?: DeskThreadEvent[];
  } | null;
  if (body?.error === "PASSWORD_ROTATION_REQUIRED") {
    window.location.replace("/admin/password");
    return { mode: "browser", documents: [], events: [] };
  }
  if (body?.mode === "live") {
    return {
      mode: "live",
      documents: Array.isArray(body.documents) ? body.documents : [],
      events: Array.isArray(body.events) ? body.events : [],
    };
  }
  if (body?.mode === "unavailable") {
    return { mode: "unavailable", documents: [], events: [] };
  }
  return { mode: "browser", documents: [], events: [] };
}

function emptyChecklist(): Record<string, boolean> {
  return Object.fromEntries(INSPECTION_CHECKLIST.map((item) => [item.key, false]));
}

function pieceDraftsFor(watchIds: string[]): Record<string, PieceDraft> {
  return Object.fromEntries(watchIds.map((id) => [id, {
    decision: "confirm" as const,
    inspectedValue: "",
    serialMatch: false,
    conditionMatch: false,
  }]));
}

function dollarsToCents(raw: string) {
  const dollars = Number(String(raw).replace(/[^0-9.]/g, ""));
  if (!Number.isFinite(dollars) || dollars < 0) return null;
  return Math.round(dollars * 100);
}

function attemptForThisInspection(
  attempts: { timepieceId: string; status: string; finalizedAt?: string; finalizedAgreementId?: string; inspectedValueCents?: number }[],
  timepieceId: string,
  agreementId: string,
) {
  return attempts.find((attempt) => (
    attempt.timepieceId === timepieceId
    && attempt.status === "accepted"
    && Boolean(attempt.finalizedAt)
    && attempt.finalizedAgreementId === agreementId
  ));
}

export default function DeskRequestPage() {
  const params = useParams<{ id: string }>();
  const {
    agreements,
    timepieces,
    appraisalAttempts,
    user,
    deskReturnRequest,
    recordDeliveryRequest,
    inspectRequest,
    executeMacRequest,
    recordReturnRequest,
    flagRequestCustomerSuccess,
  } = useStore();
  const agreement = agreements.find((row) => row.id === params.id);
  const watches = timepieces.filter((watch) => agreement?.watchIds.includes(watch.id));
  const [note, setNote] = useState("");
  const [outcomeNote, setOutcomeNote] = useState("");
  const [showInternal, setShowInternal] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [bookMode, setBookMode] = useState<"browser" | "live" | "unavailable">("browser");
  const [documents, setDocuments] = useState<ListedDocument[]>([]);
  const [threadEvents, setThreadEvents] = useState<DeskThreadEvent[]>([]);
  const [pieces, setPieces] = useState<Record<string, PieceDraft>>({});
  const [checklist, setChecklist] = useState(emptyChecklist);
  const [paymentReference, setPaymentReference] = useState("");
  const [typedName, setTypedName] = useState("");

  useEffect(() => {
    if (!agreement) return;
    let cancelled = false;
    fetchAgreementDocuments(agreement.id)
      .then((loaded) => {
        if (cancelled) return;
        setBookMode(loaded.mode);
        setDocuments(loaded.documents);
        if (loaded.mode === "live") setThreadEvents(loaded.events);
      })
      .catch(() => {
        if (!cancelled) {
          setBookMode("browser");
          setDocuments([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agreement]);

  if (!agreement || !isRequestRow(agreement)) {
    return (
      <AdminChrome title="Request">
        <p className="text-sm text-white/60">That request is not on the desk.</p>
        <Link href="/admin/agreements" className="mt-3 inline-block text-[#FCB040]">
          Back to queue
        </Link>
      </AdminChrome>
    );
  }

  const deskUser = user && isDeskRole(user.role) ? user : null;
  const inspector = Boolean(deskUser && canInspect(deskUser));
  const actor = deskUser
    ? { kind: "desk" as const, id: deskUser.email, role: deskUser.role }
    : { kind: "retail" as const, id: user?.email ?? "" };
  const allowed = nextAllowedActions(agreement, actor);
  const cap = Object.values(agreement.pieceCaps ?? {}).reduce((sum, value) => sum + value, 0);
  const visibleEvents = threadEvents.length ? threadEvents : (agreement.events ?? []);
  const warning = forbiddenCopyWarning(note) || forbiddenCopyWarning(outcomeNote);
  const inspectPieces = watches.map((watch) => {
    const draft = pieces[watch.id] ?? { decision: "confirm" as const, inspectedValue: "", serialMatch: false, conditionMatch: false };
    const inspectedValueCents = draft.decision === "confirm" ? dollarsToCents(draft.inspectedValue) ?? undefined : undefined;
    return {
      timepieceId: watch.id,
      decision: draft.decision,
      ...(draft.decision === "confirm" && inspectedValueCents != null ? { inspectedValueCents } : {}),
    };
  });
  const preview = inspectPreview(agreement, inspectPieces);
  const remainingFinalized = watches.every((watch) =>
    Boolean(attemptForThisInspection(appraisalAttempts, watch.id, agreement.id)),
  );
  const signedFits = inspectPreview(
    agreement,
    watches.map((watch) => {
      const attempt = attemptForThisInspection(appraisalAttempts, watch.id, agreement.id);
      return attempt?.inspectedValueCents != null
        ? { timepieceId: watch.id, decision: "confirm" as const, inspectedValueCents: attempt.inspectedValueCents }
        : { timepieceId: watch.id, decision: "drop" as const };
    }),
  ).kind === "execute";
  const checklistComplete = INSPECTION_CHECKLIST.every((item) => checklist[item.key] === true);
  const collectorHash = agreement.signatures?.find((row) => (
    row.party === "collector" && row.version === (agreement.version ?? 1)
  ))?.snapshotHash ?? "";
  const canSignMac = inspector
    && allowed.includes("executeMac")
    && remainingFinalized
    && signedFits
    && checklistComplete
    && Boolean(paymentReference.trim())
    && Boolean(typedName.trim());

  function updatePiece(id: string, patch: Partial<PieceDraft>) {
    setPieces((current) => ({
      ...current,
      [id]: { ...(current[id] ?? pieceDraftsFor([id])[id]), ...patch },
    }));
  }

  async function run(label: string, work: () => Promise<{ ok: boolean; error?: string }>) {
    if (busy) return;
    setBusy(true);
    setError("");
    const result = await work();
    setBusy(false);
    if (!result.ok) {
      setError(
        result.error === "ROLE_FORBIDDEN"
          ? APPRAISER_REQUIRED
          : result.error === "AGREEMENT_STATE_CONFLICT"
            ? "This request moved on. Refresh the desk."
            : `${label} could not be recorded.`,
      );
    }
  }

  return (
    <AdminChrome title="Request">
      <p className="mb-4">
        <Link href="/admin/agreements" className="text-[12px] tracking-[0.14em] text-[#FCB040] uppercase">
          Back to queue
        </Link>
      </p>
      <section className="mb-6 rounded-2xl border border-white/10 bg-[#161B24] p-4">
        <p className="text-[11px] tracking-[0.16em] text-white/40 uppercase">
          {agreement.agreementCode || agreement.id}
        </p>
        <h2 className="mt-1 text-lg font-semibold text-white">{agreement.ownerName}</h2>
        <p className="text-[13px] text-white/60">{agreement.email}</p>
        <p className="mt-3 text-[13px] text-white/80">
          Sale amount {money(agreement.amount)}
          {cap ? ` · Cap ${money(cap)}` : ""}
          {agreement.version && agreement.version > 1 ? ` · Version ${agreement.version}` : ""}
        </p>
      </section>

      <section className="mb-6 space-y-3">
        <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Pieces</h3>
        {watches.map((watch) => (
          <PieceRow
            key={watch.id}
            watch={watch}
            cap={agreement.pieceCaps?.[watch.id]}
            word={APPRAISAL_WORDS[appraisalView(appraisalAttempts, watch.id, watch).word]}
            draft={pieces[watch.id] ?? pieceDraftsFor([watch.id])[watch.id]}
            inspecting={agreement.status === "inspecting"}
            inspector={inspector}
            onChange={(patch) => updatePiece(watch.id, patch)}
          />
        ))}
      </section>

      <div className="mb-6">
        <DeskRequestThread
          events={visibleEvents}
          showInternal={showInternal}
          onToggleInternal={setShowInternal}
        />
      </div>

      <section className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-[#161B24] p-4">
        <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Customer success</h3>
        <p className="text-[13px] text-white/70">
          {agreement.customerSuccess ? "Flagged for customer success." : "Not flagged."}
        </p>
        <Field label="Outcome note">
          <input
            value={outcomeNote}
            onChange={(event) => setOutcomeNote(event.target.value)}
            className="w-full bg-transparent py-1 text-[16px] text-white outline-none"
          />
        </Field>
        <PillButton
          type="button"
          variant="navy"
          disabled={busy || !allowed.includes("flagCustomerSuccess")}
          onClick={() => void run("Flag", () => flagRequestCustomerSuccess(agreement.id, !agreement.customerSuccess, outcomeNote))}
        >
          {agreement.customerSuccess ? "Clear customer-success flag" : "Flag customer success"}
        </PillButton>
      </section>

      <section className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-[#161B24] p-4">
        <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Desk note</h3>
        <Field label="Note">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="min-h-[72px] w-full bg-transparent py-1 text-[15px] text-white outline-none"
          />
        </Field>
        {warning ? <p className="text-[13px] text-[#FCB040]">{warning}</p> : null}
        {allowed.includes("deskReturn") ? (
          <div className="flex flex-wrap gap-3">
            <PillButton
              type="button"
              variant="gold"
              className="md:w-auto px-6"
              disabled={busy}
              onClick={() => void run("Confirm", () => deskReturnRequest(agreement.id, "confirm", note))}
            >
              Confirm
            </PillButton>
            <PillButton
              type="button"
              variant="navy"
              className="md:w-auto px-6"
              disabled={busy}
              onClick={() => void run("Decline", () => deskReturnRequest(agreement.id, "decline", note))}
            >
              Decline
            </PillButton>
          </div>
        ) : null}
        {allowed.includes("recordDelivery") ? (
          <PillButton
            type="button"
            variant="gold"
            disabled={busy}
            onClick={() => void run("Delivery", () => recordDeliveryRequest(agreement.id, note))}
          >
            Record delivery
          </PillButton>
        ) : null}
        {agreement.status === "closed" && agreement.deliveredOn && !hasRecordReturn({ events: visibleEvents }) ? (
          <PillButton
            type="button"
            variant="gold"
            disabled={busy}
            onClick={() => void run("Return", () => recordReturnRequest(agreement.id, note))}
          >
            Record return
          </PillButton>
        ) : null}
      </section>

      {agreement.status === "inspecting" ? (
        <section className="mb-6 space-y-3 rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Inspection</h3>
          {!inspector ? <p className="text-[13px] text-[#FCB040]">{APPRAISER_REQUIRED}</p> : null}
          <p className="text-[13px] text-white/70">
            Recomputed maximum {money(preview.maximum)} against signed {money(agreement.amount)}.
            {preview.kind === "execute"
              ? " MAC can execute as signed."
              : preview.kind === "return"
                ? ` This request will return to the collector at ${money(preview.amount)}.`
                : " MAC will decline this request."}
          </p>
          <PillButton
            type="button"
            variant="gold"
            disabled={!inspector || busy}
            onClick={() => {
              if (inspectPieces.some((piece) => piece.decision === "confirm" && piece.inspectedValueCents == null)) {
                setError("Enter an inspected value for each confirmed piece.");
                return;
              }
              if (watches.some((watch) => {
                const draft = pieces[watch.id];
                const decision = draft?.decision ?? "confirm";
                return decision === "confirm" && (!draft?.serialMatch || !draft?.conditionMatch);
              })) {
                setError("Mark serial match and condition match on each confirmed piece.");
                return;
              }
              const pieceNotes = watches.map((watch) => {
                const draft = pieces[watch.id] ?? { decision: "confirm" as const, serialMatch: false, conditionMatch: false };
                const label = `${watch.brand} ${watch.model}`;
                if (draft.decision !== "confirm") return `${label}: ${draft.decision}`;
                return `${label}: confirm; serial match; condition match`;
              });
              void run("Inspection", () => inspectRequest(agreement.id, {
                outcome: preview.kind === "decline" ? "decline" : "proceed",
                pieces: inspectPieces.map((piece) => ({
                  timepieceId: piece.timepieceId,
                  decision: piece.decision,
                  ...(piece.decision === "confirm" ? { inspectedValueCents: piece.inspectedValueCents } : {}),
                })),
                note: [note.trim(), ...pieceNotes].filter(Boolean).join("\n"),
              }));
            }}
          >
            Record inspection
          </PillButton>
        </section>
      ) : null}

      {agreement.status === "inspecting" || allowed.includes("executeMac") ? (
        <InspectionChecklist
          checklist={checklist}
          onToggle={(key: ChecklistKey) => setChecklist((current) => ({ ...current, [key]: !current[key] }))}
          paymentReference={paymentReference}
          onPaymentReference={setPaymentReference}
          typedName={typedName}
          onTypedName={setTypedName}
          disabled={!inspector}
          reason={inspector ? "" : APPRAISER_REQUIRED}
          canExecute={canSignMac}
          busy={busy}
          onSign={() => {
            void (async () => {
              if (!canSignMac || busy) return;
              setBusy(true);
              setError("");
              const loaded = await fetchAgreementDocuments(agreement.id).catch(() => null);
              if (loaded) {
                setBookMode(loaded.mode);
                setDocuments(loaded.documents);
                if (loaded.mode === "live") setThreadEvents(loaded.events);
              }
              const listed = loaded?.documents ?? documents;
              const current = listed.find((row) => row.version === (agreement.version ?? 1) && row.snapshotHash)
                ?? listed.find((row) => row.snapshotHash);
              const serverHash = current?.snapshotHash && /^[0-9a-f]{64}$/i.test(current.snapshotHash)
                ? current.snapshotHash
                : "";
              if ((loaded?.mode ?? bookMode) === "live" && !serverHash) {
                setBusy(false);
                setError("This agreement is still preparing. Try again in a moment.");
                return;
              }
              const snapshotHash = serverHash || collectorHash || await hashSnapshot({
                id: agreement.id,
                version: agreement.version ?? 1,
                amount: agreement.amount,
              });
              const result = await executeMacRequest(agreement.id, {
                typedName: typedName.trim(),
                snapshotHash,
                paymentReference: paymentReference.trim(),
                checklist: Object.fromEntries(INSPECTION_CHECKLIST.map((item) => [item.key, true as const])),
                note,
              });
              setBusy(false);
              if (!result.ok) {
                setError(result.error === "ROLE_FORBIDDEN" ? APPRAISER_REQUIRED : "MAC sign could not be recorded.");
              }
            })();
          }}
        />
      ) : null}

      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}
    </AdminChrome>
  );
}

function PieceRow({
  watch,
  cap,
  word,
  draft,
  inspecting,
  inspector,
  onChange,
}: {
  watch: Timepiece;
  cap?: number;
  word: string;
  draft?: PieceDraft;
  inspecting: boolean;
  inspector: boolean;
  onChange: (patch: Partial<PieceDraft>) => void;
}) {
  const current = draft ?? {
    decision: "confirm" as const,
    inspectedValue: "",
    serialMatch: false,
    conditionMatch: false,
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
      <p className="text-[13px] font-medium text-white">{watch.brand} {watch.model}</p>
      <p className="text-[12px] text-white/55">
        {word}
        {cap != null ? ` · Cap ${money(cap)}` : ""}
      </p>
      {inspecting ? (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-4 text-[13px] text-white/80">
            {(["confirm", "refuse", "drop"] as const).map((decision) => (
              <label key={decision} className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`inspect-${watch.id}`}
                  value={decision}
                  checked={current.decision === decision}
                  disabled={!inspector}
                  onChange={() => onChange({ decision })}
                />
                {decision === "confirm" ? "Confirm" : decision === "refuse" ? "Refuse" : "Drop"}
              </label>
            ))}
          </div>
          {current.decision === "confirm" ? (
            <Field label="Inspected value">
              <input
                inputMode="decimal"
                value={current.inspectedValue}
                disabled={!inspector}
                onChange={(event) => onChange({ inspectedValue: event.target.value })}
                className="w-full bg-transparent py-1 text-[16px] text-white outline-none disabled:opacity-40"
              />
            </Field>
          ) : null}
          <label className="flex items-center gap-2 text-[13px] text-white/80">
            <input
              type="checkbox"
              checked={current.serialMatch}
              disabled={!inspector}
              onChange={(event) => onChange({ serialMatch: event.target.checked })}
            />
            Serial match
          </label>
          <label className="flex items-center gap-2 text-[13px] text-white/80">
            <input
              type="checkbox"
              checked={current.conditionMatch}
              disabled={!inspector}
              onChange={(event) => onChange({ conditionMatch: event.target.checked })}
            />
            Condition match
          </label>
        </div>
      ) : null}
    </div>
  );
}
