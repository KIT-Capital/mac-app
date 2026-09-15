"use client";

import type { ReactNode } from "react";

export function DeskShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full items-center justify-center bg-[#0b0f16] p-3 md:p-5">
      <div
        data-appearance="dark"
        className="mac-app-screen mac-desk-screen flex overflow-hidden rounded-xl border border-white/10 bg-[#10141D] shadow-[0_28px_80px_-24px_rgba(0,0,0,0.72)]"
        style={{
          width: "min(100vw - 1.5rem, calc((100vh - 1.5rem) * 16 / 9))",
          height: "min(100vh - 1.5rem, calc((100vw - 1.5rem) * 9 / 16))",
        }}
      >
        {children}
      </div>
    </div>
  );
}
