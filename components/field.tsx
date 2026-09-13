import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block space-y-1 border-b border-white/12 pb-3", className)}>
      <span className="text-[11px] tracking-[0.04em] text-white/40">{label}</span>
      {children}
    </label>
  );
}

export function NativeSelect({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "w-full appearance-none bg-transparent py-1 text-[16px] text-white outline-none",
        className,
      )}
      {...props}
    />
  );
}

export function PillButton({
  children,
  variant = "navy",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "champagne" | "white" | "navy" | "ghost" | "gold";
}) {
  const styles = {
    champagne: "bg-[#E8D5C0] text-black",
    white: "bg-white text-black",
    navy: "bg-[#0E2A44] text-white",
    ghost: "bg-transparent text-white ring-1 ring-white/25",
    gold: "bg-[#FCB040] text-black",
  }[variant];

  return (
    <button
      className={cn(
        "mac-tap h-12 w-full rounded-none text-[12px] font-semibold tracking-[0.2em] uppercase disabled:opacity-40",
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
