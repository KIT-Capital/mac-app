import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
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

export const collectorAccessTokens = pgTable(
  "collector_access_tokens",
  {
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    customerId: text("customer_id").references(() => customers.id, { onDelete: "cascade" }),
    registrationPayload: jsonb("registration_payload"),
    purpose: text("purpose").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    sendStatus: text("send_status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("collector_access_tokens_customer_id_idx").on(table.customerId),
    index("collector_access_tokens_expires_at_idx").on(table.expiresAt),
    check(
      "collector_access_tokens_purpose_check",
      sql`${table.purpose} in ('login', 'register')`,
    ),
    check(
      "collector_access_tokens_send_status_check",
      sql`${table.sendStatus} in ('pending', 'sent', 'send_failed')`,
    ),
    check(
      "collector_access_tokens_payload_check",
      sql`(
        (${table.purpose} = 'login' and ${table.customerId} is not null and ${table.registrationPayload} is null)
        or
        (
          ${table.purpose} = 'register'
          and ${table.customerId} is null
          and (
            (${table.consumedAt} is null and ${table.registrationPayload} is not null)
            or
            (${table.consumedAt} is not null and ${table.registrationPayload} is null)
          )
        )
      )`,
    ),
  ],
);

export const collectorSessions = pgTable(
  "collector_sessions",
  {
    id: text("id").primaryKey(),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("collector_sessions_customer_id_idx").on(table.customerId),
    index("collector_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const accessRateLimits = pgTable(
  "access_rate_limits",
  {
    scope: text("scope").notNull(),
    keyHash: text("key_hash").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    hits: integer("hits").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.scope, table.keyHash, table.windowStart] }),
    index("access_rate_limits_window_start_idx").on(table.windowStart),
    check("access_rate_limits_hits_check", sql`${table.hits} > 0`),
  ],
);

export const staffAccounts = pgTable(
  "staff_accounts",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    /** Null until the person sets their first password (seeded desk people). */
    passwordHash: text("password_hash"),
    passwordSalt: text("password_salt"),
    passwordParams: jsonb("password_params"),
    role: text("role").notNull(),
    /** Exactly one row: the master super admin (`lib/roles.mjs`). */
    isMaster: boolean("is_master").notNull().default(false),
    mustRotate: boolean("must_rotate").notNull().default(true),
    passwordSetAt: timestamp("password_set_at", { withTimezone: true }),
    sessionValidAfter: timestamp("session_valid_after", { withTimezone: true })
      .notNull()
      .default(sql`'epoch'::timestamptz`),
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("staff_accounts_role_check", sql`${table.role} in ('admin', 'appraiser', 'super_admin')`),
    check("staff_accounts_email_lower_check", sql`${table.email} = lower(${table.email})`),
    check("staff_accounts_name_check", sql`length(${table.name}) > 0`),
    check("staff_accounts_hash_check", sql`length(${table.passwordHash}) > 0`),
    check("staff_accounts_salt_check", sql`length(${table.passwordSalt}) > 0`),
    check(
      "staff_accounts_params_check",
      sql`
        (${table.passwordParams}->>'N')::integer = 131072
        and (${table.passwordParams}->>'r')::integer = 8
        and (${table.passwordParams}->>'p')::integer = 1
        and (${table.passwordParams}->>'keyLength')::integer = 64
      `,
    ),
    check("staff_accounts_password_set_check", sql`
      (${table.passwordHash} is null and ${table.passwordSalt} is null and ${table.passwordParams} is null and ${table.passwordSetAt} is null)
      or (${table.passwordHash} is not null and ${table.passwordSalt} is not null and ${table.passwordParams} is not null and ${table.passwordSetAt} is not null)
    `),
    check("staff_accounts_master_role_check", sql`${table.isMaster} = false or ${table.role} = 'super_admin'`),
    uniqueIndex("staff_accounts_master_uidx")
      .on(table.isMaster)
      .where(sql`${table.isMaster} = true`),
    index("staff_accounts_disabled_at_idx").on(table.disabledAt),
  ],
);

