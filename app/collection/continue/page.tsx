"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ScreenHeader } from "@/components/screen-header";
import { PillButton } from "@/components/field";
import { useOwnedAssets } from "@/lib/ownership";
import { useStore } from "@/lib/store";

export default function CollectionContinuePage() {
  const router = useRouter();
  const { completeOnboarding } = useStore();
  const { timepieces } = useOwnedAssets();
  const last = timepieces[0];

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Timepiece Saved" />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-between p-6">
        <div className="space-y-4 pt-4">
          <span className="inline-block rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-0.5 text-[10px] font-bold tracking-wider text-emerald-300 uppercase">
            ✓ Successfully Added
          </span>
          <h2 className="text-[24px] font-semibold text-mac-fg">
            {last ? `${last.brand} ${last.model}` : "Timepiece registered"}
          </h2>
          <p className="text-[13px] leading-relaxed text-mac-muted">
            Your piece is now recorded in your private portfolio. Add more watches, or open the collection. Sale-and-repurchase terms are shared only after you send an application.
          </p>
        </div>

        <div className="space-y-3 pt-6">
          <Link href="/collection/add?onboarding=1">
            <PillButton type="button" variant="white">
              + Add Another Piece
            </PillButton>
          </Link>
          <PillButton
            type="button"
            variant="gold"
            onClick={() => {
              completeOnboarding();
              router.push("/collection");
            }}
          >
            Enter Collection
          </PillButton>
        </div>
      </div>
    </main>
  );
}
