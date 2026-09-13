"use client";

import Link from "next/link";
import { LogOut, Pencil, Settings, Star, Ticket, Users } from "lucide-react";
import { isDesk } from "@/lib/catalog";
import { useStore } from "@/lib/store";

const TILES = [
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/settings", label: "Promo codes", icon: Ticket },
  { href: "/contact", label: "Partners", icon: Users },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export default function ProfilePage() {
  const { user, signOut, resetDemo } = useStore();
  const desk = isDesk(user);

  return (
    <main className="flex flex-1 flex-col bg-[#161616]">
      <div className="relative isolate h-36">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/splash.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[86%_72%] opacity-35" />
        <div className="absolute inset-0 bg-[#0E2A44]/86" />
        <div className="relative z-10 flex items-start justify-between px-4 pt-[max(12px,env(safe-area-inset-top))]">
          <Link href="/profile/settings" className="mac-tap flex flex-col items-center text-[9px] tracking-[0.16em] text-white/80 uppercase">
            <Pencil className="mb-1 h-4 w-4" strokeWidth={1.5} />
            Edit profile
          </Link>
          <button onClick={signOut} className="mac-tap flex flex-col items-center text-[9px] tracking-[0.16em] text-white/80 uppercase">
            <LogOut className="mb-1 h-4 w-4" strokeWidth={1.5} />
            Log out
          </button>
        </div>
      </div>
      <div className="-mt-12 flex flex-1 flex-col px-5">
        <div className="mx-auto h-[88px] w-[88px] overflow-hidden rounded-full ring-4 ring-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user?.avatar || "/watches/patek-wrist.jpg"} alt="" className="h-full w-full object-cover" />
        </div>
        <h2 className="mt-5 text-center text-[28px] font-medium tracking-tight">
          {user?.name}
        </h2>
        <div className="mx-auto mt-6 w-full max-w-md space-y-3 text-sm">
          <p className="flex items-center gap-3 bg-[#222] px-4 py-3 ring-1 ring-white/20">
            <span className="text-white/55">@</span>
            {user?.email}
          </p>
          <p className="flex items-center gap-3 bg-[#222] px-4 py-3 ring-1 ring-white/20">
            <span className="text-white/55">#</span>
            {user?.phone}
          </p>
        </div>
        <div className="mx-auto mt-6 grid w-full max-w-md grid-cols-2 gap-3">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex h-28 flex-col items-center justify-center gap-2 bg-[#222] text-[12px] tracking-[0.08em] text-white ring-1 ring-white/20"
              >
                <Icon className="h-6 w-6 text-white/55" strokeWidth={1.4} />
                {tile.label}
              </Link>
            );
          })}
        </div>
        {desk ? (
          <Link href="/admin" className="mx-auto mt-6 block text-center text-[12px] tracking-[0.16em] text-[#FCB040] uppercase">
            Open admin desk
          </Link>
        ) : null}
        <button
          onClick={resetDemo}
          className="mt-6 w-full text-center text-[11px] tracking-[0.16em] text-white/35 uppercase"
        >
          Restore demo collection
        </button>
      </div>
    </main>
  );
}
