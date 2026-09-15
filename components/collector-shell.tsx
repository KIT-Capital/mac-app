"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const AUTH = ["/", "/login", "/signup", "/privacy"];

export function CollectorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings, user } = useStore();
  const appearance = user?.preferences.appearance ?? settings.appearance;
  const auth = AUTH.includes(pathname);

  return (
    <div
      data-appearance={appearance}
      className="mac-app-screen mac-phone-screen relative flex min-h-dvh w-full flex-col bg-mac-bg text-mac-fg"
    >
      <div
        className={cn(
          "mx-auto flex min-h-dvh w-full flex-1 flex-col",
          auth ? "max-w-[430px] md:max-w-[460px]" : "max-w-6xl",
        )}
      >
        {children}
      </div>
    </div>
  );
}
