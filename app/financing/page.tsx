"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock, FilePlus, ShieldCheck } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { hasApplication, money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function FinancingPage() {
  const { agreements, timepieces, settings, user } = useStore();
  const applied = hasApplication(user, agreements.length);

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader
        title="Sale & Repurchase"
        right={
          <Link
            href="/financing/new"
            aria-label="Submit repurchase application"
            title="Submit repurchase application"
            className="mac-tap -mr-1 flex items-center justify-center text-white/80 hover:text-white"
          >
            <FilePlus className="h-5 w-5" strokeWidth={2} />
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        <div className="rounded-2xl border border-[#FCB040]/30 bg-gradient-to-br from-[#161B24] to-[#0E2A44]/40 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FCB040]/20 text-[#FCB040]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold tracking-[0.16em] text-[#FCB040] uppercase">
              Repo desk — not a loan
            </span>
          </div>
          <h2 className="mt-2 text-[18px] font-semibold text-white">MAC buys. You buy back.</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-white/70">
            Mechanical Art Capital purchases qualifying timepieces. You may repurchase them later at
            the price on our preset scale for the term you choose. There is no interest rate and
            this is not a loan.
          </p>

          {applied ? (
            <div className="mt-4 space-y-2 border-t border-white/10 pt-3 text-[12px] text-white/75">
              <p>
                Custody after purchase is arranged by the desk
                {settings.vaultLocation ? ` (${settings.vaultLocation})` : ""}.
              </p>
              <p>Your repurchase price is confirmed on the scale attached to each application.</p>
            </div>
          ) : (
            <p className="mt-4 border-t border-white/10 pt-3 text-[12px] text-white/60">
              Custody location and the pricing scale are shared after you send an application.
            </p>
          )}

          <Link
            href="/financing/new"
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FCB040] text-[12px] font-bold tracking-[0.16em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59]"
          >
            Submit an Application
          </Link>
        </div>

        <div>
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-[11px] font-bold tracking-[0.16em] text-white/60 uppercase">
              Your repurchase agreements
            </h3>
            <Link href="/agreements" className="text-[11px] font-medium text-[#FCB040] hover:underline">
              View All
            </Link>
          </div>

          {agreements.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#161B24] p-6 text-center">
              <Clock className="mx-auto h-8 w-8 text-white/30" />
              <p className="mt-2 text-[14px] font-medium text-white">No applications yet</p>
              <p className="mt-1 text-[12px] text-white/55">
                Appraise a timepiece, then send a sale-and-repurchase application. The desk confirms
                the buyback scale after it arrives.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {agreements.map((a) => {
                const watches = timepieces.filter((w) => a.watchIds.includes(w.id));
                const isSigned = a.status === "signed";
                return (
                  <Link
                    key={a.id}
                    href={`/agreements/${a.id}`}
                    className="group block rounded-2xl border border-white/15 bg-[#161B24] p-4 transition hover:border-[#FCB040]/50"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold tracking-[0.16em] text-[#E8D5C0] uppercase">
                        {a.agreementCode || a.id}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase ${
                          isSigned
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/30"
                            : "bg-[#FCB040]/10 text-[#FCB040] border border-[#FCB040]/30"
                        }`}
                      >
                        {isSigned ? <CheckCircle2 className="h-2.5 w-2.5" /> : null}
                        {a.status.replace("_", " ")}
                      </span>
                    </div>

                    <div className="mt-2 flex items-baseline justify-between">
                      <p className="text-[20px] font-bold text-white">{money(a.amount)}</p>
                      <span className="text-[12px] text-white/60">{a.termMonths} Months</span>
                    </div>

                    <p className="mt-1 text-[12px] text-white/70 line-clamp-1">
                      Timepiece: {watches.map((w) => `${w.brand} ${w.model}`).join(" · ") || "Selected watch"}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-white/50">
                      <span>{applied ? a.delivery : "Custody confirmed after review"}</span>
                      <span className="flex items-center gap-1 text-[#FCB040] group-hover:translate-x-0.5 transition">
                        Agreement <ArrowRight className="h-3 w-3" />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
