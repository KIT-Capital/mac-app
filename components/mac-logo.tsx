import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Official Logo-FF (Final Logo 2 Gold): black gear, gray arc, three gold
 * pinions with colored jewels, MECHANICAL ART CAPITAL. Never invert this
 * mark, and never substitute an MB&F lockup.
 */
const WORDMARK = "/brand/logo-ff.png";
const MARK = "/brand/logo-ff-mark.png";

export function MacWordmark({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        onDark && "rounded-2xl bg-white px-4 py-3 shadow-sm",
        className,
      )}
    >
      <Image
        src={WORDMARK}
        alt="Mechanical Art Capital"
        width={1200}
        height={720}
        className="h-auto w-full object-contain"
        priority
      />
    </div>
  );
}

export function MacLogoMark({ className }: { className?: string }) {
  return (
    <Image
      src={MARK}
      alt="Mechanical Art Capital"
      width={640}
      height={400}
      className={cn("h-auto w-full object-contain", className)}
      priority
    />
  );
}

export function MacDarkLogo({ className }: { className?: string }) {
  return <MacWordmark onDark className={className} />;
}

export function MacMark({ className }: { className?: string }) {
  return <MacLogoMark className={className} />;
}

/** Full official lockup — splash and sign-in. */
export function MacLockup({ onDark = false, className }: { onDark?: boolean; className?: string }) {
  return (
    <div className={cn("flex w-full justify-center", className)}>
      <MacWordmark onDark={onDark} className="w-[214px]" />
    </div>
  );
}
