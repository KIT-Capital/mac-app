export function MacMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 80" className={className} aria-hidden>
      <circle cx="40" cy="40" r="30" fill="none" stroke="#FCB040" strokeWidth="3.2" />
      <circle cx="40" cy="40" r="18" fill="none" stroke="#FCB040" strokeWidth="2.2" />
      <circle cx="40" cy="40" r="3.2" fill="#FCB040" />
      {Array.from({ length: 8 }).map((_, i) => {
        const a = (i / 8) * Math.PI * 2;
        return (
          <line
            key={i}
            x1={40 + Math.cos(a) * 12}
            y1={40 + Math.sin(a) * 12}
            x2={40 + Math.cos(a) * 26}
            y2={40 + Math.sin(a) * 26}
            stroke="#FCB040"
            strokeWidth="2.1"
          />
        );
      })}
    </svg>
  );
}

export function MacWordmark({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <MacMark className="h-8 w-8 shrink-0" />
      <div className={`leading-none ${light ? "text-white" : "text-white"}`}>
        <p className="text-[11px] font-semibold tracking-[0.22em]">MECHANICAL ART</p>
        <p className="mt-0.5 text-[10px] tracking-[0.32em] text-[#FCB040]">CAPITAL</p>
      </div>
    </div>
  );
}
