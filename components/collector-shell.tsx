"use client";

import { useCallback, useSyncExternalStore, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const AUTH = ["/", "/login", "/signup", "/privacy", "/verify"];
const VIEW_KEY = "mac-device-view";
const VIEW_EVENT = "mac-device-view";

function subscribeDeviceView(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  const requested = new URLSearchParams(window.location.search).get("view");
  if (requested === "phone") sessionStorage.setItem(VIEW_KEY, "phone");
  if (requested === "desktop") sessionStorage.removeItem(VIEW_KEY);
  window.addEventListener(VIEW_EVENT, onStoreChange);
  window.addEventListener("popstate", onStoreChange);
  return () => {
    window.removeEventListener(VIEW_EVENT, onStoreChange);
    window.removeEventListener("popstate", onStoreChange);
  };
}

function readPhonePreview() {
  if (typeof window === "undefined") return false;
  const requested = new URLSearchParams(window.location.search).get("view");
  if (requested === "desktop") return false;
  if (requested === "phone") return true;
  return sessionStorage.getItem(VIEW_KEY) === "phone";
}

export function CollectorShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { settings, user } = useStore();
  const appearance = user?.preferences.appearance ?? settings.appearance;
  const auth = AUTH.includes(pathname);
  const phonePreview = useSyncExternalStore(subscribeDeviceView, readPhonePreview, () => false);

  const exitPhonePreview = useCallback(() => {
    sessionStorage.removeItem(VIEW_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("view");
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    window.dispatchEvent(new Event(VIEW_EVENT));
  }, []);

  const screen = (
    <div
      className={cn(
        "mx-auto flex min-h-dvh w-full flex-1 flex-col",
        phonePreview ? "min-h-0" : auth ? "max-w-[430px] md:max-w-[460px]" : "max-w-6xl",
      )}
    >
      {children}
    </div>
  );

  return (
    <div
      data-appearance={appearance}
      className="mac-app-screen mac-phone-screen relative flex min-h-dvh w-full flex-col bg-mac-bg text-mac-fg"
    >
      {phonePreview ? (
        <div className="flex min-h-dvh flex-col items-center justify-center bg-[#0b0f16] px-4 py-5">
          <p className="mb-3 text-[10px] tracking-[0.16em] text-white/40 uppercase">
            Phone preview ·{" "}
            <button type="button" className="text-mac-gold uppercase" onClick={exitPhonePreview}>
              Show full screen
            </button>
          </p>
          <div
            data-device="phone"
            className="flex h-[min(844px,calc(100dvh-72px))] w-[min(390px,100%)] flex-col overflow-hidden rounded-[28px] bg-black shadow-[0_30px_80px_rgb(0_0_0/0.65)] ring-1 ring-white/15"
          >
            {screen}
          </div>
        </div>
      ) : (
        screen
      )}
    </div>
  );
}