export const deskAuditLog = pgTable(
  "desk_audit_log",
  {
    id: text("id").primaryKey(),
    actorEmail: text("actor_email").notNull(),
    actorRole: text("actor_role").notNull(),
    action: text("action").notNull(),
    targetId: text("target_id"),
    clientAddress: text("client_address").notNull(),
    detail: jsonb("detail").notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("desk_audit_log_created_at_idx").on(table.createdAt),
    index("desk_audit_log_actor_email_idx").on(table.actorEmail),
    // 'staff' stays valid for rows written before the 2026-09-19 roles migration.
    check("desk_audit_log_actor_role_check", sql`${table.actorRole} in ('staff', 'admin', 'appraiser', 'super_admin')`),
    check("desk_audit_log_client_address_check", sql`length(${table.clientAddress}) > 0`),
  ],
);

/** Shared live desk pricing and custody settings. Exactly one row may exist. */
export const deskSettings = pgTable(
  "desk_settings",
  {
    id: text("id").primaryKey(),
    maxLtvBps: integer("max_ltv_bps").notNull(),
    startingRateBps: integer("starting_rate_bps").notNull(),
    setupFeeBps: integer("setup_fee_bps").notNull(),
    earlyRepurchaseAmountBps: integer("early_repurchase_amount_bps").notNull(),
    brokerFeeBps: integer("broker_fee_bps").notNull(),
    minMonths: integer("min_months").notNull(),
    earlyStartMonth: integer("early_start_month").notNull(),
    earlyUntilMonth: integer("early_until_month").notNull(),
    typicalTerm: integer("typical_term").notNull(),
    membershipMonthlyCents: integer("membership_monthly_cents").notNull(),
    /** Floor for a repo request. Below it the desk declines instead of pricing. */
    minSaleAmountCents: integer("min_sale_amount_cents").notNull().default(100000),
    vaultLocation: text("vault_location").notNull(),
    requiredPhotoKinds: text("required_photo_kinds")
      .array()
      .notNull()
      .default(sql`'{"front","back","left","right","clasp"}'::text[]`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "desk_settings_required_photo_kinds_check",
      sql`${table.requiredPhotoKinds} @> '{"front","back","left","right","clasp"}'::text[]`,
    ),
    check("desk_settings_singleton_check", sql`${table.id} = 'default'`),
    check(
      "desk_settings_min_sale_check",
      sql`${table.minSaleAmountCents} > 0 and ${table.minSaleAmountCents} <= 2147483647`,
    ),
    check("desk_settings_max_ltv_check", sql`${table.maxLtvBps} > 0 and ${table.maxLtvBps} <= 6000`),
    check("desk_settings_money_check", sql`
      ${table.startingRateBps} >= 1850
      and ${table.startingRateBps} <= 10000
      and ${table.setupFeeBps} >= 100
      and ${table.setupFeeBps} <= 10000
      and ${table.earlyRepurchaseAmountBps} >= 350
      and ${table.earlyRepurchaseAmountBps} <= 10000
      and ${table.brokerFeeBps} >= 350
      and ${table.brokerFeeBps} <= 10000
      and ${table.membershipMonthlyCents} between 0 and 2147483647
    `),
    check("desk_settings_terms_check", sql`
      ${table.minMonths} > 0
      and ${table.earlyStartMonth} > 0
      and ${table.earlyUntilMonth} > 0
      and ${table.typicalTerm} > 0
      and ${table.minMonths} <= ${table.typicalTerm}
      and ${table.earlyStartMonth} < ${table.earlyUntilMonth}
      and ${table.earlyUntilMonth} <= ${table.typicalTerm}
    `),
  ],
);

/** Shared desk appraisal references. Empty is a valid live catalog. */
export const catalogReferences = pgTable(
  "catalog_references",
  {
    id: text("id").primaryKey(),
    brand: text("brand").notNull(),
    model: text("model").notNull(),
    reference: text("reference").notNull().default(""),
    caseMetal: text("case_metal").notNull().default(""),
    caseDiameter: text("case_diameter").notNull().default(""),
    typicalLowCents: integer("typical_low_cents").notNull(),
    typicalHighCents: integer("typical_high_cents").notNull(),
    financeable: boolean("financeable").notNull().default(false),
    notes: text("notes").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("catalog_references_values_check", sql`
      ${table.typicalLowCents} >= 0
      and ${table.typicalHighCents} >= ${table.typicalLowCents}
      and ${table.typicalHighCents} <= 2147483647
    `),
  ],
);

