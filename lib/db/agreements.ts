import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { assertIsolation, canPrepareAgreement, canReadAgreement, canSubmitApplication } from "./isolation.mjs";
import { dollarsToCents } from "./money.mjs";
import type { Actor } from "./records";
import {
  allocations,
  agreementVersions,
  agreements,
  applications,
  customers,
  photoObjects,
  timepieces,
} from "./schema";

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

function isUniqueViolation(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    if ("code" in current && current.code === "23505") return true;
    current = "cause" in current ? current.cause : undefined;
  }
  return false;
}

type DbSession = Pick<Database, "select" | "insert" | "update" | "execute">;

async function buildSnapshot(
  db: DbSession,
  application: typeof applications.$inferSelect,
): Promise<AgreementSnapshot> {
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
    .where(and(eq(photoObjects.timepieceId, piece.id), eq(photoObjects.status, "stored")));
  return {
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
}

async function finishPrepare(
  tx: DbSession,
  actor: Actor,
  application: typeof applications.$inferSelect,
  agreement: typeof agreements.$inferSelect,
) {
  const [version] = agreement.currentVersionId
    ? await tx
        .select()
        .from(agreementVersions)
        .where(eq(agreementVersions.id, agreement.currentVersionId))
        .limit(1)
    : [];
  if (!version) {
    const snapshot = await buildSnapshot(tx, application);
    const versionId = agreement.currentVersionId ?? randomUUID();
    await tx.insert(agreementVersions).values({
      id: versionId,
      agreementId: agreement.id,
      versionNumber: 1,
      executable: true,
      snapshot,
      preparedBy: actor.email,
    });
    if (!agreement.currentVersionId) {
      await tx
        .update(agreements)
        .set({ currentVersionId: versionId, updatedAt: new Date() })
        .where(eq(agreements.id, agreement.id));
    }
  }

  const [allocation] = await tx
    .select()
    .from(allocations)
    .where(eq(allocations.agreementId, agreement.id))
    .limit(1);
  if (!allocation) {
    try {
      await tx.insert(allocations).values({
        id: randomUUID(),
        timepieceId: application.timepieceId,
        agreementId: agreement.id,
        status: "live",
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new Error("PIECE_ALREADY_ALLOCATED");
      }
      throw error;
    }
  }

  if (application.status !== "converted") {
    await tx
      .update(applications)
      .set({ status: "converted", updatedAt: new Date() })
      .where(eq(applications.id, application.id));
  }

  const [fresh] = await tx.select().from(agreements).where(eq(agreements.id, agreement.id)).limit(1);
  return fresh ?? agreement;
}

export async function prepareAgreement(db: Database, actor: Actor, applicationId: string) {
  assertIsolation(canPrepareAgreement(actor), "PREPARE_REQUIRES_DESK");
  try {
    return await db.transaction(async (tx) => {
      const [application] = await tx
        .select()
        .from(applications)
        .where(eq(applications.id, applicationId))
        .limit(1);
      if (!application) {
        throw new Error("APPLICATION_NOT_FOUND");
      }

      const [existing] = await tx
        .select()
        .from(agreements)
        .where(eq(agreements.applicationId, application.id))
        .limit(1);
      if (existing) {
        await tx.execute(sql`select id from agreements where id = ${existing.id} for update`);
        return finishPrepare(tx, actor, application, existing);
      }

      const [live] = await tx
        .select()
        .from(allocations)
        .where(and(eq(allocations.timepieceId, application.timepieceId), eq(allocations.status, "live")))
        .limit(1);
      if (live) {
        throw new Error("PIECE_ALREADY_ALLOCATED");
      }

      const snapshot = await buildSnapshot(tx, application);
      const agreementId = randomUUID();
      const versionId = randomUUID();
      const [agreement] = await tx
        .insert(agreements)
        .values({
          id: agreementId,
          customerId: application.customerId,
          applicationId: application.id,
          timepieceId: application.timepieceId,
          agreementCode: `MAC-${agreementId.replaceAll("-", "").slice(-6).toUpperCase()}`,
          status: "prepared",
          currentVersionId: versionId,
        })
        .returning();
      await tx.insert(agreementVersions).values({
        id: versionId,
        agreementId,
        versionNumber: 1,
        executable: true,
        snapshot,
        preparedBy: actor.email,
      });
      await tx.insert(allocations).values({
        id: randomUUID(),
        timepieceId: application.timepieceId,
        agreementId,
        status: "live",
      });
      await tx
        .update(applications)
        .set({ status: "converted", updatedAt: new Date() })
        .where(eq(applications.id, application.id));
      return agreement;
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new Error("PIECE_ALREADY_ALLOCATED");
    }
    throw error;
  }
}
