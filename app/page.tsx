"use client";

import Link from "next/link";
import { MacLockup } from "@/components/mac-logo";
import { useStore } from "@/lib/store";

export default function WelcomePage() {
  const { settings, updateSettings } = useStore();
  const light = settings.appearance === "light";

  return (
    <main
      className={`relative flex min-h-0 flex-1 flex-col px-8 py-10 ${
        light ? "bg-white" : "bg-black"
      }`}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <div className="flex w-full max-w-[320px] flex-col items-center">
          <MacLockup onDark={!light} size="hero" />
          <h1
            className={`mt-8 text-center text-[26px] font-medium leading-[1.14] tracking-[0.06em] uppercase sm:text-[28px] ${
              light ? "text-black" : "text-white"
            }`}
          >
            Unbiased
            <br />
            Appraisals
            <br />
            of Premium
            <br />
            Timepieces
          </h1>
          <p
            className={`mx-auto mt-5 max-w-[280px] text-center text-[12px] leading-[1.65] ${
              light ? "text-black/55" : "text-white/65"
            }`}
          >
            Appraise your timepiece with MAC, the horology experts who appreciate mechanical art as
            much as you do. MAC buys qualifying pieces; you may buy them back on a preset scale.
          </p>
          <div className="mt-10 w-full space-y-3">
            <Link
              href="/signup"
              className={`mac-tap flex h-12 w-full items-center justify-center text-[12px] font-semibold tracking-[0.18em] uppercase ${
                light ? "bg-black text-white" : "bg-white text-black"
              }`}
            >
              Get Started
            </Link>
            <Link
              href="/login"
              className="mac-tap flex h-12 w-full items-center justify-center bg-[#0E2A44] text-[12px] font-semibold tracking-[0.18em] text-white uppercase"
            >
              Sign In
            </Link>
          </div>
          <button
            type="button"
            onClick={() => updateSettings({ appearance: light ? "dark" : "light" })}
            className={`mt-5 text-[10px] tracking-[0.16em] uppercase ${
              light ? "text-black/40" : "text-white/40"
            }`}
          >
            {light ? "Dark screen" : "Light screen"}
          </button>
        </div>
      </div>
    </main>
  );
}
