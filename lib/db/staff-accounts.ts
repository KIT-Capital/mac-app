import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import {
  consumeAccessRateLimit,
  releaseAccessRateLimit,
} from "./collector-sessions";
import type { Database } from "./client";
import {
  deskAuditLog,
  staffAccounts,
  customers,
} from "./schema";
import {
  hashStaffPassword,
  parseStaffPasswordHash,
  serializeStaffPasswordHash,
  verifyStaffPassword,
} from "../staff-password.mjs";
import {
  canCreateDeskRole,
  canManageDeskAccount,
  canSeeDeskAccount,
  isDeskRole,
} from "../roles.mjs";
import type { DeskRole } from "../types";

const DUMMY_PASSWORD_HASH =
  "$scrypt$131072$8$1$tsxcUKwlwSA7TXAmc2P9aw$03kovydDWBxIHiIrgjQelFgbKIEnthJAcqkCcSRZCLzhbg6wFBeXhhIUm_0scAiKykAxlvKILgtRl0JBsj0Ong";

export type StaffActor = {
  id: string;
  email: string;
  role: DeskRole;
  isMaster?: boolean;
};
type StaffAccount = Omit<typeof staffAccounts.$inferSelect, "role"> & {
  role: DeskRole;
};
type StaffTransaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

type StaffInput = {
  name: string;
  email: string;
  role: DeskRole;
  passwordHash: string;
  mustRotate?: boolean;
};

/** A row that can never sign in: seeded people before their first password. */
export const PASSWORD_NOT_SET = "PASSWORD_NOT_SET";
/** The actor's role may not create, edit, disable, or reset that target. */
export const ROLE_FORBIDDEN = "ROLE_FORBIDDEN";

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function passwordColumns(serialized: string, setAt = new Date()) {
  const parsed = parseStaffPasswordHash(serialized);
  if (!parsed) throw new Error("STAFF_PASSWORD_HASH_INVALID");
  return {
    passwordHash: parsed.hash,
    passwordSalt: parsed.salt,
    passwordParams: parsed.params,
    passwordSetAt: setAt,
  };
}

/** Rows without a password verify against the fixed dummy hash and never match. */
function storedPassword(row: typeof staffAccounts.$inferSelect) {
  if (!row.passwordHash || !row.passwordSalt || !row.passwordParams) {
    return DUMMY_PASSWORD_HASH;
  }
  return serializeStaffPasswordHash({
    hash: row.passwordHash,
    salt: row.passwordSalt,
    params: row.passwordParams,
  });
}

export function hasPassword(row: { passwordHash: string | null }) {
  return Boolean(row.passwordHash);
}

function typedStaff(row: typeof staffAccounts.$inferSelect): StaffAccount {
  if (!isDeskRole(row.role)) {
    throw new Error("STAFF_ROLE_INVALID");
  }
  return { ...row, role: row.role };
}

async function lockStaffActor(
  tx: StaffTransaction,
  actor: StaffActor,
) {
  const [row] = await tx.select().from(staffAccounts).where(and(
    eq(staffAccounts.id, actor.id),
    eq(staffAccounts.email, actor.email),
    isNull(staffAccounts.disabledAt),
  )).for("update").limit(1);
  if (!row) throw new Error("SESSION_INVALID");
  return typedStaff(row);
}

async function lockStaffPair(
  tx: StaffTransaction,
  actor: StaffActor,
  targetId: string,
) {
  const ids = [...new Set([actor.id, targetId])].sort();
  const rows = await tx.select().from(staffAccounts)
    .where(inArray(staffAccounts.id, ids))
    .orderBy(staffAccounts.id)
    .for("update");
  const actorRow = rows.find((row) =>
    row.id === actor.id &&
    row.email === actor.email &&
    !row.disabledAt
  );
  if (!actorRow) throw new Error("SESSION_INVALID");
  const trusted = typedStaff(actorRow);
  const targetRow = rows.find((row) => row.id === targetId);
  if (!targetRow) throw new Error("STAFF_NOT_FOUND");
  const target = typedStaff(targetRow);
  if (!canManageDeskAccount(trusted, target)) throw new Error(ROLE_FORBIDDEN);
  return { trusted, target };
}

