"use client";

import Link from "next/link";
import { FileDown, Plus } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { WatchCard } from "@/components/watch-card";
import { WatchPhoto } from "@/components/watch-photo";
import { appraisalView, deskToday, isAppraisalCurrent } from "@/lib/contract/repo-book.mjs";
import { useOwnedAssets } from "@/lib/ownership";
import { useStore } from "@/lib/store";

export default function CollectionPage() {
  const { user, appraisalAttempts } = useStore();
  const { timepieces } = useOwnedAssets();
  const empty = timepieces.length === 0;

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader
        title="My Timepieces"
        right={
          <Link
            href="/appraisal"
            aria-label="PDF"
            title="PDF"
            className="mac-tap -mr-1 flex items-center justify-center text-white/80"
          >
            <FileDown className="h-5 w-5" strokeWidth={1.8} />
          </Link>
        }
      />

      <p className="px-5 py-3 text-[13px] leading-relaxed text-mac-muted">
        {user?.member ? (
          "Monthly appraisals are included with your premium membership."
        ) : (
          <>
            If you want to have the timepiece appraised on a monthly basis, become a{" "}
            <Link href="/profile/membership" className="underline underline-offset-2">
              premium member
            </Link>
            .
          </>
        )}
      </p>

      <div className="relative flex-1 px-4 pb-24">
        {empty ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-4 text-center">
            <div className="mb-5 h-28 w-28 overflow-hidden rounded-full bg-mac-card">
              <WatchPhoto
                src={null}
                watch={{ caseType: "Round", band: "bracelet" }}
                alt=""
                className="opacity-80"
              />
            </div>
            <p className="text-[15px] text-mac-fg">Your collection is empty</p>
            <p className="mt-1 max-w-[240px] text-[13px] text-mac-muted">
              Upload photographs of your timepiece. If a photo is missing, MAC shows a
              photorealistic illustration until you add one.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-3 gap-y-6 md:grid-cols-3 md:gap-5 xl:grid-cols-4">
            {timepieces.map((watch) => {
              const view = appraisalView(appraisalAttempts, watch.id, watch);
              const expired = view.word === "accepted"
                && !isAppraisalCurrent(appraisalAttempts, watch.id, deskToday(), watch);
              return (
                <WatchCard
                  key={watch.id}
                  watch={watch}
                  word={view.word}
                  decisionsUsed={view.decisionsUsed}
                  expired={expired}
                />
              );
            })}
          </div>
        )}

        <Link
          href="/collection/add"
          className="mac-tap absolute bottom-5 left-1/2 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full bg-mac-navy text-white shadow-md md:static md:mt-8 md:h-12 md:w-auto md:translate-x-0 md:rounded-none md:px-6 md:text-[12px] md:font-semibold md:tracking-[0.16em] md:uppercase"
          aria-label="Add a timepiece"
          title="Add a timepiece"
        >
          <Plus className="h-6 w-6 md:hidden" strokeWidth={2} />
          <span className="hidden md:inline">Add a timepiece</span>
        </Link>
      </div>
    </main>
  );
}
