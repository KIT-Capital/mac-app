import { deskRoleForEmail } from "@/lib/auth";
import { DEFAULT_SETTINGS } from "@/lib/theme";

export const TIER_ONE_BRANDS = [
  "A. Lange & Söhne",
  "Audemars Piguet",
  "Christophe Claret",
  "David Candaux",
  "De Bethune",
  "F.P. Journe",
  "Greubel Forsey",
  "Grönefeld",
  "Kari Voutilainen",
  "Laurent Ferrier",
  "Maîtres du Temps",
  "MB&F",
  "Patek Philippe",
  "Philippe Dufour",
  "Richard Mille",
  "Roger Dubuis",
  "Rolex",
  "Romain Gauthier",
  "Urwerk",
  "Vacheron Constantin",
] as const;

export const CONDITIONS = [
  "Unworn",
  "Like new",
  "Excellent",
  "Very good",
  "Good",
  "Fair",
];

export const BOX_PAPERS = [
  "Box and papers",
  "Papers only",
  "Box only",
  "Watch only",
];

export const CASE_METALS = [
  "Steel",
  "Rose gold",
  "Yellow gold",
  "White gold",
  "Platinum",
  "Titanium",
  "Ceramic",
  "Carbon",
];

export const CASE_TYPES = ["Round", "Tonneau", "Cushion", "Rectangular", "Other"];
export const CASE_DIAMETERS = ["38mm", "39mm", "40mm", "41mm", "42mm", "43mm", "44mm", "45mm+"];
export const DIAL_COLORS = ["Blue", "Black", "Silver", "White", "Grey", "Green", "Skeleton", "Other"];
export const BUCKLES = ["Folding clasp", "Deployant", "Pin buckle", "Other"];
export const STRAP_MATERIALS = ["Leather", "Rubber", "Alligator", "Textile", "Steel"];
export const COMPLICATIONS = [
  "Time only",
  "Date",
  "Chronograph",
  "Moonphase",
  "Tourbillon",
  "GMT / Dual time",
  "Perpetual calendar",
  "I don't know",
];
export const TERMS = [3, 6, 8, 9, 12];
export const DELIVERY_METHODS = [
  "Insured courier",
  "Desk arranges intake",
  "Private appointment",
];

export const MODELS_BY_BRAND: Record<string, string[]> = {
  "Audemars Piguet": ["Royal Oak Selfwinding", "Royal Oak Offshore", "Royal Oak Perpetual Calendar"],
  "Patek Philippe": ["Nautilus", "Calatrava Pilot Travel Time", "Aquanaut", "Grand Complications"],
  "Richard Mille": ["RM 011", "RM 027", "RM 035"],
  "Romain Gauthier": ["Logical One", "Insight Micro-Rotor"],
  "MB&F": ["HMX", "Legacy Machine", "Horological Machine"],
  Rolex: ["Daytona", "GMT-Master II", "Day-Date"],
  "Vacheron Constantin": ["Overseas", "Patrimony", "Traditionnelle"],
};

export const COMPANY = {
  name: DEFAULT_SETTINGS.companyName,
  short: "MAC",
  phone: DEFAULT_SETTINGS.phone,
  email: DEFAULT_SETTINGS.email,
  financingEmail: DEFAULT_SETTINGS.financingEmail,
  handle: DEFAULT_SETTINGS.handle,
  rate: DEFAULT_SETTINGS.startingRate,
  minAdvance: DEFAULT_SETTINGS.minAdvance,
  ltv: DEFAULT_SETTINGS.maxLtv,
  membershipMonthly: DEFAULT_SETTINGS.membershipMonthly,
};

export function money(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function moneyRange(low?: number, high?: number) {
  if (!low && !high) return "Not evaluated";
  if (low && high) return `${money(low)} – ${money(high)}`;
  return money(low || high || 0);
}

export function estimateAdvance(valueLow?: number, valueHigh?: number, ltv = COMPANY.ltv) {
  const base = valueLow ?? (valueHigh ? valueHigh * 0.75 : 0);
  return Math.round((base * ltv) / 500) * 500;
}

/** Dollar buyback on the desk scale. Never display the scale as a rate or interest. */
export function buybackPrice(saleAmount: number, termMonths: number, annualScale = COMPANY.rate) {
  return Math.round((saleAmount * (1 + annualScale * (termMonths / 12))) / 100) * 100;
}

export function hasApplication(
  user: { applicationSubmitted?: boolean; role?: string } | null,
  agreementCount = 0,
) {
  if (user?.role === "admin" || user?.role === "staff") return true;
  return Boolean(user?.applicationSubmitted) || agreementCount > 0;
}

export function roleFromEmail(email: string) {
  return deskRoleForEmail(email) ?? "collector";
}

export function isDesk(user: { role?: string } | null) {
  return user?.role === "admin" || user?.role === "staff";
}
