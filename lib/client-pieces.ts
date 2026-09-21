import { catalogMatch } from "@/lib/catalog";
import { deskToday, heldWatchIds, holdsPieces } from "@/lib/contract/repo-book.mjs";
import type { Agreement, CatalogEntry, Timepiece } from "@/lib/types";

export const MAX_VIDEO_SECONDS = 60;

export type PieceCustody = "free" | "in_request" | "locked";

export function catalogEntryForPiece(
  catalog: CatalogEntry[],
  piece: Pick<Timepiece, "brand" | "model" | "reference" | "catalogId">,
) {
  if (piece.catalogId) {
    const linked = catalog.find((entry) => entry.id === piece.catalogId);
    if (linked) return linked;
  }
  return catalogMatch(piece, catalog) ?? null;
}

export function catalogIdForSelection(catalog: CatalogEntry[], brand: string, model: string, reference?: string) {
  return catalogEntryForPiece(catalog, { brand, model, reference, catalogId: null })?.id ?? null;
}

export function pieceCustody(agreements: Agreement[], timepieceId: string): PieceCustody {
  const today = deskToday();
  if (!heldWatchIds(agreements, today).has(timepieceId)) return "free";
  const holding = agreements.find((agreement) =>
    agreement.watchIds.includes(timepieceId) && holdsPieces(agreement, today),
  );
  return holding?.executedOn ? "locked" : "in_request";
}

export function custodyLabel(state: PieceCustody) {
  if (state === "locked") return "Locked in activated repo";
  if (state === "in_request") return "In a repo collection";
  return "Free";
}

export function assertVideoDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_VIDEO_SECONDS) {
    throw new Error("VIDEO_TOO_LONG");
  }
  return seconds;
}
