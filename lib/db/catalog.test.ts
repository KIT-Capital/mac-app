import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { createDb } from "./client";
import { clearAccessRateLimit } from "./collector-sessions";
import { SPARKLE_SCOPE } from "./catalog";
import { executeLiveBookOperation } from "./live-book-mutations";
import { readLiveBookState } from "./live-book-adapter";
import { deskActor } from "./records";
import { createStaffAccount } from "./staff-accounts";
import { hashStaffPassword } from "../staff-password.mjs";
import { catalogBrands, catalogReferences, staffAccounts } from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();

describe("live catalog brands and Sparkle", { skip }, () => {
  const db = createDb();
  const staffIds: string[] = [];
  const catalogIds = [`cat-photo-${suffix}`, `cat-sparkle-a-${suffix}`, `cat-sparkle-b-${suffix}`];

  after(async () => {
    if (catalogIds.length) {
      for (const id of catalogIds) {
        await db.delete(catalogReferences).where(eq(catalogReferences.id, id));
      }
    }
    await db.delete(catalogBrands).where(eq(catalogBrands.id, `brand-test-${suffix}`));
    if (staffIds.length) {
      await db.delete(staffAccounts).where(inArray(staffAccounts.id, staffIds));
    }
  });

  it("seeds 53 brands in two tiers, all hidden from retail", async () => {
    const brands = await db.select().from(catalogBrands);
    assert.ok(brands.length >= 53);
    assert.equal(brands.filter((brand) => brand.tier === 1).length >= 20, true);
    assert.equal(brands.filter((brand) => brand.tier === 2).length >= 33, true);
    const seeded = brands.filter((brand) => brand.id.startsWith("brand-") && !brand.id.startsWith("brand-legacy-") && !brand.id.startsWith("brand-test-"));
    assert.ok(seeded.length >= 53);
    assert.equal(seeded.every((brand) => brand.retailVisible === false), true);
    const models = await db.select().from(catalogReferences);
    assert.ok(models.length >= 53);
    assert.equal(models.every((row) => row.retailVisible === false), true);
  });

  it("refuses a retail-visible model without a photo", async () => {
    const passwordHash = await hashStaffPassword("temporary password 123");
    const appraiser = await createStaffAccount(db, {
      name: "Catalog Appraiser",
      email: `cat-appraiser.${suffix}@mac.test`,
      role: "appraiser",
      passwordHash,
      mustRotate: false,
    });
    staffIds.push(appraiser.id);
    const actor = deskActor("appraiser", appraiser.email, appraiser.id);
    const admin = deskActor("admin", `cat-admin.${suffix}@mac.test`, `staff-admin-${suffix}`);
    await assert.rejects(
      () => executeLiveBookOperation(db, admin, {
        action: "brand.upsert",
        brand: {
          id: `brand-test-${suffix}`,
          name: "Test Maison",
          tier: 2,
          slug: `test-maison-${suffix}`,
          retailVisible: false,
          sortOrder: 90,
        },
      }),
      { message: "ROLE_FORBIDDEN" },
    );
    await executeLiveBookOperation(db, actor, {
      action: "brand.upsert",
      brand: {
        id: `brand-test-${suffix}`,
        name: "Test Maison",
        tier: 2,
        slug: `test-maison-${suffix}`,
        retailVisible: false,
        sortOrder: 90,
      },
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, actor, {
        action: "catalog.upsert",
        entry: {
          id: catalogIds[0],
          brandId: `brand-test-${suffix}`,
          brand: "Test Maison",
          model: "No Photo",
          reference: "",
          caseMetal: "",
          caseDiameter: "",
          typicalLow: 0,
          typicalHigh: 0,
          financeable: false,
          notes: "",
          retailVisible: true,
        },
      }),
      { message: "PHOTO_REQUIRED" },
    );
    await executeLiveBookOperation(db, actor, {
      action: "catalog.upsert",
      entry: {
        id: catalogIds[0],
        brandId: `brand-test-${suffix}`,
        brand: "Test Maison",
        model: "No Photo",
        reference: "",
        caseMetal: "",
        caseDiameter: "",
        typicalLow: 0,
        typicalHigh: 0,
        financeable: false,
        notes: "",
        retailVisible: true,
        photoSourceUrl: "https://example.com/open.jpg",
        photoLicense: "cc0",
        photoAttribution: "Example",
      },
    });
  });

  it("throttles Sparkle on the eleventh call and never writes from Sparkle itself", async () => {
    const appraiserId = staffIds[0];
    const actor = deskActor("appraiser", `cat-appraiser.${suffix}@mac.test`, appraiserId);
    const options = { env: { MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv };
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        deskActor("admin", `cat-admin2.${suffix}@mac.test`),
        { action: "catalog.sparkle", kind: "brand", id: `brand-test-${suffix}` },
      ),
      { message: "ROLE_FORBIDDEN" },
    );
    const before = (await readLiveBookState(db, actor)).catalog.length;
    await clearAccessRateLimit(db, SPARKLE_SCOPE, appraiserId);
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        deskActor("appraiser", actor.email),
        { action: "catalog.sparkle", kind: "brand", id: `brand-test-${suffix}` },
        options,
      ),
      { message: "SESSION_INVALID" },
    );
    for (let i = 0; i < 10; i += 1) {
      await assert.rejects(
        () => executeLiveBookOperation(
          db,
          actor,
          { action: "catalog.sparkle", kind: "brand", id: `brand-test-${suffix}` },
          options,
        ),
        { message: "SPARKLE_UNAVAILABLE" },
      );
    }
    await assert.rejects(
      () => executeLiveBookOperation(
        db,
        actor,
        { action: "catalog.sparkle", kind: "brand", id: `brand-test-${suffix}` },
        options,
      ),
      { message: "THROTTLED" },
    );
    assert.equal((await readLiveBookState(db, actor)).catalog.length, before);
    await executeLiveBookOperation(db, actor, {
      action: "catalog.upsert",
      entry: {
        id: catalogIds[1],
        brandId: `brand-test-${suffix}`,
        brand: "Test Maison",
        model: "Saved One",
        reference: "ONE",
        caseMetal: "",
        caseDiameter: "",
        typicalLow: 0,
        typicalHigh: 0,
        financeable: false,
        notes: "",
        retailVisible: false,
        marketSourceUrls: ["https://example.com/one"],
        marketRetrievedOn: "2026-09-20",
      },
    });
    await executeLiveBookOperation(db, actor, {
      action: "catalog.upsert",
      entry: {
        id: catalogIds[2],
        brandId: `brand-test-${suffix}`,
        brand: "Test Maison",
        model: "Saved Two",
        reference: "TWO",
        caseMetal: "",
        caseDiameter: "",
        typicalLow: 0,
        typicalHigh: 0,
        financeable: false,
        notes: "",
        retailVisible: false,
        marketSourceUrls: ["https://example.com/two"],
        marketRetrievedOn: "2026-09-20",
      },
    });
    const saved = (await readLiveBookState(db, actor)).catalog.filter((row) =>
      row.id === catalogIds[1] || row.id === catalogIds[2],
    );
    assert.equal(saved.length, 2);
    await clearAccessRateLimit(db, SPARKLE_SCOPE, appraiserId);
  });
});
