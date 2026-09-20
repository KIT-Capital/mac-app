import { retailEventLine } from "@/lib/contract/request-transitions.mjs";

export type RetailThreadEvent = {
  action: string;
  toStatus?: string;
  createdAt: string;
  note?: string;
};

export function RequestThread({ events }: { events: RetailThreadEvent[] }) {
  const rows = events
    .map((event) => ({ event, line: retailEventLine(event) }))
    .filter((row) => row.line);
  if (!rows.length) return null;

  return (
    <section className="mt-4 rounded-xl border border-mac-line bg-mac-card p-3">
      <h3 className="text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">Activity</h3>
      <ol className="mt-2 space-y-2">
        {rows.map((row) => (
          <li key={`${row.event.action}-${row.event.createdAt}`} className="text-[13px] text-mac-fg">
            <p>{row.line}</p>
            <p className="text-[11px] text-mac-faint">{row.event.createdAt.slice(0, 10)}</p>
            {row.event.note ? <p className="mt-1 text-[12px] text-mac-muted">{row.event.note}</p> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}
