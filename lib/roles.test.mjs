import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DESK_ROLES,
  MASTER_SUPER_ADMIN_EMAIL,
  RETAIL_ROLES,
  SEEDED_DESK_ACCOUNTS,
  canCreateDeskRole,
  canEditAppraisal,
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
  it("seeds the master and two admins on mechartcap.com with no password", () => {
    assert.equal(MASTER_SUPER_ADMIN_EMAIL, "rc@mechartcap.com");
    assert.deepEqual(
      SEEDED_DESK_ACCOUNTS.map(({ email, role, isMaster }) => ({ email, role, isMaster })),
      [
        { email: "rc@mechartcap.com", role: "super_admin", isMaster: true },
        { email: "dov@mechartcap.com", role: "admin", isMaster: false },
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
});
