import "server-only";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { isReservedDeskEmail } from "../desk-identities.mjs";
import { mergePreferences } from "../preferences";
import { DEFAULT_TENANT_ID } from "../tenant.mjs";
import { normalizeCollectorPhone } from "../phone.mjs";
import type { Database } from "./client";
import { customerEmailOnDefaultTenant } from "./tenants";
import { customers, whatsappMessages } from "./schema";

export async function insertWhatsAppMessage(
  db: Database,
  input: {
    customerId?: string | null;
    direction: "inbound" | "outbound";
    phone: string;
    body: string;
    providerSid?: string | null;
    kind?: string | null;
  },
) {
  const id = randomUUID();
  await db.insert(whatsappMessages).values({
    id,
    tenantId: DEFAULT_TENANT_ID,
    customerId: input.customerId ?? null,
    direction: input.direction,
    phone: input.phone,
    body: input.body.slice(0, 4096),
    providerSid: input.providerSid ?? null,
    kind: input.kind ?? null,
  }).onConflictDoNothing();
  return id;
}

export async function listWhatsAppMessages(db: Database, limit = 50) {
  return db.select({
    id: whatsappMessages.id,
    direction: whatsappMessages.direction,
    phone: whatsappMessages.phone,
    body: whatsappMessages.body,
    kind: whatsappMessages.kind,
    customerId: whatsappMessages.customerId,
    createdAt: whatsappMessages.createdAt,
  }).from(whatsappMessages)
    .where(eq(whatsappMessages.tenantId, DEFAULT_TENANT_ID))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit);
}

export async function findRetailWhatsAppRecipient(db: Database, email: string) {
  const [row] = await db.select().from(customers).where(customerEmailOnDefaultTenant(email.trim().toLowerCase())).limit(1);
  if (!row || isReservedDeskEmail(row.email) || !["active", "invited"].includes(row.status)) return null;
  const prefs = mergePreferences(row.preferences as Record<string, unknown>);
  if (!prefs.whatsappUpdates) return null;
  let phone;
  try {
    phone = normalizeCollectorPhone(row.phone);
  } catch {
    return null;
  }
  return { customerId: row.id, phone, name: row.name };
}
