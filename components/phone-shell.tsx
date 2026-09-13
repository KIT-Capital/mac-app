"use client";

import type { ReactNode } from "react";
import { IosHomeIndicator, IosStatusBar } from "@/components/ios-status-bar";
import { useStore } from "@/lib/store";
import { usePathname } from "next/navigation";

export function PhoneShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings } = useStore();
  const appearance = pathname.startsWith("/admin") ? "dark" : settings.appearance;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#DFE3E8] p-3 md:p-8">
      <div className="relative mx-auto w-full max-w-[412px] rounded-[50px] border-[3.5px] border-[#2C3038] bg-[#181A20] p-[7px] shadow-[0_30px_80px_-15px_rgba(20,25,35,0.4),0_12px_28px_-5px_rgba(20,25,35,0.25)] ring-1 ring-black/40">
        <div
          data-appearance={appearance}
          className="mac-phone-screen relative flex min-h-[min(100dvh-2rem,852px)] w-full flex-col overflow-hidden rounded-[43px] bg-mac-bg text-mac-fg md:min-h-[852px]"
        >
          <IosStatusBar />
          <div className="relative flex flex-1 flex-col overflow-y-auto">{children}</div>
          <IosHomeIndicator />
        </div>
      </div>
    </div>
  );
}
