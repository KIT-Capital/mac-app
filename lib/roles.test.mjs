import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_ROLES,
  MASTER_SUPER_ADMIN_EMAIL,
  RETAIL_ROLES,
  SEEDED_DESK_ACCOUNTS,
  APPRAISAL_PATCH_FIELDS,
  canCreateDeskRole,
  canEditAppraisal,
  canInspect,
  canReviewRequest,
  isSuperAdmin,
  isMasterSuperAdmin,
  canEditTenantBrand,
  patchNeedsAppraisal,
  canManageDeskAccount,
  canManageRetailAccount,
  canSeeDeskAccount,
  canSignForMac,
  isDeskRole,
  isRetailRole,
  normalizeDeskRole,
  roleLabel,
} from "./roles.mjs";

const admin = { role: "admin", isMaster: false };
const appraiser = { role: "appraiser", isMaster: false };
const superAdmin = { role: "super_admin", isMaster: false };
const master = { role: "super_admin", isMaster: true };
const collector = { role: "collector" };

describe("role sets", () => {
  it("splits retail from desk and never overlaps", () => {
    assert.deepEqual(RETAIL_ROLES, ["collector", "dealer"]);
    assert.deepEqual(DESK_ROLES, ["admin", "appraiser", "super_admin"]);
    for (const role of RETAIL_ROLES) {
      assert.equal(isRetailRole(role), true);
      assert.equal(isDeskRole(role), false);
    }
    for (const role of DESK_ROLES) {
      assert.equal(isDeskRole(role), true);
      assert.equal(isRetailRole(role), false);
    }
    assert.equal(isDeskRole("staff"), false);
    assert.equal(isDeskRole(undefined), false);
  });

  it("maps the retired staff role to admin and refuses unknown roles", () => {
    assert.equal(normalizeDeskRole("staff"), "admin");
    assert.equal(normalizeDeskRole("admin"), "admin");
    assert.equal(normalizeDeskRole("appraiser"), "appraiser");
    assert.equal(normalizeDeskRole("super_admin"), "super_admin");
    assert.equal(normalizeDeskRole("collector"), null);
    assert.equal(normalizeDeskRole(""), null);
  });

  it("labels roles in plain words", () => {
    assert.equal(roleLabel("super_admin"), "Super admin");
    assert.equal(roleLabel("appraiser"), "Appraiser");
    assert.equal(roleLabel("dealer"), "Dealer");
  });
});

describe("seeded desk accounts", () => {
  it("seeds the master, the appraiser, and the admin on mechartcap.com with no password", () => {
    assert.equal(MASTER_SUPER_ADMIN_EMAIL, "rc@mechartcap.com");
    assert.deepEqual(
      SEEDED_DESK_ACCOUNTS.map(({ email, role, isMaster }) => ({ email, role, isMaster })),
      [
        { email: "rc@mechartcap.com", role: "super_admin", isMaster: true },
        { email: "dov@mechartcap.com", role: "appraiser", isMaster: false },
        { email: "rosario@mechartcap.com", role: "admin", isMaster: false },
      ],
    );
    for (const seed of SEEDED_DESK_ACCOUNTS) {
      assert.ok(seed.name.length > 0);
      assert.equal("password" in seed, false);
      assert.equal("passwordHash" in seed, false);
    }
  });
});

