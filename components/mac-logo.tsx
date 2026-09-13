import Image from "next/image";
import { cn } from "@/lib/utils";

/** Official Logo-FF wordmark with the three jeweled center gears, for dark screens. */
export function MacWordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mac-logo-jeweled-on-dark.png"
      alt="Mechanical Art Capital"
      width={600}
      height={367}
      className={cn("h-auto w-full", className)}
      priority
    />
  );
}

/** Official Logo-FF on light grounds — black gear, gold pinions, colored jewels. */
export function MacLogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mac-logo-jeweled.png"
      alt="Mechanical Art Capital"
      width={600}
      height={367}
      className={cn("h-auto w-full object-contain", className)}
      priority
    />
  );
}

export function MacDarkLogo({ className }: { className?: string }) {
  return <MacWordmark className={className} />;
}

/** @deprecated Use MacLogoMark — kept so older screens keep compiling. */
export function MacMark({ className }: { className?: string }) {
  return <MacLogoMark className={className} />;
}
