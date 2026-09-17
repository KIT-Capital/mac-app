import { SCENARIO_60 } from "./contract/repo-scale.mjs";

const ACTIONS = new Set([
  "profile.update",
  "timepiece.create",
  "timepiece.update",
  "timepiece.deskUpdate",
  "timepiece.remove",
  "agreement.create",
  "agreement.updateScale",
  "agreement.signCollector",
  "agreement.markSigned",
  "agreement.recordEnd",
  "agreement.clearEnd",
  "agreement.renew",
  "agreement.addWatches",
  "agreement.setAmount",
  "agreement.remove",
  "preview.upsert",
  "preview.remove",
  "customer.update",
  "customer.remove",
  "customer.invite",
]);

const PIECE_FIELDS = [
  "id", "brand", "model", "reference", "status", "condition", "boxPapers",
  "caseMetal", "caseType", "caseDiameter", "dialColor", "buckle", "band",
  "bandMaterial", "complication", "assetCode",
];
const DESK_PIECE_FIELDS = ["status", "financeable", "valueLow", "valueHigh", "evaluatedAt", "assetCode"];
const PROFILE_FIELDS = ["name", "phone", "avatar", "onboardingComplete", "preferences"];
const AGREEMENT_FIELDS = [
  "id", "watchIds", "amount", "termMonths", "delivery", "ownerName", "email",
  "createdAt", "agreementCode", "scale",
];
const CUSTOMER_FIELDS = ["name", "phone", "status", "member"];
const PREVIEW_KINDS = new Set(["front", "back", "left", "right", "clasp", "more", "buckle", "box", "papers", "other", "legacy_preview"]);
const SCALE_FIELDS = ["purchaseShare", "setupFee", "annualAdjustment", "earlyRepurchaseAmount", "brokerFee", "minMonths", "earlyStartMonth", "earlyUntilMonth"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function object(value, code = "LIVE_BOOK_OPERATION_INVALID") {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(code);
  return value;
}

function id(value) {
  const parsed = String(value ?? "").trim();
  if (!parsed || parsed.length > 160) throw new Error("LIVE_BOOK_ID_REQUIRED");
  return parsed;
}

function pick(value, fields) {
  const source = object(value);
  return Object.fromEntries(fields.filter((field) => source[field] !== undefined).map((field) => [field, source[field]]));
}

function scale(value) {
  const parsed = pick(value, SCALE_FIELDS);
  const defaults = {
    purchaseShare: SCENARIO_60.purchaseShare,
    setupFee: SCENARIO_60.setupFee,
    annualAdjustment: SCENARIO_60.annualAdjustment,
    earlyRepurchaseAmount: SCENARIO_60.earlyRepurchaseAmount,
    brokerFee: SCENARIO_60.brokerFee,
  };
  const share = parsed.purchaseShare ?? defaults.purchaseShare;
  if (
    typeof share !== "number" ||
    !Number.isFinite(share) ||
    share <= 0 ||
    share > defaults.purchaseShare
  ) {
    throw new Error("AGREEMENT_SCALE_INVALID");
  }
  for (const [key, minimum] of Object.entries(defaults)) {
    if (key === "purchaseShare") continue;
    const raw = parsed[key] ?? minimum;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < minimum) {
      throw new Error("AGREEMENT_SCALE_INVALID");
    }
    parsed[key] = raw;
  }
  for (const [key, raw] of Object.entries(parsed)) {
    if (key === "purchaseShare") continue;
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) throw new Error("AGREEMENT_SCALE_INVALID");
  }
  parsed.purchaseShare = share;
  return parsed;
}

function agreement(value) {
  const parsed = pick(value, AGREEMENT_FIELDS);
  parsed.id = id(parsed.id);
  const amount = Number(parsed.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
    throw new Error("AGREEMENT_AMOUNT_INVALID");
  }
  const termMonths = Number(parsed.termMonths);
  if (!Number.isInteger(termMonths) || termMonths < 1 || termMonths > 24) {
    throw new Error("AGREEMENT_TERM_INVALID");
  }
  const createdAt = String(parsed.createdAt ?? "");
  if (!ISO_DATE.test(createdAt) || Number.isNaN(Date.parse(`${createdAt}T00:00:00Z`))) {
    throw new Error("AGREEMENT_DATE_INVALID");
  }
  if (!Array.isArray(parsed.watchIds) || parsed.watchIds.length < 1 || parsed.watchIds.length > 24) {
    throw new Error("WATCH_IDS_REQUIRED");
  }
  parsed.watchIds = parsed.watchIds.map(id);
  parsed.amount = amount;
  parsed.termMonths = termMonths;
  parsed.createdAt = createdAt;
  if (parsed.scale !== undefined) parsed.scale = scale(parsed.scale);
  return parsed;
}

function term(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24) {
    throw new Error("AGREEMENT_TERM_INVALID");
  }
  return parsed;
}

