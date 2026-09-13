import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function PhoneShell({
  children,
  wide = false,
}: {
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="min-h-dvh bg-[#F3EEE6] md:flex md:items-stretch md:justify-center md:py-6 xl:py-8">
      <div
        className={cn(
          "relative mx-auto flex min-h-dvh w-full flex-col overflow-hidden bg-black text-white",
          wide
            ? "max-w-[1280px] md:min-h-[calc(100dvh-4rem)] md:rounded-[1.6rem] md:border md:border-black/10 md:shadow-[0_24px_60px_rgba(40,28,16,0.16)]"
            : "max-w-[430px] md:max-w-[834px] xl:max-w-[1280px] md:min-h-[calc(100dvh-4rem)] md:rounded-[1.8rem] md:border md:border-black/10 md:shadow-[0_24px_60px_rgba(40,28,16,0.16)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}
