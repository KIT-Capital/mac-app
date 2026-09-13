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
      src="/brand/mac-logo.png"
      alt="Mechanical Art Capital"
      width={180}
      height={180}
      className={cn("h-auto w-full rounded-2xl bg-white object-contain p-2", className)}
      priority
    />
  );
}

/** @deprecated Use MacLogoMark — kept so older screens keep compiling. */
export function MacMark({ className }: { className?: string }) {
  return <MacLogoMark className={className} />;
}
