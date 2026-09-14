import type { Timepiece } from "@/lib/types";

export const ILLUSTRATIONS = {
  tonneau: "/watches/illustrations/tonneau-skeleton.jpg",
  octagonal: "/watches/illustrations/octagonal-steel.jpg",
  round: "/watches/illustrations/round-steel.jpg",
  dress: "/watches/illustrations/white-gold-dress.jpg",
  titanium: "/watches/illustrations/titanium-sport.jpg",
  wrist: "/watches/illustrations/wrist.jpg",
} as const;

type WatchHint = Partial<
  Pick<Timepiece, "brand" | "model" | "reference" | "caseType" | "caseMetal" | "dialColor" | "band">
>;

export function illustrationFor(watch?: WatchHint | null): string {
  const hay = `${watch?.brand ?? ""} ${watch?.model ?? ""} ${watch?.reference ?? ""}`.toLowerCase();
  const metal = (watch?.caseMetal ?? "").toLowerCase();
  const form = (watch?.caseType ?? "").toLowerCase();

  if (/richard mille|\brm\s?0|tonneau/.test(hay) || form === "tonneau") return ILLUSTRATIONS.tonneau;
  if (/royal oak|offshore|octagon/.test(hay)) return ILLUSTRATIONS.octagonal;
  if (/nautilus|aquanaut|rolex|submariner|daytona/.test(hay)) return ILLUSTRATIONS.round;
  if (/gauthier|logical|calatrava|dufour|journe|lange|voutilainen|ferrier/.test(hay)) {
    return ILLUSTRATIONS.dress;
  }
  if (/pilot|5524|travel time/.test(hay)) return "/watches/patek-5524g.jpg";
  if (metal.includes("titanium") || metal.includes("carbon") || metal.includes("ceramic")) {
    return ILLUSTRATIONS.titanium;
  }
  if (form === "rectangular" || form === "cushion") return ILLUSTRATIONS.tonneau;
  if (watch?.band === "bracelet") return ILLUSTRATIONS.round;
  return ILLUSTRATIONS.round;
}

export function watchSrc(watch?: WatchHint & { images?: string[] } | null, index = 0): string {
  const src = watch?.images?.[index];
  if (src) return src;
  return illustrationFor(watch);
}
