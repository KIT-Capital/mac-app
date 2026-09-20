"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { Check, Clock, HelpCircle, Trash2, XCircle } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { WatchPhoto } from "@/components/watch-photo";
import { money, moneyRange } from "@/lib/catalog";
import {
  APPRAISAL_WORDS,
  CLOSED_PHRASE,
  PROVISIONAL_PHRASE,
  REFUSAL_PHRASE,
  WITH_MAC_PHRASE,
  shotPhrase,
} from "@/lib/appraisal-words";
import { appraisalView, liveWatchIds, missingEvidenceKinds } from "@/lib/contract/repo-book.mjs";
import { nextId } from "@/lib/ids";
import { useOwnedAssets } from "@/lib/ownership";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";
import { formatIntakeList, normalizeRequiredPhotoKinds } from "@/lib/timepiece-shots.mjs";

const SUBMIT_ERRORS: Record<string, string> = {
  PHOTOS_INCOMPLETE: "Add the missing photographs before sending this piece.",
  REVIEW_LOCKED: "MAC is already reviewing this piece.",
  SUBMISSION_OPEN: "MAC is already reviewing this piece.",
  PIECE_HELD: "This timepiece is on a live repo.",
  APPRAISAL_ATTEMPTS_EXHAUSTED: CLOSED_PHRASE,
  NOTE_TOO_LONG: "Shorten the note to 256 characters or fewer.",
};

