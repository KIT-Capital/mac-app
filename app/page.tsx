"use client";

import Link from "next/link";
import { MacWordmark } from "@/components/mac-logo";

export default function WelcomePage() {
  return (
    <main className="relative flex flex-1 flex-col justify-between overflow-hidden bg-[#0D1017] px-6 py-8">
      {/* Ambient background with dark luxury vignette */}
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/watches/richard-mille.jpg"
          alt=""
          className="h-full w-full object-cover opacity-25 filter blur-[1px] scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0D1017]/80 via-[#0D1017]/90 to-[#0D1017]" />
      </div>

      {/* Top Branding */}
      <div className="relative z-10 pt-4 text-center">
        <div className="mx-auto w-[220px]">
          <MacWordmark />
        </div>
      </div>

      {/* Hero Narrative */}
      <div className="relative z-10 my-auto py-8 text-center space-y-4">
        <span className="inline-block rounded-full border border-[#FCB040]/30 bg-[#FCB040]/10 px-3 py-1 text-[10px] font-semibold tracking-[0.22em] text-[#FCB040] uppercase">
          Appraising Premium Timepieces
        </span>
        <h1 className="text-[28px] font-medium leading-[1.12] tracking-tight text-white uppercase sm:text-[32px]">
          Unbiased
          <br />
          Appraisals &
          <br />
          <span className="text-[#FCB040]">Overnight</span> Financing
        </h1>
        <p className="mx-auto max-w-[280px] text-[13px] leading-relaxed text-white/70">
          From elite collections to aspiring connoisseurs. Access confidential asset-backed financing
          from specialists who appreciate mechanical art as much as you do.
        </p>
      </div>

      {/* CTAs */}
      <div className="relative z-10 space-y-3 pt-4">
        <Link
          href="/signup"
          className="mac-tap flex h-12 w-full items-center justify-center rounded-xl bg-white text-[13px] font-bold tracking-[0.18em] text-[#0A0D14] uppercase shadow-lg transition hover:bg-white/90 active:scale-[0.99]"
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="mac-tap flex h-12 w-full items-center justify-center rounded-xl border border-[#FCB040]/50 bg-[#0E2A44] text-[13px] font-bold tracking-[0.18em] text-white uppercase shadow-md transition hover:bg-[#133758] active:scale-[0.99]"
        >
          Sign In
        </Link>
        <p className="pt-2 text-center text-[10px] tracking-[0.14em] text-white/40 uppercase">
          Confidential · Manhattan Vault · 18% Base Rate
        </p>
      </div>
    </main>
  );
}
