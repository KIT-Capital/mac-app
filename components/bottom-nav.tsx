"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, FileSignature, Mail, UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/financing", label: "Financing", icon: FileSignature },
  { href: "/contact", label: "Contact us", icon: Mail },
  { href: "/profile", label: "Account", icon: UserRound },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-white/10 bg-black/95 backdrop-blur">
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 py-3 text-[10px] tracking-[0.12em] uppercase",
                  active ? "text-white" : "text-white/40"
                )}
              >
                <Icon className={cn("h-5 w-5", active && "text-[#FCB040]")} />
                {item.label}
                {active && <span className="h-px w-6 bg-[#FCB040]" />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
