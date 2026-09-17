import { eq, inArray } from "drizzle-orm";
import { ownerKey } from "@/lib/owners";
import { mergePreferences } from "@/lib/preferences";
import type {
  Agreement,
  AgreementEnd,
  AppState,
  ManagedUser,
  PhotoKind,
  PhotoRecord,
  Profile,
  Timepiece,
} from "@/lib/types";
import type { Database } from "./client";
import { centsToDollars } from "./money.mjs";
import type { Actor } from "./records";
import {
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

type Row = Record<string, unknown>;
export type LiveBookRows = {
  customers: Row[];
  timepieces: Row[];
  agreements: Row[];
  members: Row[];
  ends: Row[];
  previews: Row[];
};
export type LiveBookState = Pick<AppState, "timepieces" | "agreements" | "users" | "photos" | "profiles">;

const PHOTO_KINDS = new Set(["front", "back", "left", "right", "clasp", "more", "buckle", "box", "papers", "other"]);
const text = (row: Row, key: string, fallback = "") => typeof row[key] === "string" ? row[key] : fallback;
const optionalText = (row: Row, key: string) => text(row, key) || undefined;
const photoKind = (value: string) => (PHOTO_KINDS.has(value) ? value : "other") as PhotoKind;

function profile(row: Row): Profile {
  return {
    name: text(row, "name", text(row, "email")),
    email: ownerKey(text(row, "email")),
    phone: text(row, "phone"),
    member: Boolean(row.member),
    avatar: text(row, "avatar"),
    role: "collector",
    onboardingComplete: Boolean(row.onboardingComplete),
    applicationSubmitted: Boolean(row.applicationSubmitted),
    promoCode: typeof row.promoCode === "string" ? row.promoCode : null,
    preferences: mergePreferences(row.preferences && typeof row.preferences === "object" ? row.preferences : undefined),
  };
}

function managedUser(row: Row): ManagedUser {
  return {
    id: text(row, "id"),
    name: text(row, "name", text(row, "email")),
    email: ownerKey(text(row, "email")),
    phone: text(row, "phone"),
    role: "collector",
    status:
      text(row, "status") === "suspended"
        ? "suspended"
        : text(row, "status") === "invited"
          ? "invited"
          : "active",
    member: Boolean(row.member),
    lastActive: row.lastActive instanceof Date
      ? row.lastActive.toISOString().slice(0, 10)
      : text(row, "lastActive", "1970-01-01"),
  };
}

export function mapLiveBookRows(rows: LiveBookRows, customerId?: string): LiveBookState {
  const customerRows = customerId ? rows.customers.filter((row) => row.id === customerId) : rows.customers;
  const customerIds = new Set(customerRows.map((row) => text(row, "id")));
  const customerById = new Map(customerRows.map((row) => [text(row, "id"), row]));
  const pieceRows = rows.timepieces.filter((row) => customerIds.has(text(row, "customerId")));
  const pieceIds = new Set(pieceRows.map((row) => text(row, "id")));
  const agreementRows = rows.agreements.filter((row) => customerIds.has(text(row, "customerId")));
  const agreementIds = new Set(agreementRows.map((row) => text(row, "id")));
  const previewRows = rows.previews.filter((row) => pieceIds.has(text(row, "timepieceId")));
  const previewsByPiece = new Map<string, Row[]>();
  for (const preview of previewRows) {
    const id = text(preview, "timepieceId");
    const bucket = previewsByPiece.get(id);
    if (bucket) bucket.push(preview);
    else previewsByPiece.set(id, [preview]);
  }

  const mappedPieces: Timepiece[] = pieceRows.map((row) => {
    const previews = previewsByPiece.get(text(row, "id")) ?? [];
    return {
      id: text(row, "id"),
      ownerEmail: ownerKey(text(customerById.get(text(row, "customerId")) ?? {}, "email")),
      brand: text(row, "brand"),
      model: text(row, "model"),
      reference: optionalText(row, "reference"),
      images: previews.map((item) => text(item, "previewUrl")).filter(Boolean),
      photoKinds: previews.map((item) => photoKind(text(item, "kind"))),
      status: row.status === "reviewing" || row.status === "appraised" ? row.status : "not_evaluated",
      valueLow: centsToDollars(typeof row.valueLowCents === "number" ? row.valueLowCents : null),
      valueHigh: centsToDollars(typeof row.valueHighCents === "number" ? row.valueHighCents : null),
      financeable: Boolean(row.financeable),
      condition: text(row, "condition"),
      boxPapers: text(row, "boxPapers"),
      caseMetal: text(row, "caseMetal"),
      caseType: text(row, "caseType"),
      caseDiameter: text(row, "caseDiameter"),
      dialColor: text(row, "dialColor"),
      buckle: text(row, "buckle"),
      band: row.band === "bracelet" ? "bracelet" : "strap",
      bandMaterial: text(row, "bandMaterial"),
      complication: text(row, "complication"),
      evaluatedAt: row.evaluatedAt instanceof Date ? row.evaluatedAt.toISOString().slice(0, 10) : optionalText(row, "evaluatedAt"),
      assetCode: optionalText(row, "assetCode"),
    };
  });

  const members = new Map<string, string[]>();
  for (const row of rows.members) {
    const agreementId = text(row, "agreementId");
    if (!agreementIds.has(agreementId)) continue;
    const bucket = members.get(agreementId);
    if (bucket) bucket.push(text(row, "timepieceId"));
    else members.set(agreementId, [text(row, "timepieceId")]);
  }
  const ends = new Map(rows.ends.map((row) => [text(row, "agreementId"), row]));
  const mappedAgreements: Agreement[] = agreementRows.map((row) => {
    const agreement: Agreement = {
      id: text(row, "id"),
      watchIds: members.get(text(row, "id")) ?? [],
      amount: centsToDollars(typeof row.amountCents === "number" ? row.amountCents : 0) ?? 0,
      termMonths: typeof row.termMonths === "number" ? row.termMonths : 12,
      delivery: text(row, "delivery"),
      ownerName: text(row, "ownerName"),
      email: ownerKey(text(row, "email")),
      status: row.status === "draft" || row.status === "signed" ? row.status : "pending_signature",
      createdAt: text(row, "createdOn"),
    };
    const signedAt = optionalText(row, "signedOn");
    const agreementCode = optionalText(row, "agreementCode");
    if (signedAt) agreement.signedAt = signedAt;
    if (agreementCode) agreement.agreementCode = agreementCode;
    if (row.scale && typeof row.scale === "object") agreement.scale = row.scale as Agreement["scale"];
    const end = ends.get(agreement.id);
    if (end) agreement.bookEnd = {
      kind: text(end, "kind") as AgreementEnd["kind"],
      date: text(end, "endedOn"),
      amount: centsToDollars(typeof end.amountCents === "number" ? end.amountCents : 0) ?? 0,
    };
    return agreement;
  });
  const pieceById = new Map(mappedPieces.map((row) => [row.id, row]));
  const mappedPhotos: PhotoRecord[] = previewRows.map((row) => {
    const piece = pieceById.get(text(row, "timepieceId"));
    return {
      id: text(row, "id"),
      url: text(row, "previewUrl"),
      kind: photoKind(text(row, "kind")),
      assetId: text(row, "timepieceId"),
      caption: piece ? `${piece.brand} ${piece.model}`.trim() : "",
      uploadedAt: row.createdAt instanceof Date ? row.createdAt.toISOString().slice(0, 10) : "1970-01-01",
      ownerEmail: piece?.ownerEmail ?? "",
    };
  });
  const profiles = Object.fromEntries(customerRows.map((row) => {
    const value = profile(row);
    return [value.email, value];
  }));
  return {
    timepieces: mappedPieces,
    agreements: mappedAgreements,
    users: customerRows.map(managedUser),
    photos: mappedPhotos,
    profiles,
  };
}

export async function readLiveBookState(db: Database, actor: Actor): Promise<LiveBookState> {
  return db.transaction(async (tx) => {
    const customerRows = actor.role === "collector"
      ? await tx.select().from(customers).where(eq(customers.id, actor.customerId))
      : await tx.select().from(customers);
    const customerIds = customerRows.map((row) => row.id);
    if (!customerIds.length) return { timepieces: [], agreements: [], users: [], photos: [], profiles: {} };
    const [pieceRows, agreementRows] = await Promise.all([
      tx.select().from(timepieces).where(inArray(timepieces.customerId, customerIds)),
      tx.select().from(liveAgreements).where(inArray(liveAgreements.customerId, customerIds)),
    ]);
    const agreementIds = agreementRows.map((row) => row.id);
    const pieceIds = pieceRows.map((row) => row.id);
    const [memberRows, endRows, previewRows] = await Promise.all([
      agreementIds.length ? tx.select().from(liveAgreementMembers).where(inArray(liveAgreementMembers.agreementId, agreementIds)) : [],
      agreementIds.length ? tx.select().from(liveAgreementEnds).where(inArray(liveAgreementEnds.agreementId, agreementIds)) : [],
      pieceIds.length ? tx.select().from(livePreviews).where(inArray(livePreviews.timepieceId, pieceIds)) : [],
    ]);
    return mapLiveBookRows({
      customers: customerRows,
      timepieces: pieceRows,
      agreements: agreementRows,
      members: memberRows,
      ends: endRows,
      previews: previewRows,
    }, actor.role === "collector" ? actor.customerId : undefined);
  });
}
