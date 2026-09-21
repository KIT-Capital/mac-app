import { retailCatalog } from "../catalog-retail.mjs";
import type { CatalogBrand, CatalogEntry } from "../types";

export const SPARKLE_DAILY_LIMIT = 10;
export const SPARKLE_WINDOW_MS = 24 * 60 * 60 * 1000;
export const SPARKLE_SCOPE = "catalog.sparkle";

export function discloseCatalog(
  brands: CatalogBrand[],
  catalog: CatalogEntry[],
  desk: boolean,
) {
  return retailCatalog(brands, catalog, desk);
}
