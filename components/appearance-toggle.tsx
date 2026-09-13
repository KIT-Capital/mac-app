"use client";

import { Moon, Sun } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function AppearanceToggle({ className }: { className?: string }) {
  const { settings, updateSettings } = useStore();
  const light = settings.appearance === "light";

  return (
    <div className={cn("grid grid-cols-2 gap-2", className)}>
      <button
        type="button"
        onClick={() => updateSettings({ appearance: "dark" })}
        className={cn(
          "mac-tap flex h-11 items-center justify-center gap-2 rounded-xl border text-[11px] font-bold tracking-[0.14em] uppercase",
          !light
            ? "border-[#FCB040] bg-[#0E2A44] text-white"
            : "border-mac-line bg-mac-card text-mac-muted",
        )}
      >
        <Moon className="h-3.5 w-3.5" />
        Dark
      </button>
      <button
        type="button"
        onClick={() => updateSettings({ appearance: "light" })}
        className={cn(
          "mac-tap flex h-11 items-center justify-center gap-2 rounded-xl border text-[11px] font-bold tracking-[0.14em] uppercase",
          light
            ? "border-[#FCB040] bg-[#0E2A44] text-white"
            : "border-mac-line bg-mac-card text-mac-muted",
        )}
      >
        <Sun className="h-3.5 w-3.5" />
        Light
      </button>
    </div>
  );
}
