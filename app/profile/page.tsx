"use client";

import Image from "next/image";
import Link from "next/link";
import { Asterisk, Camera, Mail, Pencil, Phone, Power, RefreshCw, Settings, SlidersHorizontal, Star } from "lucide-react";
import { BurgerButton } from "@/components/burger-menu";
import { useStore } from "@/lib/store";

const TILES = [
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/promo", label: "Promo Codes", icon: Asterisk },
  { href: "/profile/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export default function ProfilePage() {
  const { user, signOut, resetDemo } = useStore();
  const avatar = user?.avatar || "/watches/patek-wrist.jpg";

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <div className="relative h-[148px] overflow-hidden bg-[#0E2A44]">
        <Image
          src="/watches/richard-mille.jpg"
          alt=""
          fill
          sizes="412px"
          className="object-cover opacity-25"
          priority
        />
        <div className="relative flex items-start justify-between px-5 pt-14">
          <div className="flex items-start gap-3">
            <BurgerButton className="-ml-1 min-h-11 min-w-11" />
          <Link
            href="/profile/settings"
            className="flex min-h-11 min-w-11 flex-col items-start gap-1 text-white"
          >
            <Pencil className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[8px] tracking-[0.14em] uppercase">Edit Profile</span>
          </Link>
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-11 min-w-11 flex-col items-end gap-1 text-white"
          >
            <Power className="h-4 w-4" strokeWidth={1.5} />
            <span className="text-[8px] tracking-[0.14em] uppercase">Log Out</span>
          </button>
        </div>
      </div>

      <div className="-mt-11 flex flex-1 flex-col px-5 pb-4">
        <div className="relative mx-auto h-[88px] w-[88px]">
          <div className="h-full w-full overflow-hidden rounded-full border-[3px] border-mac-bg bg-mac-card">
            <Image
              src={avatar}
              alt={user?.name ? `${user.name} portrait` : "Account portrait"}
              width={88}
              height={88}
              className="h-full w-full object-cover"
            />
          </div>
          <Link
            href="/profile/settings"
            aria-label="Edit profile photo"
            className="absolute -bottom-0.5 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-black text-white"
          >
            <Camera className="h-2.5 w-2.5" strokeWidth={1.8} />
          </Link>
        </div>

        <h2 className="mt-4 text-center text-[22px] font-medium tracking-tight text-mac-fg">
          {user?.name}
        </h2>

        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-3 bg-mac-card px-4 py-3.5 text-[13px] text-mac-fg">
            <Mail className="h-4 w-4 shrink-0 text-mac-faint" strokeWidth={1.5} />
            <span className="truncate">{user?.email}</span>
          </div>
          <div className="flex items-center gap-3 bg-mac-card px-4 py-3.5 text-[13px] text-mac-fg">
            <Phone className="h-4 w-4 shrink-0 text-mac-faint" strokeWidth={1.5} />
            <span>{user?.phone || "Phone not on file"}</span>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          {TILES.map((tile) => {
            const Icon = tile.icon;
            return (
              <Link
                key={tile.label}
                href={tile.href}
                className="flex flex-col items-center justify-center gap-3 bg-mac-card py-8 text-mac-fg"
              >
                <Icon className="h-6 w-6 text-mac-muted" strokeWidth={1.35} />
                <span className="text-[12px]">{tile.label}</span>
              </Link>
            );
          })}
        </div>

        <button
          type="button"
          onClick={resetDemo}
          className="mt-auto pt-5 text-center text-[10px] tracking-[0.14em] text-mac-faint uppercase"
        >
          <RefreshCw className="mr-1 inline h-3 w-3" />
          Restore demo
        </button>
      </div>
    </main>
  );
}
