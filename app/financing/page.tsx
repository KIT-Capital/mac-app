"use client";

import Link from "next/link";
import { ArrowRight, Calculator, CheckCircle2, Clock, Plus, ShieldCheck } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function FinancingPage() {
  const { agreements, timepieces, settings } = useStore();

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader
        title="Financing Desk"
        right={
          <Link
            href="/financing/new"
            aria-label="New Financing Estimate"
            title="New Financing Estimate"
            className="mac-tap -mr-1 flex items-center justify-center text-white/80 hover:text-white"
          >
            <Plus className="h-5 w-5" strokeWidth={2} />
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Value Proposition Card */}
        <div className="rounded-2xl border border-[#FCB040]/30 bg-gradient-to-br from-[#161B24] to-[#0E2A44]/40 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#FCB040]/20 text-[#FCB040]">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-bold tracking-[0.16em] text-[#FCB040] uppercase">
              Sale-and-Repurchase Liquidity
            </span>
          </div>
          <h2 className="mt-2 text-[18px] font-semibold text-white">
            Instant Advances up to {Math.round(settings.maxLtv * 100)}% LTV
          </h2>
          <p className="mt-1 text-[12px] leading-relaxed text-white/70">
            Confidential liquidity against top horology references. No credit checks or bureaucratic
            delays. Closed in {settings.closeBusinessDays} business days via Manhattan vault custody.
          </p>

          <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/10 pt-3 text-center">
            <div>
              <p className="text-[10px] text-white/50 uppercase">Base Rate</p>
              <p className="text-[14px] font-bold text-white">{Math.round(settings.startingRate * 100)}% + fees</p>
            </div>
            <div>
              <p className="text-[10px] text-white/50 uppercase">Min Advance</p>
              <p className="text-[14px] font-bold text-white">{money(settings.minAdvance)}</p>
            </div>
            <div>
              <p className="text-[10px] text-white/50 uppercase">Closing</p>
              <p className="text-[14px] font-bold text-[#FCB040]">{settings.closeBusinessDays} Days</p>
            </div>
          </div>

          <Link
            href="/financing/new"
            className="mt-4 flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#FCB040] text-[12px] font-bold tracking-[0.16em] text-[#0A0D14] uppercase shadow-md transition hover:bg-[#ffbe59]"
          >
            <Calculator className="h-4 w-4" />
            Calculate Advance
          </Link>
        </div>

        {/* Existing Agreements */}
        <div>
          <div className="flex items-center justify-between pb-2">
            <h3 className="text-[11px] font-bold tracking-[0.16em] text-white/60 uppercase">
              Your Repurchase Agreements
            </h3>
            <Link href="/agreements" className="text-[11px] font-medium text-[#FCB040] hover:underline">
              View All
            </Link>
          </div>

          {agreements.length === 0 ? (
            <div className="rounded-2xl border border-white/10 bg-[#161B24] p-6 text-center">
              <Clock className="mx-auto h-8 w-8 text-white/30" />
              <p className="mt-2 text-[14px] font-medium text-white">No active agreements</p>
              <p className="mt-1 text-[12px] text-white/55">
                Run an estimate on any appraised timepiece to create your first repurchase contract.
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
                      Collateral: {watches.map((w) => `${w.brand} ${w.model}`).join(" · ") || "Selected watch"}
                    </p>

                    <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-2 text-[11px] text-white/50">
                      <span>{a.delivery}</span>
                      <span className="flex items-center gap-1 text-[#FCB040] group-hover:translate-x-0.5 transition">
                        Contract Details <ArrowRight className="h-3 w-3" />
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
