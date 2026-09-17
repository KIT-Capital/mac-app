import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Stage 1 compatibility probe. Not a product table. */
export const schemaProbe = pgTable("mac_schema_probe", {
  id: text("id").primaryKey(),
  label: text("label").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Collector party record. WorkOS subject stays null until identity is purchased. */
export const customers = pgTable("customers", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  phone: text("phone").notNull().default(""),
  role: text("role").notNull().default("collector"),
  status: text("status").notNull().default("active"),
  member: boolean("member").notNull().default(false),
  avatar: text("avatar").notNull().default(""),
  onboardingComplete: boolean("onboarding_complete").notNull().default(false),
  applicationSubmitted: boolean("application_submitted").notNull().default(false),
  promoCode: text("promo_code"),
  preferences: jsonb("preferences").notNull().default(sql`'{}'::jsonb`),
  workosSubject: text("workos_subject"),
  lastActive: timestamp("last_active", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Timepiece identity. Preview data URLs stay in the browser store until Stage 3. */
export const timepieces = pgTable(
  "timepieces",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    reference: text("reference"),
    serial: text("serial"),
    status: text("status").notNull().default("not_evaluated"),
    financeable: boolean("financeable").notNull().default(false),
    condition: text("condition").notNull().default(""),
    boxPapers: text("box_papers").notNull().default(""),
    caseMetal: text("case_metal").notNull().default(""),
    caseType: text("case_type").notNull().default(""),
    caseDiameter: text("case_diameter").notNull().default(""),
    dialColor: text("dial_color").notNull().default(""),
    buckle: text("buckle").notNull().default(""),
    band: text("band").notNull().default("strap"),
    bandMaterial: text("band_material").notNull().default(""),
    complication: text("complication").notNull().default(""),
    evaluatedAt: timestamp("evaluated_at", { withTimezone: true }),
    assetCode: text("asset_code"),
    valueLowCents: integer("value_low_cents"),
    valueHighCents: integer("value_high_cents"),
    provenance: text("provenance"),
    custody: text("custody"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("timepieces_customer_id_idx").on(table.customerId)],
);

/** Original object + optional thumbnail. Preview data URLs stay in the browser. */
export const photoObjects = pgTable(
  "photo_objects",
  {
    id: text("id").primaryKey(),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    kind: text("kind").notNull(),
    originalKey: text("original_key").notNull(),
    originalChecksum: text("original_checksum").notNull(),
    originalBytes: integer("original_bytes").notNull(),
    thumbnailKey: text("thumbnail_key"),
    thumbnailChecksum: text("thumbnail_checksum"),
    uploadedBy: text("uploaded_by").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("photo_objects_timepiece_id_idx").on(table.timepieceId),
    uniqueIndex("photo_objects_timepiece_checksum_uidx").on(table.timepieceId, table.originalChecksum),
  ],
);

/** Collector interest. Never executable. Desk prepare creates the agreement version. */
export const applications = pgTable(
  "applications",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    amountCents: integer("amount_cents").notNull(),
    termMonths: integer("term_months").notNull(),
    delivery: text("delivery").notNull().default(""),
    status: text("status").notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("applications_customer_id_idx").on(table.customerId)],
);

export const agreements = pgTable(
  "agreements",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    applicationId: text("application_id")
      .notNull()
      .references(() => applications.id),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    agreementCode: text("agreement_code").notNull(),
    status: text("status").notNull().default("draft"),
    currentVersionId: text("current_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agreements_application_id_uidx").on(table.applicationId),
    index("agreements_customer_id_idx").on(table.customerId),
  ],
);

export const agreementVersions = pgTable(
  "agreement_versions",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id),
    versionNumber: integer("version_number").notNull(),
    executable: boolean("executable").notNull().default(false),
    snapshot: jsonb("snapshot").notNull(),
    preparedBy: text("prepared_by").notNull(),
    preparedAt: timestamp("prepared_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("agreement_versions_agreement_version_uidx").on(table.agreementId, table.versionNumber),
    index("agreement_versions_agreement_id_idx").on(table.agreementId),
  ],
);

/** One live allocation per timepiece. Released rows stay for history. */
export const allocations = pgTable(
  "allocations",
  {
    id: text("id").primaryKey(),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id),
    status: text("status").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("allocations_timepiece_id_idx").on(table.timepieceId),
    uniqueIndex("allocations_live_timepiece_uidx")
      .on(table.timepieceId)
      .where(sql`${table.status} = 'live'`),
  ],
);

