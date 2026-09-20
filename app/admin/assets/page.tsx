"use client";

import Link from "next/link";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { APPRAISAL_WORDS } from "@/lib/appraisal-words";
import { moneyRange } from "@/lib/catalog";
import { appraisalView } from "@/lib/contract/repo-book.mjs";
import { useStore } from "@/lib/store";

function daysSince(iso: string) {
  const submitted = Date.parse(iso);
  if (!Number.isFinite(submitted)) return 0;
  return Math.max(0, Math.floor((Date.now() - submitted) / 86_400_000));
}

function age(days: number) {
  if (days === 0) return "today";
  return days === 1 ? "1 day" : `${days} days`;
}

export default function AdminAssetsPage() {
  const { timepieces, appraisalAttempts } = useStore();
  const pieceById = new Map(timepieces.map((piece) => [piece.id, piece]));

  const queue = appraisalAttempts
    .filter((attempt) => attempt.status === "under_review")
    .map((attempt) => ({ attempt, piece: pieceById.get(attempt.timepieceId) }))
    .filter((row) => row.piece)
    .sort((a, b) => a.attempt.submittedAt.localeCompare(b.attempt.submittedAt));

  const latestAttemptFor = (timepieceId: string) =>
    [...appraisalAttempts]
      .filter((attempt) => attempt.timepieceId === timepieceId)
      .sort((a, b) => a.attemptNo - b.attemptNo)
      .at(-1);

  return (
    <AdminChrome title="Asset database">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Collector pieces and the submissions waiting on an appraiser. A value is only written by
        deciding a submission.
      </p>

      <h2 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
        Appraisal queue
      </h2>
      {queue.length === 0 ? (
        <p className="mb-6 rounded-2xl border border-white/10 bg-[#161B24] p-4 text-sm text-white/50">
          No submissions are waiting.
        </p>
      ) : (
        <div className="mb-6">
          <AdminTable
            headers={["Piece", "Owner", "Waiting", "Attempt", ""]}
            rows={queue.map(({ attempt, piece }) => [
              `${piece?.brand} ${piece?.model}`,
              piece?.ownerEmail || "—",
              age(daysSince(attempt.submittedAt)),
              `#${attempt.attemptNo}`,
              <Link
                key={attempt.id}
                href={`/admin/appraisals/${attempt.id}`}
                className="text-[#FCB040]"
              >
                Review
              </Link>,
            ])}
          />
        </div>
      )}

      <h2 className="mb-2 text-[11px] font-bold tracking-[0.16em] text-white/70 uppercase">
        Client assets
      </h2>
      <AdminTable
        headers={["Code", "Piece", "Owner", "Appraisal", "Range", ""]}
        rows={timepieces.map((w) => {
          const view = appraisalView(appraisalAttempts, w.id, w);
          const latest = latestAttemptFor(w.id);
          return [
            w.assetCode || w.id,
            `${w.brand} ${w.model}`,
            w.ownerEmail || "—",
            `${APPRAISAL_WORDS[view.word]}${view.decisionsUsed ? ` · ${view.decisionsUsed}/3` : ""}`,
            moneyRange(w.valueLow, w.valueHigh),
            latest ? (
              <Link key={w.id} href={`/admin/appraisals/${latest.id}`} className="text-[#FCB040]">
                Review
              </Link>
            ) : (
              <span key={w.id} className="text-white/35">
                No submission
              </span>
            ),
          ];
        })}
      />
    </AdminChrome>
  );
}