function isoDate(value) {
  const parsed = String(value ?? "");
  if (!ISO_DATE.test(parsed) || Number.isNaN(Date.parse(`${parsed}T00:00:00Z`))) {
    throw new Error("AGREEMENT_DATE_INVALID");
  }
  return parsed;
}

export function parseLiveBookOperation(input) {
  const source = object(input);
  const action = String(source.action ?? "");
  if (!ACTIONS.has(action)) throw new Error("LIVE_BOOK_ACTION_INVALID");

  if (action === "profile.update") return { action, patch: pick(source.patch, PROFILE_FIELDS) };
  if (action === "timepiece.create") {
    const timepiece = pick(source.timepiece, PIECE_FIELDS);
    timepiece.id = id(timepiece.id);
    if (timepiece.assetCode !== undefined && (typeof timepiece.assetCode !== "string" || timepiece.assetCode.length > 64)) {
      throw new Error("ASSET_CODE_INVALID");
    }
    return { action, timepiece };
  }
  if (action === "timepiece.update") return { action, id: id(source.id), patch: pick(source.patch, PIECE_FIELDS.slice(1)) };
  if (action === "timepiece.deskUpdate") return { action, id: id(source.id), patch: pick(source.patch, [...PIECE_FIELDS.slice(1), ...DESK_PIECE_FIELDS]) };
  if (action === "timepiece.remove") return { action, id: id(source.id) };
  if (action === "agreement.create") {
    return { action, agreement: agreement(source.agreement) };
  }
  if (action === "agreement.updateScale") {
    return { action, id: id(source.id), scale: scale(source.scale), termMonths: term(source.termMonths) };
  }
  if (action === "agreement.signCollector" || action === "agreement.markSigned" || action === "agreement.clearEnd") {
    return { action, id: id(source.id) };
  }
  if (action === "agreement.recordEnd") return { action, id: id(source.id), end: object(source.end) };
  if (action === "agreement.renew") {
    return {
      action,
      id: id(source.id),
      closeDate: isoDate(source.closeDate),
      successorId: id(source.successorId),
      agreementCode: id(source.agreementCode),
      scale: scale(source.scale),
    };
  }
  if (action === "agreement.addWatches") {
    if (!Array.isArray(source.watchIds)) throw new Error("WATCH_IDS_REQUIRED");
    return { action, id: id(source.id), watchIds: source.watchIds.map(id) };
  }
  if (action === "agreement.setAmount") {
    const amount = Number(source.amount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000) {
      throw new Error("AGREEMENT_AMOUNT_INVALID");
    }
    return { action, id: id(source.id), amount };
  }
  if (action === "agreement.remove" || action === "preview.remove" || action === "customer.remove") {
    return { action, id: id(source.id) };
  }
  if (action === "customer.update") {
    const patch = pick(source.patch, CUSTOMER_FIELDS);
    if (patch.name !== undefined && (typeof patch.name !== "string" || patch.name.trim().length < 1 || patch.name.length > 120)) {
      throw new Error("CUSTOMER_UPDATE_INVALID");
    }
    if (patch.phone !== undefined && (typeof patch.phone !== "string" || patch.phone.length > 40)) {
      throw new Error("CUSTOMER_UPDATE_INVALID");
    }
    if (patch.status !== undefined && !["active", "invited", "suspended"].includes(patch.status)) {
      throw new Error("CUSTOMER_UPDATE_INVALID");
    }
    return { action, id: id(source.id), patch };
  }
  if (action === "customer.invite") {
    const customer = object(source.customer);
    const email = String(customer.email ?? "").trim().toLowerCase();
    const name = String(customer.name ?? "").trim();
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(email) || email.length > 254) {
      throw new Error("CUSTOMER_INVITE_INVALID");
    }
    if (["admin@mechartcap.com", "desk@mechartcap.com"].includes(email)) {
      throw new Error("RESERVED_DESK_EMAIL");
    }
    if (!name || name.length > 120 || String(customer.phone ?? "").length > 40 || customer.role !== "collector") {
      throw new Error("CUSTOMER_INVITE_INVALID");
    }
    return {
      action,
      customer: {
        id: id(customer.id),
        name,
        email,
        phone: String(customer.phone ?? "").trim(),
        role: "collector",
        status: "invited",
        member: Boolean(customer.member),
      },
    };
  }
  const url = String(source.url ?? "");
  if (
    url.length > 2048 ||
    !url.startsWith("/") ||
    url.startsWith("//")
  ) {
    throw new Error("PREVIEW_URL_INVALID");
  }
  const kind = String(source.kind ?? "other");
  if (kind.length > 40 || !PREVIEW_KINDS.has(kind)) throw new Error("PREVIEW_KIND_INVALID");
  return {
    action,
    id: id(source.id),
    timepieceId: id(source.timepieceId),
    kind,
    url,
  };
}
