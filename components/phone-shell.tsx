"use client";

import type { ReactNode } from "react";
import { CollectorShell } from "@/components/collector-shell";

/** @deprecated Use CollectorShell. Kept so older imports keep working. */
export function PhoneShell({ children }: { children: ReactNode }) {
  return <CollectorShell>{children}</CollectorShell>;
}
