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
