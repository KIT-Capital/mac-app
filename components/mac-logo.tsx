"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { brandFromSettings } from "@/lib/theme";

const LOCKUP_WIDTH = {
  hero: "w-[min(304px,78%)]",
  default: "w-[260px]",
  compact: "w-[168px]",
} as const;

function useBrand() {
  const { settings } = useStore();
  return brandFromSettings(settings);
}

export function MacWordmark({
  className,
  onDark = false,
}: {
  className?: string;
  onDark?: boolean;
}) {
  const brand = useBrand();
  return (
    <Image
      src={onDark ? brand.wordmarkOnDark : brand.wordmark}
      alt={brand.companyName}
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
  const brand = useBrand();
  return (
    <Image
      src={onDark ? brand.markOnDark : brand.mark}
      alt={brand.companyName}
      width={722}
      height={697}
      unoptimized
      className={cn("h-auto w-full object-contain", className)}
    />
  );
}

export function MacDarkLogo({ className }: { className?: string }) {
  return <MacWordmark onDark className={className} />;
}

export function MacMark({ className }: { className?: string }) {
  return <MacLogoMark className={className} />;
}

/** Full official lockup — splash and sign-in. Chrome uses MacLogoMark. */
export function MacLockup({
  onDark = false,
  className,
  size = "default",
}: {
  onDark?: boolean;
  className?: string;
  size?: keyof typeof LOCKUP_WIDTH;
}) {
  return (
    <div className={cn("flex w-full justify-center", className)}>
      <MacWordmark onDark={onDark} className={LOCKUP_WIDTH[size]} />
    </div>
  );
}
