"use client";

import Link from "next/link";
import { MacWordmark } from "@/components/mac-logo";

export default function WelcomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/splash.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-black/70 to-black" />

      <div className="relative z-10 flex flex-1 flex-col items-center px-8 pb-10 pt-[max(3rem,env(safe-area-inset-top))]">
        <MacWordmark className="mt-6 w-[220px] md:w-[260px]" />
        <div className="mt-auto w-full max-w-md space-y-7 pb-4 text-center">
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-[0.02em] text-white uppercase md:text-[42px]">
            Unbiased
            <br />
            appraisals
            <br />
            of premium
            <br />
            timepieces
          </h1>
          <p className="mx-auto max-w-[20rem] text-[11px] leading-5 tracking-[0.16em] text-white/75 uppercase">
            Appraise your timepieces and access financing from MAC, the horology experts who
            appreciate mechanical art as much as you do.
          </p>
          <div className="space-y-3 pt-2">
            <Link
              href="/signup"
              className="mac-tap flex h-12 items-center justify-center bg-white text-[12px] font-semibold tracking-[0.22em] text-black uppercase"
            >
              Get started
            </Link>
            <Link
              href="/login"
              className="mac-tap flex h-12 items-center justify-center bg-[#0E2A44] text-[12px] font-semibold tracking-[0.22em] text-white uppercase"
            >
              Sign in
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
