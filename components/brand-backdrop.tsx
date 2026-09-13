import { cn } from "@/lib/utils";

/** Movement crop only — hides the website copy baked into splash.jpg. */
export function BrandBackdrop({ className }: { className?: string }) {
  return (
    <img
      src="/brand/splash.jpg"
      alt=""
      className={cn("absolute inset-0 h-full w-full object-cover object-[86%_72%]", className)}
    />
  );
}
