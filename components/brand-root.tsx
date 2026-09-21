"use client";

import { useLayoutEffect, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { brandFromSettings } from "@/lib/theme";

export function BrandRoot({ children }: { children: ReactNode }) {
  const { settings } = useStore();
  const brand = brandFromSettings(settings);
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.brand = brand.id;
    root.style.setProperty("--brand-primary", brand.palette.primary);
    root.style.setProperty("--brand-accent", brand.palette.accent);
    root.style.setProperty("--brand-soft", brand.palette.soft);
  }, [brand]);
  return children;
}