/** Signing adapter envelope. Sign-complete and archive-success are different states. */
export const signatureEnvelopes = pgTable(
  "signature_envelopes",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => agreements.id),
    agreementVersionId: text("agreement_version_id")
      .notNull()
      .references(() => agreementVersions.id),
    provider: text("provider").notNull().default("mock"),
    externalId: text("external_id").notNull(),
    status: text("status").notNull().default("sent"),
    collectorSignedAt: timestamp("collector_signed_at", { withTimezone: true }),
    macSignedAt: timestamp("mac_signed_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("signature_envelopes_external_id_uidx").on(table.externalId),
    uniqueIndex("signature_envelopes_version_id_uidx").on(table.agreementVersionId),
  ],
);

export const archivedDocuments = pgTable(
  "archived_documents",
  {
    id: text("id").primaryKey(),
    envelopeId: text("envelope_id")
      .notNull()
      .references(() => signatureEnvelopes.id),
    objectKey: text("object_key").notNull(),
    checksum: text("checksum").notNull(),
    bytes: integer("bytes").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("archived_documents_envelope_id_uidx").on(table.envelopeId)],
);

/** Frozen report. Never rewrites an archived signed PDF. */
export const reportSnapshots = pgTable(
  "report_snapshots",
  {
    id: text("id").primaryKey(),
    kind: text("kind").notNull(),
    agreementId: text("agreement_id").references(() => agreements.id),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    payload: jsonb("payload").notNull(),
    archiveChecksum: text("archive_checksum"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("report_snapshots_agreement_id_idx").on(table.agreementId)],
);

/**
 * Live collector/desk repo book. Separate from Stage 4 one-piece `agreements`.
 * Client string IDs survive. Open / past due stay derived; a recorded end wins.
 */
export const liveAgreements = pgTable(
  "live_agreements",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    amountCents: integer("amount_cents").notNull(),
    termMonths: integer("term_months").notNull(),
    delivery: text("delivery").notNull().default(""),
    ownerName: text("owner_name").notNull(),
    email: text("email").notNull(),
    status: text("status").notNull().default("pending_signature"),
    agreementCode: text("agreement_code"),
    createdOn: text("created_on").notNull(),
    signedOn: text("signed_on"),
    scale: jsonb("scale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("live_agreements_customer_id_idx").on(table.customerId)],
);

/** Membership of a timepiece on a live-book repo. Released rows stay for history. */
export const liveAgreementMembers = pgTable(
  "live_agreement_members",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => liveAgreements.id),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    status: text("status").notNull().default("live"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("live_agreement_members_agreement_id_idx").on(table.agreementId),
    uniqueIndex("live_agreement_members_agreement_timepiece_uidx").on(
      table.agreementId,
      table.timepieceId,
    ),
    uniqueIndex("live_agreement_members_live_timepiece_uidx")
      .on(table.timepieceId)
      .where(sql`${table.status} = 'live'`),
  ],
);

export const liveAgreementEnds = pgTable("live_agreement_ends", {
  agreementId: text("agreement_id")
    .primaryKey()
    .references(() => liveAgreements.id),
  kind: text("kind").notNull(),
  endedOn: text("ended_on").notNull(),
  amountCents: integer("amount_cents").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Labeled preview URL only. Never an original object key or JPEG jsonb. */
export const livePreviews = pgTable(
  "live_previews",
  {
    id: text("id").primaryKey(),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    kind: text("kind").notNull().default("legacy_preview"),
    previewUrl: text("preview_url").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("live_previews_timepiece_id_idx").on(table.timepieceId)],
);
