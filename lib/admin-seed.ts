import { catalogSeedBrands, catalogSeedModels } from "@/lib/catalog-seed.mjs";
import { hydrateCatalogBrand, hydrateCatalogEntry } from "@/lib/catalog-retail.mjs";
import { DEFAULT_SETTINGS } from "@/lib/theme";
import type {
  AgreementShell,
  AppSettings,
  CatalogBrand,
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
    name: "Desk Appraiser",
    email: "desk@mechartcap.com",
    phone: "+1 (833) 209-0972",
    role: "appraiser",
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

export const DEMO_CATALOG_BRANDS: CatalogBrand[] = catalogSeedBrands().map(hydrateCatalogBrand);
export const DEMO_CATALOG: CatalogEntry[] = catalogSeedModels().map(hydrateCatalogEntry);

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
