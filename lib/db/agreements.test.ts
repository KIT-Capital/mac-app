import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import {
  getAgreement,
  getApplication,
  getCurrentVersion,
  isVersionExecutable,
  prepareAgreement,
  submitApplication,
} from "./agreements";
import { createDb } from "./client";
import { deskActor, createTimepiece, registerCollector, toCollectorActor } from "./records";
import { allocations, agreementVersions, agreements, applications, customers, timepieces } from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

describe("Stage 4 prepare + snapshots", { skip }, () => {
  const db = createDb();
  const desk = deskActor("staff", "desk@mechartcap.com");

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    await db.delete(allocations).where(inArray(allocations.timepieceId, (
      await db.select({ id: timepieces.id }).from(timepieces).where(inArray(timepieces.customerId, createdCustomerIds))
    ).map((row) => row.id)));
    const agreementRows = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(inArray(agreements.customerId, createdCustomerIds));
    const agreementIds = agreementRows.map((row) => row.id);
    if (agreementIds.length > 0) {
      await db.delete(agreementVersions).where(inArray(agreementVersions.agreementId, agreementIds));
    }
    await db.delete(agreements).where(inArray(agreements.customerId, createdCustomerIds));
    await db.delete(applications).where(inArray(applications.customerId, createdCustomerIds));
    await db.delete(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("keeps an application non-executable until the desk freezes a version", async () => {
    const customer = await registerCollector(db, {
      email: `collector-app.${suffix}@mac.test`,
      name: "App Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Audemars Piguet",
      model: "Royal Oak",
    });
    const application = await submitApplication(db, actor, {
      timepieceId: piece.id,
      amount: 125000,
      termMonths: 12,
      delivery: "vault",
    });
    assert.equal(application.status, "submitted");

    await assert.rejects(() => prepareAgreement(db, actor, application.id), {
      message: "PREPARE_REQUIRES_DESK",
    });

    const prepared = await prepareAgreement(db, desk, application.id);
    const retry = await prepareAgreement(db, desk, application.id);
    assert.equal(prepared.id, retry.id);
    const version = await getCurrentVersion(db, actor, prepared.id);
    assert.equal(isVersionExecutable(version), true);
    assert.equal((version?.snapshot as { terms: { amountCents: number } }).terms.amountCents, 12500000);
    const converted = await getApplication(db, actor, application.id);
    assert.equal(converted?.status, "converted");
  });

  it("keeps collector B from reading collector A and blocks a second live allocation", async () => {
    const customerA = await registerCollector(db, {
      email: `collector-app-a.${suffix}@mac.test`,
      name: "App A",
    });
    const customerB = await registerCollector(db, {
      email: `collector-app-b.${suffix}@mac.test`,
      name: "App B",
    });
    createdCustomerIds.push(customerA.id, customerB.id);
    const actorA = toCollectorActor(customerA);
    const actorB = toCollectorActor(customerB);
    const piece = await createTimepiece(db, actorA, customerA.id, {
      brand: "Vacheron Constantin",
      model: "Overseas",
    });
    const application = await submitApplication(db, actorA, {
      timepieceId: piece.id,
      amount: 80000,
      termMonths: 18,
    });
    await assert.rejects(() => getApplication(db, actorB, application.id), { message: "ISOLATION_DENIED" });
    const agreement = await prepareAgreement(db, desk, application.id);
    await assert.rejects(() => getAgreement(db, actorB, agreement.id), { message: "ISOLATION_DENIED" });

    const second = await submitApplication(db, actorA, {
      timepieceId: piece.id,
      amount: 81000,
      termMonths: 12,
    });
    await assert.rejects(() => prepareAgreement(db, desk, second.id), { message: "PIECE_ALREADY_ALLOCATED" });
  });

  it("resumes a torn prepare instead of returning an incomplete agreement", async () => {
    const customer = await registerCollector(db, {
      email: `collector-app-resume.${suffix}@mac.test`,
      name: "Resume Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Jaeger-LeCoultre",
      model: "Reverso",
    });
    const application = await submitApplication(db, actor, {
      timepieceId: piece.id,
      amount: 55000,
      termMonths: 12,
    });
    const tornId = crypto.randomUUID();
    const tornVersionId = crypto.randomUUID();
    await db.insert(agreements).values({
      id: tornId,
      customerId: customer.id,
      applicationId: application.id,
      timepieceId: piece.id,
      agreementCode: "MAC-TORN1",
      status: "prepared",
      currentVersionId: tornVersionId,
    });

    const resumed = await prepareAgreement(db, desk, application.id);
    assert.equal(resumed.id, tornId);
    const version = await getCurrentVersion(db, actor, tornId);
    assert.equal(isVersionExecutable(version), true);
    const [allocation] = await db.select().from(allocations).where(inArray(allocations.agreementId, [tornId]));
    assert.equal(allocation?.status, "live");
    const converted = await getApplication(db, actor, application.id);
    assert.equal(converted?.status, "converted");
  });
});
