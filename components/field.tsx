import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
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
    <div
      className={cn(
        "rounded-xl border border-white/20 bg-[#161B24] p-3 transition focus-within:border-[#FCB040] focus-within:ring-1 focus-within:ring-[#FCB040]/50",
        className,
      )}
    >
      <span className="block text-[10px] font-semibold tracking-[0.14em] text-[#E8D5C0] uppercase">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export function NativeSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative flex items-center">
      <select
        className={cn(
          "w-full appearance-none bg-transparent pr-7 text-[15px] font-medium text-white outline-none cursor-pointer",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-[#FCB040]" />
    </div>
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
    champagne: "bg-[#E8D5C0] text-[#0A0D14] hover:bg-[#faebd7]",
    white: "bg-white text-[#0A0D14] hover:bg-white/90",
    navy: "bg-[#0E2A44] text-white border border-[#FCB040]/50 hover:bg-[#133758]",
    ghost: "bg-transparent text-white border border-white/25 hover:bg-white/5",
    gold: "bg-[#FCB040] text-[#0A0D14] hover:bg-[#ffbe59]",
  }[variant];

  return (
    <button
      className={cn(
        "mac-tap flex h-12 w-full items-center justify-center rounded-xl text-[12px] font-bold tracking-[0.18em] uppercase shadow-sm transition active:scale-[0.99] disabled:opacity-40",
        styles,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