export async function lockStaffForDeskMutation(
  tx: StaffTransaction,
  actor: StaffActor,
) {
  const trusted = await lockStaffActor(tx, actor);
  if (trusted.mustRotate) throw new Error("PASSWORD_ROTATION_REQUIRED");
  return trusted;
}

export async function writeDeskAudit(
  tx: StaffTransaction,
  actor: StaffActor,
  action: string,
  targetId: string,
  clientAddress: string,
) {
  if (!clientAddress.trim()) throw new Error("CLIENT_ADDRESS_REQUIRED");
  await tx.insert(deskAuditLog).values({
    id: randomUUID(),
    actorEmail: actor.email,
    actorRole: actor.role,
    action,
    targetId,
    clientAddress,
  });
}

export async function createStaffAccount(db: Database, input: StaffInput) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new Error("STAFF_EMAIL_INVALID");
  if (!input.name.trim()) throw new Error("STAFF_NAME_REQUIRED");
  const [row] = await db.insert(staffAccounts).values({
    id: randomUUID(),
    name: input.name.trim(),
    email,
    role: input.role,
    mustRotate: input.mustRotate ?? true,
    ...passwordColumns(input.passwordHash),
  }).returning();
  return typedStaff(row);
}

/**
 * Creates the Doppler-held bootstrap admin while nobody on the desk can sign
 * in yet. Seeded rows without a password do not count: they cannot log in.
 */
export async function bootstrapFirstAdmin(
  db: Database,
  env: Record<string, string | undefined> = process.env,
) {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mac-staff-bootstrap'))`);
    const existing = await tx.select({ id: staffAccounts.id }).from(staffAccounts)
      .where(isNotNull(staffAccounts.passwordHash))
      .limit(1);
    if (existing.length) return null;
    const email = normalizeEmail(env.DESK_BOOTSTRAP_ADMIN_EMAIL ?? "");
    const serialized = env.DESK_BOOTSTRAP_ADMIN_PASSWORD_HASH?.trim() ?? "";
    if (!email.includes("@") || !serialized) return null;
    const password = passwordColumns(serialized);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const customer = await tx.select({ id: customers.id }).from(customers)
      .where(eq(customers.email, email)).limit(1);
    if (customer.length) throw new Error("STAFF_EMAIL_RESERVED");
    const id = randomUUID();
    const [created] = await tx.insert(staffAccounts).values({
      id,
      name: "Bootstrap Admin",
      email,
      role: "admin",
      mustRotate: true,
      ...password,
    }).onConflictDoNothing({ target: staffAccounts.email }).returning();
    if (created) {
      const staff = typedStaff(created);
      await writeDeskAudit(tx, staff, "staff.bootstrap", id, "bootstrap");
      return staff;
    }
    const [concurrent] = await tx.select().from(staffAccounts)
      .where(eq(staffAccounts.email, email))
      .limit(1);
    return concurrent ? typedStaff(concurrent) : null;
  });
}

export async function findStaffByEmail(db: Database, emailInput: string) {
  const [row] = await db.select().from(staffAccounts)
    .where(eq(staffAccounts.email, normalizeEmail(emailInput)))
    .limit(1);
  return row ? typedStaff(row) : null;
}

export async function findActiveStaffById(db: Database, id: string) {
  const [row] = await db.select().from(staffAccounts).where(and(
    eq(staffAccounts.id, id),
    isNull(staffAccounts.disabledAt),
  )).limit(1);
  return row ? typedStaff(row) : null;
}

