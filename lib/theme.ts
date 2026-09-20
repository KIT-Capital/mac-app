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
  ageMinimum: 18,
  allowVideo: true,
  appearance: "dark" as const,
};
