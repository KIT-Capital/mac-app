import type { Role } from "@/lib/types";
import {
  developmentDeskRole,
  isReservedDeskEmail,
} from "@/lib/desk-identities.mjs";

export function deskRoleForEmail(email: string): Role | null {
  return developmentDeskRole(email) as Role | null;
}

export { isReservedDeskEmail };