export async function verifyStaffCredentials(
  db: Database,
  emailInput: string,
  password: string,
  options: {
    address: string;
    now?: Date;
    verifyPassword?: typeof verifyStaffPassword;
  },
) {
  const email = normalizeEmail(emailInput);
  const now = options.now ?? new Date();
  const emailReservation = await consumeAccessRateLimit(db, {
    scope: "desk-password-email",
    key: email,
    limit: 10,
    windowMs: 60 * 60_000,
    now,
  });
  if (!emailReservation.allowed) return null;
  const addressReservation = await consumeAccessRateLimit(db, {
    scope: "desk-password-address",
    key: options.address,
    limit: 30,
    windowMs: 60 * 60_000,
    now,
  });
  if (!addressReservation.allowed) {
    await releaseAccessRateLimit(db, {
      scope: "desk-password-email",
      key: email,
      windowMs: 60 * 60_000,
      now,
    });
    return null;
  }
  let row;
  let valid;
  try {
    row = await findStaffByEmail(db, email);
    const candidate = row && !row.disabledAt ? storedPassword(row) : DUMMY_PASSWORD_HASH;
    valid = await (options.verifyPassword ?? verifyStaffPassword)(password, candidate);
  } catch (error) {
    await Promise.all([
      releaseAccessRateLimit(db, {
        scope: "desk-password-email",
        key: email,
        windowMs: 60 * 60_000,
        now,
      }),
      releaseAccessRateLimit(db, {
        scope: "desk-password-address",
        key: options.address,
        windowMs: 60 * 60_000,
        now,
      }),
    ]);
    throw error;
  }
  if (!valid || !row || row.disabledAt) {
    return null;
  }
  await Promise.all([
    releaseAccessRateLimit(db, {
      scope: "desk-password-email",
      key: email,
      windowMs: 60 * 60_000,
      now,
    }),
    releaseAccessRateLimit(db, {
      scope: "desk-password-address",
      key: options.address,
      windowMs: 60 * 60_000,
      now,
    }),
  ]);
  return typedStaff(row);
}

/** Every desk role lists the desk; super-admin rows appear only to super admins. */
export async function listStaffAccounts(db: Database, actor: StaffActor) {
  if (!isDeskRole(actor.role)) throw new Error("DESK_REQUIRED");
  const rows = await db.select({
    id: staffAccounts.id,
    name: staffAccounts.name,
    email: staffAccounts.email,
    role: staffAccounts.role,
    isMaster: staffAccounts.isMaster,
    mustRotate: staffAccounts.mustRotate,
    passwordHash: staffAccounts.passwordHash,
    disabledAt: staffAccounts.disabledAt,
    createdAt: staffAccounts.createdAt,
  }).from(staffAccounts).orderBy(staffAccounts.createdAt);
  return rows
    .filter((row) => canSeeDeskAccount(actor, row))
    .map(({ passwordHash, ...row }) => ({
      ...row,
      passwordSet: Boolean(passwordHash),
      manageable: canManageDeskAccount(actor, row),
    }));
}

export async function addStaffAccount(
  db: Database,
  actor: StaffActor,
  input: {
    name: string;
    email: string;
    role: DeskRole;
    clientAddress: string;
  },
) {
  const email = normalizeEmail(input.email);
  if (!email.includes("@")) throw new Error("STAFF_EMAIL_INVALID");
  if (!input.name.trim()) throw new Error("STAFF_NAME_INVALID");
  if (!isDeskRole(input.role)) throw new Error("STAFF_ROLE_INVALID");
  const temporaryPassword = randomBytes(18).toString("base64url");
  const serialized = await hashStaffPassword(temporaryPassword);
  const row = await db.transaction(async (tx) => {
    const trusted = await lockStaffActor(tx, actor);
    if (!canCreateDeskRole(trusted, input.role)) throw new Error(ROLE_FORBIDDEN);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const [customer, staff] = await Promise.all([
      tx.select({ id: customers.id }).from(customers)
        .where(eq(customers.email, email)).limit(1),
      tx.select({ id: staffAccounts.id }).from(staffAccounts)
        .where(eq(staffAccounts.email, email)).limit(1),
    ]);
    if (customer[0]) throw new Error("STAFF_EMAIL_RESERVED");
    if (staff[0]) throw new Error("STAFF_EXISTS");
    const [created] = await tx.insert(staffAccounts).values({
      id: randomUUID(),
      name: input.name.trim(),
      email,
      role: input.role,
      mustRotate: true,
      ...passwordColumns(serialized),
    }).returning();
    await writeDeskAudit(tx, trusted, "staff.add", created.id, input.clientAddress);
    return typedStaff(created);
  });
  return { row, temporaryPassword };
}

