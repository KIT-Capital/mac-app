"use client";

import Link from "next/link";
import { MacLockup } from "@/components/mac-logo";
import { useStore } from "@/lib/store";

export default function WelcomePage() {
  const { settings, updateSettings } = useStore();
  const light = settings.appearance === "light";

  return (
    <main className={`relative flex flex-1 flex-col justify-between overflow-hidden px-7 pb-8 pt-6 ${light ? "bg-white" : "bg-black"}`}>
      <div className="absolute inset-0 z-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={light ? "/watches/patek-wrist.jpg" : "/watches/richard-mille.jpg"}
          alt=""
          className={`h-full w-full object-cover object-center ${light ? "opacity-35" : "opacity-45"}`}
        />
        <div
          className={`absolute inset-0 ${
            light
              ? "bg-gradient-to-b from-white via-white/70 to-white"
              : "bg-gradient-to-b from-black/70 via-black/45 to-black"
          }`}
        />
      </div>

      <div className="relative z-10 flex justify-center pt-2">
        <MacLockup onDark={!light} />
      </div>

      <div className="relative z-10 my-auto text-center">
        <h1
          className={`text-[30px] font-medium leading-[1.12] tracking-[-0.02em] uppercase sm:text-[32px] ${
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
          className={`mx-auto mt-5 max-w-[250px] text-[11px] leading-relaxed ${
            light ? "text-black/55" : "text-white/70"
          }`}
        >
          Appraise your timepiece with MAC, the horology experts who appreciate mechanical art as
          much as you do. MAC buys qualifying pieces; you may buy them back on a preset scale.
        </p>
      </div>

      <div className="relative z-10 space-y-3">
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
        <button
          type="button"
          onClick={() => updateSettings({ appearance: light ? "dark" : "light" })}
          className={`mx-auto block pt-1 text-[10px] tracking-[0.16em] uppercase ${
            light ? "text-black/40" : "text-white/40"
          }`}
        >
          {light ? "Dark screen" : "Light screen"}
        </button>
      </div>
    </main>
  );
}
