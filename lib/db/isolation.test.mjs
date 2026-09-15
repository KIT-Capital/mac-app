import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertIsolation,
  canReadCustomer,
  canReadPhoto,
  canReadTimepiece,
  canWriteCustomer,
  canWritePhoto,
  canWriteTimepiece,
} from "./isolation.mjs";

const collectorA = { role: "collector", customerId: "cust-a", email: "collector-a.stage2@mac.test" };
const collectorB = { role: "collector", customerId: "cust-b", email: "collector-b.stage2@mac.test" };
const staff = { role: "staff", email: "desk@mechartcap.com" };
const admin = { role: "admin", email: "admin@mechartcap.com" };

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
  });

  it("lets staff and admin read every customer and timepiece", () => {
    assert.equal(canReadCustomer(staff, "cust-a"), true);
    assert.equal(canReadCustomer(admin, "cust-b"), true);
    assert.equal(canReadTimepiece(staff, "cust-b"), true);
    assert.equal(canWriteTimepiece(admin, "cust-a"), true);
  });

  it("denies missing actors", () => {
    assert.equal(canReadCustomer(null, "cust-a"), false);
    assert.equal(canReadTimepiece(undefined, "cust-a"), false);
  });

  it("throws ISOLATION_DENIED when the assertion fails", () => {
    assert.throws(() => assertIsolation(canReadCustomer(collectorA, "cust-b")), {
      name: "IsolationError",
      message: "ISOLATION_DENIED",
    });
  });
});
