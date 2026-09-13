"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { BottomNav } from "@/components/bottom-nav";
import { PhoneShell } from "@/components/phone-shell";
import { SideNav } from "@/components/side-nav";
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
    <PhoneShell wide={isAdmin || Boolean(user)}>
      <div className="flex min-h-dvh flex-1 md:min-h-[calc(100dvh-4rem)]">
        {showCollectorNav ? <SideNav /> : null}
        <div className="flex min-w-0 flex-1 flex-col bg-black">
          {!hydrated ? (
            <div className="flex flex-1 items-center justify-center text-[12px] tracking-[0.2em] text-white/40 uppercase">
              Loading collection
            </div>
          ) : (
            children
          )}
          {showCollectorNav ? <BottomNav /> : null}
        </div>
      </div>
    </PhoneShell>
  );
}
