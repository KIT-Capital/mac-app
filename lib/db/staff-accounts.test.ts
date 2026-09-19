import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, describe, it } from "node:test";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createDb } from "./client";
import {
  clearAccessRateLimit,
  consumeAccessRateLimit,
} from "./collector-sessions";
import {
  addStaffAccount,
  bootstrapFirstAdmin,
  createStaffAccount,
  findStaffByEmail,
  listStaffAccounts,
  resetStaffPassword,
  rotateStaffPassword,
  setStaffDisabled,
  verifyStaffCredentials,
} from "./staff-accounts";
import {
  customers,
  deskAuditLog,
  staffAccounts,
  timepieces,
} from "./schema";
import { hashStaffPassword } from "../staff-password.mjs";
import { MASTER_SUPER_ADMIN_EMAIL, SEEDED_DESK_ACCOUNTS } from "../roles.mjs";
import { rotateDeskPasswordRequest } from "../auth.server";
import { issueDeskToken, readDeskToken } from "../desk-session";
import { resolveDeskActor } from "../server/request-actor";
import { dispatchMail } from "../mail";
import {
  createTimepiece,
  deskActor,
  registerCollector,
  toCollectorActor,
} from "./records";
import { executeLiveBookOperation } from "./live-book-mutations";

const skip = !process.env.DATABASE_URL;
const suffix = `${Date.now()}-${randomUUID().slice(0, 8)}`;
const staffIds: string[] = [];
const customerIds: string[] = [];
const timepieceIds: string[] = [];

