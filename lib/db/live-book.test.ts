import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { ENDPOINT_BY_APP_ENV } from "../env/database-mapping.mjs";
import { evaluateDevelopmentMigration } from "../env/development-migration.mjs";
import { createDb } from "./client";
import { getLiveAgreement, insertLiveAgreement, insertLivePreview } from "./live-book";
import { createTimepiece, registerCollector, toCollectorActor } from "./records";
import {
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const createdCustomerIds: string[] = [];

describe("live-book migrate guard", () => {
  it("refuses staging and production migrate", () => {
    const staging = evaluateDevelopmentMigration({
      APP_ENV: "staging",
      NEON_BRANCH: "staging",
      DATABASE_URL_UNPOOLED: `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}.us-east-2.aws.neon.tech/neondb`,
    });
    const production = evaluateDevelopmentMigration({
      APP_ENV: "production",
      NEON_BRANCH: "production",
      DATABASE_URL_UNPOOLED: `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}.us-east-2.aws.neon.tech/neondb`,
    });
    assert.equal(staging.ok, false);
    assert.ok(staging.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
    assert.equal(production.ok, false);
    assert.ok(production.errors.includes("PRODUCTION_MIGRATION_NOT_ALLOWED"));
    assert.ok(production.errors.includes("DEVELOPMENT_MIGRATION_ONLY"));
  });
});

describe("live book tables", { skip }, () => {
  const db = createDb();

  after(async () => {
    if (createdCustomerIds.length === 0) return;
    const pieceIds = (
      await db
        .select({ id: timepieces.id })
        .from(timepieces)
        .where(inArray(timepieces.customerId, createdCustomerIds))
    ).map((row) => row.id);
    if (pieceIds.length > 0) {
      await db.delete(livePreviews).where(inArray(livePreviews.timepieceId, pieceIds));
      await db.delete(liveAgreementMembers).where(inArray(liveAgreementMembers.timepieceId, pieceIds));
    }
    const agreementIds = (
      await db
        .select({ id: liveAgreements.id })
        .from(liveAgreements)
        .where(inArray(liveAgreements.customerId, createdCustomerIds))
    ).map((row) => row.id);
    if (agreementIds.length > 0) {
      await db.delete(liveAgreementEnds).where(inArray(liveAgreementEnds.agreementId, agreementIds));
    }
    await db.delete(liveAgreements).where(inArray(liveAgreements.customerId, createdCustomerIds));
    await db.delete(timepieces).where(inArray(timepieces.customerId, createdCustomerIds));
    await db.delete(customers).where(inArray(customers.id, createdCustomerIds));
  });

  it("inserts a Hale-shaped repo with two watch ids and no application", async () => {
    const customer = await registerCollector(db, {
      email: `hale-live.${suffix}@mac.test`,
      name: "Jonathan Hale",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const first = await createTimepiece(db, actor, customer.id, {
      brand: "Richard Mille",
      model: "RM 011",
    });
    const second = await createTimepiece(db, actor, customer.id, {
      brand: "Patek Philippe",
      model: "Nautilus",
    });
    const agreement = await insertLiveAgreement(db, {
      id: `agr-live-${suffix}`,
      customerId: customer.id,
      watchIds: [first.id, second.id],
      amount: 200000,
      termMonths: 12,
      delivery: "Desk arranges intake",
      ownerName: "Jonathan Hale",
      email: customer.email,
      createdOn: "2021-03-14",
      agreementCode: "MAC-31419",
    });
    assert.equal(agreement?.id, `agr-live-${suffix}`);
    assert.equal(agreement?.amountCents, 20000000);
    assert.equal(agreement?.createdOn, "2021-03-14");
    const loaded = await getLiveAgreement(db, agreement.id);
    assert.equal(loaded?.createdOn, "2021-03-14");
    assert.deepEqual(loaded?.watchIds.sort(), [first.id, second.id].sort());
    assert.equal(loaded?.bookEnd, null);
    assert.equal("applicationId" in (loaded ?? {}), false);
  });

  it("stores a preview URL without an original key", async () => {
    const customer = await registerCollector(db, {
      email: `preview-live.${suffix}@mac.test`,
      name: "Preview Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Audemars Piguet",
      model: "Royal Oak",
    });
    const preview = await insertLivePreview(db, {
      timepieceId: piece.id,
      previewUrl: "https://example.test/legacy-preview/royal-oak.jpg",
      kind: "legacy_preview",
    });
    assert.equal(preview.previewUrl, "https://example.test/legacy-preview/royal-oak.jpg");
    assert.equal(preview.kind, "legacy_preview");
    assert.equal("originalKey" in preview, false);
  });

  it("allows only one live membership per timepiece", async () => {
    const customer = await registerCollector(db, {
      email: `exclusive-live.${suffix}@mac.test`,
      name: "Exclusive Collector",
    });
    createdCustomerIds.push(customer.id);
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Richard Mille",
      model: "RM 011",
    });
    await insertLiveAgreement(db, {
      id: `agr-live-a-${suffix}`,
      customerId: customer.id,
      watchIds: [piece.id],
      amount: 200000,
      termMonths: 12,
      delivery: "Desk arranges intake",
      ownerName: "Exclusive Collector",
      email: customer.email,
      createdOn: "2021-03-14",
    });
    await assert.rejects(
      () =>
        insertLiveAgreement(db, {
          id: `agr-live-b-${suffix}`,
          customerId: customer.id,
          watchIds: [piece.id],
          amount: 180000,
          termMonths: 12,
          delivery: "Desk arranges intake",
          ownerName: "Exclusive Collector",
          email: customer.email,
          createdOn: "2026-09-17",
        }),
      { message: "LIVE_WATCH_CONFLICT" },
    );
  });
});
