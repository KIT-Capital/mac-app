"use client";

import { visibleAgreements, visiblePieces } from "@/lib/owners";
import { useStore } from "@/lib/store";

export {
  agreementsForCollector,
  ownedCounts,
  ownerKey,
  piecesForCollector,
  visibleAgreements,
  visiblePieces,
} from "@/lib/owners";

export function useOwnedAssets() {
  const { user, timepieces, agreements } = useStore();
  return {
    timepieces: visiblePieces(user, timepieces),
    agreements: visibleAgreements(user, agreements),
  };
}
