import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  backHref,
  right,
  className,
}: {
  title: string;
  backHref?: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative isolate flex h-[56px] shrink-0 items-center justify-between px-3 pt-[env(safe-area-inset-top)]",
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/splash.jpg"
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-30"
      />
      <div className="absolute inset-0 bg-[#0E2A44]/88" />
      <div className="relative z-10 flex w-12 justify-start">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="mac-tap flex items-center justify-center text-white"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={1.75} />
          </Link>
        ) : (
          <span className="w-11" />
        )}
      </div>
      <h1 className="relative z-10 flex-1 text-center text-[13px] font-medium tracking-[0.22em] text-white uppercase">
        {title}
      </h1>
      <div className="relative z-10 flex w-12 justify-end text-white">{right}</div>
    </header>
  );
}
