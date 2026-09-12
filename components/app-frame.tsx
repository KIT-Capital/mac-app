"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { PhoneShell } from "@/components/phone-shell";
import { useStore } from "@/lib/store";

const PUBLIC = ["/", "/login", "/signup"];

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrated } = useStore();
  const isPublic = PUBLIC.includes(pathname);
  const showNav = !isPublic;

  useEffect(() => {
    if (!hydrated) return;
    if (!user && !isPublic) router.replace("/login");
    if (user && pathname === "/") router.replace("/collection");
  }, [hydrated, user, isPublic, pathname, router]);

  return (
    <PhoneShell>
      <div className="flex min-h-dvh flex-1 flex-col md:min-h-[880px]">
        {!hydrated ? (
          <div className="flex flex-1 items-center justify-center text-[12px] tracking-[0.2em] text-white/40 uppercase">
            Loading collection
          </div>
        ) : (
          children
        )}
        {hydrated && user && showNav ? <BottomNav /> : null}
      </div>
    </PhoneShell>
  );
}
