import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertIsolation,
  canReadCustomer,
  canPrepareAgreement,
  canReadAppraisalAttempt,
  canReadAgreement,
  canReadAgreementDocument,
  canReadPhoto,
  canReadTimepiece,
  canSubmitApplication,
  canWriteCustomer,
  canWritePhoto,
  canWriteTimepiece,
} from "./isolation.mjs";

const collectorA = { role: "collector", customerId: "cust-a", email: "collector-a.stage2@mac.test" };
const collectorB = { role: "collector", customerId: "cust-b", email: "collector-b.stage2@mac.test" };
const staff = { role: "appraiser", email: "desk@mechartcap.com" };
const admin = { role: "admin", email: "admin@mechartcap.com" };
const superAdmin = { role: "super_admin", email: "rc@mechartcap.com" };
const dealer = { role: "dealer", customerId: "cust-d", email: "dealer.stage2@mac.test" };
const retiredStaff = { role: "staff", email: "old@mechartcap.com" };

describe("Stage 2 isolation", () => {
  it("lets a collector read and write only their own customer row", () => {
    assert.equal(canReadCustomer(collectorA, "cust-a"), true);
    assert.equal(canWriteCustomer(collectorA, "cust-a"), true);
    assert.equal(canReadCustomer(collectorA, "cust-b"), false);
    assert.equal(canWriteCustomer(collectorA, "cust-b"), false);
  });

  it("lets a collector read and write only their own timepieces", () => {
    assert.equal(canReadTimepiece(collectorA, "cust-a"), true);
    assert.equal(canWriteTimepiece(collectorA, "cust-a"), true);
    assert.equal(canReadTimepiece(collectorA, "cust-b"), false);
    assert.equal(canWriteTimepiece(collectorB, "cust-a"), false);
    assert.equal(canReadPhoto(collectorA, "cust-a"), true);
    assert.equal(canWritePhoto(collectorB, "cust-a"), false);
    assert.equal(canReadAppraisalAttempt(collectorA, "cust-a"), true);
    assert.equal(canReadAppraisalAttempt(collectorA, "cust-b"), false);
    assert.equal(canReadAppraisalAttempt(staff, "cust-b"), true);
  });

  it("lets staff and admin read every customer and timepiece", () => {
    assert.equal(canReadCustomer(staff, "cust-a"), true);
    assert.equal(canReadCustomer(admin, "cust-b"), true);
    assert.equal(canReadTimepiece(staff, "cust-b"), true);
    assert.equal(canWriteTimepiece(admin, "cust-a"), true);
  });

  it("treats super admins as desk and dealers as retail; the retired staff role is nobody", () => {
    assert.equal(canReadCustomer(superAdmin, "cust-a"), true);
    assert.equal(canReadCustomer(dealer, "cust-d"), true);
    assert.equal(canReadCustomer(dealer, "cust-a"), false);
    assert.equal(canSubmitApplication(dealer, "cust-d"), true);
    assert.equal(canReadCustomer(retiredStaff, "cust-a"), false);
    assert.equal(canPrepareAgreement(retiredStaff), false);
  });

  it("denies missing actors", () => {
    assert.equal(canReadCustomer(null, "cust-a"), false);
    assert.equal(canReadTimepiece(undefined, "cust-a"), false);
  });

  it("lets a collector submit an application only on their own piece", () => {
    assert.equal(canSubmitApplication(collectorA, "cust-a"), true);
    assert.equal(canSubmitApplication(collectorA, "cust-b"), false);
    assert.equal(canSubmitApplication(staff, "cust-a"), false);
    assert.equal(canReadAgreement(collectorA, "cust-a"), true);
    assert.equal(canReadAgreement(collectorB, "cust-a"), false);
  });

  it("lets only the desk prepare an executable agreement version", () => {
    assert.equal(canPrepareAgreement(staff), true);
    assert.equal(canPrepareAgreement(admin), true);
    assert.equal(canPrepareAgreement(collectorA), false);
  });

  it("lets a collector read only their own agreement documents", () => {
    assert.equal(canReadAgreementDocument(collectorA, "cust-a"), true);
    assert.equal(canReadAgreementDocument(collectorA, "cust-b"), false);
    assert.equal(canReadAgreementDocument(staff, "cust-b"), true);
    assert.equal(canReadAgreementDocument(admin, "cust-a"), true);
    assert.equal(canReadAgreementDocument(null, "cust-a"), false);
  });

  it("throws ISOLATION_DENIED when the assertion fails", () => {
    assert.throws(() => assertIsolation(canReadCustomer(collectorA, "cust-b")), {
      name: "IsolationError",
      message: "ISOLATION_DENIED",
    });
  });
});