export default function WatchDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const {
    removeTimepiece,
    submitAppraisal,
    settings,
    user,
    agreements,
    photos,
    appraisalAttempts,
    bookMode,
  } = useStore();
  const { timepieces } = useOwnedAssets();
  const [actionError, setActionError] = useState("");
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const watch = timepieces.find((w) => w.id === params.id);
  const onLiveRepo = watch ? liveWatchIds(agreements).has(watch.id) : false;

  if (!watch) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center p-6 text-center bg-mac-bg">
        <HelpCircle className="h-10 w-10 text-mac-faint" />
        <p className="mt-3 text-[14px] font-medium text-mac-muted">Timepiece Not Found</p>
        <Link
          href="/collection"
          className="mt-4 rounded-xl border border-mac-line bg-white/5 px-4 py-2 text-xs font-semibold text-[#FCB040]"
        >
          Return to Collection
        </Link>
      </main>
    );
  }

  const view = appraisalView(appraisalAttempts, watch.id, watch);
  const underReview = view.word === "with_mac";
  const closed = view.word === "closed";
  const held = onLiveRepo;
  const hasAttempt = appraisalAttempts.some((attempt) => attempt.timepieceId === watch.id);

  // The same rule the submission itself applies, so the button can name what is
  // missing instead of letting the send fail.
  const missingKinds = missingEvidenceKinds(
    photos,
    watch.id,
    normalizeRequiredPhotoKinds(settings.requiredPhotoKinds),
    { allowDataUrls: bookMode !== "live" },
  );
  const canSend = !underReview && !closed && !held && missingKinds.length === 0;

  async function send() {
    if (!watch || sending) return;
    setSending(true);
    const result = await submitAppraisal({
      id: nextId("att"),
      timepieceId: watch.id,
      note: note.trim() || undefined,
    });
    setSending(false);
    if (!result.ok) {
      setActionError(
        SUBMIT_ERRORS[result.error ?? ""] ?? "This piece could not be sent for appraisal.",
      );
      return;
    }
    setActionError("");
    setNote("");
    if (user) {
      void sendAppEmail({
        kind: "appraisal",
        name: user.name,
        email: user.email,
        phone: user.phone,
        watch: `${watch.brand} ${watch.model}`,
      });
    }
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title={watch.brand} backHref="/collection" />

      <div className="flex-1 overflow-y-auto pb-8">
        {/* Gallery Hero */}
        <div className="relative aspect-square w-full bg-[#090C12]">
          <WatchPhoto src={watch.images[0]} watch={watch} alt={watch.model} showCaption />

          {watch.images.length > 1 ? (
            <div className="absolute bottom-3 left-3 flex gap-2">
              {watch.images.map((src, i) => (
                <div
                  key={src + i}
                  className="h-12 w-12 overflow-hidden rounded-lg border-2 border-white/50 bg-mac-card shadow-md"
                >
                  <WatchPhoto src={src} watch={watch} alt="" />
                </div>
              ))}
            </div>
          ) : null}

          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-mac-line bg-black/70 px-3 py-1 text-[10px] font-bold tracking-wider text-[#FCB040] uppercase backdrop-blur-md">
              {view.word === "accepted" ? <Check className="h-3 w-3" strokeWidth={3} /> : null}
              {view.word === "not_accepted" ? <XCircle className="h-3 w-3" /> : null}
              {view.word === "with_mac" ? <Clock className="h-3 w-3" /> : null}
              {APPRAISAL_WORDS[view.word]}
            </span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-5">
          <div>
            <p className="text-[11px] font-bold tracking-[0.16em] text-[#FCB040] uppercase">
              {watch.brand}
            </p>
            <h1 className="mt-0.5 text-[24px] font-semibold text-mac-fg tracking-tight">
              {watch.model}
            </h1>
            {watch.reference ? (
              <p className="text-[13px] text-mac-faint font-mono">Ref. {watch.reference}</p>
            ) : null}
          </div>

          {/* Appraisal state (R29) */}
          <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase">
              Appraisal
            </p>
            <p
              data-testid="appraisal-state"
              className="mt-1 text-[22px] font-bold text-mac-fg"
            >
              {APPRAISAL_WORDS[view.word]}
            </p>
            {view.decisionsUsed > 0 ? (
              <p className="mt-1 text-[12px] text-mac-faint">
                Attempt {view.decisionsUsed} of 3
              </p>
            ) : null}

            {view.word === "with_mac" ? (
              <p className="mt-3 border-t border-mac-line pt-3 text-[12px] text-mac-muted">
                {WITH_MAC_PHRASE}
              </p>
            ) : null}
            {view.word === "accepted" ? (
              <div className="mt-3 border-t border-mac-line pt-3">
                {typeof view.value === "number" ? (
                  <p className="text-[20px] font-bold text-mac-fg">{money(view.value)}</p>
                ) : null}
                <p className="mt-1 text-[12px] text-mac-muted">{PROVISIONAL_PHRASE}</p>
              </div>
            ) : null}
            {view.word === "not_accepted" ? (
              <p className="mt-3 border-t border-mac-line pt-3 text-[12px] text-mac-muted">
                {REFUSAL_PHRASE}
              </p>
            ) : null}
            {closed ? (
              <p className="mt-3 border-t border-mac-line pt-3 text-[12px] text-mac-muted">
                {CLOSED_PHRASE}
              </p>
            ) : null}
          </div>

          {/* Informational band. The appraisal value above is the business number. */}
          <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
            <p className="text-[10px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase">
              Appraisal range
            </p>
            <p className="mt-1 text-[22px] font-bold text-mac-fg">
              {moneyRange(watch.valueLow, watch.valueHigh)}
            </p>

            {view.word === "accepted" && watch.financeable && !onLiveRepo ? (
              <p className="mt-3 border-t border-mac-line pt-3 text-[12px] text-mac-muted">
                Eligible for a sale-and-repurchase application. MAC would buy this piece; you may
                buy it back on the preset scale. This is not a loan.
              </p>
            ) : null}
            {onLiveRepo ? (
              <p className="mt-3 border-t border-mac-line pt-3 text-[12px] text-mac-muted">
                This timepiece is already on a live repo.
              </p>
            ) : null}
          </div>

          {/* Specifications Table */}
          <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
            <h3 className="text-[11px] font-bold tracking-[0.16em] text-mac-faint uppercase pb-2 border-b border-mac-line">
              Technical Specifications
            </h3>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Condition</dt>
                <dd className="font-medium text-mac-fg">{watch.condition}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Case Metal</dt>
                <dd className="font-medium text-mac-fg">{watch.caseMetal}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Case Diameter</dt>
                <dd className="font-medium text-mac-fg">{watch.caseDiameter}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Dial Color</dt>
                <dd className="font-medium text-mac-fg">{watch.dialColor}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Box & Papers</dt>
                <dd className="font-medium text-mac-fg">{watch.boxPapers}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-mac-faint">Complication</dt>
                <dd className="font-medium text-mac-fg">{watch.complication}</dd>
              </div>
            </dl>
          </div>

          {/* One primary action (R29) */}
          {!underReview && !closed ? (
            <div className="space-y-3">
              <div>
                <label
                  htmlFor="appraisal-note"
                  className="text-[10px] font-semibold tracking-[0.16em] text-mac-faint uppercase"
                >
                  Anything MAC should know?
                </label>
                <textarea
                  id="appraisal-note"
                  value={note}
                  maxLength={256}
                  rows={3}
                  onChange={(event) => setNote(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-mac-line bg-white/5 p-3 text-[13px] text-mac-fg"
                  placeholder="Optional"
                />
              </div>
              <button
                type="button"
                disabled={!canSend || sending}
                onClick={() => void send()}
                className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-[#FCB040] text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59] disabled:opacity-40"
              >
                Send for appraisal
              </button>
              {missingKinds.length ? (
                <p className="text-[12px] text-mac-muted">
                  Add {formatIntakeList(missingKinds.map(shotPhrase))} before sending for appraisal.
                </p>
              ) : null}
              {held ? (
                <p className="text-[12px] text-mac-muted">
                  A timepiece on a live repo cannot be sent for appraisal.
                </p>
              ) : null}
            </div>
          ) : null}
          {actionError ? <p className="text-sm text-red-400">{actionError}</p> : null}

          {view.word === "accepted" && watch.financeable && !onLiveRepo ? (
            <button
              type="button"
              onClick={() => router.push(`/repurchase/new?watch=${watch.id}`)}
              className="mac-tap flex h-12 w-full items-center justify-center rounded-xl border border-[#FCB040]/40 bg-transparent text-[13px] font-bold tracking-[0.18em] text-[#FCB040] uppercase transition hover:bg-[#FCB040]/10"
            >
              Apply to Sell &amp; Repurchase
            </button>
          ) : null}

          {/* Secondary Controls */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              disabled={underReview || held}
              onClick={() => router.push(`/collection/add?id=${watch.id}`)}
              className="flex-1 rounded-xl border border-mac-line bg-white/5 py-3 text-[11px] font-semibold tracking-wider text-mac-fg uppercase disabled:opacity-30"
            >
              Edit details &amp; photos
            </button>
            <button
              type="button"
              disabled={hasAttempt || held}
              onClick={async () => {
                const removed = await removeTimepiece(watch.id);
                if (removed.ok) {
                  router.push("/collection");
                } else {
                  setActionError(removed.error || "The timepiece could not be removed.");
                }
              }}
              className="flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-red-300 transition hover:bg-red-500/20 disabled:opacity-30"
              aria-label="Remove watch"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          {hasAttempt ? (
            <p className="text-[11px] text-mac-faint">
              MAC keeps a submitted timepiece and its photographs as appraisal evidence.
            </p>
          ) : null}
        </div>
      </div>
    </main>
  );
}
