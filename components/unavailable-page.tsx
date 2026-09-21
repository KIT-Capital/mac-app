"use client";

import { MacLockup } from "@/components/mac-logo";

const CONTACT_EMAIL = "info@mechartcap.com";

/**
 * Rendered in place of every route when the server reports `mode: "unavailable"`
 * (plan 2026-09-17-003, KTD1). No sign-in, no navigation chrome, no automatic
 * re-check: "Try again" is one full reload.
 */
export function UnavailablePage() {
  return (
    <main
      data-appearance="dark"
      className="mac-app-screen flex min-h-dvh w-full flex-col items-center justify-center bg-mac-bg px-6 py-10 text-mac-fg"
    >
      <div className="flex w-full max-w-[430px] flex-col items-center gap-8 text-center">
        <MacLockup onDark size="hero" />
        <p className="text-[15px] leading-relaxed text-mac-muted">
          Mechanical Art Capital is temporarily unavailable. Your collection and agreements are
          safe.
        </p>
        <p className="text-[12px] text-mac-faint">
          Questions:{" "}
          <a className="text-mac-gold" href={`mailto:${CONTACT_EMAIL}`}>
            {CONTACT_EMAIL}
          </a>
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded-full bg-mac-navy px-8 py-3 text-[11px] font-bold tracking-[0.18em] text-white uppercase shadow-sm"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
