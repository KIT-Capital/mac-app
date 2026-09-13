import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Official Logo-FF (Final Logo 2 Gold).
 * Light: black gear, gray arc, gold jeweled pinions, MECHANICAL ART CAPITAL.
 * Dark: the same lockup with black ink flipped to white — no plate, no outline invert.
 */
const WORDMARK = "/brand/logo-ff.png";
const WORDMARK_ON_DARK = "/brand/logo-ff-on-dark.png";
const MARK = "/brand/logo-ff-mark.png";
const MARK_ON_DARK = "/brand/logo-ff-mark-on-dark.png";

export function MacWordmark({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  return (
    <div className={cn("mx-auto w-full", className)}>
      <Image
        src={onDark ? WORDMARK_ON_DARK : WORDMARK}
        alt="Mechanical Art Capital"
        width={1200}
        height={730}
        className="h-auto w-full object-contain"
        priority
      />
    </div>
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
      width={640}
      height={615}
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
      <MacWordmark onDark={onDark} className="w-[236px]" />
    </div>
  );
}
