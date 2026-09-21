import { DEFAULT_REQUIRED_PHOTO_KINDS } from "./timepiece-shots.mjs";
import type { PhotoKind } from "./types";

export const MAC = {
  navy: "#0E2A44",
  gold: "#FCB040",
  champagne: "#E8D5C0",
  black: "#000000",
  ink: "#111111",
  field: "#0A0A0A",
  parchment: "#F3EEE6",
} as const;

export type BrandPresetId = "mac" | "mbf";

export const BRAND_PRESETS = {
  mac: {
    id: "mac" as const,
    companyName: "Mechanical Art Capital",
    palette: {
      primary: MAC.navy,
      accent: MAC.gold,
      soft: MAC.champagne,
    },
    wordmark: "/brand/logo-ff.svg",
    wordmarkOnDark: "/brand/logo-ff-on-dark.svg",
    mark: "/brand/logo-ff-mark.png",
    markOnDark: "/brand/logo-ff-mark-on-dark.png",
    splash:
      "Appraise your timepiece with MAC, the horology experts who appreciate mechanical art as much as you do. MAC buys qualifying pieces; you may buy them back on a preset scale.",
  },
  mbf: {
    id: "mbf" as const,
    companyName: "MB&F",
    paletteNote: "sampled — confirm with MB&F",
    palette: {
      primary: "#4E7A96",
      accent: "#C5CDD4",
      soft: "#D8DDE2",
    },
    wordmark: "/brand/mbf-wordmark.svg",
    wordmarkOnDark: "/brand/mbf-wordmark.svg",
    mark: "/brand/mbf-mark.svg",
    markOnDark: "/brand/mbf-mark.svg",
    splash:
      "Appraise your timepiece with MB&F. Qualifying pieces may be sold and bought back on a preset scale.",
  },
} as const;

export function resolveBrandPreset(id: unknown) {
  if (id === "mac" || id === "mbf") return BRAND_PRESETS[id];
  return undefined;
}

export function brandFromSettings(settings: { brandPreset?: string } | null | undefined) {
  return resolveBrandPreset(settings?.brandPreset) ?? BRAND_PRESETS.mac;
}

export function brandBootstrapScript(presetId: string = "mac") {
  const preset = brandFromSettings({ brandPreset: presetId });
  return `(function(){var r=document.documentElement;r.setAttribute("data-brand",${JSON.stringify(preset.id)});r.style.setProperty("--brand-primary",${JSON.stringify(preset.palette.primary)});r.style.setProperty("--brand-accent",${JSON.stringify(preset.palette.accent)});r.style.setProperty("--brand-soft",${JSON.stringify(preset.palette.soft)});})();`;
}

/** Settings the desk persists server-side. The browser store and the Desk
 * config page share this list so a new field cannot reach one and not the other. */
export const SERVER_SETTING_KEYS = [
  "maxLtv",
  "startingRate",
  "setupFee",
  "earlyRepurchaseAmount",
  "brokerFee",
  "minMonths",
  "earlyStartMonth",
  "earlyUntilMonth",
  "typicalTerm",
  "membershipMonthly",
  "vaultLocation",
  "requiredPhotoKinds",
  "brandPreset",
] as const;

/** Floor the server and both books use when desk settings have no row (R28). */
export const DEFAULT_MIN_SALE_AMOUNT = 1_000;

export const DEFAULT_SETTINGS = {
  companyName: "Mechanical Art Capital",
  phone: "+1 (833) 209-0972",
  email: "info@mechartcap.com",
  financingEmail: "financing@mechartcap.com",
  handle: "@mechartcap",
  startingRate: 0.185,
  minAdvance: DEFAULT_MIN_SALE_AMOUNT,
  maxLtv: 0.6,
  setupFee: 0.01,
  earlyRepurchaseAmount: 0.035,
  brokerFee: 0.035,
  minMonths: 3,
  earlyStartMonth: 4,
  earlyUntilMonth: 8,
  typicalTerm: 12,
  membershipMonthly: 4.99,
  minPieceValue: 40_000,
  closeBusinessDays: 2,
  vaultLocation: "Manhattan vault",
  requiredPhotoKinds: [...DEFAULT_REQUIRED_PHOTO_KINDS] as PhotoKind[],
  brandPreset: "mac" as const,
  ageMinimum: 18,
  allowVideo: true,
  appearance: "dark" as const,
};
