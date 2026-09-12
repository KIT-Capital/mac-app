import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#070707] md:flex md:items-center md:justify-center md:py-8">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-black text-white md:min-h-[880px] md:rounded-[2.1rem] md:border md:border-white/10 md:shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
        {children}
      </div>
    </div>
  );
}
