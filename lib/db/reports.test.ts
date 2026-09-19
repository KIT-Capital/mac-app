import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { memoryObjectStore } from "../storage/object-store.mjs";
import { prepareAgreement, submitApplication } from "./agreements";
import { createDb } from "./client";
import { createTimepiece, deskActor, registerCollector, toCollectorActor } from "./records";
import { assertArchiveUnchanged, snapshotContractStatement } from "./reports";
import {
  allocations,
  agreementVersions,
  agreements,
  applications,
  archivedDocuments,
  customers,
  reportSnapshots,
  signatureEnvelopes,
  timepieces,
} from "./schema";
import { applySignatureWebhook, archiveSignedPdf, sendForSignature } from "./signing";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

describe("Stage 7 contract report snapshots", { skip }, () => {
  const db = createDb();
  const desk = deskActor("appraiser", "desk@mechartcap.com");
  const store = memoryObjectStore();

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    const agreementRows = await db
      .select({ id: agreements.id })
      .from(agreements)
      .where(inArray(agreements.customerId, createdCustomerIds));
    const agreementIds = agreementRows.map((row) => row.id);
    if (agreementIds.length > 0) {
      await db.delete(reportSnapshots).where(inArray(reportSnapshots.agreementId, agreementIds));
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

  it("freezes a contract statement without mutating the archived PDF", async () => {
    const customer = await registerCollector(db, {
      email: `collector-report.${suffix}@mac.test`,
      name: "Report Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Omega",
      model: "Speedmaster",
    });
    const application = await submitApplication(db, actor, {
      timepieceId: piece.id,
      amount: 42000,
      termMonths: 12,
    });
    const agreement = await prepareAgreement(db, desk, application.id);
    const envelope = await sendForSignature(db, desk, agreement.id);
    await applySignatureWebhook(db, { externalId: envelope.externalId, event: "complete" });
    const pdf = new TextEncoder().encode(`report-pdf-${suffix}`);
    const archive = await archiveSignedPdf(db, store, desk, envelope.id, pdf);
    const report = await snapshotContractStatement(db, desk, agreement.id);
    assert.equal(report.kind, "contract_statement");
    assert.equal(report.archiveChecksum, archive.checksum);
    await assertArchiveUnchanged(db, archive.id, archive.checksum);
    const again = await snapshotContractStatement(db, desk, agreement.id);
    assert.equal(again.archiveChecksum, archive.checksum);
    await assertArchiveUnchanged(db, archive.id, archive.checksum);
  });
});