/** Shared agreement shells used to derive new live agreement scales. */
export const agreementShells = pgTable(
  "agreement_shells",
  {
    id: text("id").primaryKey(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    termMonths: integer("term_months").notNull(),
    rateBps: integer("rate_bps").notNull(),
    ltvBps: integer("ltv_bps").notNull(),
    setupFeeBps: integer("setup_fee_bps").notNull(),
    earlyRepurchaseAmountBps: integer("early_repurchase_amount_bps").notNull(),
    brokerFeeBps: integer("broker_fee_bps").notNull(),
    minMonths: integer("min_months").notNull(),
    earlyStartMonth: integer("early_start_month").notNull(),
    earlyUntilMonth: integer("early_until_month").notNull(),
    status: text("status").notNull(),
    createdOn: text("created_on").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("agreement_shells_status_check", sql`${table.status} in ('open', 'assigned', 'closed')`),
    uniqueIndex("agreement_shells_open_uidx")
      .on(table.status)
      .where(sql`${table.status} = 'open'`),
    check("agreement_shells_ltv_check", sql`${table.ltvBps} > 0 and ${table.ltvBps} <= 6000`),
    check("agreement_shells_money_check", sql`
      ${table.rateBps} >= 1850
      and ${table.rateBps} <= 10000
      and ${table.setupFeeBps} >= 100
      and ${table.setupFeeBps} <= 10000
      and ${table.earlyRepurchaseAmountBps} >= 350
      and ${table.earlyRepurchaseAmountBps} <= 10000
      and ${table.brokerFeeBps} >= 350
      and ${table.brokerFeeBps} <= 10000
    `),
    check("agreement_shells_terms_check", sql`
      ${table.termMonths} > 0
      and ${table.minMonths} > 0
      and ${table.earlyStartMonth} > 0
      and ${table.earlyUntilMonth} > 0
      and ${table.minMonths} <= ${table.termMonths}
      and ${table.earlyStartMonth} < ${table.earlyUntilMonth}
      and ${table.earlyUntilMonth} <= ${table.termMonths}
    `),
  ],
);

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

/** Direct-upload original and preview metadata. No image bytes enter the server. */
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
    contentType: text("content_type"),
    previewKey: text("preview_key"),
    previewChecksum: text("preview_checksum"),
    previewBytes: integer("preview_bytes"),
    previewContentType: text("preview_content_type"),
    status: text("status").notNull().default("stored"),
    thumbnailKey: text("thumbnail_key"),
    thumbnailChecksum: text("thumbnail_checksum"),
    uploadedBy: text("uploaded_by").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "photo_objects_status_check",
      sql`${table.status} in ('pending', 'stored', 'abandoned')`,
    ),
    index("photo_objects_timepiece_id_idx").on(table.timepieceId),
    uniqueIndex("photo_objects_timepiece_checksum_uidx")
      .on(table.timepieceId, table.originalChecksum)
      .where(sql`${table.status} <> 'abandoned' and ${table.previewKey} is not null`),
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
    /** The day the repo went on the book. The term clock starts here (KTD7). */
    executedOn: text("executed_on"),
    deliveredOn: text("delivered_on"),
    /** Bumped whenever the amount or the pieces change (KTD6). */
    version: integer("version").notNull().default(1),
    lastActionAt: timestamp("last_action_at", { withTimezone: true }).notNull().defaultNow(),
    closeReason: text("close_reason"),
    /** Desk-only handling flag; never serialized to a retail reader (KTD22). */
    customerSuccess: boolean("customer_success").notNull().default(false),
    paymentReference: text("payment_reference"),
    /** Per-piece caps frozen at Apply so a later appraisal never reprices it. */
    pieceCaps: jsonb("piece_caps"),
    scale: jsonb("scale"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("live_agreements_customer_id_idx").on(table.customerId),
    index("live_agreements_status_idx").on(table.status),
    check(
      "live_agreements_status_check",
      sql`${table.status} in (
        'submitted', 'returned', 'collector_signed', 'inspecting', 'executed', 'closed',
        'draft', 'pending_signature', 'signed'
      )`,
    ),
    // A repo is on the book exactly when it carries the day it went there.
    // Anything that moves a row across this line must set both in one
    // statement, which is why the backfill never lands a date on its own.
    check(
      "live_agreements_executed_shape_check",
      sql`(${table.status} = 'executed') = (${table.executedOn} is not null)`,
    ),
    check(
      "live_agreements_closed_shape_check",
      sql`(${table.status} = 'closed') = (${table.closeReason} is not null)`,
    ),
    check(
      "live_agreements_close_reason_check",
      sql`${table.closeReason} is null or ${table.closeReason} in (
        'declined_by_desk', 'declined_by_collector', 'withdrawn', 'expired'
      )`,
    ),
    check("live_agreements_version_check", sql`${table.version} >= 1`),
    // The term clock is computed from this day, so it has to be one. The
    // backfill closes any row it cannot date; writes are held to the same bar.
    // Written as a character class, not `\d`: a backslash does not survive the
    // template literal into the generated SQL, and the regex would then match
    // the letter d and reject every real date.
    check(
      "live_agreements_executed_on_check",
      sql`${table.executedOn} is null or ${table.executedOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
    check(
      "live_agreements_delivered_on_check",
      sql`${table.deliveredOn} is null or ${table.deliveredOn} ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'`,
    ),
  ],
);

