import { deskRoleForEmail } from "@/lib/auth";
import { isDeskRole } from "@/lib/roles.mjs";
import { APPLICATION_TERMS } from "@/lib/contract/repo-scale.mjs";
import { DEFAULT_SETTINGS } from "@/lib/theme";

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
export const TERMS = APPLICATION_TERMS;
export const DELIVERY_METHODS = [
  "Insured courier",
  "Desk arranges intake",
  "Private appointment",
];

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

export function maxPurchaseAmount(valueLow?: number, valueHigh?: number, share = COMPANY.ltv) {
  const base = valueLow ?? (valueHigh ? valueHigh * 0.75 : 0);
  return Math.round((base * share) / 500) * 500;
}

/** Dollar buyback on the desk scale. Never display the scale as a rate or interest. */
export function buybackPrice(saleAmount: number, termMonths: number, annualScale = COMPANY.rate) {
  return Math.round((saleAmount * (1 + annualScale * (termMonths / 12))) / 100) * 100;
}

export function hasApplication(
  user: { applicationSubmitted?: boolean; role?: string; email?: string } | null,
  agreements: { email?: string }[] | number = [],
) {
  if (!user) return false;
  if (isDeskRole(user.role)) return true;
  if (user.applicationSubmitted) return true;
  if (typeof agreements === "number") return agreements > 0;
  const key = user.email?.trim().toLowerCase();
  return agreements.some((item) => (item.email || "").trim().toLowerCase() === key);
}

export function roleFromEmail(email: string) {
  return deskRoleForEmail(email) ?? "collector";
}

export function isDesk(user: { role?: string } | null) {
  return isDeskRole(user?.role);
}

export function catalogMatch(
  watch: { brand: string; model: string; reference?: string },
  catalog: {
    brand: string;
    model: string;
    reference: string;
    typicalLow: number;
    typicalHigh: number;
    financeable?: boolean;
  }[],
) {
  const ref = (watch.reference || "").trim().toLowerCase();
  const brand = watch.brand.trim().toLowerCase();
  return (
    catalog.find(
      (c) =>
        ref &&
        c.reference.trim().toLowerCase() === ref &&
        c.brand.trim().toLowerCase() === brand,
    ) ||
    (!ref
      ? catalog.find(
          (c) =>
            c.brand.trim().toLowerCase() === brand &&
            c.model.trim().toLowerCase() === watch.model.trim().toLowerCase(),
        )
      : undefined)
  );
}

export function catalogValuation(
  watch: { brand: string; model: string; reference?: string; valueLow?: number; valueHigh?: number },
  catalog: {
    brand: string;
    model: string;
    reference: string;
    typicalLow: number;
    typicalHigh: number;
    financeable?: boolean;
  }[],
) {
  const match = catalogMatch(watch, catalog);
  return {
    valueLow: match?.typicalLow ?? watch.valueLow ?? 40000,
    valueHigh: match?.typicalHigh ?? watch.valueHigh ?? 55000,
    financeable: match?.financeable ?? false,
  };
}
