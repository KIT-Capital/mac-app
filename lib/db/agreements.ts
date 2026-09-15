import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Database } from "./client";
import { assertIsolation, canPrepareAgreement, canReadAgreement, canSubmitApplication } from "./isolation.mjs";
import { dollarsToCents } from "./money.mjs";
import { photoObjects } from "./schema";
import {
  allocations,
  agreementVersions,
  agreements,
  applications,
  customers,
  timepieces,
} from "./schema";
import type { Actor } from "./records";

export type SubmitApplicationInput = {
  timepieceId: string;
  amount: number;
  termMonths: number;
  delivery?: string;
};

export type AgreementSnapshot = {
  templateId: string;
  customer: { id: string; email: string; name: string };
  timepiece: {
    id: string;
    brand: string;
    model: string;
    reference: string | null;
    serial: string | null;
    valueLowCents: number | null;
    valueHighCents: number | null;
  };
  photos: { id: string; kind: string; originalChecksum: string }[];
  terms: { amountCents: number; termMonths: number; delivery: string };
};

export function isApplicationExecutable() {
  return false;
}

export function isVersionExecutable(version: { executable: boolean } | null | undefined) {
  return version?.executable === true;
}

export async function submitApplication(
  db: Database,
  actor: Actor,
  input: SubmitApplicationInput,
) {
  const [piece] = await db
    .select()
    .from(timepieces)
    .where(eq(timepieces.id, input.timepieceId))
    .limit(1);
  if (!piece) {
    throw new Error("TIMEPIECE_NOT_FOUND");
  }
  assertIsolation(canSubmitApplication(actor, piece.customerId));
  if (!Number.isInteger(input.termMonths) || input.termMonths <= 0) {
    throw new Error("TERM_REQUIRED");
  }
  const amountCents = dollarsToCents(input.amount);
  if (amountCents === null || amountCents <= 0) {
    throw new Error("AMOUNT_REQUIRED");
  }
  const [row] = await db
    .insert(applications)
    .values({
      id: randomUUID(),
      customerId: piece.customerId,
      timepieceId: piece.id,
      amountCents,
      termMonths: input.termMonths,
      delivery: input.delivery?.trim() ?? "",
      status: "submitted",
    })
    .returning();
  return row;
}

export async function getApplication(db: Database, actor: Actor, applicationId: string) {
  const [row] = await db.select().from(applications).where(eq(applications.id, applicationId)).limit(1);
  if (!row) return null;
  assertIsolation(canReadAgreement(actor, row.customerId));
  return row;
}

export async function getAgreement(db: Database, actor: Actor, agreementId: string) {
  const [row] = await db.select().from(agreements).where(eq(agreements.id, agreementId)).limit(1);
  if (!row) return null;
  assertIsolation(canReadAgreement(actor, row.customerId));
  return row;
}

export async function getCurrentVersion(db: Database, actor: Actor, agreementId: string) {
  const agreement = await getAgreement(db, actor, agreementId);
  if (!agreement?.currentVersionId) return null;
  const [version] = await db
    .select()
    .from(agreementVersions)
    .where(eq(agreementVersions.id, agreement.currentVersionId))
    .limit(1);
  return version ?? null;
}

export async function prepareAgreement(db: Database, actor: Actor, applicationId: string) {
  assertIsolation(canPrepareAgreement(actor), "PREPARE_REQUIRES_DESK");
  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, applicationId))
    .limit(1);
  if (!application) {
    throw new Error("APPLICATION_NOT_FOUND");
  }

  const [existing] = await db
    .select()
    .from(agreements)
    .where(eq(agreements.applicationId, application.id))
    .limit(1);
  if (existing) {
    return existing;
  }

  const [live] = await db
    .select()
    .from(allocations)
    .where(and(eq(allocations.timepieceId, application.timepieceId), eq(allocations.status, "live")))
    .limit(1);
  if (live) {
    throw new Error("PIECE_ALREADY_ALLOCATED");
  }

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, application.customerId))
    .limit(1);
  const [piece] = await db
    .select()
    .from(timepieces)
    .where(eq(timepieces.id, application.timepieceId))
    .limit(1);
  if (!customer || !piece) {
    throw new Error("APPLICATION_ORPHANED");
  }
  const photos = await db
    .select({
      id: photoObjects.id,
      kind: photoObjects.kind,
      originalChecksum: photoObjects.originalChecksum,
    })
    .from(photoObjects)
    .where(eq(photoObjects.timepieceId, piece.id));

  const snapshot: AgreementSnapshot = {
    templateId: "mac-repo-v1",
    customer: { id: customer.id, email: customer.email, name: customer.name },
    timepiece: {
      id: piece.id,
      brand: piece.brand,
      model: piece.model,
      reference: piece.reference,
      serial: piece.serial,
      valueLowCents: piece.valueLowCents,
      valueHighCents: piece.valueHighCents,
    },
    photos,
    terms: {
      amountCents: application.amountCents,
      termMonths: application.termMonths,
      delivery: application.delivery,
    },
  };

  const agreementId = randomUUID();
  const versionId = randomUUID();
  const [agreement] = await db
    .insert(agreements)
    .values({
      id: agreementId,
      customerId: customer.id,
      applicationId: application.id,
      timepieceId: piece.id,
      agreementCode: `MAC-${agreementId.replaceAll("-", "").slice(-6).toUpperCase()}`,
      status: "prepared",
      currentVersionId: versionId,
    })
    .returning();

  await db.insert(agreementVersions).values({
    id: versionId,
    agreementId,
    versionNumber: 1,
    executable: true,
    snapshot,
    preparedBy: actor.email,
  });
  await db.insert(allocations).values({
    id: randomUUID(),
    timepieceId: piece.id,
    agreementId,
    status: "live",
  });
  await db
    .update(applications)
    .set({ status: "converted", updatedAt: new Date() })
    .where(eq(applications.id, application.id));

  return agreement;
}