/**
 * The request thread: one row per state change, in the order it happened.
 * Append-only — a corrected record is a new event, never an edited one.
 */
export const agreementEvents = pgTable(
  "agreement_events",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => liveAgreements.id),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id"),
    action: text("action").notNull(),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    amountCents: integer("amount_cents"),
    version: integer("version").notNull(),
    note: text("note").notNull().default(""),
    /** Desk-only events never reach the retail thread (KTD22). */
    internal: boolean("internal").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agreement_events_agreement_id_idx").on(table.agreementId),
    index("agreement_events_created_at_idx").on(table.createdAt),
    check(
      "agreement_events_actor_kind_check",
      sql`${table.actorKind} in ('retail', 'desk', 'system')`,
    ),
    check("agreement_events_note_check", sql`length(${table.note}) <= 1000`),
    check("agreement_events_version_check", sql`${table.version} >= 1`),
  ],
);

/**
 * Signature evidence. A signature binds to the exact document the signer was
 * shown, through `document_id` plus that row's snapshot hash (KTD10), so it can
 * never be read as approval of a version the signer never saw.
 */
export const agreementSignatures = pgTable(
  "agreement_signatures",
  {
    id: text("id").primaryKey(),
    agreementId: text("agreement_id")
      .notNull()
      .references(() => liveAgreements.id),
    version: integer("version").notNull(),
    party: text("party").notNull(),
    signerId: text("signer_id"),
    typedName: text("typed_name").notNull(),
    documentId: text("document_id").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    clientAddress: text("client_address"),
    /** Browser signatures are demo data and are labeled as such (KTD24). */
    book: text("book").notNull().default("live"),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("agreement_signatures_agreement_id_idx").on(table.agreementId),
    uniqueIndex("agreement_signatures_agreement_version_party_uidx").on(
      table.agreementId,
      table.version,
      table.party,
    ),
    // The document must belong to this agreement, not merely exist.
    foreignKey({
      columns: [table.documentId, table.agreementId],
      foreignColumns: [agreementDocuments.id, agreementDocuments.liveAgreementId],
      name: "agreement_signatures_document_fk",
    }),
    check("agreement_signatures_party_check", sql`${table.party} in ('collector', 'mac')`),
    check("agreement_signatures_book_check", sql`${table.book} in ('live', 'browser')`),
    check("agreement_signatures_version_check", sql`${table.version} >= 1`),
  ],
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
    // A piece sits on at most one request or repo at a time: reserving it for a
    // request holds it just as firmly as executing one does (R19, KTD6).
    uniqueIndex("live_agreement_members_held_timepiece_uidx")
      .on(table.timepieceId)
      .where(sql`${table.status} in ('reserved', 'live')`),
    check(
      "live_agreement_members_status_check",
      sql`${table.status} in ('reserved', 'live', 'released')`,
    ),
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

/** Legacy URL or reference to a stored photo preview. */
export const livePreviews = pgTable(
  "live_previews",
  {
    id: text("id").primaryKey(),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    kind: text("kind").notNull().default("legacy_preview"),
    previewUrl: text("preview_url"),
    photoObjectId: text("photo_object_id").references(() => photoObjects.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("live_previews_timepiece_id_idx").on(table.timepieceId)],
);

/**
 * One immutable retail submission plus its evolving desk decision.
 * Returned submissions keep their snapshot but do not receive a decision number.
 */
export const appraisalAttempts = pgTable(
  "appraisal_attempts",
  {
    id: text("id").primaryKey(),
    timepieceId: text("timepiece_id")
      .notNull()
      .references(() => timepieces.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    attemptNo: integer("attempt_no").notNull(),
    decisionNo: integer("decision_no"),
    status: text("status").notNull().default("under_review"),
    note: text("note").notNull().default(""),
    responseNote: text("response_note"),
    snapshot: jsonb("snapshot").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }).notNull().defaultNow(),
    /** Null only inside the submit transaction while evidence rows are inserted. */
    evidenceSealedAt: timestamp("evidence_sealed_at", { withTimezone: true }),
    decidedByStaffId: text("decided_by_staff_id").references(() => staffAccounts.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    valueCents: integer("value_cents"),
    rangeLowCents: integer("range_low_cents"),
    rangeHighCents: integer("range_high_cents"),
    finalizedAt: timestamp("finalized_at", { withTimezone: true }),
    finalizedByStaffId: text("finalized_by_staff_id").references(() => staffAccounts.id),
    finalizedAgreementId: text("finalized_agreement_id").references(() => liveAgreements.id),
    reopenedCount: integer("reopened_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "appraisal_attempts_status_check",
      sql`${table.status} in ('under_review', 'returned', 'accepted', 'refused')`,
    ),
    check("appraisal_attempts_attempt_no_check", sql`${table.attemptNo} between 1 and 2147483647`),
    check(
      "appraisal_attempts_decision_no_check",
      sql`${table.decisionNo} is null or ${table.decisionNo} between 1 and 3`,
    ),
    check("appraisal_attempts_reopened_count_check", sql`${table.reopenedCount} >= 0`),
    check("appraisal_attempts_note_check", sql`length(${table.note}) <= 256`),
    check(
      "appraisal_attempts_response_note_check",
      sql`
        (
          ${table.status} = 'returned'
          and ${table.responseNote} is not null
          and length(${table.responseNote}) between 1 and 1000
        )
        or (
          ${table.status} <> 'returned'
          and ${table.responseNote} is null
        )
      `,
    ),
    check(
      "appraisal_attempts_finalization_shape_check",
      sql`
        (
          ${table.finalizedAt} is null
          and ${table.finalizedByStaffId} is null
          and ${table.finalizedAgreementId} is null
        )
        or (
          ${table.status} = 'accepted'
          and ${table.finalizedAt} is not null
          and ${table.finalizedByStaffId} is not null
          and ${table.finalizedAgreementId} is not null
        )
      `,
    ),
    check(
      "appraisal_attempts_decision_shape_check",
      sql`
        (
          ${table.status} in ('under_review', 'returned')
          and (
            (
              ${table.decisionNo} is null
              and ${table.decidedByStaffId} is null
              and ${table.decidedAt} is null
              and ${table.valueCents} is null
              and ${table.rangeLowCents} is null
              and ${table.rangeHighCents} is null
            )
            or (
              ${table.status} = 'under_review'
              and ${table.decisionNo} is not null
              and ${table.decidedByStaffId} is not null
              and ${table.decidedAt} is not null
              and (
                (
                  ${table.valueCents} is not null
                  and ${table.rangeLowCents} is not null
                  and ${table.rangeHighCents} is not null
                  and ${table.valueCents} >= 0
                  and ${table.rangeLowCents} >= 0
                  and ${table.rangeHighCents} >= ${table.rangeLowCents}
                )
                or (
                  ${table.valueCents} is null
                  and ${table.rangeLowCents} is null
                  and ${table.rangeHighCents} is null
                )
              )
            )
          )
        )
        or (
          ${table.status} = 'accepted'
          and ${table.decisionNo} is not null
          and ${table.decidedByStaffId} is not null
          and ${table.decidedAt} is not null
          and ${table.valueCents} is not null
          and ${table.rangeLowCents} is not null
          and ${table.rangeHighCents} is not null
          and ${table.valueCents} >= 0
          and ${table.rangeLowCents} >= 0
          and ${table.rangeHighCents} >= ${table.rangeLowCents}
        )
        or (
          ${table.status} = 'refused'
          and ${table.decisionNo} is not null
          and ${table.decidedByStaffId} is not null
          and ${table.decidedAt} is not null
          and ${table.valueCents} is null
          and ${table.rangeLowCents} is null
          and ${table.rangeHighCents} is null
        )
      `,
    ),
    uniqueIndex("appraisal_attempts_timepiece_attempt_uidx").on(
      table.timepieceId,
      table.attemptNo,
    ),
    uniqueIndex("appraisal_attempts_timepiece_decision_uidx")
      .on(table.timepieceId, table.decisionNo)
      .where(sql`${table.decisionNo} is not null`),
    uniqueIndex("appraisal_attempts_open_timepiece_uidx")
      .on(table.timepieceId)
      .where(sql`${table.status} = 'under_review'`),
    index("appraisal_attempts_customer_id_idx").on(table.customerId),
    index("appraisal_attempts_decided_by_staff_id_idx").on(table.decidedByStaffId),
    index("appraisal_attempts_finalized_by_staff_id_idx").on(table.finalizedByStaffId),
    index("appraisal_attempts_finalized_agreement_id_idx").on(table.finalizedAgreementId),
  ],
);

/** Exact stored photo evidence frozen with one appraisal submission. */
export const appraisalAttemptPhotos = pgTable(
  "appraisal_attempt_photos",
  {
    attemptId: text("attempt_id")
      .notNull()
      .references(() => appraisalAttempts.id),
    photoObjectId: text("photo_object_id")
      .notNull()
      .references(() => photoObjects.id),
    originalKey: text("original_key").notNull(),
    originalChecksum: text("original_checksum").notNull(),
    kind: text("kind").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.attemptId, table.photoObjectId] }),
    uniqueIndex("appraisal_attempt_photos_attempt_kind_uidx").on(table.attemptId, table.kind),
    index("appraisal_attempt_photos_photo_object_id_idx").on(table.photoObjectId),
  ],
);

