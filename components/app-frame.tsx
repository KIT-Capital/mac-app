"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { CollectorShell } from "@/components/collector-shell";
import { DeskShell } from "@/components/desk-shell";
import { UnavailablePage } from "@/components/unavailable-page";
import { isDesk } from "@/lib/catalog";
import { useStore } from "@/lib/store";

const PUBLIC = ["/", "/login", "/signup", "/privacy", "/verify", "/admin/password"];
const ONBOARDING = ["/collection/setup", "/collection/add", "/collection/continue"];

export function AppFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, hydrated, bookMode } = useStore();
  const unavailable = bookMode === "unavailable";
  const isPublic = PUBLIC.includes(pathname);
  const isAdmin = pathname.startsWith("/admin");
  const desk = isDesk(user);
  useEffect(() => {
    if (!hydrated || unavailable) return;
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
  }, [desk, hydrated, isAdmin, isPublic, pathname, router, unavailable, user]);

  // The server said a live prerequisite is missing: one page for every route,
  // no route children mount, so no page-level fetch fires.
  if (unavailable) {
    return <UnavailablePage />;
  }

  const body = (
    <div className="flex min-h-0 flex-1 flex-col">
      {!hydrated ? (
        <div className="flex flex-1 items-center justify-center text-[12px] tracking-[0.2em] text-mac-faint uppercase">
          Loading collection
        </div>
      ) : (
        children
      )}
    </div>
  );

  if (isAdmin && pathname !== "/admin/password") {
    return <DeskShell>{body}</DeskShell>;
  }

  return <CollectorShell>{body}</CollectorShell>;
}
