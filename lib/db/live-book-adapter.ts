import { eq, inArray } from "drizzle-orm";
import { applicationPurchaseShares } from "@/lib/contract/repo-scale.mjs";
import { ownerKey } from "@/lib/owners";
import { mergePreferences } from "@/lib/preferences";
import { DEFAULT_SETTINGS } from "@/lib/theme";
import { TIMEPIECE_SHOTS } from "@/lib/timepiece-shots.mjs";
import type {
  Agreement,
  AgreementEnd,
  AgreementShell,
  ApplicationPurchaseShares,
  AppSettings,
  AppState,
  CatalogEntry,
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
  agreementShells,
  applications,
  catalogReferences,
  deskSettings,
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
  settings?: Row[];
  catalog?: Row[];
  shells?: Row[];
};
export type LiveBookState = Pick<
  AppState,
  "timepieces" | "agreements" | "users" | "photos" | "profiles" | "settings" | "catalog" | "shells"
> & { applicationPurchaseShares: ApplicationPurchaseShares };

const PHOTO_KINDS = new Set(["front", "back", "left", "right", "clasp", "more", "buckle", "box", "papers", "other"]);
const text = (row: Row, key: string, fallback = "") => typeof row[key] === "string" ? row[key] : fallback;
const optionalText = (row: Row, key: string) => text(row, key) || undefined;
const photoKind = (value: string) => (PHOTO_KINDS.has(value) ? value : "other") as PhotoKind;
const shotOrder = new Map(TIMEPIECE_SHOTS.map((shot, index) => [shot.kind, index]));
const bps = (value: unknown, fallback: number) =>
  typeof value === "number" ? value / 10_000 : fallback;

function previewTime(row: Row) {
  const value = row.createdAt;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function currentPreviews(rows: Row[]) {
  const byKind = new Map<PhotoKind, Row>();
  for (const row of rows) {
    const source = text(row, "photoObjectId") || text(row, "previewUrl");
    if (!source) continue;
    const kind = photoKind(text(row, "kind"));
    const current = byKind.get(kind);
    if (!current) {
      byKind.set(kind, row);
      continue;
    }
    const direct = Boolean(text(row, "photoObjectId"));
    const currentDirect = Boolean(text(current, "photoObjectId"));
    if (
      (direct && !currentDirect)
      || (direct === currentDirect && previewTime(row) > previewTime(current))
      || (
        direct === currentDirect
        && previewTime(row) === previewTime(current)
        && text(row, "id") > text(current, "id")
      )
    ) {
      byKind.set(kind, row);
    }
  }
  return [...byKind.entries()]
    .sort(([kindA, rowA], [kindB, rowB]) => {
      const orderA = shotOrder.get(kindA) ?? Number.MAX_SAFE_INTEGER;
      const orderB = shotOrder.get(kindB) ?? Number.MAX_SAFE_INTEGER;
      return orderA - orderB || kindA.localeCompare(kindB) || text(rowA, "id").localeCompare(text(rowB, "id"));
    })
    .map(([, row]) => row);
}

function settings(rows: Row[]): AppSettings {
  const row = rows[0];
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    ...DEFAULT_SETTINGS,
    maxLtv: bps(row.maxLtvBps, DEFAULT_SETTINGS.maxLtv),
    startingRate: bps(row.startingRateBps, DEFAULT_SETTINGS.startingRate),
    setupFee: bps(row.setupFeeBps, DEFAULT_SETTINGS.setupFee),
    earlyRepurchaseAmount: bps(
      row.earlyRepurchaseAmountBps,
      DEFAULT_SETTINGS.earlyRepurchaseAmount,
    ),
    brokerFee: bps(row.brokerFeeBps, DEFAULT_SETTINGS.brokerFee),
    minMonths: typeof row.minMonths === "number" ? row.minMonths : DEFAULT_SETTINGS.minMonths,
    earlyStartMonth:
      typeof row.earlyStartMonth === "number"
        ? row.earlyStartMonth
        : DEFAULT_SETTINGS.earlyStartMonth,
    earlyUntilMonth:
      typeof row.earlyUntilMonth === "number"
        ? row.earlyUntilMonth
        : DEFAULT_SETTINGS.earlyUntilMonth,
    typicalTerm:
      typeof row.typicalTerm === "number" ? row.typicalTerm : DEFAULT_SETTINGS.typicalTerm,
    membershipMonthly:
      typeof row.membershipMonthlyCents === "number"
        ? row.membershipMonthlyCents / 100
        : DEFAULT_SETTINGS.membershipMonthly,
    vaultLocation: text(row, "vaultLocation", DEFAULT_SETTINGS.vaultLocation),
  };
}

function catalog(rows: Row[]): CatalogEntry[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    brand: text(row, "brand"),
    model: text(row, "model"),
    reference: text(row, "reference"),
    caseMetal: text(row, "caseMetal"),
    caseDiameter: text(row, "caseDiameter"),
    typicalLow: centsToDollars(
      typeof row.typicalLowCents === "number" ? row.typicalLowCents : 0,
    ) ?? 0,
    typicalHigh: centsToDollars(
      typeof row.typicalHighCents === "number" ? row.typicalHighCents : 0,
    ) ?? 0,
    financeable: Boolean(row.financeable),
    notes: text(row, "notes"),
  }));
}

