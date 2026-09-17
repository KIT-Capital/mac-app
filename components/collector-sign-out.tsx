"use client";

import { useRouter } from "next/navigation";
import { endClientSession } from "@/lib/session-client";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function CollectorSignOut({ className }: { className?: string }) {
  const router = useRouter();
  const { signOut } = useStore();

  return (
    <button
      type="button"
      onClick={() => {
        void endClientSession(signOut);
        router.replace("/login");
      }}
      className={cn(
        "mac-tap hidden items-center text-[11px] tracking-[0.16em] text-white/80 uppercase hover:text-white md:inline-flex",
        className,
      )}
    >
      Log out
    </button>
  );
}
