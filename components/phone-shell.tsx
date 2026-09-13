import type { ReactNode } from "react";

/** Stage behind the phone — mid slate so it contrasts with both black screens and the white appraisal. */
export const STAGE = "#5C6570";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex min-h-dvh items-center justify-center px-3 py-4 md:px-6 md:py-8"
      style={{ background: STAGE }}
    >
      <div className="relative mx-auto w-full max-w-[430px] rounded-[2.15rem] bg-[#1a1c1e] p-[10px] shadow-[0_22px_50px_rgba(12,16,20,0.38)] ring-1 ring-black/25">
        <div className="relative flex min-h-[min(100dvh-2rem,844px)] flex-col overflow-hidden rounded-[1.65rem] bg-black text-white md:min-h-[844px]">
          {children}
        </div>
      </div>
    </div>
  );
}
