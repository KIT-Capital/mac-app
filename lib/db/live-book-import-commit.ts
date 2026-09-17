import { eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import { liveBookFlagOn, planLiveBookImport } from "./live-book-import.mjs";
import { dollarsToCents } from "./money.mjs";
import type { Actor } from "./records";
import { assertIsolation, isDeskActor } from "./isolation.mjs";
import {
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

export type ImportPayload = {
  timepieces?: unknown[];
  agreements?: unknown[];
  users?: unknown[];
};

export async function commitLiveBookImport(
  db: Database,
  actor: Actor,
  payload: ImportPayload,
  options: { confirmLiveImport?: boolean; env?: NodeJS.ProcessEnv } = {},
) {
  assertIsolation(isDeskActor(actor), "DESK_REQUIRED");
  if (liveBookFlagOn(options.env)) {
    throw new Error("LIVE_BOOK_FLAG_ON");
  }
  const existingCustomers = await db.select({ id: customers.id, email: customers.email }).from(customers);
  const existingTimepieces = await db
    .select({ id: timepieces.id, customerId: timepieces.customerId })
    .from(timepieces);
  const existingAgreements = await db
    .select({ id: liveAgreements.id, customerId: liveAgreements.customerId })
    .from(liveAgreements);
  const plan = planLiveBookImport(payload, {
    existingCustomers,
    existingTimepieces,
    existingAgreements,
    confirmLiveImport: options.confirmLiveImport,
    env: options.env,
  });
  if (!plan.ok) {
    throw new Error(plan.error || "IMPORT_REJECTED");
  }

  await db.transaction(async (tx) => {
    for (const person of plan.customers) {
      await tx
        .insert(customers)
        .values({
          id: person.id,
          email: person.email,
          name: person.name,
          role: "collector",
        })
        .onConflictDoUpdate({
          target: customers.id,
          set: { email: person.email, name: person.name, updatedAt: new Date() },
        });
    }

    for (const watch of plan.timepieces) {
      await tx
        .insert(timepieces)
        .values({
          id: watch.id,
          customerId: watch.customerId,
          brand: watch.brand,
          model: watch.model,
          reference: watch.reference,
          status: watch.status,
          financeable: watch.financeable,
          condition: watch.condition,
          boxPapers: watch.boxPapers,
          caseMetal: watch.caseMetal,
          caseType: watch.caseType,
          caseDiameter: watch.caseDiameter,
          dialColor: watch.dialColor,
          buckle: watch.buckle,
          band: watch.band === "bracelet" ? "bracelet" : "strap",
          bandMaterial: watch.bandMaterial,
          complication: watch.complication,
          assetCode: watch.assetCode,
          valueLowCents: dollarsToCents(watch.valueLow),
          valueHighCents: dollarsToCents(watch.valueHigh),
        })
        .onConflictDoUpdate({
          target: timepieces.id,
          set: {
            customerId: watch.customerId,
            brand: watch.brand,
            model: watch.model,
            reference: watch.reference,
            status: watch.status,
            financeable: watch.financeable,
            condition: watch.condition,
            boxPapers: watch.boxPapers,
            caseMetal: watch.caseMetal,
            caseType: watch.caseType,
            caseDiameter: watch.caseDiameter,
            dialColor: watch.dialColor,
            buckle: watch.buckle,
            band: watch.band === "bracelet" ? "bracelet" : "strap",
            bandMaterial: watch.bandMaterial,
            complication: watch.complication,
            assetCode: watch.assetCode,
            valueLowCents: dollarsToCents(watch.valueLow),
            valueHighCents: dollarsToCents(watch.valueHigh),
            updatedAt: new Date(),
          },
        });
    }

    if (plan.agreements.length) {
      await tx.delete(liveAgreementMembers).where(
        inArray(
          liveAgreementMembers.agreementId,
          plan.agreements.map((agreement) => agreement.id),
        ),
      );
    }

    for (const agreement of plan.agreements) {
      const amountCents = dollarsToCents(agreement.amount);
      if (amountCents === null) {
        throw new Error("INVALID_DOLLAR_AMOUNT");
      }
      await tx
        .insert(liveAgreements)
        .values({
          id: agreement.id,
          customerId: agreement.customerId,
          amountCents,
          termMonths: agreement.termMonths,
          delivery: agreement.delivery,
          ownerName: agreement.ownerName,
          email: agreement.email,
          status: agreement.status,
          agreementCode: agreement.agreementCode,
          createdOn: agreement.createdOn,
          signedOn: agreement.signedOn,
          scale: agreement.scale,
        })
        .onConflictDoUpdate({
          target: liveAgreements.id,
          set: {
            customerId: agreement.customerId,
            amountCents,
            termMonths: agreement.termMonths,
            delivery: agreement.delivery,
            ownerName: agreement.ownerName,
            email: agreement.email,
            status: agreement.status,
            agreementCode: agreement.agreementCode,
            createdOn: agreement.createdOn,
            signedOn: agreement.signedOn,
            scale: agreement.scale,
            updatedAt: new Date(),
          },
        });
      if (agreement.watchIds.length) {
        await tx.insert(liveAgreementMembers).values(
          agreement.watchIds.map((timepieceId: string) => ({
            id: `${agreement.id}:${timepieceId}`,
            agreementId: agreement.id,
            timepieceId,
            status: agreement.memberStatus === "released" ? "released" : "live",
          })),
        );
      }
      if (!agreement.bookEnd) {
        await tx.delete(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, agreement.id));
      } else {
        const endCents = dollarsToCents(agreement.bookEnd.amount);
        if (endCents === null) {
          throw new Error("INVALID_DOLLAR_AMOUNT");
        }
        await tx
          .insert(liveAgreementEnds)
          .values({
            agreementId: agreement.id,
            kind: agreement.bookEnd.kind,
            endedOn: agreement.bookEnd.date,
            amountCents: endCents,
          })
          .onConflictDoUpdate({
            target: liveAgreementEnds.agreementId,
            set: {
              kind: agreement.bookEnd.kind,
              endedOn: agreement.bookEnd.date,
              amountCents: endCents,
            },
          });
      }
    }

    for (const preview of plan.previews) {
      await tx
        .insert(livePreviews)
        .values({
          id: preview.id,
          timepieceId: preview.timepieceId,
          kind: preview.kind,
          previewUrl: preview.previewUrl,
        })
        .onConflictDoUpdate({
          target: livePreviews.id,
          set: { previewUrl: preview.previewUrl, kind: preview.kind },
        });
    }
  });

  return plan;
}

export async function commitLivePreview(
  db: Database,
  actor: Actor,
  input: { timepieceId: string; previewUrl: string; kind?: string },
) {
  assertIsolation(isDeskActor(actor), "DESK_REQUIRED");
  if (liveBookFlagOn()) {
    throw new Error("LIVE_BOOK_FLAG_ON");
  }
  if (!input.timepieceId || !input.previewUrl) {
    throw new Error("PREVIEW_REQUIRED");
  }
  const id = `preview-${input.timepieceId}-legacy`;
  const [row] = await db
    .insert(livePreviews)
    .values({
      id,
      timepieceId: input.timepieceId,
      kind: input.kind ?? "legacy_preview",
      previewUrl: input.previewUrl,
    })
    .onConflictDoUpdate({
      target: livePreviews.id,
      set: { previewUrl: input.previewUrl, kind: input.kind ?? "legacy_preview" },
    })
    .returning();
  return row;
}
