"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Mail, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

const ITEMS = [
  { href: "/collection", label: "Timepieces", icon: Clock },
  { href: "/financing", label: "Financing", icon: Plus },
  { href: "/contact", label: "Contact us", icon: Mail },
];

export function BottomNav() {
  const pathname = usePathname();
  const { user } = useStore();

  return (
    <nav className="sticky bottom-0 z-20 border-t border-white/10 bg-black pb-[env(safe-area-inset-bottom)] xl:hidden">
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "mac-tap flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] tracking-[0.04em] text-white/45",
                  active && "text-white",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={1.5} />
                {item.label}
                {active ? <span className="h-px w-8 bg-[#FCB040]" /> : <span className="h-px w-8" />}
              </Link>
            </li>
          );
        })}
        <li>
          <Link
            href="/profile"
            className={cn(
              "mac-tap flex flex-col items-center justify-center gap-1 py-2.5 text-[10px] tracking-[0.04em] text-white/45",
              pathname.startsWith("/profile") && "text-white",
            )}
          >
            <span className="h-5 w-5 overflow-hidden rounded-full bg-[#1a1a1a]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={user?.avatar || "/watches/patek-wrist.jpg"} alt="" className="h-full w-full object-cover" />
            </span>
            Account
            {pathname.startsWith("/profile") ? (
              <span className="h-px w-8 bg-[#FCB040]" />
            ) : (
              <span className="h-px w-8" />
            )}
          </Link>
        </li>
      </ul>
    </nav>
  );
}