describe("staff accounts repository", { skip }, () => {
  const db = createDb();

  after(async () => {
    if (staffIds.length) {
      await db.delete(staffAccounts).where(inArray(staffAccounts.id, staffIds));
    }
    if (timepieceIds.length) {
      await db.delete(timepieces).where(inArray(timepieces.id, timepieceIds));
    }
    if (customerIds.length) {
      await db.delete(customers).where(inArray(customers.id, customerIds));
    }
  });

  async function account(label: string, role: "admin" | "appraiser" | "super_admin" = "admin") {
    const row = await createStaffAccount(db, {
      name: label,
      email: `${label}.${suffix}@mac.test`,
      role,
      passwordHash: await hashStaffPassword("temporary password 123"),
      mustRotate: true,
    });
    staffIds.push(row.id);
    return row;
  }

  it("verifies only an active row and returns its database role", async () => {
    const member = await account("verify", "appraiser");
    const verified = await verifyStaffCredentials(
      db,
      member.email,
      "temporary password 123",
      { address: "127.0.0.1" },
    );
    assert.equal(verified?.id, member.id);
    assert.equal(verified?.role, "appraiser");
    assert.equal(verified?.mustRotate, true);

    assert.equal(await verifyStaffCredentials(
      db,
      `missing.${suffix}@mac.test`,
      "temporary password 123",
      { address: "127.0.0.1" },
    ), null);
  });

  it("uses the same fixed dummy scrypt path for unknown and disabled emails", async () => {
    const active = await account("timing-active");
    const disabled = await account("timing-disabled");
    await db.update(staffAccounts).set({ disabledAt: new Date() })
      .where(eq(staffAccounts.id, disabled.id));
    const candidates: string[] = [];
    const verifyPassword = async (_password: string, serialized: string) => {
      candidates.push(serialized);
      return false;
    };
    await verifyStaffCredentials(db, `unknown.${suffix}@mac.test`, "wrong", {
      address: `timing-unknown-${suffix}`,
      verifyPassword,
    });
    await verifyStaffCredentials(db, disabled.email, "wrong", {
      address: `timing-disabled-${suffix}`,
      verifyPassword,
    });
    await verifyStaffCredentials(db, active.email, "wrong", {
      address: `timing-active-${suffix}`,
      verifyPassword,
    });
    assert.equal(candidates.length, 3);
    assert.equal(candidates[0], candidates[1]);
    assert.notEqual(candidates[0], candidates[2]);
    assert.ok(candidates.every((candidate) => candidate.startsWith("$scrypt$131072$8$1$")));
    await Promise.all([
      clearAccessRateLimit(db, "desk-password-email", `unknown.${suffix}@mac.test`),
      clearAccessRateLimit(db, "desk-password-email", disabled.email),
      clearAccessRateLimit(db, "desk-password-email", active.email),
      clearAccessRateLimit(db, "desk-password-address", `timing-unknown-${suffix}`),
      clearAccessRateLimit(db, "desk-password-address", `timing-disabled-${suffix}`),
      clearAccessRateLimit(db, "desk-password-address", `timing-active-${suffix}`),
    ]);
  });

  it("refuses an over-limit email before running scrypt", async () => {
    const member = await account("limited");
    for (let attempt = 0; attempt < 10; attempt += 1) {
      await consumeAccessRateLimit(db, {
        scope: "desk-password-email",
        key: member.email,
        limit: 10,
        windowMs: 60 * 60_000,
      });
    }
    let verifyCalls = 0;
    const result = await verifyStaffCredentials(
      db,
      member.email,
      "temporary password 123",
      {
        address: "127.0.0.1",
        verifyPassword: async () => {
          verifyCalls += 1;
          return true;
        },
      },
    );
    assert.equal(result, null);
    assert.equal(verifyCalls, 0);
    await clearAccessRateLimit(db, "desk-password-email", member.email);
  });

  it("refuses an over-limit address before running scrypt", async () => {
    const address = `test-address-${suffix}`;
    for (let attempt = 0; attempt < 30; attempt += 1) {
      await consumeAccessRateLimit(db, {
        scope: "desk-password-address",
        key: address,
        limit: 30,
        windowMs: 60 * 60_000,
      });
    }
    let verifyCalls = 0;
    const result = await verifyStaffCredentials(
      db,
      `rotated-email.${suffix}@mac.test`,
      "any password",
      {
        address,
        verifyPassword: async () => {
          verifyCalls += 1;
          return false;
        },
      },
    );
    assert.equal(result, null);
    assert.equal(verifyCalls, 0);
    await clearAccessRateLimit(db, "desk-password-address", address);
  });

  it("caps concurrent scrypt reservations for one address", async () => {
    const address = `burst-address-${suffix}`;
    let verifyCalls = 0;
    const attempts = await Promise.all(
      Array.from({ length: 35 }, (_, index) => verifyStaffCredentials(
        db,
        `burst-${index}.${suffix}@mac.test`,
        "any password",
        {
          address,
          verifyPassword: async () => {
            verifyCalls += 1;
            return false;
          },
        },
      )),
    );
    assert.ok(attempts.every((result) => result === null));
    assert.equal(verifyCalls, 30);
    await clearAccessRateLimit(db, "desk-password-address", address);
  });

  it("caps concurrent scrypt reservations for one email", async () => {
    const email = `burst-email.${suffix}@mac.test`;
    let verifyCalls = 0;
    const attempts = await Promise.all(
      Array.from({ length: 15 }, (_, index) => verifyStaffCredentials(
        db,
        email,
        "any password",
        {
          address: `burst-email-address-${index}-${suffix}`,
          verifyPassword: async () => {
            verifyCalls += 1;
            return false;
          },
        },
      )),
    );
    assert.ok(attempts.every((result) => result === null));
    assert.equal(verifyCalls, 10);
    await clearAccessRateLimit(db, "desk-password-email", email);
  });

  it("disables and resets staff with immutable audit rows", async () => {
    const admin = await account("admin", "admin");
    const member = await account("managed", "admin");
    await setStaffDisabled(db, admin, member.id, true, "127.0.0.1");
    assert.equal(await verifyStaffCredentials(
      db,
      member.email,
      "temporary password 123",
      { address: "127.0.0.1" },
    ), null);

    await setStaffDisabled(db, admin, member.id, false, "127.0.0.1");
    const reset = await resetStaffPassword(db, admin, member.id, "127.0.0.1");
    assert.match(reset.temporaryPassword, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal((await verifyStaffCredentials(
      db,
      member.email,
      reset.temporaryPassword,
      { address: "127.0.0.1" },
    ))?.mustRotate, true);

    const audits = await db.select().from(deskAuditLog)
      .where(eq(deskAuditLog.targetId, member.id));
    assert.deepEqual(
      audits.map((row) => row.action).sort(),
      ["staff.disable", "staff.enable", "staff.reset"],
    );
    await assert.rejects(
      () => db.update(deskAuditLog).set({ action: "tampered" })
        .where(eq(deskAuditLog.id, audits[0].id)),
    );
    await assert.rejects(
      () => db.delete(deskAuditLog).where(eq(deskAuditLog.id, audits[0].id)),
    );
  });

  it("serializes admin disables and preserves one active administrator", async () => {
    const baseline = await db.select({ id: staffAccounts.id }).from(staffAccounts)
      .where(and(
        eq(staffAccounts.role, "admin"),
        isNull(staffAccounts.disabledAt),
      ));
    const first = await account("admin-first", "admin");
    const second = await account("admin-second", "admin");
    const results = await Promise.allSettled([
      setStaffDisabled(db, first, first.id, true, "127.0.0.1"),
      setStaffDisabled(db, second, second.id, true, "127.0.0.2"),
    ]);
    const fulfilled = results.filter((result) => result.status === "fulfilled").length;
    assert.equal(fulfilled, baseline.length > 0 ? 2 : 1);
    const active = await db.select({ id: staffAccounts.id }).from(staffAccounts)
      .where(and(
        eq(staffAccounts.role, "admin"),
        isNull(staffAccounts.disabledAt),
      ));
    assert.ok(active.length >= 1);
  });

  it("adds staff with a one-time password and refuses collector emails", async () => {
    const admin = await account("add-admin", "admin");
    const collector = await registerCollector(db, {
      name: "Collector",
      email: `collision.${suffix}@mac.test`,
    });
    customerIds.push(collector.id);
    await assert.rejects(
      () => addStaffAccount(db, admin, {
        name: "Collision",
        email: collector.email,
        role: "admin",
        clientAddress: "127.0.0.1",
      }),
      /STAFF_EMAIL_RESERVED/,
    );

    const added = await addStaffAccount(db, admin, {
      name: "New Staff",
      email: `new-staff.${suffix}@mac.test`,
      role: "admin",
      clientAddress: "127.0.0.1",
    });
    staffIds.push(added.row.id);
    assert.match(added.temporaryPassword, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal((await verifyStaffCredentials(
      db,
      added.row.email,
      added.temporaryPassword,
      { address: "127.0.0.1" },
    ))?.role, "admin");
    const [audit] = await db.select().from(deskAuditLog)
      .where(eq(deskAuditLog.targetId, added.row.id));
    assert.equal(audit.action, "staff.add");
    assert.doesNotMatch(JSON.stringify(audit), new RegExp(added.temporaryPassword));
    const invite = await dispatchMail({
      kind: "invite",
      name: added.row.name,
      email: added.row.email,
      role: added.row.role,
    }, { env: {} });
    assert.doesNotMatch(JSON.stringify(invite.messages), new RegExp(added.temporaryPassword));
  });

  it("rotates a forced password and writes an audit row", async () => {
    const member = await account("rotate", "appraiser");
    const rotated = await rotateStaffPassword(db, member, {
      currentPassword: "temporary password 123",
      newPassword: "a different secure password 456",
      clientAddress: "127.0.0.1",
    });
    assert.equal(rotated.mustRotate, false);
    assert.equal((await verifyStaffCredentials(
      db,
      member.email,
      "a different secure password 456",
      { address: "127.0.0.1" },
    ))?.mustRotate, false);
    const visible = await listStaffAccounts(db, member);
    assert.ok(visible.some((row) => row.id === member.id));
    assert.equal(visible.some((row) => row.role === "super_admin"), false);
    const [audit] = await db.select().from(deskAuditLog)
      .where(eq(deskAuditLog.targetId, member.id));
    assert.equal(audit.action, "staff.password.rotate");
  });

  it("validates the password-rotation request and reissues a normal token", async () => {
    const member = await account("rotate-request", "appraiser");
    const secret = "desk-rotation-test-secret-material-0123456789";
    const env = {
      APP_ENV: "production",
      DESK_SESSION_KEYS: `k1:${secret}`,
    };
    const token = issueDeskToken(member.email, "appraiser", {
      env,
      mustRotate: true,
    });
    await assert.rejects(
      () => rotateDeskPasswordRequest(db, token, {
        currentPassword: "temporary password 123",
        newPassword: "short",
        confirmPassword: "different",
      }, "127.0.0.1", env),
      /PASSWORD_TOO_WEAK/,
    );
    for (const newPassword of [
      "short",
      "temporary password 123",
      `prefix-${member.email}`,
    ]) {
      await assert.rejects(
        () => rotateDeskPasswordRequest(db, token, {
          currentPassword: "temporary password 123",
          newPassword,
          confirmPassword: newPassword,
        }, "127.0.0.1", env),
        /PASSWORD_TOO_WEAK/,
      );
    }
    await assert.rejects(
      () => rotateDeskPasswordRequest(db, token, {
        currentPassword: "wrong temporary password",
        newPassword: "a different secure password 456",
        confirmPassword: "a different secure password 456",
      }, "127.0.0.1", env),
      /DESK_PASSWORD_INVALID/,
    );
    const rotated = await rotateDeskPasswordRequest(db, token, {
      currentPassword: "temporary password 123",
      newPassword: "a different secure password 456",
      confirmPassword: "a different secure password 456",
    }, "127.0.0.1", env);
    const oldSession = readDeskToken(token, { env });
    const newSession = readDeskToken(rotated.token, { env });
    const updated = await findStaffByEmail(db, member.email);
    assert.ok(oldSession);
    assert.ok(newSession);
    assert.ok(updated);
    assert.ok(oldSession.iat <= updated.sessionValidAfter.getTime());
    assert.ok(newSession.iat > updated.sessionValidAfter.getTime());
    assert.equal(newSession.rot, false);
    assert.equal((await verifyStaffCredentials(
      db,
      member.email,
      "a different secure password 456",
      { address: "127.0.0.2" },
    ))?.role, "appraiser");
  });

  it("commits desk mutations and their audit row together", async () => {
    // Appraisal values need an appraiser (R5); the audit behaviour under test is role-agnostic.
    const admin = await createStaffAccount(db, {
      name: "Auditing Appraiser",
      email: `audit-appraiser.${suffix}@mac.test`,
      role: "appraiser",
      passwordHash: await hashStaffPassword("temporary password 123"),
      mustRotate: false,
    });
    staffIds.push(admin.id);
    const collector = await registerCollector(db, {
      name: "Audit Collector",
      email: `audit-collector.${suffix}@mac.test`,
    });
    customerIds.push(collector.id);
    const piece = await createTimepiece(
      db,
      toCollectorActor(collector),
      collector.id,
      { brand: "Cartier", model: "Tank" },
    );
    timepieceIds.push(piece.id);

    await executeLiveBookOperation(
      db,
      deskActor("appraiser", admin.email, admin.id),
      {
        action: "timepiece.deskUpdate",
        id: piece.id,
        patch: { status: "appraised", valueLow: 10000, valueHigh: 12000 },
      },
      {
        env: { MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "127.0.0.1",
      },
    );
    const [audit] = await db.select().from(deskAuditLog).where(and(
      eq(deskAuditLog.actorEmail, admin.email),
      eq(deskAuditLog.targetId, piece.id),
    ));
    assert.equal(audit.action, "timepiece.deskUpdate");
    assert.equal(audit.clientAddress, "127.0.0.1");

    await assert.rejects(() => executeLiveBookOperation(
      db,
      deskActor("appraiser", admin.email, admin.id),
      {
        action: "timepiece.deskUpdate",
        id: piece.id,
        patch: { status: "reviewing" },
      },
      {
        env: { MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
        clientAddress: "",
      },
    ));
    const [afterFailure] = await db.select({ status: timepieces.status })
      .from(timepieces)
      .where(eq(timepieces.id, piece.id));
    assert.equal(afterFailure.status, "appraised");
  });

  it("re-reads the staff row on every desk request", async () => {
    const admin = await account("actor-admin", "admin");
    const member = await createStaffAccount(db, {
      name: "Actor Staff",
      email: `actor-staff.${suffix}@mac.test`,
      role: "admin",
      passwordHash: await hashStaffPassword("temporary password 123"),
      mustRotate: false,
    });
    staffIds.push(member.id);
    const secret = "desk-actor-test-secret-material-0123456789";
    const previous = {
      APP_ENV: process.env.APP_ENV,
      MAC_LIVE_BOOK: process.env.MAC_LIVE_BOOK,
      DESK_SESSION_KEYS: process.env.DESK_SESSION_KEYS,
    };
    Object.assign(process.env, {
      APP_ENV: "development",
      MAC_LIVE_BOOK: "1",
      DESK_SESSION_KEYS: `k1:${secret}`,
    });
    try {
      const token = issueDeskToken(member.email, "admin");
      const before = await resolveDeskActor(token);
      assert.equal("actor" in (before ?? {}) ? before?.actor.role : null, "admin");
      await setStaffDisabled(db, admin, member.id, true, "127.0.0.1");
      assert.deepEqual(await resolveDeskActor(token), { error: "DESK_SESSION_INVALID" });
      await setStaffDisabled(db, admin, member.id, false, "127.0.0.1");
      assert.deepEqual(
        await resolveDeskActor(token),
        { error: "DESK_SESSION_INVALID" },
      );
      const enabled = await findStaffByEmail(db, member.email);
      assert.ok(enabled);
      const freshToken = issueDeskToken(member.email, "admin", {
        now: enabled.sessionValidAfter.getTime() + 1,
      });
      const freshActor = await resolveDeskActor(freshToken);
      assert.equal("actor" in (freshActor ?? {}) ? freshActor?.actor.role : null, "admin");
      await resetStaffPassword(db, admin, member.id, "127.0.0.1");
      assert.deepEqual(await resolveDeskActor(freshToken), { error: "DESK_SESSION_INVALID" });
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  });

  it("seeds the master, the appraiser, and the admin with no password and refuses their sign-in", async () => {
    const seeded = await db.select().from(staffAccounts)
      .where(inArray(staffAccounts.email, SEEDED_DESK_ACCOUNTS.map((seed) => seed.email)));
    assert.equal(seeded.length, 3);
    const master = seeded.find((row) => row.email === MASTER_SUPER_ADMIN_EMAIL);
    assert.ok(master);
    assert.equal(master.role, "super_admin");
    assert.equal(master.isMaster, true);
    assert.equal(seeded.filter((row) => row.isMaster).length, 1);
    // The migrated rows carry the seeded roles: Dov appraises, Rosario administers.
    for (const seed of SEEDED_DESK_ACCOUNTS) {
      const row = seeded.find((candidate) => candidate.email === seed.email);
      assert.ok(row, `${seed.email} is seeded`);
      assert.equal(row.role, seed.role, `${seed.email} role`);
    }
    for (const row of seeded.filter((row) => !row.passwordHash)) {
      assert.equal(row.passwordSetAt, null);
      assert.equal(await verifyStaffCredentials(db, row.email, "anything at all 123", {
        address: `seed-${row.id}-${suffix}`,
      }), null);
      // Even a verifier that says "match" cannot sign a passwordless row in.
      assert.equal(await verifyStaffCredentials(db, row.email, "dummy preimage", {
        address: `seed-match-${row.id}-${suffix}`,
        verifyPassword: async () => true,
      }), null);
      await clearAccessRateLimit(db, "desk-password-email", row.email);
    }
  });

  it("refuses a temporary-password reset for a row that never set a password", async () => {
    const superAdmin = await account("reset-seed-super", "super_admin");
    const [seededAdmin] = await db.select().from(staffAccounts).where(and(
      eq(staffAccounts.role, "admin"),
      isNull(staffAccounts.passwordHash),
      inArray(staffAccounts.email, SEEDED_DESK_ACCOUNTS.map((seed) => seed.email)),
    )).limit(1);
    if (!seededAdmin) return;
    await assert.rejects(
      () => resetStaffPassword(db, superAdmin, seededAdmin.id, "127.0.0.1"),
      /PASSWORD_NOT_SET/,
    );
  });

  it("does not confirm hidden super-admin emails to an admin through add", async () => {
    const admin = await account("oracle-admin", "admin");
    const hidden = await account("oracle-super", "super_admin");
    await assert.rejects(
      () => addStaffAccount(db, admin, {
        name: "Probe",
        email: hidden.email,
        role: "admin",
        clientAddress: "127.0.0.1",
      }),
      /ROLE_FORBIDDEN/,
    );
    const visible = await account("oracle-visible", "admin");
    await assert.rejects(
      () => addStaffAccount(db, admin, {
        name: "Probe",
        email: visible.email,
        role: "admin",
        clientAddress: "127.0.0.1",
      }),
      /STAFF_EXISTS/,
    );
  });

  it("fences desk-account verbs by role and protects the master row", async () => {
    const admin = await account("fence-admin", "admin");
    const superAdmin = await account("fence-super", "super_admin");
    const appraiser = await account("fence-appraiser", "appraiser");

    await assert.rejects(
      () => addStaffAccount(db, admin, {
        name: "Nope",
        email: `fence-nope.${suffix}@mac.test`,
        role: "appraiser",
        clientAddress: "127.0.0.1",
      }),
      /ROLE_FORBIDDEN/,
    );
    await assert.rejects(
      () => setStaffDisabled(db, admin, appraiser.id, true, "127.0.0.1"),
      /ROLE_FORBIDDEN/,
    );
    await assert.rejects(
      () => resetStaffPassword(db, appraiser, superAdmin.id, "127.0.0.1"),
      /ROLE_FORBIDDEN/,
    );
    await assert.rejects(
      () => setStaffDisabled(db, superAdmin, superAdmin.id, true, "127.0.0.1"),
      /ROLE_FORBIDDEN/,
    );

    const [masterRow] = await db.select().from(staffAccounts)
      .where(eq(staffAccounts.isMaster, true));
    assert.ok(masterRow);
    await assert.rejects(
      () => setStaffDisabled(db, superAdmin, masterRow.id, true, "127.0.0.1"),
      /ROLE_FORBIDDEN/,
    );

    const created = await addStaffAccount(db, superAdmin, {
      name: "New Appraiser",
      email: `fence-new-appraiser.${suffix}@mac.test`,
      role: "appraiser",
      clientAddress: "127.0.0.1",
    });
    staffIds.push(created.row.id);
    await setStaffDisabled(db, superAdmin, created.row.id, true, "127.0.0.1");

    const adminView = await listStaffAccounts(db, admin);
    assert.equal(adminView.some((row) => row.role === "super_admin"), false);
    assert.equal(adminView.find((row) => row.id === appraiser.id)?.manageable, false);
    const superView = await listStaffAccounts(db, superAdmin);
    assert.ok(superView.some((row) => row.id === masterRow.id && row.manageable === false));
  });

  it("bootstraps onto a seeded passwordless row with the same email and keeps its role", async () => {
    const schema = `staff_seed_bootstrap_${randomUUID().replaceAll("-", "")}`;
    await db.execute(sql.raw(`create schema "${schema}"`));
    await db.execute(sql.raw(
      `create table "${schema}".staff_accounts (like public.staff_accounts including all)`,
    ));
    await db.execute(sql.raw(
      `create table "${schema}".desk_audit_log (like public.desk_audit_log including all)`,
    ));
    await db.execute(sql.raw(
      `create table "${schema}".customers (like public.customers including all)`,
    ));
    const email = `seed-master.${suffix}@mac.test`;
    const env = {
      DESK_BOOTSTRAP_ADMIN_EMAIL: email,
      DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH: await hashStaffPassword("bootstrap password 123"),
    };
    const inSchema = <T>(work: (isolated: ReturnType<typeof createDb>) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        return work(tx as unknown as ReturnType<typeof createDb>);
      });
    try {
      await inSchema((isolated) => isolated.insert(staffAccounts).values({
        id: `seed-${suffix}`,
        name: "Seeded Master",
        email,
        role: "super_admin",
        isMaster: true,
        mustRotate: true,
      }));
      const result = await inSchema((isolated) => bootstrapFirstAdmin(isolated, env));
      assert.ok(result);
      assert.equal(result.id, `seed-${suffix}`);
      assert.equal(result.role, "super_admin");
      assert.equal(result.isMaster, true);
      assert.equal(result.mustRotate, true);
      assert.ok(result.passwordHash);
      assert.equal(await inSchema((isolated) => bootstrapFirstAdmin(isolated, env)), null);
    } finally {
      await db.execute(sql.raw(`drop schema "${schema}" cascade`));
    }
  });

  it("bootstraps once under concurrency in an isolated schema", async () => {
    const schema = `staff_bootstrap_${randomUUID().replaceAll("-", "")}`;
    await db.execute(sql.raw(`create schema "${schema}"`));
    await db.execute(sql.raw(
      `create table "${schema}".staff_accounts (like public.staff_accounts including all)`,
    ));
    await db.execute(sql.raw(
      `create table "${schema}".desk_audit_log (like public.desk_audit_log including all)`,
    ));
    const passwordHash = await hashStaffPassword("bootstrap password 123");
    const env = {
      DESK_BOOTSTRAP_ADMIN_EMAIL: `bootstrap.${suffix}@mac.test`,
      DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH: passwordHash,
    };
    const inSchema = <T>(work: (isolated: ReturnType<typeof createDb>) => Promise<T>) =>
      db.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        return work(tx as unknown as ReturnType<typeof createDb>);
      });
    try {
      const results = await Promise.all([
        inSchema((isolated) => bootstrapFirstAdmin(isolated, env)),
        inSchema((isolated) => bootstrapFirstAdmin(isolated, env)),
      ]);
      const created = results.find(Boolean);
      assert.ok(created);
      assert.equal(created.mustRotate, true);
      const rows = await inSchema((isolated) => isolated.select().from(staffAccounts));
      assert.equal(rows.length, 1);
      const audits = await inSchema((isolated) => isolated.select().from(deskAuditLog));
      assert.equal(audits.length, 1);
      assert.equal(audits[0].action, "staff.bootstrap");
      assert.equal(await inSchema((isolated) => bootstrapFirstAdmin(isolated, {
        DESK_BOOTSTRAP_ADMIN_EMAIL: "ignored@example.com",
        DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH: "malformed",
      })), null);
    } finally {
      await db.execute(sql.raw(`drop schema "${schema}" cascade`));
    }
  });

});
