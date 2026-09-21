import test from "node:test";
import assert from "node:assert/strict";
import {
  CATALOG_TIER_ONE,
  CATALOG_TIER_TWO,
  catalogBrandSlug,
  catalogSeedBrands,
  catalogSeedModels,
  catalogSeedRows,
} from "./catalog-seed.mjs";

test("catalog seed has 53 manufacturers, 20 tier one and 33 tier two", () => {
  const brands = catalogSeedBrands();
  assert.equal(brands.length, 53);
  assert.equal(brands.filter((brand) => brand.tier === 1).length, 20);
  assert.equal(brands.filter((brand) => brand.tier === 2).length, 33);
  assert.equal(CATALOG_TIER_ONE.length, 20);
  assert.equal(CATALOG_TIER_TWO.length, 33);
});

test("catalog seed gives every manufacturer one model and hides all from retail", () => {
  const rows = catalogSeedRows();
  const models = catalogSeedModels();
  assert.equal(models.length, 53);
  assert.equal(new Set(models.map((model) => model.brandId)).size, 53);
  for (const row of rows) {
    assert.equal(row.brand.retailVisible, false);
    assert.equal(row.model.retailVisible, false);
    assert.equal(row.model.typicalLow, 0);
    assert.equal(row.model.typicalHigh, 0);
    assert.equal(row.model.photoObjectKey, null);
  }
});

test("catalog brand slugs are unique and stable", () => {
  const slugs = catalogSeedBrands().map((brand) => brand.slug);
  assert.equal(new Set(slugs).size, slugs.length);
  assert.equal(catalogBrandSlug("A. Lange & Söhne"), "a-lange-and-sohne");
  assert.equal(catalogBrandSlug("H. Moser & Cie"), "h-moser-and-cie");
});
