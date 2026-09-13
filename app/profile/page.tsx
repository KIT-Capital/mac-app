"use client";

import Link from "next/link";
import { LogOut, Pencil, RefreshCw, Settings, ShieldAlert, Star, Ticket, Users } from "lucide-react";
import { isDesk } from "@/lib/catalog";
import { useStore } from "@/lib/store";

const TILES = [
  { href: "/profile/membership", label: "Membership", desc: "Certified Revaluations", icon: Star },
  { href: "/profile/settings", label: "Promo Codes", desc: "Fee Waivers", icon: Ticket },
  { href: "/contact", label: "Partners", desc: "Private Deal Desk", icon: Users },
  { href: "/profile/settings", label: "Settings", desc: "Security & Profile", icon: Settings },
];

export default function ProfilePage() {
  const { user, signOut, resetDemo } = useStore();
  const desk = isDesk(user);

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      {/* Header Banner */}
      <div className="relative flex h-28 items-start justify-between border-b border-white/10 bg-[#0E2A44] px-4 pt-3 shadow-inner">
        <Link
          href="/profile/settings"
          className="mac-tap flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white uppercase transition hover:bg-white/20"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit
        </Link>
        <button
          onClick={signOut}
          className="mac-tap flex items-center gap-1.5 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-red-300 uppercase transition hover:bg-red-500/20"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log Out
        </button>
      </div>

      {/* Avatar & Identity */}
      <div className="-mt-14 flex flex-1 flex-col px-5 pb-8">
        <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-4 border-[#10141D] bg-[#161B24] shadow-lg ring-2 ring-[#FCB040]/50">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user?.avatar || "/watches/patek-wrist.jpg"} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="mt-3 text-center">
          <h2 className="text-[22px] font-semibold tracking-tight text-white">{user?.name}</h2>
          <span className="mt-1 inline-block rounded-full border border-[#FCB040]/30 bg-[#FCB040]/10 px-3 py-0.5 text-[10px] font-bold tracking-[0.18em] text-[#FCB040] uppercase">
            {user?.member ? "★ Premium Client" : "Standard Client"}
          </span>
        </div>

        {/* Contact info cards */}
        <div className="mt-5 space-y-2.5">
          <div className="flex items-center justify-between rounded-xl border border-white/15 bg-[#161B24] px-4 py-3 text-[13px]">
            <span className="text-white/50 text-[11px] font-semibold tracking-wider uppercase">Email</span>
            <span className="font-medium text-white">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-white/15 bg-[#161B24] px-4 py-3 text-[13px]">
            <span className="text-white/50 text-[11px] font-semibold tracking-wider uppercase">Phone</span>
            <span className="font-medium text-white">{user?.phone || "+1 (212) 555-0148"}</span>
          </div>
        </div>

        {/* Navigation Grid */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="group flex flex-col justify-between rounded-2xl border border-white/15 bg-[#161B24] p-4 transition hover:border-[#FCB040]/60 hover:bg-[#1A212E]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-[#FCB040] transition group-hover:bg-[#FCB040]/10">
                  <Icon className="h-5 w-5" strokeWidth={2} />
                </div>
                <div className="mt-4">
                  <p className="text-[13px] font-semibold text-white">{tile.label}</p>
                  <p className="text-[11px] text-white/50">{tile.desc}</p>
                </div>
              </Link>
            );
          })}
        </div>

        {/* Admin Desk Shortcut (for staff/admin) */}
        {desk ? (
          <Link
            href="/admin"
            className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[#FCB040]/40 bg-[#FCB040]/10 py-3 text-[12px] font-bold tracking-[0.16em] text-[#FCB040] uppercase transition hover:bg-[#FCB040]/20"
          >
            <ShieldAlert className="h-4 w-4" />
            Open Admin Management Desk
          </Link>
        ) : null}

        {/* Reset / Demo seed */}
        <div className="mt-auto pt-6 text-center">
          <button
            onClick={resetDemo}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-white/40 uppercase transition hover:text-white/70"
          >
            <RefreshCw className="h-3 w-3" />
            Restore Demo Data & Watches
          </button>
        </div>
      </div>
    </main>
  );
}
