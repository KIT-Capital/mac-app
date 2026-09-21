import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { BurgerButton } from "@/components/burger-menu";
import { CollectorNav } from "@/components/collector-nav";
import { CollectorSignOut } from "@/components/collector-sign-out";
import { MacLogoMark } from "@/components/mac-logo";
import { cn } from "@/lib/utils";

export function ScreenHeader({
  title,
  backHref,
  right,
  menu = true,
  className,
}: {
  title: string;
  backHref?: string;
  right?: ReactNode;
  menu?: boolean;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative flex h-[54px] shrink-0 items-center justify-between border-b border-white/10 bg-mac-navy px-3 shadow-sm md:h-16 md:px-5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex w-12 justify-start md:hidden">
          {backHref ? (
            <Link
              href={backHref}
              aria-label="Back"
              className="mac-tap -ml-1 flex items-center justify-center text-white/80 transition hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" strokeWidth={2} />
            </Link>
          ) : menu ? (
            <BurgerButton className="-ml-1" />
          ) : (
            <span className="w-8" />
          )}
        </div>
        <Link href="/collection" className="hidden shrink-0 md:block" aria-label="Mechanical Art Capital">
          <MacLogoMark onDark className="h-9 w-9" />
        </Link>
        {menu ? <CollectorNav /> : null}
      </div>

      <h1 className="pointer-events-none absolute inset-x-16 text-center text-[12px] font-semibold tracking-[0.22em] text-white uppercase md:sr-only">
        {title}
      </h1>

      <div className="flex shrink-0 items-center justify-end gap-2 text-white/90">
        {backHref ? (
          <Link
            href={backHref}
            aria-label="Back"
            className="mac-tap hidden items-center justify-center text-white/80 md:flex"
          >
            <ArrowLeft className="h-5 w-5" strokeWidth={2} />
          </Link>
        ) : null}
        {right}
        {menu ? <CollectorSignOut /> : null}
        {menu ? (
          <span className="md:hidden">
            {backHref ? <BurgerButton /> : null}
          </span>
        ) : null}
      </div>
    </header>
  );
}
