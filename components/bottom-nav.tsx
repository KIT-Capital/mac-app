"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, FileText, Mail, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

const ITEMS = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/financing", label: "Repurchase", icon: FileText },
  { href: "/contact", label: "Contact us", icon: Mail },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useStore();
  const isAccountActive = pathname.startsWith("/profile");

  return (
    <nav className="sticky bottom-0 z-20 border-t border-mac-line bg-mac-nav backdrop-blur-md">
      <ul className="grid grid-cols-4 px-1 py-1">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "mac-tap flex flex-col items-center justify-center gap-1 py-1 text-[10px] tracking-[0.06em] uppercase transition",
                  active ? "text-mac-fg font-semibold" : "text-mac-faint hover:text-mac-muted",
                )}
              >
                <Icon
                  className={cn("h-5 w-5 transition-colors", active ? "text-[#FCB040]" : "text-mac-faint")}
                  strokeWidth={active ? 2.2 : 1.75}
                />
                <span>{item.label}</span>
                {active ? (
                  <span className="h-[2px] w-6 rounded-full bg-[#FCB040] shadow-[0_0_8px_rgba(252,176,64,0.6)]" />
                ) : (
                  <span className="h-[2px] w-6" />
                )}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/profile"
            className={cn(
              "mac-tap flex flex-col items-center justify-center gap-1 py-1 text-[10px] tracking-[0.06em] uppercase transition",
              isAccountActive ? "text-mac-fg font-semibold" : "text-mac-faint hover:text-mac-muted",
            )}
          >
            {user?.avatar ? (
              <span
                className={cn(
                  "h-5 w-5 overflow-hidden rounded-full ring-1 transition",
                  isAccountActive ? "ring-[#FCB040]" : "ring-mac-line",
                )}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={user.avatar} alt="" className="h-full w-full object-cover" />
              </span>
            ) : (
              <UserRound
                className={cn("h-5 w-5 transition-colors", isAccountActive ? "text-[#FCB040]" : "text-mac-faint")}
                strokeWidth={isAccountActive ? 2.2 : 1.75}
              />
            )}
            <span>Account</span>
            {isAccountActive ? (
              <span className="h-[2px] w-6 rounded-full bg-[#FCB040] shadow-[0_0_8px_rgba(252,176,64,0.6)]" />
            ) : (
              <span className="h-[2px] w-6" />
            )}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
