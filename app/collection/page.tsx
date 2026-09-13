"use client";

import Link from "next/link";
import { FileDown, Plus } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { WatchCard } from "@/components/watch-card";
import { useStore } from "@/lib/store";

export default function CollectionPage() {
  const { timepieces, user } = useStore();
  const empty = timepieces.length === 0;

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader
        title="My Timepieces"
        right={
          <Link
            href="/appraisal"
            aria-label="Export appraisal certificate"
            title="Export Appraisal Certificate"
            className="mac-tap -mr-1 flex items-center justify-center text-white/80 transition hover:text-white"
          >
            <FileDown className="h-5 w-5" strokeWidth={1.8} />
          </Link>
        }
      />

      {/* Membership banner */}
      <div className="border-b border-mac-line bg-mac-card px-5 py-3">
        {!user?.member ? (
          <p className="text-[12px] leading-relaxed text-mac-muted">
            If you want to have the timepiece appraised on a monthly basis, become a{" "}
            <Link href="/profile/membership" className="font-semibold text-[#FCB040] hover:underline">
              premium member
            </Link>
            .
          </p>
        ) : (
          <p className="text-[12px] font-medium text-[#FCB040]">
            Premium member — monthly certified revaluations are active.
          </p>
        )}
      </div>

      {/* Collection Grid */}
      <div className="relative flex-1 p-4 pb-24">
        {empty ? (
          <div className="flex h-full min-h-[360px] flex-col items-center justify-center px-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full border border-mac-line bg-mac-card">
              <Plus className="h-8 w-8 text-[#FCB040]" />
            </div>
            <h3 className="mt-4 text-[17px] font-medium text-mac-fg">Your collection is empty</h3>
            <p className="mt-1 max-w-[260px] text-[13px] text-mac-muted">
              Upload photographs of your luxury timepiece to request a certified confidential appraisal.
            </p>
            <Link
              href="/collection/add"
              className="mt-6 flex h-11 items-center justify-center rounded-xl bg-[#FCB040] px-6 text-[12px] font-bold tracking-[0.16em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59]"
            >
              Add First Timepiece
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3.5">
            {timepieces.map((watch) => (
              <WatchCard key={watch.id} watch={watch} />
            ))}
          </div>
        )}

        {/* Floating Add Action Button */}
        {!empty ? (
          <Link
            href="/collection/add"
            className="mac-tap absolute bottom-6 right-5 flex h-14 w-14 items-center justify-center rounded-full bg-[#FCB040] text-[#0A0D14] shadow-[0_8px_25px_rgba(252,176,64,0.4)] transition hover:scale-105 active:scale-95"
            aria-label="Add a timepiece"
            title="Add a timepiece"
          >
            <Plus className="h-7 w-7" strokeWidth={2.5} />
          </Link>
        ) : null}
      </div>
    </main>
  );
}
