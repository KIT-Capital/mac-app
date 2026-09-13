import Image from "next/image";
import { cn } from "@/lib/utils";

export function MacWordmark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mac-wordmark-on-dark.svg"
      alt="Mechanical Art Capital"
      width={280}
      height={72}
      className={cn("h-auto w-full", className)}
      priority
      unoptimized
    />
  );
}

export function MacLogoMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mac-logo-light.jpg"
      alt="Mechanical Art Capital"
      width={180}
      height={180}
      className={cn("h-auto w-full object-contain", className)}
      priority
    />
  );
}

export function MacDarkLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/mac-logo-dark.png"
      alt="Mechanical Art Capital"
      width={200}
      height={200}
      className={cn("h-auto w-full object-contain", className)}
      priority
    />
  );
}

/** @deprecated Use MacLogoMark — kept so older screens keep compiling. */
export function MacMark({ className }: { className?: string }) {
  return <MacLogoMark className={className} />;
}
