"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { COLLECTOR_GUIDE } from "@/lib/nav";

export default function CollectionSetupPage() {
  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Your collection" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between p-6">
        <div className="space-y-4 pt-4">
          <span className="inline-block rounded-full border border-[#FCB040]/30 bg-[#FCB040]/10 px-3 py-0.5 text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">
            Initial Setup
          </span>
          <h2 className="text-[22px] font-semibold text-mac-fg">
            Welcome to Mechanical Art Capital
          </h2>
          <p className="text-[13px] leading-relaxed text-mac-muted">
            Every registered member begins with a confidential, empty collection. Add timepieces one by one with guided photographs of the front, back, left and right sides of the barrel, and the clasp, matched against our manufacturer catalog.
          </p>

          <div className="rounded-2xl border border-mac-line bg-mac-card p-4 text-[12px] space-y-2 text-mac-muted">
            <p className="font-semibold text-[#E8D5C0] uppercase tracking-wider text-[11px]">Intake Checklist</p>
            <p>✓ High-resolution dial & movement photographs</p>
            <p>✓ Box & papers status verification</p>
            <p>✓ Certified market valuation on qualifying models</p>
          </div>
        </div>

        <div className="space-y-3 pt-8">
          <Link href="/collection/add?onboarding=1">
            <PillButton type="button" variant="gold">
              Add First Timepiece
            </PillButton>
          </Link>
          <Link
            href={COLLECTOR_GUIDE.href}
            className="block text-center text-[11px] tracking-[0.14em] text-mac-muted uppercase"
          >
            {COLLECTOR_GUIDE.label}
          </Link>
        </div>
      </div>
    </main>
  );
}
