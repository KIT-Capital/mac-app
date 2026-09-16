import { DEFAULT_SETTINGS } from "@/lib/theme";
import type {
  AgreementShell,
  AppSettings,
  CatalogEntry,
  ManagedUser,
  PhotoRecord,
} from "@/lib/types";

export const DEMO_SETTINGS: AppSettings = { ...DEFAULT_SETTINGS };

export const DEMO_USERS: ManagedUser[] = [
  {
    id: "usr-admin",
    name: "Ricardo Cidale",
    email: "admin@mechartcap.com",
    phone: "+1 (833) 209-0972",
    role: "admin",
    status: "active",
    member: true,
    lastActive: "2026-09-13",
  },
  {
    id: "usr-desk",
    name: "Desk Partner",
    email: "desk@mechartcap.com",
    phone: "+1 (833) 209-0972",
    role: "staff",
    status: "active",
    member: true,
    lastActive: "2026-09-12",
  },
  {
    id: "usr-hale",
    name: "Jonathan Hale",
    email: "jonathan.hale@mechartcap.com",
    phone: "+1 (212) 555-0148",
    role: "collector",
    status: "active",
    member: false,
    lastActive: "2026-09-11",
  },
];

export const DEMO_CATALOG: CatalogEntry[] = [
  {
    id: "cat-rm-011",
    brand: "Richard Mille",
    model: "RM 011",
    reference: "RM 011",
    caseMetal: "Rose gold",
    caseDiameter: "44mm",
    typicalLow: 280000,
    typicalHigh: 350000,
    financeable: true,
    notes: "Flyback chronograph. Confirm Felipe Massa variant.",
  },
  {
    id: "cat-pp-5711",
    brand: "Patek Philippe",
    model: "Nautilus",
    reference: "5711/1A",
    caseMetal: "Steel",
    caseDiameter: "40mm",
    typicalLow: 95000,
    typicalHigh: 120000,
    financeable: true,
    notes: "Discontinued steel Nautilus. Box and papers preferred.",
  },
  {
    id: "cat-ap-15400",
    brand: "Audemars Piguet",
    model: "Royal Oak Selfwinding",
    reference: "15400ST",
    caseMetal: "Steel",
    caseDiameter: "41mm",
    typicalLow: 38000,
    typicalHigh: 48000,
    financeable: true,
    notes: "Below typical $40k piece floor unless liquidation supports it.",
  },
  {
    id: "cat-rg-lo",
    brand: "Romain Gauthier",
    model: "Logical One",
    reference: "Logical One",
    caseMetal: "White gold",
    caseDiameter: "43mm",
    typicalLow: 145000,
    typicalHigh: 175000,
    financeable: true,
    notes: "Independent. Desk review required.",
  },
  {
    id: "cat-pp-5524",
    brand: "Patek Philippe",
    model: "Calatrava Pilot Travel Time",
    reference: "5524G",
    caseMetal: "White gold",
    caseDiameter: "42mm",
    typicalLow: 62000,
    typicalHigh: 78000,
    financeable: true,
    notes: "Selected dual-time reference.",
  },
];

export const DEMO_SHELLS: AgreementShell[] = [
  {
    id: "shell-31419",
    code: "MAC-31419",
    title: "12-month repurchase",
    termMonths: 12,
    rate: 0.185,
    ltv: 0.6,
    setupFee: 0.01,
    earlyRepurchaseAmount: 0.035,
    brokerFee: 0.035,
    minMonths: 3,
    earlyStartMonth: 4,
    earlyUntilMonth: 8,
    status: "assigned",
    createdAt: "2021-03-14",
  },
  {
    id: "shell-open",
    code: "MAC-OPEN-12",
    title: "Open 12-month shell",
    termMonths: 12,
    rate: 0.185,
    ltv: 0.6,
    setupFee: 0.01,
    earlyRepurchaseAmount: 0.035,
    brokerFee: 0.035,
    minMonths: 3,
    earlyStartMonth: 4,
    earlyUntilMonth: 8,
    status: "open",
    createdAt: "2026-09-01",
  },
];

export function photosFromWatches(
  watches: { id: string; images: string[]; ownerEmail?: string }[]
): PhotoRecord[] {
  const kinds = ["front", "back", "left", "buckle"] as const;
  return watches.flatMap((watch) =>
    watch.images.map((url, index) => ({
      id: `ph-${watch.id}-${index}`,
      url,
      kind: kinds[index] ?? "other",
      assetId: watch.id,
      caption: `${watch.id} ${kinds[index] ?? "detail"}`,
      uploadedAt: "2026-09-09",
      ownerEmail: watch.ownerEmail || "jonathan.hale@mechartcap.com",
    }))
  );
}
