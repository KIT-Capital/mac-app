import type { ReactNode } from "react";

export function PhoneShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-[#F3EEE6] md:flex md:items-center md:justify-center md:py-8">
      <div className="relative mx-auto flex min-h-dvh w-full max-w-[430px] flex-col overflow-hidden bg-black text-white md:min-h-[880px] md:rounded-[2.1rem] md:border md:border-black/10 md:shadow-[0_24px_60px_rgba(40,28,16,0.16)]">
        {children}
      </div>
    </div>
  );
}
