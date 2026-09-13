"use client";

import Link from "next/link";
import { AppearanceToggle } from "@/components/appearance-toggle";
import { MacLogoMark, MacWordmark } from "@/components/mac-logo";
import { useStore } from "@/lib/store";

export default function WelcomePage() {
  const { settings } = useStore();
  const light = settings.appearance === "light";

  return (
    <main className="relative flex flex-1 flex-col justify-between overflow-hidden bg-mac-bg px-6 py-8">
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/watches/richard-mille.jpg"
          alt=""
          className={`h-full w-full object-cover scale-105 ${light ? "opacity-20" : "opacity-25 filter blur-[1px]"}`}
        />
        <div
          className={`absolute inset-0 ${
            light
              ? "bg-gradient-to-b from-white/85 via-white/92 to-white"
              : "bg-gradient-to-b from-[#0D1017]/80 via-[#0D1017]/90 to-[#0D1017]"
          }`}
        />
      </div>

      <div className="relative z-10 pt-4 text-center">
        <div className="mx-auto w-[220px]">
          {light ? <MacLogoMark /> : <MacWordmark />}
        </div>
      </div>

      <div className="relative z-10 my-auto py-8 text-center space-y-4">
        <h1 className="text-[28px] font-medium leading-[1.08] tracking-tight text-mac-fg uppercase sm:text-[32px]">
          Unbiased
          <br />
          Appraisals
          <br />
          of Premium
          <br />
          Timepieces
        </h1>
        <p className="mx-auto max-w-[280px] text-[13px] leading-relaxed text-mac-muted">
          Appraise your timepiece with MAC, the horology experts who appreciate mechanical art as
          much as you do. MAC buys qualifying pieces; you may buy them back on a preset scale. This
          is not a loan.
        </p>
      </div>

      <div className="relative z-10 space-y-3 pt-4">
        <Link
          href="/signup"
          className={`mac-tap flex h-12 w-full items-center justify-center rounded-none text-[13px] font-bold tracking-[0.18em] uppercase shadow-lg transition active:scale-[0.99] ${
            light ? "bg-black text-white hover:bg-black/90" : "bg-white text-[#0A0D14] hover:bg-white/90"
          }`}
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="mac-tap flex h-12 w-full items-center justify-center rounded-none bg-[#0E2A44] text-[13px] font-bold tracking-[0.18em] text-white uppercase shadow-md transition hover:bg-[#133758] active:scale-[0.99]"
        >
          Sign In
        </Link>
        <AppearanceToggle className="pt-2" />
      </div>
    </main>
  );
}
