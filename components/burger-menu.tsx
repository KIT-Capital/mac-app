"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { LayoutDashboard, Menu, X } from "lucide-react";
import { CollectorNav } from "@/components/collector-nav";
import { MacLogoMark } from "@/components/mac-logo";
import { isDesk } from "@/lib/catalog";
import { endClientSession } from "@/lib/session-client";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function BurgerButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Open menu"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={cn("mac-tap flex items-center justify-center text-white", className)}
      >
        <Menu className="h-5 w-5" strokeWidth={1.8} />
      </button>
      {open ? <BurgerDrawer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function BurgerDrawer({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { user, signOut } = useStore();
  const desk = isDesk(user);
  const host = useSyncExternalStore(
    () => () => {},
    () => document.querySelector(".mac-app-screen"),
    () => null,
  );

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!host) return null;

  return createPortal(
    <div className="absolute inset-0 z-50 flex">
      <button type="button" aria-label="Close menu" className="absolute inset-0 bg-black/55" onClick={onClose} />
      <nav className="relative z-10 flex h-full w-[78%] max-w-[300px] flex-col bg-mac-navy text-white shadow-2xl">
        <div className="flex items-center justify-between px-4 pt-10 pb-4">
          <div className="min-w-0">
            <MacLogoMark onDark className="w-14" />
            <p className="mt-2 text-[13px] font-medium text-white/80">{user?.name || "Collector"}</p>
          </div>
          <button type="button" aria-label="Close menu" onClick={onClose} className="mac-tap flex items-center justify-center">
            <X className="h-5 w-5" strokeWidth={1.8} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          <CollectorNav variant="drawer" onNavigate={onClose} />
          {desk ? (
            <Link
              href="/admin"
              onClick={onClose}
              className="mac-tap mt-4 flex items-center gap-3 rounded-sm px-3 text-[13px] text-white/50"
            >
              <LayoutDashboard className="h-4 w-4" strokeWidth={1.6} />
              Desk
            </Link>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            onClose();
            void endClientSession(signOut);
            router.replace("/login");
          }}
          className="border-t border-white/10 px-5 py-4 text-left text-[11px] tracking-[0.16em] text-white/55 uppercase"
        >
          Log out
        </button>
      </nav>
    </div>,
    host,
  );
}
