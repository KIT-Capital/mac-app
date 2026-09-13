"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";

export default function CollectionSetupPage() {
  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Collection Vault" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between p-6">
        <div className="space-y-4 pt-4">
          <span className="inline-block rounded-full border border-[#FCB040]/30 bg-[#FCB040]/10 px-3 py-0.5 text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">
            Initial Setup
          </span>
          <h2 className="text-[22px] font-semibold text-white">
            Welcome to Mechanical Art Capital
          </h2>
          <p className="text-[13px] leading-relaxed text-white/70">
            Every registered member begins with a confidential, empty vault. Add timepieces one by one by providing Front, Back, and Side angles, matching against our verified manufacturer database.
          </p>

          <div className="rounded-2xl border border-white/10 bg-[#161B24] p-4 text-[12px] space-y-2 text-white/80">
            <p className="font-semibold text-[#E8D5C0] uppercase tracking-wider text-[11px]">Intake Checklist</p>
            <p>✓ High-resolution dial & movement photographs</p>
            <p>✓ Box & papers status verification</p>
            <p>✓ Instant liquidation valuation & loan-to-value cap</p>
          </div>
        </div>

        <div className="pt-8">
          <Link href="/collection/add?onboarding=1">
            <PillButton type="button" variant="gold">
              Add First Timepiece
            </PillButton>
          </Link>
        </div>
      </div>
    </main>
  );
}
