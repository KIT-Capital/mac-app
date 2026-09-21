import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { createDb } from "./client";
import {
  createTimepiece,
  activateInvitedCollector,
  deskActor,
  findCustomerByEmail,
  getCustomer,
  getTimepiece,
  listTimepieces,
  registerCollector,
  registerVerifiedCollector,
  timepieceDollars,
  toCollectorActor,
} from "./records";
import { customers, timepieces } from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

describe("Stage 2 records isolation", { skip }, () => {
  const db = createDb();

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    await db.delete(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("keeps collector B from reading collector A", async () => {
    const customerA = await registerCollector(db, {
      email: `collector-a.${suffix}@mac.test`,
      name: "Collector A",
    });
    const customerB = await registerCollector(db, {
      email: `collector-b.${suffix}@mac.test`,
      name: "Collector B",
    });
    createdCustomerIds.push(customerA.id, customerB.id);

    const actorA = toCollectorActor(customerA);
    const actorB = toCollectorActor(customerB);
    const staff = deskActor("appraiser", "desk@mechartcap.com");

    const piece = await createTimepiece(db, actorA, customerA.id, {
      brand: "Audemars Piguet",
      model: "Royal Oak",
      reference: "15500ST",
      serial: "SYN-STAGE2-1",
      valueLow: 42_000,
      valueHigh: 48_000,
    });

    assert.deepEqual(timepieceDollars(piece), { valueLow: 42_000, valueHigh: 48_000 });
    assert.equal((await listTimepieces(db, actorA, customerA.id)).length, 1);
    assert.equal((await getCustomer(db, actorA, customerA.id))?.email, customerA.email);

    await assert.rejects(() => getCustomer(db, actorB, customerA.id), { message: "ISOLATION_DENIED" });
    await assert.rejects(() => listTimepieces(db, actorB, customerA.id), { message: "ISOLATION_DENIED" });
    await assert.rejects(() => getTimepiece(db, actorB, piece.id), { message: "ISOLATION_DENIED" });
    await assert.rejects(
      () => createTimepiece(db, actorB, customerA.id, { brand: "Patek", model: "Nautilus" }),
      { message: "ISOLATION_DENIED" },
    );

    const staffView = await getTimepiece(db, staff, piece.id);
    assert.equal(staffView?.serial, "SYN-STAGE2-1");
    assert.equal((await listTimepieces(db, staff, customerA.id)).length, 1);
  });

  it("rejects reserved desk emails as collector identities", async () => {
    await assert.rejects(
      () => registerCollector(db, { email: "admin@mechartcap.com", name: "Nope" }),
      { message: "RESERVED_DESK_EMAIL" },
    );
  });

  it("registers a verified email once without overwriting the existing collector", async () => {
    const email = `verified.${suffix}@mac.test`;
    const first = await registerVerifiedCollector(db, {
      email,
      name: "Verified Collector",
      phone: "+1 212 555 0100",
    });
    createdCustomerIds.push(first.id);

    const replay = await registerVerifiedCollector(db, {
      email: email.toUpperCase(),
      name: "Replacement Name",
      phone: "+1 212 555 0199",
    });

    assert.equal(replay.id, first.id);
    assert.equal(replay.name, "Verified Collector");
    assert.equal((await findCustomerByEmail(db, email))?.id, first.id);
  });

  it("does not verify registration over a suspended collector", async () => {
    const email = `suspended.${suffix}@mac.test`;
    const customer = await registerVerifiedCollector(db, { email, name: "Suspended", phone: "" });
    createdCustomerIds.push(customer.id);
    await db.update(customers).set({ status: "suspended" }).where(inArray(customers.id, [customer.id]));
    await assert.rejects(
      () => registerVerifiedCollector(db, { email, name: "Replacement", phone: "" }),
      { message: "COLLECTOR_INACTIVE" },
    );
  });

  it("atomically activates the exact invited collector on verified login", async () => {
    const email = `invited-login.${suffix}@mac.test`;
    const customer = await registerVerifiedCollector(db, { email, name: "Invited", phone: "" });
    createdCustomerIds.push(customer.id);
    await db.update(customers).set({ status: "invited" }).where(inArray(customers.id, [customer.id]));
    const activated = await activateInvitedCollector(db, customer.id, email.toUpperCase());
    assert.equal(activated.status, "active");
    await assert.rejects(
      () => activateInvitedCollector(db, "other-id", email),
      { message: "COLLECTOR_NOT_FOUND" },
    );
  });

  it("lets a dealer own pieces the same way a collector does", async () => {
    const dealer = await registerCollector(db, {
      email: `dealer.${suffix}@mac.test`,
      name: "47th Street Books",
      role: "dealer",
    });
    createdCustomerIds.push(dealer.id);
    const actor = toCollectorActor(dealer);
    assert.equal(actor.role, "dealer");
    const piece = await createTimepiece(db, actor, dealer.id, {
      brand: "Rolex",
      model: "Submariner",
    });
    assert.equal((await listTimepieces(db, actor, dealer.id))[0].id, piece.id);
  });
});
