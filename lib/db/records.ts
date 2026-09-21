import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { DeskRole, RetailRole, WatchStatus } from "../types";
import { isRetailRole } from "../roles.mjs";
import { isReservedDeskEmail } from "../desk-identities.mjs";
import type { Database } from "./client";
import {
  assertIsolation,
  canReadCustomer,
  canReadTimepiece,
  canWriteTimepiece,
  isDeskActor,
} from "./isolation.mjs";
import { centsToDollars, dollarsToCents } from "./money.mjs";
import { DEFAULT_TENANT_ID } from "../tenant.mjs";
import { allocateMemberIdIn, customerEmailOnDefaultTenant } from "./tenants";
import { normalizeCollectorPhone, phoneDigits } from "../phone.mjs";
import { customers, timepieces } from "./schema";

const PHONE_DIGITS_SQL = sql`(
  CASE
    WHEN length(regexp_replace(${customers.phone}, '[^0-9]', '', 'g')) = 10
    THEN '1' || regexp_replace(${customers.phone}, '[^0-9]', '', 'g')
    ELSE regexp_replace(${customers.phone}, '[^0-9]', '', 'g')
  END
)`;

/**
 * Server actors. Retail is collector or dealer; desk never shares an email.
 */
export type Actor =
  | { role: RetailRole; customerId: string; email: string }
  | { role: DeskRole; email: string; staffId?: string; isMaster?: boolean };

export function isRetailActor(
  actor: Actor,
): actor is Extract<Actor, { role: RetailRole; customerId: string }> {
  return isRetailRole(actor.role);
}

const DEFAULT_PREFERENCES = {
  appearance: "dark",
  pushNotifications: true,
  emailUpdates: true,
  smsUpdates: false,
  whatsappUpdates: false,
  preferredContact: "email",
  language: "en",
};

export type RegisterCollectorInput = {
  email: string;
  name: string;
  phone?: string;
  role?: RetailRole;
};

export type TimepieceInput = {
  brand: string;
  model: string;
  reference?: string;
  serial?: string;
  status?: WatchStatus;
  financeable?: boolean;
  condition?: string;
  boxPapers?: string;
  caseMetal?: string;
  caseType?: string;
  caseDiameter?: string;
  dialColor?: string;
  buckle?: string;
  band?: "strap" | "bracelet";
  bandMaterial?: string;
  complication?: string;
  evaluatedAt?: string;
  assetCode?: string;
  valueLow?: number;
  valueHigh?: number;
  provenance?: string;
  custody?: string;
};

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function constraintName(error: unknown) {
  let current: unknown = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return null;
    if ("constraint" in current && typeof current.constraint === "string") {
      return current.constraint;
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return null;
}

function retailRoleOf(customer: { role?: string | null }): RetailRole {
  return isRetailRole(customer.role) ? customer.role : "collector";
}

function collectorActor(customer: typeof customers.$inferSelect): Actor {
  return { role: retailRoleOf(customer), customerId: customer.id, email: customer.email };
}

export function toRetailActor(customer: typeof customers.$inferSelect): Actor {
  return collectorActor(customer);
}

function requestedRetailRole(role?: string | null): RetailRole {
  return isRetailRole(role) ? role : "collector";
}

export async function registerCollector(db: Database, input: RegisterCollectorInput) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) {
    throw new Error("INVALID_EMAIL");
  }
  if (isReservedDeskEmail(email)) {
    throw new Error("RESERVED_DESK_EMAIL");
  }
  const role = requestedRetailRole(input.role);
  try {
    return await db.transaction(async (tx) => {
      const memberId = await allocateMemberIdIn(tx);
      const [row] = await tx
        .insert(customers)
        .values({
          id: randomUUID(),
          tenantId: DEFAULT_TENANT_ID,
          email,
          name: input.name.trim() || (role === "dealer" ? "Dealer" : "Collector"),
          phone: input.phone?.trim() ?? "",
          role,
          memberId,
          preferences: DEFAULT_PREFERENCES,
        })
        .returning();
      return row;
    });
  } catch (error) {
    if (constraintName(error) === "customers_tenant_email_uidx") {
      throw new Error("DUPLICATE_EMAIL");
    }
    throw error;
  }
}

export async function findCustomerByEmail(db: Database, emailInput: string) {
  const email = normalizeEmail(emailInput);
  if (!email.includes("@")) return null;
  const [row] = await db.select().from(customers).where(customerEmailOnDefaultTenant(email)).limit(1);
  return row ?? null;
}

export async function findCustomerByPhone(db: Database, phoneInput: string) {
  let digits: string;
  try {
    digits = phoneDigits(normalizeCollectorPhone(phoneInput));
  } catch {
    return null;
  }
  if (!digits) return null;
  const rows = await db.select().from(customers).where(and(
    eq(customers.tenantId, DEFAULT_TENANT_ID),
    sql`${PHONE_DIGITS_SQL} = ${digits}`,
  )).limit(2);
  if (rows.length !== 1) return null;
  return rows[0];
}

