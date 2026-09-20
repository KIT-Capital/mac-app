"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { AdminChrome } from "@/components/admin-chrome";
import { WatchPhoto } from "@/components/watch-photo";
import { APPRAISAL_WORDS } from "@/lib/appraisal-words";
import { catalogValuation, money, moneyRange } from "@/lib/catalog";
import { appraisalReviewControls, appraisalView } from "@/lib/contract/repo-book.mjs";
import { useStore } from "@/lib/store";
import type { AppraisalAttempt, CatalogEntry, Timepiece } from "@/lib/types";

const APPRAISER_REQUIRED = "Appraiser or super admin required to decide an appraisal.";

const DECIDE_ERRORS: Record<string, string> = {
  ROLE_FORBIDDEN: APPRAISER_REQUIRED,
  APPRAISAL_NOT_OWNER:
    "Only the appraiser who decided this attempt, or a super admin, may change it.",
  ATTEMPT_STATE_CONFLICT: "This submission already moved. Reload the review.",
  APPRAISAL_ATTEMPTS_EXHAUSTED: "This piece has used its three decisions.",
  RANGE_REQUIRED: "Enter the appraisal value and both range ends.",
  APPRAISAL_DECISION_INVALID: "Check the value and range: whole dollars, high at or above low.",
  ATTEMPT_SUPERSEDED: "A newer submission exists; reopen is only for the newest attempt.",
  APPRAISAL_RETURN_INVALID: "Write a note telling the collector what to fix.",
  APPRAISAL_REOPEN_INVALID: "Give a reason for reopening this decision.",
};

function message(code: string | undefined, fallback: string) {
  return DECIDE_ERRORS[code ?? ""] ?? fallback;
}

/** "Save for later" is a private desk draft, never a server state. */
function draftKey(attemptId: string) {
  return `mac-appraisal-draft-${attemptId}`;
}

type Draft = {
  decision: "accept" | "refuse";
  value: string;
  rangeLow: string;
  rangeHigh: string;
};

/**
 * Mounted with `key={attempt.id}` so each submission gets its own form seeded
 * from the catalog match and any draft, with no state-syncing effect.
 */
