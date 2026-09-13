"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col bg-black">
      <ScreenHeader title="Privacy policy" backHref="/signup" />
      <article className="mx-auto w-full max-w-xl flex-1 space-y-4 overflow-y-auto px-5 py-6 text-[13px] leading-6 text-white/70">
        <p className="text-[11px] tracking-[0.16em] text-[#FCB040] uppercase">Effective November 20, 2020</p>
        <p>
          Mechanical Art Capital LLC collects account, collection, photograph, and financing information to
          appraise timepieces and originate confidential sale-and-repurchase agreements. We do not sell
          personal information. Photographs and serial data are used for manufacturer verification and vault
          intake.
        </p>
        <p>
          You may request access, correction, or deletion of your collection profile by writing
          info@mechartcap.com or calling +1 (833) 209-0972. This prototype stores data only in this browser.
        </p>
        <p>
          By creating an account you confirm you are 18 or older and agree to this policy. The production
          iOS and Android apps will present this notice before first upload.
        </p>
        <Link href="/signup" className="inline-block pt-4 text-[#FCB040]">
          Back to create account
        </Link>
      </article>
    </main>
  );
}
