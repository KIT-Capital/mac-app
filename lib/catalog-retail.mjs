/** Retail-visible catalog rows need a photo MAC may show (R41). */

/**
 * @typedef {{
 *   id: string,
 *   name: string,
 *   tier: 1 | 2,
 *   slug: string,
 *   logoAssetKey: string | null,
 *   retailVisible: boolean,
 *   sortOrder: number,
 * }} CatalogBrand
 */

/**
 * @typedef {{
 *   id: string,
 *   brandId: string,
 *   brand: string,
 *   model: string,
 *   reference: string,
 *   caseMetal: string,
 *   caseDiameter: string,
 *   typicalLow: number,
 *   typicalHigh: number,
 *   financeable: boolean,
 *   notes: string,
 *   retailVisible: boolean,
 *   photoObjectKey: string | null,
 *   photoSourceUrl: string,
 *   photoLicense: string,
 *   photoAttribution: string,
 *   marketSourceUrls: string[],
 *   marketRetrievedOn: string | null,
 *   lastEditedByStaffId: string | null,
 * }} CatalogEntry
 */

/**
 * @param {{ retailVisible?: boolean, photoObjectKey?: unknown, photoSourceUrl?: unknown } | null | undefined} entry
 * @returns {"PHOTO_REQUIRED" | null}
 */
export function catalogPhotoError(entry) {
  if (!entry || entry.retailVisible !== true) return null;
  const objectKey = String(entry.photoObjectKey ?? "").trim();
  const sourceUrl = String(entry.photoSourceUrl ?? "").trim();
  if (objectKey || sourceUrl) return null;
  return "PHOTO_REQUIRED";
}

/**
 * @param {unknown} brand
 * @returns {CatalogBrand}
 */
export function hydrateCatalogBrand(brand) {
  const source = brand && typeof brand === "object" ? /** @type {Record<string, unknown>} */ (brand) : {};
  /** @type {1 | 2} */
  const tier = source.tier === 2 ? 2 : 1;
  return {
    id: String(source.id ?? ""),
    name: String(source.name ?? ""),
    tier,
    slug: String(source.slug ?? ""),
    logoAssetKey: source.logoAssetKey ? String(source.logoAssetKey) : null,
    retailVisible: Boolean(source.retailVisible),
    sortOrder: Number.isFinite(Number(source.sortOrder)) ? Number(source.sortOrder) : 0,
  };
}

/**
 * @param {unknown} entry
 * @returns {CatalogEntry}
 */
export function hydrateCatalogEntry(entry) {
  const source = entry && typeof entry === "object" ? /** @type {Record<string, unknown>} */ (entry) : {};
  const urls = Array.isArray(source.marketSourceUrls)
    ? source.marketSourceUrls.map((url) => String(url)).filter(Boolean)
    : [];
  return {
    id: String(source.id ?? ""),
    brandId: String(source.brandId ?? ""),
    brand: String(source.brand ?? ""),
    model: String(source.model ?? ""),
    reference: String(source.reference ?? ""),
    caseMetal: String(source.caseMetal ?? ""),
    caseDiameter: String(source.caseDiameter ?? ""),
    typicalLow: Number(source.typicalLow) || 0,
    typicalHigh: Number(source.typicalHigh) || 0,
    financeable: Boolean(source.financeable),
    notes: String(source.notes ?? ""),
    retailVisible: Boolean(source.retailVisible),
    photoObjectKey: source.photoObjectKey ? String(source.photoObjectKey) : null,
    photoSourceUrl: String(source.photoSourceUrl ?? ""),
    photoLicense: String(source.photoLicense ?? ""),
    photoAttribution: String(source.photoAttribution ?? ""),
    marketSourceUrls: urls,
    marketRetrievedOn: source.marketRetrievedOn ? String(source.marketRetrievedOn) : null,
    lastEditedByStaffId: source.lastEditedByStaffId ? String(source.lastEditedByStaffId) : null,
  };
}

/**
 * @template {{ id?: string }} T
 * @param {T[]} seed
 * @param {T[]} existing
 * @returns {T[]}
 */
export function mergeById(seed, existing) {
  const merged = new Map();
  for (const row of seed) merged.set(row.id, row);
  for (const row of existing) {
    if (!row?.id) continue;
    merged.set(row.id, { ...(merged.get(row.id) ?? {}), ...row });
  }
  return [...merged.values()];
}

/**
 * @param {unknown[] | null | undefined} brands
 * @param {unknown[] | null | undefined} catalog
 * @param {boolean} desk
 * @returns {{ brands: CatalogBrand[], catalog: CatalogEntry[] }}
 */
export function retailCatalog(brands, catalog, desk) {
  const hydratedBrands = (brands ?? []).map(hydrateCatalogBrand);
  const hydratedCatalog = (catalog ?? []).map(hydrateCatalogEntry);
  if (desk) {
    return {
      brands: [...hydratedBrands].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
      catalog: hydratedCatalog,
    };
  }
  const visibleBrandIds = new Set(
    hydratedBrands.filter((brand) => brand.retailVisible).map((brand) => brand.id),
  );
  return {
    brands: hydratedBrands
      .filter((brand) => brand.retailVisible)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
    catalog: hydratedCatalog.filter(
      (entry) => entry.retailVisible && visibleBrandIds.has(entry.brandId),
    ),
  };
}

/**
 * @param {unknown[] | null | undefined} brands
 * @param {unknown[] | null | undefined} catalog
 * @param {boolean} desk
 * @returns {string[]}
 */
export function pickerBrandNames(brands, catalog, desk) {
  return retailCatalog(brands, catalog, desk).brands.map((brand) => brand.name);
}

/**
 * @param {unknown[] | null | undefined} brands
 * @param {unknown[] | null | undefined} catalog
 * @param {string} brandName
 * @param {boolean} desk
 * @returns {string[]}
 */
export function pickerModelsForBrand(brands, catalog, brandName, desk) {
  const visible = retailCatalog(brands, catalog, desk);
  return visible.catalog
    .filter((entry) => entry.brand === brandName)
    .map((entry) => entry.model);
}
