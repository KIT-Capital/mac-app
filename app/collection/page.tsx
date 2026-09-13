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
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader
        title="My timepieces"
        right={
          <Link href="/appraisal" aria-label="Export appraisal PDF" className="mac-tap flex flex-col items-center justify-center text-white">
            <FileDown className="h-5 w-5" strokeWidth={1.5} />
          </Link>
        }
      />

      {!user?.member ? (
        <p className="px-5 py-4 text-[13px] leading-5 text-white/70">
          If you want to have the timepieces appraised on a monthly basis,{" "}
          <Link href="/profile/membership" className="text-white underline underline-offset-2">
            become a premium member
          </Link>
          .
        </p>
      ) : (
        <p className="px-5 py-4 text-[13px] text-[#FCB040]">
          Premium member — monthly reappraisal is included.
        </p>
      )}

      <div className="relative flex-1 px-5 pb-24">
        {empty ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/splash.jpg" alt="" className="mb-8 h-28 w-full object-cover opacity-70" />
            <p className="text-[15px] text-white/70">
              Press <span className="text-[#E8D5C0]">+</span> to upload your first timepiece
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 md:grid-cols-3 xl:grid-cols-4">
            {timepieces.map((watch) => (
              <WatchCard key={watch.id} watch={watch} />
            ))}
          </div>
        )}

        <Link
          href="/collection/add"
          className="absolute bottom-6 left-1/2 flex h-14 w-14 -translate-x-1/2 items-center justify-center rounded-full bg-[#E8D5C0] text-black shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          aria-label="Add a timepiece"
        >
          <Plus className="h-7 w-7" strokeWidth={1.75} />
        </Link>
      </div>
    </main>
  );
}
