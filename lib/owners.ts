import { isDesk } from "@/lib/catalog";
import type { Agreement, Profile, Timepiece } from "@/lib/types";

export function ownerKey(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function piecesForCollector(timepieces: Timepiece[], email?: string | null) {
  const key = ownerKey(email);
  if (!key) return [];
  return timepieces.filter((watch) => ownerKey(watch.ownerEmail) === key);
}

export function agreementsForCollector(agreements: Agreement[], email?: string | null) {
  const key = ownerKey(email);
  if (!key) return [];
  return agreements.filter((agreement) => ownerKey(agreement.email) === key);
}

export function visiblePieces(user: Profile | null, timepieces: Timepiece[]) {
  if (isDesk(user)) return timepieces;
  return piecesForCollector(timepieces, user?.email);
}

export function visibleAgreements(user: Profile | null, agreements: Agreement[]) {
  if (isDesk(user)) return agreements;
  return agreementsForCollector(agreements, user?.email);
}

export function ownedCounts(email: string | null | undefined, timepieces: Timepiece[], agreements: Agreement[]) {
  return {
    pieces: piecesForCollector(timepieces, email).length,
    agreements: agreementsForCollector(agreements, email).length,
  };
}
