import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Official Logo-FF only: black gear, three gold pinions, colored jewels,
 * MECHANICAL ART CAPITAL. Never invert this into a ghost outline, and never
 * substitute an MB&F lockup.
 */
const WORDMARK = "/brand/mac-logo-jeweled.png";
const MARK = "/brand/mac-logo-jeweled-mark.png";

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
        width={600}
        height={367}
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
      width={600}
      height={367}
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