export async function activateInvitedCollector(
  db: Database,
  customerId: string,
  emailInput: string,
) {
  const email = normalizeEmail(emailInput);
  return db.transaction(async (tx) => {
    const [activated] = await tx.update(customers).set({
      status: "active",
      updatedAt: new Date(),
    }).where(and(
      eq(customers.id, customerId),
      customerEmailOnDefaultTenant(email),
      eq(customers.status, "invited"),
    )).returning();
    if (activated) return activated;
    const [existing] = await tx.select().from(customers).where(and(
      eq(customers.id, customerId),
      customerEmailOnDefaultTenant(email),
    )).limit(1);
    if (!existing) throw new Error("COLLECTOR_NOT_FOUND");
    if (existing.status !== "active") throw new Error("COLLECTOR_INACTIVE");
    return existing;
  });
}

export async function registerVerifiedCollector(
  db: Database,
  input: RegisterCollectorInput,
) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const phone = input.phone?.trim() ?? "";
  const role = requestedRetailRole(input.role);
  if (!email.includes("@")) throw new Error("INVALID_EMAIL");
  if (isReservedDeskEmail(email)) throw new Error("RESERVED_DESK_EMAIL");
  if (!name) throw new Error("NAME_REQUIRED");

  const [created] = await db.transaction(async (tx) => {
    const memberId = await allocateMemberIdIn(tx);
    return tx
      .insert(customers)
      .values({
        id: randomUUID(),
        tenantId: DEFAULT_TENANT_ID,
        email,
        name,
        phone,
        role,
        memberId,
        preferences: DEFAULT_PREFERENCES,
      })
      .onConflictDoNothing({ target: [customers.tenantId, customers.email] })
      .returning();
  });
  if (created) return created;

  const existing = await findCustomerByEmail(db, email);
  if (!existing) throw new Error("COLLECTOR_REGISTRATION_CONFLICT");
  if (existing.status !== "active") throw new Error("COLLECTOR_INACTIVE");
  return existing;
}

export async function getCustomer(db: Database, actor: Actor, customerId: string) {
  const [row] = await db.select().from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!row) return null;
  assertIsolation(canReadCustomer(actor, row.id));
  return row;
}

export async function listTimepieces(db: Database, actor: Actor, customerId: string) {
  assertIsolation(canReadTimepiece(actor, customerId));
  return db.select().from(timepieces).where(eq(timepieces.customerId, customerId));
}

export async function getTimepiece(db: Database, actor: Actor, timepieceId: string) {
  const [row] = await db.select().from(timepieces).where(eq(timepieces.id, timepieceId)).limit(1);
  if (!row) return null;
  assertIsolation(canReadTimepiece(actor, row.customerId));
  return row;
}

export async function createTimepiece(
  db: Database,
  actor: Actor,
  customerId: string,
  input: TimepieceInput,
) {
  assertIsolation(canWriteTimepiece(actor, customerId));
  const owner = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, customerId)).limit(1);
  if (!owner[0]) {
    throw new Error("CUSTOMER_NOT_FOUND");
  }
  if (!input.brand.trim() || !input.model.trim()) {
    throw new Error("TIMEPIECE_IDENTITY_REQUIRED");
  }
  const [row] = await db
    .insert(timepieces)
    .values({
      id: randomUUID(),
      tenantId: DEFAULT_TENANT_ID,
      customerId,
      brand: input.brand.trim(),
      model: input.model.trim(),
      reference: input.reference?.trim() || null,
      serial: input.serial?.trim() || null,
      status: input.status ?? "not_evaluated",
      financeable: input.financeable ?? false,
      condition: input.condition ?? "",
      boxPapers: input.boxPapers ?? "",
      caseMetal: input.caseMetal ?? "",
      caseType: input.caseType ?? "",
      caseDiameter: input.caseDiameter ?? "",
      dialColor: input.dialColor ?? "",
      buckle: input.buckle ?? "",
      band: input.band ?? "strap",
      bandMaterial: input.bandMaterial ?? "",
      complication: input.complication ?? "",
      evaluatedAt: input.evaluatedAt ? new Date(input.evaluatedAt) : null,
      assetCode: input.assetCode ?? null,
      valueLowCents: dollarsToCents(input.valueLow),
      valueHighCents: dollarsToCents(input.valueHigh),
      provenance: input.provenance ?? null,
      custody: input.custody ?? null,
    })
    .returning();
  return row;
}

export type DeskActorRecord = Extract<Actor, { role: DeskRole }>;

/** Type-narrowing twin of `isDeskActor` from `isolation.mjs`. */
export function asDeskActor(actor: Actor | null | undefined): DeskActorRecord | null {
  return actor && isDeskActor(actor) ? (actor as DeskActorRecord) : null;
}

export function toCollectorActor(customer: typeof customers.$inferSelect): Actor {
  return collectorActor(customer);
}

export function deskActor(
  role: DeskRole,
  email: string,
  staffId?: string,
  isMaster = false,
): Actor {
  if (!isDeskActor({ role, email })) {
    throw new Error("INVALID_DESK_ACTOR");
  }
  return { role, email, staffId, isMaster };
}

export function timepieceDollars(row: typeof timepieces.$inferSelect) {
  return {
    valueLow: centsToDollars(row.valueLowCents),
    valueHigh: centsToDollars(row.valueHighCents),
  };
}