/** Frozen unsigned agreement PDF metadata. Not the signed archive table. */
export const agreementDocuments = pgTable(
  "agreement_documents",
  {
    id: text("id").primaryKey(),
    liveAgreementId: text("live_agreement_id")
      .notNull()
      .references(() => liveAgreements.id),
    customerId: text("customer_id")
      .notNull()
      .references(() => customers.id),
    version: integer("version").notNull(),
    supersedesDocumentId: text("supersedes_document_id").references((): AnyPgColumn => agreementDocuments.id),
    templateVersion: text("template_version").notNull(),
    status: text("status").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    snapshotHash: text("snapshot_hash").notNull(),
    objectKey: text("object_key"),
    checksum: text("checksum"),
    bytes: integer("bytes"),
    failureCode: text("failure_code"),
    /** Which step of the request this PDF records (KTD11). */
    stage: text("stage").notNull().default("legacy"),
    createdByKind: text("created_by_kind").notNull(),
    createdById: text("created_by_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    storedAt: timestamp("stored_at", { withTimezone: true }),
  },
  (table) => [
    index("agreement_documents_customer_id_idx").on(table.customerId),
    index("agreement_documents_live_agreement_id_idx").on(table.liveAgreementId),
    // The Stage 4 contract path numbers one document per version and retries on
    // this name when two renders race, so it keeps its rule over its own rows.
    uniqueIndex("agreement_documents_live_version_uidx")
      .on(table.liveAgreementId, table.version)
      .where(sql`${table.stage} = 'legacy'`),
    // One usable PDF per version per stage. A failed render is excluded so a
    // fresh attempt can reuse the same key.
    uniqueIndex("agreement_documents_stage_uidx")
      .on(table.liveAgreementId, table.version, table.stage)
      .where(sql`${table.stage} <> 'legacy' and ${table.status} <> 'failed'`),
    // Lets a signature's composite foreign key prove the document is this
    // agreement's own (KTD10).
    uniqueIndex("agreement_documents_id_agreement_uidx").on(table.id, table.liveAgreementId),
    check(
      "agreement_documents_stage_check",
      sql`${table.stage} in ('proposal', 'collector_signed', 'executed', 'legacy')`,
    ),
  ],
);

/** Email attempts for a stored agreement PDF. Filled in the mail unit. */
export const agreementDocumentSends = pgTable(
  "agreement_document_sends",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id")
      .notNull()
      .references(() => agreementDocuments.id),
    actorKind: text("actor_kind").notNull(),
    actorId: text("actor_id").notNull(),
    recipientEmail: text("recipient_email").notNull(),
    recipientKind: text("recipient_kind").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    providerMessageId: text("provider_message_id"),
    result: text("result").notNull(),
    failureCode: text("failure_code"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("agreement_document_sends_document_id_idx").on(table.documentId)],
);
