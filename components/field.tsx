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
    <label
      className={cn(
        "block rounded-xl border border-mac-line bg-mac-card p-3 transition focus-within:border-mac-gold focus-within:ring-1 focus-within:ring-mac-gold/50",
        className,
      )}
    >
      <span className="block text-[10px] font-semibold tracking-[0.14em] text-mac-champagne uppercase">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function LineField({
  label,
  children,
  onClear,
  className,
}: {
  label: string;
  children: ReactNode;
  onClear?: () => void;
  className?: string;
}) {
  return (
    <label className={cn("block border-b border-mac-line py-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-mac-faint">{label}</span>
        {onClear ? (
          <button
            type="button"
            onClick={onClear}
            className="text-[16px] leading-none text-mac-faint"
            aria-label={`Clear ${label}`}
          >
            ×
          </button>
        ) : null}
      </div>
      <div className="mt-1">{children}</div>
    </label>
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
          "w-full appearance-none bg-transparent pr-7 text-[15px] font-medium text-mac-fg outline-none cursor-pointer",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-0 h-4 w-4 text-mac-faint" />
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
    champagne: "bg-mac-champagne text-[#0A0D14] hover:bg-[#faebd7]",
    white: "bg-white text-[#0A0D14] hover:bg-white/90",
    navy: "bg-mac-navy text-white border border-mac-gold/50 hover:bg-[#133758]",
    ghost: "bg-transparent text-mac-fg border border-mac-line hover:bg-mac-card",
    gold: "bg-mac-gold text-[#0A0D14] hover:bg-[#ffbe59]",
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
