"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Clock,
  LayoutDashboard,
  Mail,
  Menu,
  Plus,
  Settings,
  SlidersHorizontal,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { MacWordmark } from "@/components/mac-logo";
import { isDesk } from "@/lib/catalog";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const COLLECTOR_LINKS = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/collection/add", label: "Add a timepiece", icon: Plus },
  { href: "/financing", label: "Repurchase", icon: Plus },
  { href: "/contact", label: "Contact us", icon: Mail },
  { href: "/profile", label: "Account", icon: UserRound },
  { href: "/profile/preferences", label: "Preferences", icon: SlidersHorizontal },
  { href: "/profile/membership", label: "Membership", icon: Star },
  { href: "/profile/settings", label: "Settings", icon: Settings },
];

export function BurgerButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn("mac-tap flex items-center justify-center text-white", className)}
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>
      {open ? <BurgerDrawer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BurgerDrawer({ onClose }: { onClose: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useStore();
  const desk = isDesk(user);
  const [host, setHost] = useState<Element | null>(null);

  useEffect(() => {
    setHost(document.querySelector(".mac-phone-screen"));
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!host) return null;

  return createPortal(
    <div className="absolute inset-0 z-50 flex">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <nav className="relative z-10 flex h-full w-[78%] max-w-[300px] flex-col bg-[#0E2A44] text-white shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-10 pb-4">
          <div className="min-w-0">
            <MacWordmark onDark className="w-[148px]" />
            <p className="mt-2 text-[13px] font-medium text-white/80">{user?.name || "Collector"}</p>
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="mac-tap flex items-center justify-center">
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <ul className="flex-1 overflow-y-auto px-2 pb-4">
          {COLLECTOR_LINKS.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/collection" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "mac-tap flex items-center gap-3 rounded-sm px-3 text-[13px] tracking-[0.04em]",
                    active ? "bg-white/10 text-white" : "text-white/70",
                  )}
                >
                  <Icon className="h-4 w-4" strokeWidth={1.6} />
                  {item.label}
                </Link>
              </li>
            );
          })}
          {desk ? (
            <li>
              <Link
                href="/admin"
                onClick={onClose}
                className="mac-tap mt-4 flex items-center gap-3 rounded-sm px-3 text-[13px] text-white/50"
              >
                <LayoutDashboard className="h-4 w-4" strokeWidth={1.6} />
                Desk
              </Link>
            </li>
          ) : null}
        </ul>
        <button
          type="button"
          onClick={() => {
            onClose();
            signOut();
            router.replace("/login");
          }}
          className="border-t border-white/10 px-5 py-4 text-left text-[11px] tracking-[0.16em] text-white/55 uppercase"
        >
          Log out
        </button>
      </nav>
    </div>,
    host,
  );
}
