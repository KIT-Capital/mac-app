import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Official Logo-FF (Final Logo 2 Gold) as the Illustrator vector.
 * Light: black gear, gray arc, gold jeweled pinions, MECHANICAL ART CAPITAL.
 * Dark: black ink is solid white — no plate, no outline invert.
 */
const WORDMARK = "/brand/logo-ff.svg";
const WORDMARK_ON_DARK = "/brand/logo-ff-on-dark.svg";
const MARK = "/brand/logo-ff-mark.png";
const MARK_ON_DARK = "/brand/logo-ff-mark-on-dark.png";

const MARK_WIDTH = {
  hero: "w-[min(168px,46%)]",
  default: "w-[132px]",
  compact: "w-[72px]",
} as const;

export function MacWordmark({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <Image
      src={onDark ? WORDMARK_ON_DARK : WORDMARK}
      alt="Mechanical Art Capital"
      width={1200}
      height={730}
      unoptimized
      priority
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}

export function MacLogoMark({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <Image
      src={onDark ? MARK_ON_DARK : MARK}
      alt="Mechanical Art Capital"
      width={722}
      height={697}
      unoptimized
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}

export function MacDarkLogo({ className }: { className?: string }) {
  return <MacLogoMark onDark className={className} />;
}

export function MacMark({ className }: { className?: string }) {
  return <MacLogoMark className={className} />;
}

/** Official gear only — no MECHANICAL ART CAPITAL wordmark. */
export function MacLockup({
  onDark = false,
  className,
  size = "default",
}: {
  onDark?: boolean;
  className?: string;
  size?: keyof typeof MARK_WIDTH;
}) {
  return (
    <div className={cn("flex w-full justify-center", className)}>
      <MacLogoMark onDark={onDark} className={MARK_WIDTH[size]} />
    </div>
  );
}
