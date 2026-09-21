import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MAC_PALETTE,
  applyTenantBrandPatch,
  contrastRatio,
  defaultMacTenant,
  parseTenantCreate,
  parseTenantPalette,
  tenantIdForCode,
} from "./tenant-brand.mjs";
import { DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME } from "./tenant.mjs";

const DEMO_PALETTE = {
  primary: "#1B3A4B",
  accent: "#E8B931",
  soft: "#E6D5C3",
};

describe("MAC tenant overlay", () => {
  it("keeps Mechanical Art Capital on Logo-FF colors", () => {
    const mac = defaultMacTenant();
    assert.equal(mac.id, DEFAULT_TENANT_ID);
    assert.equal(mac.name, DEFAULT_TENANT_NAME);
    assert.deepEqual(mac.palette, MAC_PALETTE);
    assert.equal(mac.logoUrl, "");
    assert.equal(mac.fromName, DEFAULT_TENANT_NAME);
  });

  it("lets the master create a DEMO tenant without restyling MAC", () => {
    const created = parseTenantCreate({ code: "DEMO", name: "Desk Demo" });
    assert.equal(created.id, "tenant-demo");
    assert.equal(created.code, "DEMO");
    assert.equal(created.name, "Desk Demo");
    assert.equal(tenantIdForCode("DEMO"), "tenant-demo");
    assert.throws(() => parseTenantCreate({ code: "MAC", name: "Other" }), /MAC_BRAND_LOCKED/);
  });

  it("refuses Patek marks on a new tenant", () => {
    assert.throws(
      () => parseTenantCreate({ code: "PTK", name: "Patek Philippe" }),
      /TENANT_MARKS_FORBIDDEN/,
    );
  });

  it("locks MAC name, logo, and palette, and allows a From name", () => {
    const mac = defaultMacTenant();
    assert.throws(
      () => applyTenantBrandPatch(mac, { palette: DEMO_PALETTE }),
      /MAC_BRAND_LOCKED/,
    );
    assert.throws(
      () => applyTenantBrandPatch(mac, { name: "Other Capital" }),
      /MAC_BRAND_LOCKED/,
    );
    assert.throws(
      () => applyTenantBrandPatch(mac, { logoUrl: "/brand/mbf-mark.svg" }),
      /MAC_BRAND_LOCKED/,
    );
    const next = applyTenantBrandPatch(mac, { fromName: "MAC Desk" });
    assert.equal(next.fromName, "MAC Desk");
    assert.deepEqual(next.palette, MAC_PALETTE);
  });

  it("stores a non-MAC overlay that still contrasts on dark navy", () => {
    const created = parseTenantCreate({ code: "DEMO", name: "Desk Demo" });
    const overlay = applyTenantBrandPatch(created, {
      palette: DEMO_PALETTE,
      logoUrl: "/brand/mbf-mark.svg",
      fromName: "Desk Demo Notices",
    });
    assert.deepEqual(overlay.palette, DEMO_PALETTE);
    assert.equal(overlay.logoUrl, "/brand/mbf-mark.svg");
    assert.ok(contrastRatio("#FFFFFF", overlay.palette.primary) >= 4.5);
    assert.throws(() => applyTenantBrandPatch(overlay, { code: "OTH" }), /TENANT_CODE_IMMUTABLE/);
  });

  it("rejects a washed-out palette", () => {
    assert.throws(
      () => parseTenantPalette({ primary: "#EEEEEE", accent: "#FFFFFF", soft: "#F5F5F5" }),
      /TENANT_PALETTE_CONTRAST/,
    );
  });
});
