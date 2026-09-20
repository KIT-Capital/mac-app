"use client";

import { deskEventLine } from "@/lib/contract/request-transitions.mjs";

export type DeskThreadEvent = {
  action: string;
  toStatus?: string;
  createdAt: string;
  note?: string;
  internal?: boolean;
};

export function DeskRequestThread({
  events,
  showInternal,
  onToggleInternal,
}: {
  events: DeskThreadEvent[];
  showInternal: boolean;
  onToggleInternal: (next: boolean) => void;
}) {
  const rows = events
    .filter((event) => showInternal || !event.internal)
    .map((event) => ({ event, line: deskEventLine(event) }))
    .filter((row) => row.line);

  return (
    <section className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-[11px] tracking-[0.16em] text-white/40 uppercase">Thread</h3>
        <label className="flex items-center gap-2 text-[12px] text-white/60">
          <input
            type="checkbox"
            checked={showInternal}
            onChange={(event) => onToggleInternal(event.target.checked)}
          />
          Internal notes
        </label>
      </div>
      {rows.length ? (
        <ol className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={`${row.event.action}-${row.event.createdAt}`} className="text-[13px] text-white/80">
              <p>{row.line}</p>
              <p className="text-[11px] text-white/45">{row.event.createdAt.slice(0, 10)}</p>
              {row.event.note ? <p className="mt-1 text-[12px] text-white/55">{row.event.note}</p> : null}
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-3 text-[13px] text-white/50">No events yet.</p>
      )}
    </section>
  );
}