export async function setStaffDisabled(
  db: Database,
  actor: StaffActor,
  targetId: string,
  disabled: boolean,
  clientAddress: string,
) {
  return db.transaction(async (tx) => {
    if (disabled) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('mac-active-admin'))`);
    }
    const { trusted, target } = await lockStaffPair(tx, actor, targetId);
    if (disabled && !target.disabledAt) {
      const otherActive = await tx.select({ id: staffAccounts.id })
        .from(staffAccounts)
        .where(and(
          isNull(staffAccounts.disabledAt),
          isNotNull(staffAccounts.passwordHash),
          ne(staffAccounts.id, targetId),
        ))
        .limit(1);
      if (!otherActive.length) throw new Error("LAST_ACTIVE_ADMIN_REQUIRED");
    }
    const changedAt = new Date();
    const [row] = await tx.update(staffAccounts).set({
      disabledAt: disabled ? changedAt : null,
      sessionValidAfter: disabled ? changedAt : undefined,
      updatedAt: changedAt,
    }).where(eq(staffAccounts.id, targetId)).returning();
    if (!row) throw new Error("STAFF_NOT_FOUND");
    await writeDeskAudit(tx, trusted, disabled ? "staff.disable" : "staff.enable", targetId, clientAddress);
    return typedStaff(row);
  });
}

export async function resetStaffPassword(
  db: Database,
  actor: StaffActor,
  targetId: string,
  clientAddress: string,
) {
  const temporaryPassword = randomBytes(18).toString("base64url");
  const serialized = await hashStaffPassword(temporaryPassword);
  const row = await db.transaction(async (tx) => {
    const { trusted } = await lockStaffPair(tx, actor, targetId);
    const changedAt = new Date();
    const [updated] = await tx.update(staffAccounts).set({
      ...passwordColumns(serialized, changedAt),
      mustRotate: true,
      sessionValidAfter: changedAt,
      updatedAt: changedAt,
    }).where(eq(staffAccounts.id, targetId)).returning();
    if (!updated) throw new Error("STAFF_NOT_FOUND");
    await writeDeskAudit(tx, trusted, "staff.reset", targetId, clientAddress);
    return typedStaff(updated);
  });
  return { row, temporaryPassword };
}

export async function rotateStaffPassword(
  db: Database,
  actor: StaffAccount,
  input: {
    currentPassword: string;
    newPassword: string;
    clientAddress: string;
  },
) {
  const newPassword = input.newPassword;
  if (
    newPassword.length < 12 ||
    newPassword === input.currentPassword ||
    newPassword.toLowerCase().includes(actor.email.toLowerCase())
  ) {
    throw new Error("PASSWORD_TOO_WEAK");
  }
  const serialized = await hashStaffPassword(newPassword);
  return db.transaction(async (tx) => {
    const trusted = await lockStaffActor(tx, actor);
    if (!hasPassword(trusted)) throw new Error(PASSWORD_NOT_SET);
    if (!await verifyStaffPassword(input.currentPassword, storedPassword(trusted))) {
      throw new Error("DESK_PASSWORD_INVALID");
    }
    const changedAt = new Date();
    const [updated] = await tx.update(staffAccounts).set({
      ...passwordColumns(serialized, changedAt),
      mustRotate: false,
      sessionValidAfter: changedAt,
      updatedAt: changedAt,
    }).where(and(
      eq(staffAccounts.id, actor.id),
      isNull(staffAccounts.disabledAt),
    )).returning();
    if (!updated) throw new Error("STAFF_NOT_FOUND");
    await writeDeskAudit(tx, trusted, "staff.password.rotate", actor.id, input.clientAddress);
    return typedStaff(updated);
  });
}
