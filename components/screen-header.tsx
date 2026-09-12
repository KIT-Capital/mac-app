import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";

export function ScreenHeader({
  title,
  backHref,
  right,
}: {
  title: string;
  backHref?: string;
  right?: ReactNode;
}) {
  return (
    <header className="relative flex h-14 shrink-0 items-center justify-between bg-[#0E2A44] px-4">
      <div className="w-10">
        {backHref ? (
          <Link href={backHref} aria-label="Back" className="flex h-9 w-9 items-center justify-center">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        ) : null}
      </div>
      <h1 className="absolute inset-x-16 text-center text-[13px] font-medium tracking-[0.22em] uppercase">
        {title}
      </h1>
      <div className="flex w-10 justify-end">{right}</div>
    </header>
  );
}
