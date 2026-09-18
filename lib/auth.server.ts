import "server-only";
import { timingSafeEqual } from "node:crypto";
import { deskRoleForEmail } from "@/lib/auth";
import { getDb } from "@/lib/db/client";
import {
  bootstrapFirstAdmin,
  findStaffByEmail,
  rotateStaffPassword,
  verifyStaffCredentials,
} from "@/lib/db/staff-accounts";
import type { Database } from "@/lib/db/client";
import {
  issueDeskToken,
  readDeskToken,
} from "@/lib/desk-session";
import { isLiveBookEnabled } from "@/lib/env/live-book-flag.mjs";

type Environment = Record<string, string | undefined>;

export function deskAuthenticationMode(env: Environment = process.env) {
  return env.APP_ENV?.trim() === "development" &&
    !isLiveBookEnabled(env.MAC_LIVE_BOOK)
    ? "development-fixture"
    : "database";
}

export function developmentDeskFixture(
  emailInput: string,
  passwordInput: string,
  env: Environment = process.env,
) {
  if (env.APP_ENV?.trim() !== "development") return null;
  const expected = env.DESK_DEVELOPMENT_PASSWORD ?? "";
  const password = String(passwordInput ?? "");
  const email = emailInput.trim().toLowerCase();
  const role = deskRoleForEmail(email);
  if (!expected || (role !== "admin" && role !== "staff")) return null;
  const supplied = Buffer.from(password);
  const configured = Buffer.from(expected);
  if (
    supplied.length !== configured.length ||
    !timingSafeEqual(supplied, configured)
  ) {
    return null;
  }
  return {
    id: `development:${email}`,
    email,
    name: role === "admin" ? "Development Admin" : "Development Staff",
    role,
    mustRotate: false,
    sessionValidAfter: new Date(0),
    disabledAt: null,
  };
}

export async function authenticateDeskAccount(
  email: string,
  password: string,
  clientAddress: string,
  env: Environment = process.env,
) {
  if (deskAuthenticationMode(env) === "development-fixture") {
    return developmentDeskFixture(email, password, env);
  }

  const db = getDb();
  await bootstrapFirstAdmin(db, env);
  return verifyStaffCredentials(db, email, password, {
    address: clientAddress,
  });
}

export async function rotateDeskPasswordRequest(
  db: Database,
  token: string | undefined,
  input: {
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  },
  clientAddress: string,
  env: Environment = process.env,
) {
  const session = readDeskToken(token, { env });
  if (!session) throw new Error("DESK_SESSION_INVALID");
  if (input.newPassword !== input.confirmPassword) {
    throw new Error("PASSWORD_TOO_WEAK");
  }
  const staff = await findStaffByEmail(db, session.email);
  if (!staff || staff.disabledAt) throw new Error("DESK_SESSION_INVALID");
  const rotated = await rotateStaffPassword(db, staff, {
    currentPassword: String(input.currentPassword ?? ""),
    newPassword: String(input.newPassword ?? ""),
    clientAddress,
  });
  return {
    email: rotated.email,
    role: rotated.role,
    token: issueDeskToken(rotated.email, rotated.role, {
      env,
      mustRotate: false,
      now: Math.max(Date.now(), rotated.sessionValidAfter.getTime() + 1),
    }),
  };
}
