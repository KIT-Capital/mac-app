"use client";

import Link from "next/link";
import { MacWordmark } from "@/components/mac-logo";

export default function WelcomePage() {
  return (
    <main className="relative flex flex-1 flex-col justify-end overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/splash.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-80"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/55 to-black" />

      <div className="relative z-10 flex flex-1 flex-col px-7 pb-10 pt-16">
        <MacWordmark />
        <div className="mt-auto space-y-6">
          <p className="text-[11px] tracking-[0.28em] text-[#FCB040] uppercase">
            Appraising premium timepieces
          </p>
          <h1 className="font-[family-name:var(--font-display)] text-[42px] leading-[0.95] tracking-tight">
            Unbiased appraisals of premium timepieces
          </h1>
          <p className="max-w-[20rem] text-[14px] leading-6 text-white/72">
            From elite collections to aspiring connoisseurs. Appraise your watches
            and access confidential financing from horology experts who love
            timepieces as much as you do.
          </p>
          <div className="space-y-3 pt-4">
            <Link
              href="/signup"
              className="flex h-12 items-center justify-center rounded-full bg-[#E8D5C0] text-[13px] font-semibold tracking-[0.18em] text-black uppercase"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="flex h-12 items-center justify-center rounded-full bg-white text-[13px] font-semibold tracking-[0.18em] text-black uppercase"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
