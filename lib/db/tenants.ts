import { eq, sql } from "drizzle-orm";
import { DEFAULT_TENANT_ID, formatMemberId } from "../tenant.mjs";
import type { Database } from "./client";
import { tenants } from "./schema";

const MAX_SEQUENCE = 99999;

type TenantTx = {
  execute: Database["execute"];
  select: Database["select"];
  update: Database["update"];
};

async function allocateOn(
  tx: TenantTx,
  tenantId: string,
  at: Date,
) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`member-seq:${tenantId}`}))`);
  const [tenant] = await tx
    .select()
    .from(tenants)
    .where(eq(tenants.id, tenantId))
    .for("update")
    .limit(1);
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  const sequence = tenant.nextMemberSequence;
  if (sequence > MAX_SEQUENCE) throw new Error("MEMBER_SEQUENCE_EXHAUSTED");
  const memberId = formatMemberId(tenant.code, sequence, at);
  await tx.update(tenants).set({
    nextMemberSequence: sequence + 1,
    updatedAt: new Date(),
  }).where(eq(tenants.id, tenantId));
  return memberId;
}

/** Allocate inside an existing transaction so a failed insert can roll the number back. */
export function allocateMemberIdIn(
  tx: TenantTx,
  tenantId: string = DEFAULT_TENANT_ID,
  at: Date = new Date(),
) {
  return allocateOn(tx, tenantId, at);
}

export function allocateMemberId(
  db: Database,
  tenantId: string = DEFAULT_TENANT_ID,
  at: Date = new Date(),
) {
  return db.transaction((tx) => allocateOn(tx, tenantId, at));
}
