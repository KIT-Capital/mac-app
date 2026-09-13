"use client";

import Link from "next/link";
import { MacWordmark } from "@/components/mac-logo";

export default function WelcomePage() {
  return (
    <main className="relative flex flex-1 flex-col overflow-hidden bg-black">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/watches/richard-mille.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-70"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/65 to-black" />

      <div className="relative z-10 flex flex-1 flex-col px-7 pb-10 pt-16">
        <MacWordmark className="w-[210px]" />
        <div className="mt-auto space-y-6">
          <p className="text-[11px] tracking-[0.28em] text-[#FCB040] uppercase">
            Appraising premium timepieces
          </p>
          <h1 className="text-[34px] leading-[1.05] font-semibold tracking-tight text-white uppercase">
            Unbiased
            <br />
            appraisals
            <br />
            of premium
            <br />
            timepieces
          </h1>
          <p className="max-w-[18rem] text-[13px] leading-5 text-white/70">
            Appraise your watches and access confidential financing from horology experts who
            love timepieces as much as you do.
          </p>
          <div className="space-y-3 pt-4">
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
