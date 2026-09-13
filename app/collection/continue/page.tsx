"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { useStore } from "@/lib/store";

export default function CollectionContinuePage() {
  const router = useRouter();
  const { timepieces, completeOnboarding } = useStore();
  const last = timepieces[0];

  return (
    <main className="flex flex-1 flex-col bg-[#161616]">
      <ScreenHeader title="My timepieces" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 py-10">
        <p className="text-[13px] tracking-[0.18em] text-[#FCB040] uppercase">Saved</p>
        <h2 className="mt-3 text-[28px] leading-tight font-medium">
          {last ? `${last.brand} ${last.model}` : "Timepiece saved"}
        </h2>
        <p className="mt-4 text-sm leading-6 text-white/65">
          Add another piece or open the collection. You can edit or remove any saved timepiece until
          it is sent for appraisal.
        </p>
        <div className="mt-auto space-y-3">
          <Link href="/collection/add?onboarding=1">
            <PillButton type="button" variant="white">
              Add another
            </PillButton>
          </Link>
          <PillButton
            type="button"
            onClick={() => {
              completeOnboarding();
              router.push("/collection");
            }}
          >
            Done
          </PillButton>
        </div>
      </div>
    </main>
  );
}
