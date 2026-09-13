import type { Role } from "@/lib/types";

export const DESK_ACCOUNTS = [
  { email: "admin@mechartcap.com", password: "MAC-Desk-2022", role: "admin" as const },
  { email: "desk@mechartcap.com", password: "MAC-Desk-2022", role: "staff" as const },
] as const;

export function deskRoleForEmail(email: string): Role | null {
  const lower = email.trim().toLowerCase();
  return DESK_ACCOUNTS.find((account) => account.email === lower)?.role ?? null;
}

export function isReservedDeskEmail(email: string) {
  return deskRoleForEmail(email) !== null;
}

export function authenticate(
  email: string,
  password: string,
): { ok: true; role: Role } | { ok: false; error: string } {
  const lower = email.trim().toLowerCase();
  if (!lower.includes("@")) {
    return { ok: false, error: "Enter a valid email address." };
  }

  const desk = DESK_ACCOUNTS.find((account) => account.email === lower);
  if (desk) {
    if (password === desk.password) return { ok: true, role: desk.role };
    return { ok: false, error: "That desk password is not recognized." };
  }

  if (!password.trim()) {
    return { ok: false, error: "Enter your password." };
  }

  return { ok: true, role: "collector" };
}