function DecisionPanel({
  attempt,
  piece,
  catalog,
  onError,
}: {
  attempt: AppraisalAttempt;
  piece: Timepiece;
  catalog: CatalogEntry[];
  onError: (text: string) => void;
}) {
  const { decideAppraisal } = useStore();
  const [draft, setDraft] = useState<Draft>(() => {
    const suggested = catalogValuation(piece, catalog);
    const seeded: Draft = {
      decision: "accept",
      value: "",
      rangeLow: String(suggested.valueLow ?? ""),
      rangeHigh: String(suggested.valueHigh ?? ""),
    };
    try {
      const raw = localStorage.getItem(draftKey(attempt.id));
      return raw ? { ...seeded, ...(JSON.parse(raw) as Partial<Draft>) } : seeded;
    } catch {
      return seeded;
    }
  });
  const [saved, setSaved] = useState(false);

  const numericValue = Number(draft.value);
  const low = Number(draft.rangeLow);
  const high = Number(draft.rangeHigh);
  const filled =
    draft.value.trim() !== "" && draft.rangeLow.trim() !== "" && draft.rangeHigh.trim() !== "";
  const numbersUsable =
    filled && Number.isFinite(numericValue) && Number.isFinite(low) && Number.isFinite(high);
  // An Accept always carries a real number. A blank form must never be able to
  // record a $0 appraisal the collector would then be shown.
  const readyToDecide = draft.decision === "refuse" || numbersUsable;
  const rangeWarning =
    draft.decision === "accept" && numbersUsable
      ? numericValue < low
        ? "below"
        : numericValue > high
          ? "above"
          : ""
      : "";

  async function decide() {
    if (!readyToDecide) {
      onError("Enter the appraisal value and both range ends before accepting.");
      return;
    }
    const result = await decideAppraisal(
      draft.decision === "accept"
        ? {
            id: attempt.id,
            decision: "accept",
            value: Number(draft.value),
            rangeLow: Number(draft.rangeLow),
            rangeHigh: Number(draft.rangeHigh),
          }
        : { id: attempt.id, decision: "refuse" },
    );
    if (!result.ok) {
      onError(message(result.error, "The decision could not be saved."));
      return;
    }
    onError("");
    try {
      localStorage.removeItem(draftKey(attempt.id));
    } catch {
      /* the decision is recorded either way */
    }
  }

  return (
    <>
      <fieldset className="mt-5">
        <legend className="text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
          Decision
        </legend>
        <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
          <input
            type="radio"
            name="decision"
            value="accept"
            checked={draft.decision === "accept"}
            onChange={() => setDraft({ ...draft, decision: "accept" })}
          />
          Accept
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm text-white/80">
          <input
            type="radio"
            name="decision"
            value="refuse"
            checked={draft.decision === "refuse"}
            onChange={() => setDraft({ ...draft, decision: "refuse" })}
          />
          Does not meet appraisal criteria
        </label>
      </fieldset>

      {draft.decision === "accept" ? (
        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="value" className="text-[12px] text-white/60">
              Appraisal value
            </label>
            <input
              id="value"
              inputMode="numeric"
              value={draft.value}
              onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="range-low" className="text-[12px] text-white/60">
                Range low
              </label>
              <input
                id="range-low"
                inputMode="numeric"
                value={draft.rangeLow}
                onChange={(event) => setDraft({ ...draft, rangeLow: event.target.value })}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
              />
            </div>
            <div>
              <label htmlFor="range-high" className="text-[12px] text-white/60">
                Range high
              </label>
              <input
                id="range-high"
                inputMode="numeric"
                value={draft.rangeHigh}
                onChange={(event) => setDraft({ ...draft, rangeHigh: event.target.value })}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
              />
            </div>
          </div>
          {rangeWarning ? (
            <p className="text-[12px] text-[#FCB040]">
              {money(numericValue)} is {rangeWarning} the advisory range. You can still save it.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="button"
          disabled={!readyToDecide}
          onClick={() => void decide()}
          className="rounded-xl bg-[#FCB040] px-4 py-2 text-[12px] font-bold tracking-[0.14em] text-[#0A0D14] uppercase disabled:opacity-40"
        >
          Decide
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(draftKey(attempt.id), JSON.stringify(draft));
              setSaved(true);
            } catch {
              onError("This browser would not keep the draft.");
            }
          }}
          className="rounded-xl border border-white/20 px-4 py-2 text-[12px] font-bold tracking-[0.14em] text-white/80 uppercase"
        >
          Save for later
        </button>
      </div>
      {saved ? (
        <p className="mt-2 text-[12px] text-white/50">
          Draft kept on this device only. Nothing was sent to the collector.
        </p>
      ) : null}
    </>
  );
}

export default function AppraisalReviewPage() {
  const params = useParams<{ id: string }>();
  const {
    appraisalAttempts,
    appraisalAttemptPhotos,
    timepieces,
    catalog,
    user,
    returnAppraisal,
    reopenAppraisal,
  } = useStore();

  const [returnNote, setReturnNote] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  const attempt = appraisalAttempts.find((row) => row.id === params.id);
  const piece = timepieces.find((row) => row.id === attempt?.timepieceId);

  if (!attempt || !piece) {
    return (
      <AdminChrome title="Appraisal review">
        <h1 className="text-lg font-semibold text-white">Appraisal review</h1>
        <p className="mt-3 text-sm text-white/60">This submission is not on the book.</p>
        <Link href="/admin/assets" className="mt-4 inline-block text-[#FCB040]">
          Back to client assets
        </Link>
      </AdminChrome>
    );
  }

  const controls = appraisalReviewControls(attempt, user);
  const view = appraisalView(appraisalAttempts, piece.id, piece);
  const snapshot = attempt.snapshot?.fields ?? {};
  const evidence = appraisalAttemptPhotos.filter((photo) => photo.attemptId === attempt.id);
  const suggested = catalogValuation(piece, catalog);

  async function sendBack() {
    if (!attempt) return;
    const result = await returnAppraisal({ id: attempt.id, note: returnNote.trim() });
    if (!result.ok) {
      setError(message(result.error, "The submission could not be returned."));
      return;
    }
    setError("");
    setReturnNote("");
  }

  async function reopen() {
    if (!attempt) return;
    const result = await reopenAppraisal({ id: attempt.id, reason: reason.trim() });
    if (!result.ok) {
      setError(message(result.error, "The decision could not be reopened."));
      return;
    }
    setError("");
    setReason("");
  }

  return (
    <AdminChrome title="Appraisal review">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-white">Appraisal review</h1>
          <p className="text-sm text-white/60">
            {piece.brand} {piece.model} · {piece.ownerEmail || "—"} · attempt #{attempt.attemptNo}
          </p>
        </div>
        <span className="rounded-full border border-white/15 px-3 py-1 text-[11px] tracking-[0.14em] text-[#FCB040] uppercase">
          {APPRAISAL_WORDS[view.word]}
          {view.decisionsUsed ? ` · ${view.decisionsUsed}/3` : ""}
        </span>
      </div>

      {controls.readOnly ? (
        <p className="mt-4 rounded-xl border border-white/10 bg-[#161B24] p-3 text-sm text-white/60">
          {APPRAISER_REQUIRED} You can read this submission.
        </p>
      ) : null}
      {error ? <p className="mt-4 text-sm text-red-400">{error}</p> : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        {/* Frozen evidence */}
        <section className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <h2 className="text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
            Submitted photographs
          </h2>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {evidence.length === 0 ? (
              <p className="col-span-3 text-sm text-white/50">No photographs on this submission.</p>
            ) : (
              evidence.map((photo) => (
                <div
                  key={`${photo.attemptId}-${photo.photoId}`}
                  className="aspect-square overflow-hidden rounded-lg bg-black/40"
                >
                  <WatchPhoto src={photo.photoId} watch={piece} alt={`${photo.kind} photograph`} />
                </div>
              ))
            )}
          </div>

          <h2 className="mt-5 text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
            Submitted details
          </h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-white/80">
            {Object.entries(snapshot).map(([field, entry]) => (
              <div key={field}>
                <dt className="text-[10px] uppercase text-white/45">{field}</dt>
                <dd>{String(entry ?? "—")}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-5 text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
            Collector note
          </h2>
          <p className="mt-2 text-[13px] text-white/75">{attempt.note || "None."}</p>
          {attempt.responseNote ? (
            <>
              <h2 className="mt-5 text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
                Returned with
              </h2>
              <p className="mt-2 text-[13px] text-white/75">{attempt.responseNote}</p>
            </>
          ) : null}
        </section>

        {/* Decision */}
        <section className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <h2 className="text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
            Catalog range (advisory)
          </h2>
          <p className="mt-1 text-sm text-white/70">
            {moneyRange(suggested.valueLow, suggested.valueHigh)}
          </p>

          {controls.canDecide ? (
            <DecisionPanel
              key={attempt.id}
              attempt={attempt}
              piece={piece}
              catalog={catalog}
              onError={setError}
            />
          ) : null}

          {controls.canReturn ? (
            <div className="mt-6 border-t border-white/10 pt-4">
              <label htmlFor="return-note" className="text-[12px] text-white/60">
                What should the collector fix?
              </label>
              <textarea
                id="return-note"
                rows={2}
                value={returnNote}
                onChange={(event) => setReturnNote(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => void sendBack()}
                className="mt-2 rounded-xl border border-white/20 px-4 py-2 text-[12px] font-bold tracking-[0.14em] text-white/80 uppercase"
              >
                Return with note
              </button>
              <p className="mt-2 text-[12px] text-white/45">
                A return does not use one of the three decisions.
              </p>
            </div>
          ) : null}

          {controls.canReopen ? (
            <div className="mt-6 border-t border-white/10 pt-4">
              <label htmlFor="reopen-reason" className="text-[12px] text-white/60">
                Why reopen this decision?
              </label>
              <input
                id="reopen-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                className="mt-1 w-full rounded-lg border border-white/15 bg-black/30 p-2 text-sm text-white"
              />
              <button
                type="button"
                onClick={() => void reopen()}
                className="mt-2 rounded-xl border border-white/20 px-4 py-2 text-[12px] font-bold tracking-[0.14em] text-white/80 uppercase"
              >
                Reopen decision
              </button>
              <p className="mt-2 text-[12px] text-white/45">
                Reopening keeps this attempt&apos;s decision number and is audited.
              </p>
            </div>
          ) : null}
        </section>
      </div>

      <Link href="/admin/assets" className="mt-6 inline-block text-[#FCB040]">
        Back to client assets
      </Link>
    </AdminChrome>
  );
}
