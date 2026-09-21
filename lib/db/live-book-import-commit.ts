import { eq, inArray, sql } from "drizzle-orm";
import type { Database } from "./client";
import { liveBookFlagOn, planLiveBookImport } from "./live-book-import.mjs";
import { dollarsToCents } from "./money.mjs";
import {
  lockStaffForDeskMutation,
  writeDeskAudit,
} from "./staff-accounts";
import { asDeskActor, type Actor } from "./records";
import { assertIsolation, isDeskActor } from "./isolation.mjs";
import { isFixtureAppEnv } from "../env/live-book-flag.mjs";
import { canEditAppraisal, isDeskRole } from "../roles.mjs";
import { DEFAULT_TENANT_ID } from "../tenant.mjs";
import { allocateMemberIdIn } from "./tenants";
import {
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  staffAccounts,
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
  options: {
    confirmLiveImport?: boolean;
    env?: NodeJS.ProcessEnv;
    clientAddress?: string;
  } = {},
) {
  assertIsolation(isDeskActor(actor), "DESK_REQUIRED");
  if (liveBookFlagOn(options.env)) {
    throw new Error("LIVE_BOOK_FLAG_ON");
  }
  const plan = await db.transaction(async (tx) => {
    const desk = asDeskActor(actor);
    const auditActor = desk?.staffId
      ? await lockStaffForDeskMutation(tx, {
        id: desk.staffId,
        email: desk.email,
        role: desk.role,
      })
      : null;
    if (!auditActor && !isFixtureAppEnv((options.env ?? process.env).APP_ENV?.trim())) {
      throw new Error("SESSION_INVALID");
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mac-live-book-import'))`);
    const existingCustomers = await tx.select({ id: customers.id, email: customers.email }).from(customers);
    const existingTimepieces = await tx
      .select({ id: timepieces.id, customerId: timepieces.customerId })
      .from(timepieces);
    const existingAgreements = await tx
      .select({ id: liveAgreements.id, customerId: liveAgreements.customerId })
      .from(liveAgreements);
    const transactionPlan = planLiveBookImport(payload, {
      existingCustomers,
      existingTimepieces,
      existingAgreements,
      confirmLiveImport: options.confirmLiveImport,
      env: options.env,
    });
    if (!transactionPlan.ok) {
      throw new Error(transactionPlan.error || "IMPORT_REJECTED");
    }
    // An import that carries appraised status, eligibility, or dollars is a bulk
    // appraisal write, so it needs the same fence as timepiece.deskUpdate (R5).
    // The planner always emits `financeable`, so only a true value counts here.
    const carriesAppraisal = transactionPlan.timepieces.some((watch) => {
      const row = watch as Record<string, unknown>;
      return (
        row.status === "appraised" ||
        row.financeable === true ||
        (row.valueLow !== undefined && row.valueLow !== null) ||
        (row.valueHigh !== undefined && row.valueHigh !== null)
      );
    });
    if (carriesAppraisal && !canEditAppraisal(auditActor ?? actor)) {
      throw new Error("ROLE_FORBIDDEN");
    }
    const importedEmails = [...new Set(
      transactionPlan.customers.map((customer) => customer.email),
    )].sort();
    for (const email of importedEmails) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    }
    if (importedEmails.length) {
      const staffCollision = await tx.select({ id: staffAccounts.id })
        .from(staffAccounts)
        .where(inArray(staffAccounts.email, importedEmails))
        .limit(1);
      if (staffCollision.length) throw new Error("RESERVED_DESK_EMAIL");
    }
    for (const person of transactionPlan.customers) {
      const [existing] = await tx
        .select({ id: customers.id, memberId: customers.memberId })
        .from(customers)
        .where(eq(customers.id, person.id))
        .limit(1);
      const memberId = existing?.memberId ?? await allocateMemberIdIn(tx);
      await tx
        .insert(customers)
        .values({
          id: person.id,
          tenantId: DEFAULT_TENANT_ID,
          email: person.email,
          name: person.name,
          role: "collector",
          memberId,
        })
        .onConflictDoUpdate({
          target: customers.id,
          set: {
            email: person.email,
            name: person.name,
            memberId,
            updatedAt: new Date(),
          },
        });
    }

    for (const watch of transactionPlan.timepieces) {
      await tx
        .insert(timepieces)
        .values({
          id: watch.id,
          tenantId: DEFAULT_TENANT_ID,
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

    if (transactionPlan.agreements.length) {
      await tx.delete(liveAgreementMembers).where(
        inArray(
          liveAgreementMembers.agreementId,
          transactionPlan.agreements.map((agreement) => agreement.id),
        ),
      );
    }

    for (const agreement of transactionPlan.agreements) {
      const amountCents = dollarsToCents(agreement.amount);
      if (amountCents === null) {
        throw new Error("INVALID_DOLLAR_AMOUNT");
      }
      await tx
        .insert(liveAgreements)
        .values({
          id: agreement.id,
          tenantId: DEFAULT_TENANT_ID,
          customerId: agreement.customerId,
          amountCents,
          termMonths: agreement.termMonths,
          delivery: agreement.delivery,
          ownerName: agreement.ownerName,
          email: agreement.email,
          status: agreement.status,
          executedOn: agreement.executedOn,
          closeReason: agreement.closeReason,
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
            executedOn: agreement.executedOn,
            closeReason: agreement.closeReason,
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
            // The planner already decided whether the row holds its pieces and
            // how firmly; flattening reserved into live would hide a request.
            status: agreement.memberStatus,
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

    for (const preview of transactionPlan.previews) {
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
    await writeDeskAudit(
      tx,
      auditActor ?? {
        id: `development:${actor.email}`,
        email: actor.email,
        role: isDeskRole(actor.role) ? actor.role : "admin",
      },
      "live-book.import",
      "live-book",
      options.clientAddress ?? "unknown",
    );
    return transactionPlan;
  });

  return plan;
}

export async function commitLivePreview(
  db: Database,
  actor: Actor,
  input: { timepieceId: string; previewUrl: string; kind?: string },
  options: { clientAddress?: string; env?: NodeJS.ProcessEnv } = {},
) {
  assertIsolation(isDeskActor(actor), "DESK_REQUIRED");
  if (liveBookFlagOn()) {
    throw new Error("LIVE_BOOK_FLAG_ON");
  }
  if (!input.timepieceId || !input.previewUrl) {
    throw new Error("PREVIEW_REQUIRED");
  }
  const id = `preview-${input.timepieceId}-legacy`;
  return db.transaction(async (tx) => {
    const desk = asDeskActor(actor);
    const auditActor = desk?.staffId
      ? await lockStaffForDeskMutation(tx, {
        id: desk.staffId,
        email: desk.email,
        role: desk.role,
      })
      : null;
    if (!auditActor && !isFixtureAppEnv((options.env ?? process.env).APP_ENV?.trim())) {
      throw new Error("SESSION_INVALID");
    }
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mac-live-book-import'))`);
    const [row] = await tx
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
    await writeDeskAudit(
      tx,
      auditActor ?? {
        id: `development:${actor.email}`,
        email: actor.email,
        role: isDeskRole(actor.role) ? actor.role : "admin",
      },
      "live-preview.import",
      input.timepieceId,
      options.clientAddress ?? "unknown",
    );
    return row;
  });
}