describe("desk account fences", () => {
  it("lets any desk role create admins and only super admins create appraisers or super admins", () => {
    assert.equal(canCreateDeskRole(admin, "admin"), true);
    assert.equal(canCreateDeskRole(admin, "appraiser"), false);
    assert.equal(canCreateDeskRole(admin, "super_admin"), false);
    assert.equal(canCreateDeskRole(appraiser, "admin"), true);
    assert.equal(canCreateDeskRole(appraiser, "appraiser"), false);
    assert.equal(canCreateDeskRole(superAdmin, "appraiser"), true);
    assert.equal(canCreateDeskRole(superAdmin, "super_admin"), true);
    assert.equal(canCreateDeskRole(master, "super_admin"), true);
    assert.equal(canCreateDeskRole(collector, "admin"), false);
  });

  it("fences edit, disable, and reset by target role and the master row", () => {
    const targetAdmin = { role: "admin", isMaster: false };
    const targetAppraiser = { role: "appraiser", isMaster: false };
    const targetSuper = { role: "super_admin", isMaster: false };

    assert.equal(canManageDeskAccount(admin, targetAdmin), true);
    assert.equal(canManageDeskAccount(admin, targetAppraiser), false);
    assert.equal(canManageDeskAccount(admin, targetSuper), false);
    assert.equal(canManageDeskAccount(admin, master), false);

    assert.equal(canManageDeskAccount(appraiser, targetAdmin), true);
    assert.equal(canManageDeskAccount(appraiser, targetAppraiser), false);
    assert.equal(canManageDeskAccount(appraiser, targetSuper), false);

    assert.equal(canManageDeskAccount(superAdmin, targetAdmin), true);
    assert.equal(canManageDeskAccount(superAdmin, targetAppraiser), true);
    assert.equal(canManageDeskAccount(superAdmin, targetSuper), false);
    assert.equal(canManageDeskAccount(superAdmin, master), false);

    assert.equal(canManageDeskAccount(master, targetSuper), true);
    assert.equal(canManageDeskAccount(master, master), false);
    assert.equal(canManageDeskAccount(collector, targetAdmin), false);
  });

  it("hides super-admin rows from admins and appraisers", () => {
    const targetSuper = { role: "super_admin", isMaster: false };
    assert.equal(canSeeDeskAccount(admin, targetSuper), false);
    assert.equal(canSeeDeskAccount(appraiser, targetSuper), false);
    assert.equal(canSeeDeskAccount(superAdmin, targetSuper), true);
    assert.equal(canSeeDeskAccount(admin, { role: "admin", isMaster: false }), true);
    assert.equal(canSeeDeskAccount(admin, { role: "appraiser", isMaster: false }), true);
  });

  it("lets every desk role manage retail accounts and no retail role manage anyone", () => {
    assert.equal(canManageRetailAccount(admin), true);
    assert.equal(canManageRetailAccount(appraiser), true);
    assert.equal(canManageRetailAccount(superAdmin), true);
    assert.equal(canManageRetailAccount(collector), false);
  });
});

describe("appraisal and MAC signature fences", () => {
  it("reserves appraisal numbers and the MAC signature for appraisers and super admins", () => {
    assert.equal(canEditAppraisal(admin), false);
    assert.equal(canEditAppraisal(appraiser), true);
    assert.equal(canEditAppraisal(superAdmin), true);
    assert.equal(canEditAppraisal(master), true);
    assert.equal(canEditAppraisal(collector), false);

    assert.equal(canSignForMac(admin), false);
    assert.equal(canSignForMac(appraiser), true);
    assert.equal(canSignForMac(superAdmin), true);
    assert.equal(canSignForMac(null), false);
  });

  it("lets every desk role review a request but only appraisers and super admins inspect", () => {
    assert.equal(canReviewRequest(admin), true);
    assert.equal(canReviewRequest(appraiser), true);
    assert.equal(canReviewRequest(superAdmin), true);
    assert.equal(canReviewRequest(collector), false);
    assert.equal(canReviewRequest(null), false);

    assert.equal(canInspect(admin), false);
    assert.equal(canInspect(appraiser), true);
    assert.equal(canInspect(superAdmin), true);
    assert.equal(canInspect(master), true);
    assert.equal(canInspect({ role: "dealer" }), false);
  });

  it("reserves desk-wide photo policy for super admins", () => {
    assert.equal(isSuperAdmin(admin), false);
    assert.equal(isSuperAdmin(appraiser), false);
    assert.equal(isSuperAdmin(superAdmin), true);
    assert.equal(isSuperAdmin(master), true);
    assert.equal(isSuperAdmin(collector), false);
    assert.equal(isSuperAdmin(null), false);
  });

  it("names the desk patch fields that need the appraisal fence", () => {
    assert.deepEqual(
      [...APPRAISAL_PATCH_FIELDS].sort(),
      ["evaluatedAt", "financeable", "valueHigh", "valueLow"],
    );
    assert.equal(patchNeedsAppraisal({ valueLow: 1 }), true);
    assert.equal(patchNeedsAppraisal({ status: "appraised" }), true);
    assert.equal(patchNeedsAppraisal({ status: "reviewing" }), false);
    assert.equal(patchNeedsAppraisal({ assetCode: "MAC-1" }), false);
    assert.equal(patchNeedsAppraisal({}), false);
  });
});

describe("tenant brand fences", () => {
  it("lets only the master mint a tenant and super admins edit an overlay", () => {
    assert.equal(isMasterSuperAdmin(master), true);
    assert.equal(isMasterSuperAdmin({ role: "super_admin", email: "rc@mechartcap.com" }), true);
    assert.equal(isMasterSuperAdmin(superAdmin), false);
    assert.equal(isMasterSuperAdmin(admin), false);
    assert.equal(canEditTenantBrand(superAdmin), true);
    assert.equal(canEditTenantBrand(master), true);
    assert.equal(canEditTenantBrand(admin), false);
    assert.equal(canEditTenantBrand(appraiser), false);
  });
});
