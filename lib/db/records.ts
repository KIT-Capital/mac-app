import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { WatchStatus } from "../types";
import type { Database } from "./client";
import {
  assertIsolation,
  canReadCustomer,
  canReadTimepiece,
  canWriteTimepiece,
  isDeskActor,
} from "./isolation.mjs";
import { centsToDollars, dollarsToCents } from "./money.mjs";
import { customers, timepieces } from "./schema";

export type Actor =
  | { role: "collector"; customerId: string; email: string }
  | { role: "staff" | "admin"; email: string };

const DESK_EMAILS = new Set(["admin@mechartcap.com", "desk@mechartcap.com"]);

const DEFAULT_PREFERENCES = {
  appearance: "dark",
  pushNotifications: true,
  emailUpdates: true,
  smsUpdates: false,
  preferredContact: "email",
  language: "en",
};

export type RegisterCollectorInput = {
  email: string;
  name: string;
  phone?: string;
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

function collectorActor(customer: typeof customers.$inferSelect): Actor {
  return { role: "collector", customerId: customer.id, email: customer.email };
}

export async function registerCollector(db: Database, input: RegisterCollectorInput) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) {
    throw new Error("INVALID_EMAIL");
  }
  if (DESK_EMAILS.has(email)) {
    throw new Error("RESERVED_DESK_EMAIL");
  }
  const [row] = await db
    .insert(customers)
    .values({
      id: randomUUID(),
      email,
      name: input.name.trim() || "Collector",
      phone: input.phone?.trim() ?? "",
      role: "collector",
      preferences: DEFAULT_PREFERENCES,
    })
    .returning();
  return row;
}

export async function findCustomerByEmail(db: Database, emailInput: string) {
  const email = normalizeEmail(emailInput);
  if (!email.includes("@")) return null;
  const [row] = await db.select().from(customers).where(eq(customers.email, email)).limit(1);
  return row ?? null;
}

export async function registerVerifiedCollector(
  db: Database,
  input: RegisterCollectorInput,
) {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  const phone = input.phone?.trim() ?? "";
  if (!email.includes("@")) throw new Error("INVALID_EMAIL");
  if (DESK_EMAILS.has(email)) throw new Error("RESERVED_DESK_EMAIL");
  if (!name) throw new Error("NAME_REQUIRED");

  const [created] = await db
    .insert(customers)
    .values({
      id: randomUUID(),
      email,
      name,
      phone,
      role: "collector",
      preferences: DEFAULT_PREFERENCES,
    })
    .onConflictDoNothing({ target: customers.email })
    .returning();
  if (created) return created;

  const existing = await findCustomerByEmail(db, email);
  if (!existing) throw new Error("COLLECTOR_REGISTRATION_CONFLICT");
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

export function toCollectorActor(customer: typeof customers.$inferSelect): Actor {
  return collectorActor(customer);
}

export function deskActor(role: "staff" | "admin", email: string): Actor {
  if (!isDeskActor({ role, email })) {
    throw new Error("INVALID_DESK_ACTOR");
  }
  return { role, email };
}

export function timepieceDollars(row: typeof timepieces.$inferSelect) {
  return {
    valueLow: centsToDollars(row.valueLowCents),
    valueHigh: centsToDollars(row.valueHighCents),
  };
}
