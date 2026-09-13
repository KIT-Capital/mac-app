"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";

export default function PrivacyPage() {
  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Privacy Policy" backHref="/signup" />
      <article className="mx-auto w-full max-w-xl flex-1 space-y-4 overflow-y-auto px-6 py-6 text-[13px] leading-relaxed text-mac-muted">
        <span className="inline-block rounded-full border border-[#FCB040]/30 bg-[#FCB040]/10 px-3 py-0.5 text-[10px] font-bold tracking-wider text-[#FCB040] uppercase">
          Client Data & Title Verification Standard
        </span>
        <p className="font-medium text-mac-fg">
          Effective November 20, 2020 · Updated for Mobile Client Desk
        </p>
        <p>
          Mechanical Art Capital LLC collects account, collection, and photograph information to
          appraise timepieces and complete confidential sale-and-repurchase purchases. This is not
          a loan. We never sell or share client collection data with unauthorized third parties.
          Photographs and serial data are used solely for manufacturer verification and, after an
          application, custody intake.
        </p>
        <p>
          You may request access, certified export, or deletion of your collection profile at any time by contacting{" "}
          <span className="text-mac-fg font-medium">info@mechartcap.com</span> or calling{" "}
          <span className="text-mac-fg font-medium">+1 (833) 209-0972</span>.
        </p>
        <p className="text-mac-faint text-[12px]">
          By creating an account, you confirm you are 18 or older and consent to manufacturer authentication checks.
        </p>
        <div className="pt-4">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-white/10 px-5 text-xs font-semibold uppercase tracking-wider text-[#FCB040] hover:bg-white/15"
          >
            ← Back to Registration
          </Link>
        </div>
      </article>
    </main>
  );
}
