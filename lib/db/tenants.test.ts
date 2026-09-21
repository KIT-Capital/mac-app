import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { tenants } from "./schema";
import { allocateMemberId } from "./tenants";
import { DEFAULT_TENANT_CODE, DEFAULT_TENANT_ID, parseMemberId } from "../tenant.mjs";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const testTenantId = `tenant-test-${suffix}`;

describe("tenant member ID allocation", { skip }, () => {
  const db = createDb();

  after(async () => {
    await db.delete(tenants).where(eq(tenants.id, testTenantId));
  });

  it("seeds Mechanical Art Capital as the default tenant", async () => {
    const [mac] = await db.select().from(tenants).where(eq(tenants.id, DEFAULT_TENANT_ID)).limit(1);
    assert.ok(mac);
    assert.equal(mac.code, DEFAULT_TENANT_CODE);
    assert.equal(mac.name, "Mechanical Art Capital");
    assert.equal(mac.primaryColor, "#0E2A44");
    assert.equal(mac.fromName, "Mechanical Art Capital");
  });

  it("allocates PREFIX#####-YY per tenant and never reuses a number", async () => {
    await db.insert(tenants).values({
      id: testTenantId,
      code: "TST",
      name: "Test Tenant",
    });
    const first = await allocateMemberId(db, testTenantId, new Date("2026-09-20T00:00:00Z"));
    const second = await allocateMemberId(db, testTenantId, new Date("2026-09-20T00:00:00Z"));
    assert.equal(first, "TST00001-26");
    assert.equal(second, "TST00002-26");
    assert.deepEqual(parseMemberId(first), { prefix: "TST", sequence: 1, year: 26 });
  });
});
