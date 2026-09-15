import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { memoryObjectStore } from "../storage/object-store.mjs";
import { prepareAgreement, submitApplication } from "./agreements";
import { createDb } from "./client";
import { createTimepiece, deskActor, registerCollector, toCollectorActor } from "./records";
import {
  allocations,
  agreementVersions,
  agreements,
  applications,
  archivedDocuments,
  customers,
  signatureEnvelopes,
  timepieces,
} from "./schema";
import {
  applySignatureWebhook,
  archiveSignedPdf,
  assertCannotReplaceArchive,
  getArchivedDocument,
  sendForSignature,
} from "./signing";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

describe("Stage 5 sign + archive", { skip }, () => {
  const db = createDb();
  const desk = deskActor("staff", "desk@mechartcap.com");
  const store = memoryObjectStore();

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    const agreementRows = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(inArray(agreements.customerId, createdCustomerIds));
    const agreementIds = agreementRows.map((row) => row.id);
    if (agreementIds.length > 0) {
      const envelopes = await db
        .select({ id: signatureEnvelopes.id })
        .from(signatureEnvelopes)
        .where(inArray(signatureEnvelopes.agreementId, agreementIds));
      const envelopeIds = envelopes.map((row) => row.id);
      if (envelopeIds.length > 0) {
        await db.delete(archivedDocuments).where(inArray(archivedDocuments.envelopeId, envelopeIds));
        await db.delete(signatureEnvelopes).where(inArray(signatureEnvelopes.id, envelopeIds));
      }
      await db.delete(allocations).where(inArray(allocations.agreementId, agreementIds));
      await db.delete(agreementVersions).where(inArray(agreementVersions.agreementId, agreementIds));
    }
    await db.delete(agreements).where(inArray(agreements.customerId, createdCustomerIds));
    await db.delete(applications).where(inArray(applications.customerId, createdCustomerIds));
    await db.delete(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("does not archive until both signatures complete and retries the archive once", async () => {
    const customer = await registerCollector(db, {
      email: `collector-sign.${suffix}@mac.test`,
      name: "Sign Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Rolex",
      model: "Daytona",
    });
    const application = await submitApplication(db, actor, {
      timepieceId: piece.id,
      amount: 90000,
      termMonths: 12,
    });
    const agreement = await prepareAgreement(db, desk, application.id);
    const envelope = await sendForSignature(db, desk, agreement.id);
    const pdf = new TextEncoder().encode(`signed-pdf-${suffix}`);

    await assert.rejects(() => archiveSignedPdf(db, store, desk, envelope.id, pdf), {
      message: "SIGN_INCOMPLETE",
    });

    const afterCollector = await applySignatureWebhook(db, {
      externalId: envelope.externalId,
      event: "collector_signed",
    });
    assert.equal(afterCollector.status, "collector_signed");
    await assert.rejects(() => archiveSignedPdf(db, store, desk, envelope.id, pdf), {
      message: "SIGN_INCOMPLETE",
    });

    const complete = await applySignatureWebhook(db, {
      externalId: envelope.externalId,
      event: "mac_signed",
    });
    assert.equal(complete.status, "complete");
    const duplicate = await applySignatureWebhook(db, {
      externalId: envelope.externalId,
      event: "complete",
    });
    assert.equal(duplicate.id, complete.id);
    assert.equal(duplicate.status, "complete");

    const first = await archiveSignedPdf(db, store, desk, envelope.id, pdf);
    const retry = await archiveSignedPdf(db, store, desk, envelope.id, pdf);
    assert.equal(first.id, retry.id);
    assert.equal(store.objects.size, 1);
    assert.ok(await getArchivedDocument(db, actor, envelope.id));
    assert.throws(() => assertCannotReplaceArchive(actor, customer.id), { message: "ARCHIVE_IMMUTABLE" });
    assert.throws(() => assertCannotReplaceArchive(desk, customer.id), { message: "ARCHIVE_IMMUTABLE" });
  });
});
