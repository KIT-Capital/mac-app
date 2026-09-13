import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { BurgerButton } from "@/components/burger-menu";
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
        "relative flex h-[54px] shrink-0 items-center justify-between border-b border-white/10 bg-[#0E2A44] px-3 shadow-sm",
        className,
      )}
    >
      <div className="flex w-12 justify-start">
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
      <h1 className="flex-1 text-center text-[12px] font-semibold tracking-[0.22em] text-white uppercase">
        {title}
      </h1>
      <div className="flex w-12 justify-end text-white/90">
        {right ?? (backHref && menu ? <BurgerButton /> : null)}
      </div>
    </header>
  );
}
