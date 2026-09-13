"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";

export default function CollectionSetupPage() {
  return (
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader title="My timepieces" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-10">
        <p className="text-[13px] leading-6 text-white/65">
          New members start with an empty vault. Add one timepiece at a time — front, back, and left
          photographs, then brand and reference from the MAC catalog.
        </p>
        <p className="mt-6 text-[15px] text-white/80">
          Press <span className="text-[#E8D5C0]">+</span> to upload your first timepiece.
        </p>
        <div className="mt-auto space-y-3">
          <Link href="/collection/add?onboarding=1">
            <PillButton type="button">Add a timepiece</PillButton>
          </Link>
        </div>
      </div>
    </main>
  );
}
