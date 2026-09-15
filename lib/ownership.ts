"use client";

import { isDesk } from "@/lib/catalog";
import { DEMO_PROFILE } from "@/lib/seed";
import { useStore } from "@/lib/store";
import type { Agreement, Profile, Timepiece } from "@/lib/types";

export function ownerKey(email?: string | null) {
  return (email || "").trim().toLowerCase();
}

export function piecesForCollector(timepieces: Timepiece[], email?: string | null) {
  const key = ownerKey(email);
  return timepieces.filter((watch) => ownerKey(watch.ownerEmail || DEMO_PROFILE.email) === key);
}

export function agreementsForCollector(agreements: Agreement[], email?: string | null) {
  const key = ownerKey(email);
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

export function useOwnedAssets() {
  const { user, timepieces, agreements } = useStore();
  return {
    timepieces: visiblePieces(user, timepieces),
    agreements: visibleAgreements(user, agreements),
  };
}
