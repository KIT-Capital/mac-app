"use client";

import Link from "next/link";
import { LogOut, Pencil, RefreshCw, Settings, ShieldAlert, Star, Ticket, Users } from "lucide-react";
import { isDesk } from "@/lib/catalog";
import { useStore } from "@/lib/store";

const TILES = [
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/settings", label: "Promo Codes", icon: Ticket },
  { href: "/contact", label: "Partners", icon: Users },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export default function ProfilePage() {
  const { user, signOut, resetDemo } = useStore();
  const desk = isDesk(user);

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <div className="relative flex h-28 items-start justify-between bg-[#0E2A44] px-4 pt-3">
        <Link
          href="/profile/settings"
          className="mac-tap flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white uppercase"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Profile
        </Link>
        <button
          onClick={signOut}
          className="mac-tap flex items-center gap-1.5 px-2 py-1.5 text-[11px] font-semibold tracking-[0.14em] text-white uppercase"
        >
          <LogOut className="h-3.5 w-3.5" />
          Log Out
        </button>
      </div>

      <div className="-mt-12 flex flex-1 flex-col px-5 pb-8">
        <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-4 border-mac-bg bg-mac-card shadow-lg">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user?.avatar || "/watches/patek-wrist.jpg"} alt="" className="h-full w-full object-cover" />
        </div>

        <div className="mt-3 text-center">
          <h2 className="text-[22px] font-semibold tracking-tight text-mac-fg">{user?.name}</h2>
        </div>

        <div className="mt-5 space-y-3 text-[13px]">
          <div className="flex items-center justify-between border-b border-mac-line pb-3">
            <span className="text-mac-faint">Email</span>
            <span className="font-medium text-mac-fg">{user?.email}</span>
          </div>
          <div className="flex items-center justify-between border-b border-mac-line pb-3">
            <span className="text-mac-faint">Phone</span>
            <span className="font-medium text-mac-fg">{user?.phone || "+1 (212) 555-0148"}</span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-mac-line bg-mac-card py-6 text-mac-fg transition hover:border-[#FCB040]/60"
              >
                <Icon className="h-6 w-6 text-mac-muted" strokeWidth={1.6} />
                <p className="text-[12px] font-semibold tracking-[0.08em] uppercase">{tile.label}</p>
              </Link>
            );
          })}
        </div>

        {desk ? (
          <Link
            href="/admin"
            className="mt-5 flex items-center justify-center gap-2 rounded-xl border border-[#FCB040]/40 bg-[#FCB040]/10 py-3 text-[12px] font-bold tracking-[0.16em] text-[#FCB040] uppercase"
          >
            <ShieldAlert className="h-4 w-4" />
            Open Admin Management Desk
          </Link>
        ) : null}

        <div className="mt-auto pt-6 text-center">
          <button
            onClick={resetDemo}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium tracking-[0.14em] text-mac-faint uppercase transition hover:text-mac-muted"
          >
            <RefreshCw className="h-3 w-3" />
            Restore Demo Data & Watches
          </button>
        </div>
      </div>
    </main>
  );
}
