import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getAgreement, getCurrentVersion } from "./agreements";
import type { Database } from "./client";
import { assertIsolation, canPrepareAgreement, canReadAgreement } from "./isolation.mjs";
import type { Actor } from "./records";
import { archivedDocuments, reportSnapshots, signatureEnvelopes } from "./schema";
import { getArchivedDocument } from "./signing";

export async function snapshotContractStatement(db: Database, actor: Actor, agreementId: string) {
  assertIsolation(canPrepareAgreement(actor), "REPORT_REQUIRES_DESK");
  const agreement = await getAgreement(db, actor, agreementId);
  if (!agreement) {
    throw new Error("AGREEMENT_NOT_FOUND");
  }
  const version = await getCurrentVersion(db, actor, agreementId);
  if (!version) {
    throw new Error("VERSION_NOT_FOUND");
  }
  const [envelope] = await db
    .select()
    .from(signatureEnvelopes)
    .where(eq(signatureEnvelopes.agreementVersionId, version.id))
    .limit(1);
  const archive = envelope ? await getArchivedDocument(db, actor, envelope.id) : null;
  const payload = {
    agreementCode: agreement.agreementCode,
    versionNumber: version.versionNumber,
    snapshot: version.snapshot,
    archiveChecksum: archive?.checksum ?? null,
  };
  const [row] = await db
    .insert(reportSnapshots)
    .values({
      id: randomUUID(),
      kind: "contract_statement",
      agreementId: agreement.id,
      asOf: new Date(),
      payload,
      archiveChecksum: archive?.checksum ?? null,
      createdBy: actor.email,
    })
    .returning();
  return row;
}

export async function getReportSnapshot(db: Database, actor: Actor, reportId: string) {
  const [row] = await db.select().from(reportSnapshots).where(eq(reportSnapshots.id, reportId)).limit(1);
  if (!row) return null;
  if (row.agreementId) {
    const agreement = await getAgreement(db, actor, row.agreementId);
    if (agreement) assertIsolation(canReadAgreement(actor, agreement.customerId));
  } else {
    assertIsolation(canPrepareAgreement(actor), "REPORT_REQUIRES_DESK");
  }
  return row;
}

export async function assertArchiveUnchanged(db: Database, archiveId: string, expectedChecksum: string) {
  const [doc] = await db.select().from(archivedDocuments).where(eq(archivedDocuments.id, archiveId)).limit(1);
  if (!doc) {
    throw new Error("ARCHIVE_NOT_FOUND");
  }
  if (doc.checksum !== expectedChecksum) {
    throw new Error("ARCHIVE_MUTATED");
  }
}
