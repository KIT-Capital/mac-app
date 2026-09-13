"use client";

import { cn } from "@/lib/utils";

export function IosStatusBar({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative z-30 flex h-11 shrink-0 items-center justify-between px-6 pt-1 text-[13px] font-semibold text-white select-none",
        className,
      )}
      aria-hidden
    >
      <span className="w-14 text-left tabular-nums tracking-tight font-medium">9:41</span>
      {/* Dynamic Island */}
      <div className="flex h-[26px] w-[104px] items-center justify-between rounded-full bg-black px-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.1)]">
        <span className="h-2.5 w-2.5 rounded-full bg-[#0a0a0a] ring-1 ring-white/10" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#111] ring-1 ring-white/5" />
      </div>
      {/* System status icons */}
      <div className="flex w-14 items-center justify-end gap-1.5">
        {/* Signal bars */}
        <svg width="15" height="11" viewBox="0 0 17 12" fill="currentColor">
          <rect x="0" y="8" width="3" height="4" rx="0.5" />
          <rect x="4.5" y="5.5" width="3" height="6.5" rx="0.5" />
          <rect x="9" y="3" width="3" height="9" rx="0.5" />
          <rect x="13.5" y="0.5" width="3" height="11.5" rx="0.5" />
        </svg>
        {/* WiFi */}
        <svg width="14" height="11" viewBox="0 0 16 12" fill="currentColor">
          <path d="M8 9.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0-3.3c1.8 0 3.4.7 4.7 1.9l-1.2 1.2A5 5 0 0 0 8 7.7a5 5 0 0 0-3.5 1.5L3.3 8a6.6 6.6 0 0 1 4.7-1.8Zm0-3.4c2.8 0 5.3 1.1 7.2 2.9l-1.2 1.2A8.6 8.6 0 0 0 8 4.3 8.6 8.6 0 0 0 2 6.9L.8 5.7A10.3 10.3 0 0 1 8 2.8Z" />
        </svg>
        {/* Battery */}
        <svg width="22" height="11" viewBox="0 0 24 12" fill="none">
          <rect x="0.5" y="1" width="20" height="10" rx="2.5" stroke="currentColor" strokeWidth="1" />
          <rect x="2" y="2.5" width="15" height="7" rx="1.5" fill="currentColor" />
          <path d="M22 4.5v3a1 1 0 0 0 1-1v-1a1 1 0 0 0-1-1Z" fill="currentColor" />
        </svg>
      </div>
    </div>
  );
}

export function IosHomeIndicator({ className }: { className?: string }) {
  return (
    <div className={cn("relative z-30 flex justify-center py-2 select-none", className)} aria-hidden>
      <div className="h-[4.5px] w-[134px] rounded-full bg-white/40 shadow-sm" />
    </div>
  );
}
