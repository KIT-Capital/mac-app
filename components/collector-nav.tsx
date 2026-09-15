"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { COLLECTOR_LINKS, COLLECTOR_PRIMARY } from "@/lib/nav";
import { cn } from "@/lib/utils";

export function CollectorNav({
  variant = "bar",
  onNavigate,
}: {
  variant?: "bar" | "drawer";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = variant === "bar" ? COLLECTOR_PRIMARY : COLLECTOR_LINKS;

  return (
    <nav aria-label="Collector" className={cn(variant === "bar" && "hidden items-center gap-1 md:flex")}>
      {items.map((item) => {
        const Icon = item.icon;
        const active =
          pathname === item.href || (item.href !== "/collection" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              variant === "bar"
                ? "mac-tap flex h-10 items-center rounded-sm px-2.5 text-[12px] tracking-[0.06em] xl:px-3"
                : "mac-tap flex items-center gap-3 rounded-sm px-3 text-[13px] tracking-[0.04em]",
              active
                ? variant === "bar"
                  ? "bg-white/10 text-white"
                  : "bg-white/10 text-white"
                : variant === "bar"
                  ? "text-white/70 hover:text-white"
                  : "text-white/70",
            )}
          >
            {variant === "drawer" ? <Icon className="h-4 w-4" strokeWidth={1.6} /> : null}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
