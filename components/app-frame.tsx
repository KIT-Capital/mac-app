"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { PhoneShell } from "@/components/phone-shell";
import { isDesk } from "@/lib/catalog";
import { useStore } from "@/lib/store";

const PUBLIC = ["/", "/login", "/signup", "/privacy"];
const ONBOARDING = ["/collection/setup", "/collection/add", "/collection/continue"];

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrated } = useStore();
  const isPublic = PUBLIC.includes(pathname);
  const isAdmin = pathname.startsWith("/admin");
  const desk = isDesk(user);
  const showCollectorNav = Boolean(hydrated && user && !isPublic && !isAdmin && user.onboardingComplete);

  useEffect(() => {
    if (!hydrated) return;
    if (!user && !isPublic) {
      router.replace("/login");
      return;
    }
    if (user && pathname === "/") {
      router.replace(desk ? "/admin" : "/collection");
      return;
    }
    if (user && isAdmin && !desk) {
      router.replace("/collection");
      return;
    }
    if (
      user &&
      !desk &&
      !user.onboardingComplete &&
      !ONBOARDING.some((p) => pathname.startsWith(p)) &&
      !isPublic
    ) {
      router.replace("/collection/setup");
    }
  }, [desk, hydrated, isAdmin, isPublic, pathname, router, user]);

  return (
    <PhoneShell>
      <div className="flex min-h-[min(100dvh-2rem,844px)] flex-1 flex-col md:min-h-[844px]">
        {!hydrated ? (
          <div className="flex flex-1 items-center justify-center text-[12px] tracking-[0.2em] text-white/70 uppercase">
            Loading collection
          </div>
        ) : (
          children
        )}
        {showCollectorNav ? <BottomNav /> : null}
      </div>
    </PhoneShell>
  );
}
