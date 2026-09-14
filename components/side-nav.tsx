"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Mail, Plus, UserRound } from "lucide-react";
import { MacWordmark } from "@/components/mac-logo";
import { cn } from "@/lib/utils";

const COLLECTOR = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/financing", label: "Repurchase", icon: Plus },
  { href: "/contact", label: "Contact us", icon: Mail },
  { href: "/profile", label: "Account", icon: UserRound },
];

export function SideNav() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-[240px] shrink-0 flex-col border-r border-white/10 bg-black xl:flex">
      <div className="border-b border-white/10 px-5 py-6">
        <MacWordmark onDark className="w-[196px]" />
      </div>
      <nav className="flex flex-1 flex-col px-3 py-4">
        {COLLECTOR.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mac-tap flex items-center gap-3 rounded-sm px-3 text-[12px] tracking-[0.12em] uppercase text-white/45",
                active && "bg-white/5 text-white",
              )}
            >
              <Icon className={cn("h-4 w-4", active && "text-[#FCB040]")} strokeWidth={1.5} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
