import test from "node:test";
import assert from "node:assert/strict";
import {
  catalogPhotoError,
  pickerBrandNames,
  retailCatalog,
} from "./catalog-retail.mjs";

test("retail-visible models need a photo or a recorded photo link", () => {
  assert.equal(catalogPhotoError({ retailVisible: false }), null);
  assert.equal(catalogPhotoError({ retailVisible: true }), "PHOTO_REQUIRED");
  assert.equal(catalogPhotoError({ retailVisible: true, photoSourceUrl: "https://example.com/a.jpg" }), null);
  assert.equal(catalogPhotoError({ retailVisible: true, photoObjectKey: "mac/render.jpg" }), null);
});

test("unchecking a brand hides its models from collectors", () => {
  const brands = [
    { id: "brand-a", name: "Alpha", tier: 1, slug: "alpha", retailVisible: true, sortOrder: 1 },
    { id: "brand-b", name: "Beta", tier: 2, slug: "beta", retailVisible: false, sortOrder: 2 },
  ];
  const catalog = [
    { id: "m-a", brandId: "brand-a", brand: "Alpha", model: "One", retailVisible: true },
    { id: "m-b", brandId: "brand-b", brand: "Beta", model: "Two", retailVisible: true },
  ];
  const retail = retailCatalog(brands, catalog, false);
  assert.deepEqual(retail.brands.map((brand) => brand.name), ["Alpha"]);
  assert.deepEqual(retail.catalog.map((entry) => entry.model), ["One"]);
  assert.deepEqual(pickerBrandNames(brands, catalog, true), ["Alpha", "Beta"]);
});
