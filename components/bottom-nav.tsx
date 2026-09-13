"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Mail, Plus, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/financing", label: "Repurchase", icon: Plus },
  { href: "/contact", label: "Contact us", icon: Mail },
  { href: "/profile", label: "Account", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-mac-line bg-mac-nav">
      <ul className="grid grid-cols-4 px-1 py-1.5">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "mac-tap flex flex-col items-center justify-center gap-1 py-1 text-[10px] tracking-[0.04em] uppercase",
                  active ? "text-mac-fg" : "text-mac-faint",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.6} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