function shells(rows: Row[]): AgreementShell[] {
  return rows.map((row) => ({
    id: text(row, "id"),
    code: text(row, "code"),
    title: text(row, "title"),
    termMonths: typeof row.termMonths === "number" ? row.termMonths : 12,
    rate: bps(row.rateBps, DEFAULT_SETTINGS.startingRate),
    ltv: bps(row.ltvBps, DEFAULT_SETTINGS.maxLtv),
    setupFee: bps(row.setupFeeBps, DEFAULT_SETTINGS.setupFee),
    earlyRepurchaseAmount: bps(
      row.earlyRepurchaseAmountBps,
      DEFAULT_SETTINGS.earlyRepurchaseAmount,
    ),
    brokerFee: bps(row.brokerFeeBps, DEFAULT_SETTINGS.brokerFee),
    minMonths: typeof row.minMonths === "number" ? row.minMonths : DEFAULT_SETTINGS.minMonths,
    earlyStartMonth:
      typeof row.earlyStartMonth === "number"
        ? row.earlyStartMonth
        : DEFAULT_SETTINGS.earlyStartMonth,
    earlyUntilMonth:
      typeof row.earlyUntilMonth === "number"
        ? row.earlyUntilMonth
        : DEFAULT_SETTINGS.earlyUntilMonth,
    status:
      row.status === "assigned" || row.status === "closed" ? row.status : "open",
    createdAt: text(row, "createdOn"),
  }));
}

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

export function mapLiveBookRows(
  rows: LiveBookRows,
  customerId?: string,
  discloseDeskTerms = true,
): LiveBookState {
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
  for (const [id, previews] of previewsByPiece) {
    previewsByPiece.set(id, currentPreviews(previews));
  }
  const currentPreviewRows = [...previewsByPiece.values()].flat();

  const mappedPieces: Timepiece[] = pieceRows.map((row) => {
    const previews = previewsByPiece.get(text(row, "id")) ?? [];
    const mappedPreviews = previews.flatMap((item) => {
      const source = text(item, "photoObjectId") || text(item, "previewUrl");
      return source ? [{ source, kind: photoKind(text(item, "kind")) }] : [];
    });
    return {
      id: text(row, "id"),
      ownerEmail: ownerKey(text(customerById.get(text(row, "customerId")) ?? {}, "email")),
      brand: text(row, "brand"),
      model: text(row, "model"),
      reference: optionalText(row, "reference"),
      images: mappedPreviews.map((item) => item.source),
      photoKinds: mappedPreviews.map((item) => item.kind),
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
  const mappedPhotos: PhotoRecord[] = currentPreviewRows.flatMap((row) => {
    const piece = pieceById.get(text(row, "timepieceId"));
    const source = text(row, "photoObjectId") || text(row, "previewUrl");
    if (!source) return [];
    return [{
      id: text(row, "id"),
      url: source,
      kind: photoKind(text(row, "kind")),
      assetId: text(row, "timepieceId"),
      caption: piece ? `${piece.brand} ${piece.model}`.trim() : "",
      uploadedAt: row.createdAt instanceof Date ? row.createdAt.toISOString().slice(0, 10) : "1970-01-01",
      ownerEmail: piece?.ownerEmail ?? "",
    }];
  });
  const profiles = Object.fromEntries(customerRows.map((row) => {
    const value = profile(row);
    return [value.email, value];
  }));
  const authoritativeSettings = settings(rows.settings ?? []);
  const authoritativeShells = shells(rows.shells ?? []);
  const openShell = authoritativeShells.find((shell) => shell.status === "open");
  return {
    timepieces: mappedPieces,
    agreements: mappedAgreements,
    users: customerRows.map(managedUser),
    photos: mappedPhotos,
    profiles,
    settings: discloseDeskTerms
      ? authoritativeSettings
      : { ...DEFAULT_SETTINGS, vaultLocation: "" },
    catalog: catalog(rows.catalog ?? []),
    shells: discloseDeskTerms ? authoritativeShells : [],
    applicationPurchaseShares: applicationPurchaseShares(
      authoritativeSettings,
      openShell,
    ),
  };
}

export async function readLiveBookState(db: Database, actor: Actor): Promise<LiveBookState> {
  return db.transaction(async (tx) => {
    const [customerRows, settingRows, catalogRows, shellRows, applicationRows] = await Promise.all([
      actor.role === "collector"
        ? tx.select().from(customers).where(eq(customers.id, actor.customerId))
        : tx.select().from(customers),
      tx.select().from(deskSettings),
      tx.select().from(catalogReferences),
      tx.select().from(agreementShells),
      actor.role === "collector"
        ? tx.select({ id: applications.id })
            .from(applications)
            .where(eq(applications.customerId, actor.customerId))
            .limit(1)
        : [],
    ]);
    const customerIds = customerRows.map((row) => row.id);
    if (!customerIds.length) {
      return mapLiveBookRows({
        customers: [],
        timepieces: [],
        agreements: [],
        members: [],
        ends: [],
        previews: [],
        settings: settingRows,
        catalog: catalogRows,
        shells: shellRows,
      }, actor.role === "collector" ? actor.customerId : undefined, actor.role !== "collector" || applicationRows.length > 0);
    }
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
      settings: settingRows,
      catalog: catalogRows,
      shells: shellRows,
    }, actor.role === "collector" ? actor.customerId : undefined,
    actor.role !== "collector" || applicationRows.length > 0 || agreementRows.length > 0);
  });
}
