import "server-only";
import { timingSafeEqual } from "node:crypto";
import { deskRoleForEmail } from "@/lib/auth";
import { isDeskRole } from "@/lib/roles.mjs";
import { getDb } from "@/lib/db/client";
import {
  bootstrapFirstAdmin,
  findStaffByEmail,
  hasPassword,
  rotateStaffPassword,
  verifyStaffCredentials,
} from "@/lib/db/staff-accounts";
import {
  consumeAccessRateLimit,
  consumeDeskLoginCode,
  createCollectorAccessToken,
} from "@/lib/db/collector-sessions";
import { evaluateLiveBookConfig } from "@/lib/env/live-book-flag.mjs";
import { dispatchCollectorAccessMail } from "@/lib/mail";
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
  if (!expected || !isDeskRole(role)) return null;
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
    name: role === "admin" ? "Development Admin" : "Development Appraiser",
    role,
    isMaster: false,
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
  code?: string,
): Promise<{ staff: NonNullable<ReturnType<typeof developmentDeskFixture>> | Awaited<ReturnType<typeof verifyStaffCredentials>> } | { pending: "code" }> {
  if (deskAuthenticationMode(env) === "development-fixture") {
    return { staff: developmentDeskFixture(email, password, env) };
  }

  const db = getDb();
  await bootstrapFirstAdmin(db, env);
  const live = evaluateLiveBookConfig(env);
  const trimmedCode = String(code ?? "").trim();

  if (live.enabled && live.ok && trimmedCode) {
    const staff = await verifyStaffCredentials(db, email, password, {
      address: clientAddress,
    });
    if (!staff) return { staff: null };
    const attempt = await consumeAccessRateLimit(db, {
      scope: "desk-code-verify",
      key: staff.email,
      limit: 8,
      windowMs: 15 * 60_000,
    });
    if (!attempt.allowed) return { staff: null };
    try {
      await consumeDeskLoginCode(db, {
        secret: live.secret,
        email: staff.email,
        code: trimmedCode,
      });
    } catch {
      return { staff: null };
    }
    return { staff };
  }

  if (live.enabled && live.ok && !trimmedCode) {
    const row = await findStaffByEmail(db, email);
    if (row && !row.disabledAt && !hasPassword(row)) {
      const issueLimit = await consumeAccessRateLimit(db, {
        scope: "desk-login-issue",
        key: row.email,
        limit: 3,
        windowMs: 60 * 60_000,
      });
      if (issueLimit.allowed) {
        const issued = await createCollectorAccessToken(db, {
          purpose: "desk_set_password",
          secret: live.secret,
          staffId: row.id,
          email: row.email,
          expiresAt: new Date(Date.now() + 15 * 60_000),
        });
        const setUrl = new URL("/admin/password/set", live.origin);
        setUrl.searchParams.set("token", issued.token);
        try {
          await dispatchCollectorAccessMail({
            to: row.email,
            name: row.name,
            action: "desk_set_password",
            url: setUrl.toString(),
            tokenId: issued.id,
          });
        } catch {
          return { pending: "code" };
        }
      }
      return { pending: "code" };
    }
    const staff = await verifyStaffCredentials(db, email, password, {
      address: clientAddress,
    });
    if (staff) {
      const issueLimit = await consumeAccessRateLimit(db, {
        scope: "desk-login-issue",
        key: staff.email,
        limit: 3,
        windowMs: 60 * 60_000,
      });
      if (!issueLimit.allowed) return { pending: "code" };
      const issued = await createCollectorAccessToken(db, {
        purpose: "desk_login",
        secret: live.secret,
        staffId: staff.id,
        email: staff.email,
        expiresAt: new Date(Date.now() + 15 * 60_000),
      });
      try {
        await dispatchCollectorAccessMail({
          to: staff.email,
          name: staff.name,
          action: "desk_login",
          code: issued.token,
          tokenId: issued.id,
        });
      } catch {
        return { pending: "code" };
      }
    }
    return { pending: "code" };
  }

  return {
    staff: await verifyStaffCredentials(db, email, password, {
      address: clientAddress,
    }),
  };
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
