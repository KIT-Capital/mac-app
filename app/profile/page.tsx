"use client";

import Link from "next/link";
import { LogOut, Pencil, Settings, Star, Ticket, Users } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { useStore } from "@/lib/store";

const TILES = [
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/settings", label: "Promo codes", icon: Ticket },
  { href: "/contact", label: "Partners", icon: Users },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export default function ProfilePage() {
  const { user, signOut, resetDemo } = useStore();

  return (
    <main className="flex flex-1 flex-col">
      <ScreenHeader
        title="Account"
        right={
          <button onClick={signOut} aria-label="Log out">
            <LogOut className="h-5 w-5" />
          </button>
        }
      />
      <div className="relative h-28 bg-[#0E2A44]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/splash.jpg" alt="" className="h-full w-full object-cover opacity-30" />
        <Link href="/profile/settings" className="absolute left-5 top-4 text-[10px] tracking-[0.16em] uppercase text-white/70">
          <Pencil className="mb-1 h-4 w-4" />
          Edit profile
        </Link>
      </div>
      <div className="-mt-10 px-5">
        <div className="mx-auto h-20 w-20 overflow-hidden rounded-full ring-4 ring-black">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={user?.avatar || "/watches/patek-wrist.jpg"} alt="" className="h-full w-full object-cover" />
        </div>
        <h2 className="mt-4 text-center font-[family-name:var(--font-display)] text-3xl">
          {user?.name}
        </h2>
        <div className="mt-5 space-y-3 text-sm">
          <p className="rounded-md bg-[#141414] px-4 py-3">{user?.email}</p>
          <p className="rounded-md bg-[#141414] px-4 py-3">{user?.phone}</p>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex h-28 flex-col items-center justify-center gap-2 rounded-md bg-[#141414] text-[12px] tracking-[0.12em] uppercase text-white/80"
              >
                <Icon className="h-6 w-6 text-white/60" />
                {tile.label}
              </Link>
            );
          })}
        </div>
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
