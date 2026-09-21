import { MAX_CONTRACT_PIECES } from "./contract/repo-contract.mjs";
import { SCENARIO_60 } from "./contract/repo-scale.mjs";
import { isReservedDeskEmail } from "./desk-identities.mjs";
import { isRetailRole } from "./roles.mjs";
import { parseTenantCreate, parseTenantUpdatePatch } from "./tenant-brand.mjs";
import {
  DEFAULT_REQUIRED_PHOTO_KINDS,
  PHOTO_KINDS,
  REQUESTABLE_PHOTO_KINDS,
  normalizeRequiredPhotoKinds,
} from "./timepiece-shots.mjs";

const ACTIONS = new Set([
  "profile.update",
  "appraisal.submit",
  "appraisal.return",
  "appraisal.decide",
  "appraisal.reopen",
  "timepiece.create",
  "timepiece.update",
  "timepiece.deskUpdate",
  "timepiece.remove",
  "request.submit",
  "request.deskReturn",
  "request.decline",
  "request.withdraw",
  "request.flagCustomerSuccess",
  "request.signCollector",
  "request.recordDelivery",
  "request.inspect",
  "request.executeMac",
  "request.resendExecuted",
  "request.recordReturn",
  "agreement.updateScale",
  "agreement.freezeScale",
  "agreement.recordEnd",
  "agreement.clearEnd",
  "agreement.renew",
  "agreement.remove",
  "preview.upsert",
  "preview.remove",
  "customer.update",
  "customer.remove",
  "customer.invite",
  "settings.update",
  "catalog.upsert",
  "catalog.remove",
  "catalog.sparkle",
  "brand.upsert",
  "shell.upsert",
  "shell.remove",
  "tenant.create",
  "tenant.update",
]);

const PIECE_FIELDS = [
  "id", "brand", "model", "reference", "serial", "catalogId", "status", "condition", "boxPapers",
  "caseMetal", "caseType", "caseDiameter", "dialColor", "buckle", "band",
  "bandMaterial", "complication", "assetCode", "videoName", "videoDurationSeconds",
];
const DESK_PIECE_FIELDS = ["status", "financeable", "valueLow", "valueHigh", "evaluatedAt", "assetCode"];
const PROFILE_FIELDS = ["name", "phone", "avatar", "onboardingComplete", "preferences", "role"];
/**
 * How the pieces reach the Desk. Mirrors `DELIVERY_METHODS` in `lib/catalog.ts`,
 * which this ESM module cannot import through the `@/` alias; keep both lists
 * identical.
 */
export const REQUEST_DELIVERY_METHODS = Object.freeze([
  "Insured courier",
  "Desk arranges intake",
  "Private appointment",
]);
/** The Desk confirms or declines. There is no lower: the app avoids negotiation. */
const REQUEST_DESK_DECISIONS = Object.freeze(["confirm", "decline"]);
const REQUEST_WATCH_LIMIT = MAX_CONTRACT_PIECES;
const CUSTOMER_FIELDS = ["name", "phone", "status", "member", "role"];
const SETTINGS_FIELDS = [
  "maxLtv", "startingRate", "setupFee", "earlyRepurchaseAmount", "brokerFee",
  "minMonths", "earlyStartMonth", "earlyUntilMonth", "typicalTerm",
  "membershipMonthly", "vaultLocation", "requiredPhotoKinds", "brandPreset",
];
const CATALOG_FIELDS = [
  "id", "brandId", "brand", "model", "reference", "caseMetal", "caseDiameter",
  "typicalLow", "typicalHigh", "financeable", "notes", "retailVisible",
  "photoObjectKey", "photoSourceUrl", "photoLicense", "photoAttribution",
  "marketSourceUrls", "marketRetrievedOn",
];
const BRAND_FIELDS = [
  "id", "name", "tier", "slug", "logoAssetKey", "retailVisible", "sortOrder",
];
const SHELL_FIELDS = [
  "id", "code", "title", "termMonths", "rate", "ltv", "setupFee",
  "earlyRepurchaseAmount", "brokerFee", "minMonths", "earlyStartMonth",
  "earlyUntilMonth", "status", "createdAt",
];
const PREVIEW_KINDS = new Set([...PHOTO_KINDS, "legacy_preview"]);
const SCALE_FIELDS = ["purchaseShare", "setupFee", "annualAdjustment", "earlyRepurchaseAmount", "brokerFee", "minMonths", "earlyStartMonth", "earlyUntilMonth"];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PG_INTEGER_MAX_DOLLARS = 21_474_836.47;

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
    if (typeof raw !== "number" || !Number.isFinite(raw) || raw < minimum || raw > 1) {
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

function boundedText(value, code, maximum, required = true) {
  const parsed = String(value ?? "").trim();
  if ((required && !parsed) || parsed.length > maximum) throw new Error(code);
  return parsed;
}

function appraisalText(value, code, maximum, required = true) {
  const cleaned = String(value ?? "").replace(/[\u0000-\u001F\u007F]/g, " ").trim();
  if ((required && !cleaned) || cleaned.length > maximum) throw new Error(code);
  return cleaned;
}

function nonNegativeMoney(value, code, maximum = PG_INTEGER_MAX_DOLLARS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error(code);
  }
  return parsed;
}

function positiveWhole(value, code, maximum = 24) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(code);
  return parsed;
}

/** The pieces on a request, deduplicated. Bounded so one Apply cannot reserve a warehouse. */
function requestWatchIds(value) {
  if (!Array.isArray(value)) throw new Error("WATCH_IDS_REQUIRED");
  const ids = [...new Set(value.map(id))];
  if (ids.length < 1 || ids.length > REQUEST_WATCH_LIMIT) throw new Error("WATCH_IDS_REQUIRED");
  return ids;
}

/**
 * The sale amount as the collector typed it. Whole dollars and the LTV cap are
 * the server's call: it knows the appraisal and the Desk's settings.
 */
function requestAmount(value) {
  const parsed = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1_000_000_000) {
    throw new Error("AGREEMENT_AMOUNT_INVALID");
  }
  return parsed;
}

function requestDelivery(value) {
  if (!REQUEST_DELIVERY_METHODS.includes(value)) throw new Error("DELIVERY_METHOD_INVALID");
  return value;
}

function requestNote(value) {
  return appraisalText(value, "NOTE_TOO_LONG", 1_000, false);
}

function typedName(value) {
  return appraisalText(value, "TYPED_NAME_REQUIRED", 120);
}

function snapshotHash(value) {
  const parsed = String(value ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(parsed)) throw new Error("DOCUMENT_STALE");
  return parsed;
}

function paymentReference(value) {
  const parsed = String(value ?? "").trim();
  if (!parsed) throw new Error("PAYMENT_REFERENCE_REQUIRED");
  return boundedText(parsed, "PAYMENT_REFERENCE_REQUIRED", 160);
}

const INSPECT_DECISIONS = Object.freeze(["confirm", "refuse", "drop"]);
const INSPECT_OUTCOMES = Object.freeze(["proceed", "decline"]);
const CHECKLIST_KEYS = Object.freeze([
  "identityVerified",
  "serialsMatch",
  "conditionMatches",
  "termAgreed",
  "inCustody",
]);

function inspectOutcome(value) {
  if (!INSPECT_OUTCOMES.includes(value)) throw new Error("REQUEST_DECISION_INVALID");
  return value;
}

function inspectPieces(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > REQUEST_WATCH_LIMIT) {
    throw new Error("WATCH_IDS_REQUIRED");
  }
  const seen = new Set();
  return value.map((entry) => {
    const row = object(entry, "LIVE_BOOK_OPERATION_INVALID");
    const timepieceId = id(row.timepieceId);
    if (seen.has(timepieceId)) throw new Error("WATCH_IDS_REQUIRED");
    seen.add(timepieceId);
    const decision = String(row.decision ?? "");
    if (!INSPECT_DECISIONS.includes(decision)) throw new Error("REQUEST_DECISION_INVALID");
    const parsed = { timepieceId, decision };
    if (decision === "confirm") {
      const cents = Number(row.inspectedValueCents);
      if (!Number.isInteger(cents) || cents < 0) throw new Error("INSPECTED_VALUE_REQUIRED");
      parsed.inspectedValueCents = cents;
    } else if (row.inspectedValueCents !== undefined) {
      throw new Error("LIVE_BOOK_OPERATION_INVALID");
    }
    return parsed;
  });
}

function inspectChecklist(value) {
  const row = object(value, "CHECKLIST_INCOMPLETE");
  const parsed = {};
  for (const key of CHECKLIST_KEYS) {
    if (row[key] !== true) throw new Error("CHECKLIST_INCOMPLETE");
    parsed[key] = true;
  }
  return parsed;
}

/**
 * The row the caller was looking at. A move against a stale row is a conflict
 * the server reports, not a silent overwrite (R25).
 */
function expectedRow(source) {
  const expectedStatus = source.expectedStatus;
  const expectedVersion = source.expectedVersion;
  if (typeof expectedStatus !== "string" || !expectedStatus || expectedStatus.length > 32) {
    throw new Error("LIVE_BOOK_OPERATION_INVALID");
  }
  if (!Number.isSafeInteger(expectedVersion) || expectedVersion < 0) {
    throw new Error("LIVE_BOOK_OPERATION_INVALID");
  }
  return { expectedStatus, expectedVersion };
}

function assertSchedule(source, termMonths, code = "AGREEMENT_SCALE_INVALID") {
  const minMonths = Number(source.minMonths);
  const earlyStartMonth = Number(source.earlyStartMonth);
  const earlyUntilMonth = Number(source.earlyUntilMonth);
  if (
    !Number.isInteger(minMonths) ||
    !Number.isInteger(earlyStartMonth) ||
    !Number.isInteger(earlyUntilMonth) ||
    minMonths > termMonths ||
    earlyStartMonth >= earlyUntilMonth ||
    earlyUntilMonth > termMonths
  ) {
    throw new Error(code);
  }
}

function validateSettingsPatch(value) {
  const parsed = pick(value, SETTINGS_FIELDS);
  if (!Object.keys(parsed).length) throw new Error("SETTINGS_UPDATE_INVALID");
  scale({
    purchaseShare: parsed.maxLtv,
    annualAdjustment: parsed.startingRate,
    setupFee: parsed.setupFee,
    earlyRepurchaseAmount: parsed.earlyRepurchaseAmount,
    brokerFee: parsed.brokerFee,
  });
  for (const key of ["minMonths", "earlyStartMonth", "earlyUntilMonth", "typicalTerm"]) {
    if (parsed[key] !== undefined) parsed[key] = positiveWhole(parsed[key], "SETTINGS_UPDATE_INVALID");
  }
  if (parsed.membershipMonthly !== undefined) {
    parsed.membershipMonthly = nonNegativeMoney(parsed.membershipMonthly, "SETTINGS_UPDATE_INVALID");
  }
  if (parsed.vaultLocation !== undefined) {
    parsed.vaultLocation = boundedText(parsed.vaultLocation, "SETTINGS_UPDATE_INVALID", 240);
  }
  if (parsed.requiredPhotoKinds !== undefined) {
    const kinds = parsed.requiredPhotoKinds;
    if (
      !Array.isArray(kinds) ||
      new Set(kinds).size !== kinds.length ||
      kinds.some((kind) => !REQUESTABLE_PHOTO_KINDS.includes(kind)) ||
      DEFAULT_REQUIRED_PHOTO_KINDS.some((kind) => !kinds.includes(kind))
    ) {
      throw new Error("SETTINGS_UPDATE_INVALID");
    }
    parsed.requiredPhotoKinds = normalizeRequiredPhotoKinds(kinds);
  }
  if (parsed.brandPreset !== undefined) {
    if (parsed.brandPreset !== "mac" && parsed.brandPreset !== "mbf") {
      throw new Error("SETTINGS_UPDATE_INVALID");
    }
  }
  if (
    parsed.minMonths !== undefined &&
    parsed.typicalTerm !== undefined &&
    parsed.minMonths > parsed.typicalTerm
  ) {
    throw new Error("AGREEMENT_SCALE_INVALID");
  }
  if (
    parsed.earlyStartMonth !== undefined &&
    parsed.earlyUntilMonth !== undefined &&
    parsed.earlyStartMonth >= parsed.earlyUntilMonth
  ) {
    throw new Error("AGREEMENT_SCALE_INVALID");
  }
  if (
    parsed.earlyUntilMonth !== undefined &&
    parsed.typicalTerm !== undefined &&
    parsed.earlyUntilMonth > parsed.typicalTerm
  ) {
    throw new Error("AGREEMENT_SCALE_INVALID");
  }
  return parsed;
}

function catalogEntry(value) {
  const parsed = pick(value, CATALOG_FIELDS);
  parsed.id = id(parsed.id);
  for (const key of ["brand", "model"]) {
    parsed[key] = boundedText(parsed[key], "CATALOG_ENTRY_INVALID", 120);
  }
  parsed.brandId = boundedText(parsed.brandId, "CATALOG_ENTRY_INVALID", 160, false);
  for (const key of ["reference", "caseMetal", "caseDiameter"]) {
    parsed[key] = boundedText(parsed[key], "CATALOG_ENTRY_INVALID", 120, false);
  }
  parsed.notes = boundedText(parsed.notes, "CATALOG_ENTRY_INVALID", 2_000, false);
  parsed.typicalLow = nonNegativeMoney(parsed.typicalLow ?? 0, "CATALOG_ENTRY_INVALID");
  parsed.typicalHigh = nonNegativeMoney(parsed.typicalHigh ?? 0, "CATALOG_ENTRY_INVALID");
  if (parsed.typicalHigh < parsed.typicalLow) throw new Error("CATALOG_ENTRY_INVALID");
  if (parsed.financeable === undefined) parsed.financeable = false;
  if (typeof parsed.financeable !== "boolean") throw new Error("CATALOG_ENTRY_INVALID");
  if (parsed.retailVisible === undefined) parsed.retailVisible = false;
  if (typeof parsed.retailVisible !== "boolean") throw new Error("CATALOG_ENTRY_INVALID");
  parsed.photoObjectKey = parsed.photoObjectKey ? boundedText(parsed.photoObjectKey, "CATALOG_ENTRY_INVALID", 400) : null;
  parsed.photoSourceUrl = boundedText(parsed.photoSourceUrl, "CATALOG_ENTRY_INVALID", 2_000, false);
  parsed.photoLicense = boundedText(parsed.photoLicense, "CATALOG_ENTRY_INVALID", 120, false);
  parsed.photoAttribution = boundedText(parsed.photoAttribution, "CATALOG_ENTRY_INVALID", 400, false);
  parsed.marketSourceUrls = Array.isArray(parsed.marketSourceUrls)
    ? parsed.marketSourceUrls.map((url) => boundedText(url, "CATALOG_ENTRY_INVALID", 2_000)).filter(Boolean)
    : [];
  parsed.marketRetrievedOn = parsed.marketRetrievedOn
    ? boundedText(parsed.marketRetrievedOn, "CATALOG_ENTRY_INVALID", 40)
    : null;
  if (parsed.retailVisible && !parsed.photoObjectKey && !parsed.photoSourceUrl) {
    throw new Error("PHOTO_REQUIRED");
  }
  return parsed;
}

function catalogBrand(value) {
  const parsed = pick(value, BRAND_FIELDS);
  parsed.id = id(parsed.id);
  parsed.name = boundedText(parsed.name, "CATALOG_ENTRY_INVALID", 120);
  const tier = Number(parsed.tier);
  if (tier !== 1 && tier !== 2) throw new Error("CATALOG_ENTRY_INVALID");
  parsed.tier = tier;
  parsed.slug = boundedText(parsed.slug, "CATALOG_ENTRY_INVALID", 160, false)
    || parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  parsed.logoAssetKey = parsed.logoAssetKey
    ? boundedText(parsed.logoAssetKey, "CATALOG_ENTRY_INVALID", 400)
    : null;
  if (parsed.retailVisible === undefined) parsed.retailVisible = false;
  if (typeof parsed.retailVisible !== "boolean") throw new Error("CATALOG_ENTRY_INVALID");
  parsed.sortOrder = positiveWhole(parsed.sortOrder ?? 1, "CATALOG_ENTRY_INVALID", 10_000);
  return parsed;
}

function agreementShell(value) {
  const parsed = pick(value, SHELL_FIELDS);
  parsed.id = id(parsed.id);
  parsed.code = boundedText(parsed.code, "AGREEMENT_SHELL_INVALID", 120);
  parsed.title = boundedText(parsed.title, "AGREEMENT_SHELL_INVALID", 200);
  parsed.termMonths = term(parsed.termMonths);
  parsed.createdAt = isoDate(parsed.createdAt);
  if (!["open", "assigned", "closed"].includes(parsed.status)) {
    throw new Error("AGREEMENT_SHELL_INVALID");
  }
  const terms = scale({
    purchaseShare: parsed.ltv,
    annualAdjustment: parsed.rate,
    setupFee: parsed.setupFee,
    earlyRepurchaseAmount: parsed.earlyRepurchaseAmount,
    brokerFee: parsed.brokerFee,
    minMonths: parsed.minMonths,
    earlyStartMonth: parsed.earlyStartMonth,
    earlyUntilMonth: parsed.earlyUntilMonth,
  });
  parsed.ltv = terms.purchaseShare;
  parsed.rate = terms.annualAdjustment;
  parsed.setupFee = terms.setupFee;
  parsed.earlyRepurchaseAmount = terms.earlyRepurchaseAmount;
  parsed.brokerFee = terms.brokerFee;
  const tenor = SCENARIO_60.tenors[parsed.termMonths] ?? SCENARIO_60.tenors[12];
  parsed.minMonths = positiveWhole(parsed.minMonths ?? tenor.minMonths, "AGREEMENT_SHELL_INVALID");
  parsed.earlyStartMonth = positiveWhole(parsed.earlyStartMonth ?? tenor.earlyStart, "AGREEMENT_SHELL_INVALID");
  parsed.earlyUntilMonth = positiveWhole(parsed.earlyUntilMonth ?? tenor.earlyUntil, "AGREEMENT_SHELL_INVALID");
  assertSchedule(parsed, parsed.termMonths);
  return parsed;
}

export function parseLiveBookOperation(input) {
  const source = object(input);
  const action = String(source.action ?? "");
  if (!ACTIONS.has(action)) throw new Error("LIVE_BOOK_ACTION_INVALID");

  if (action === "profile.update") {
    const patch = pick(source.patch, PROFILE_FIELDS);
    if (patch.role !== undefined && !isRetailRole(patch.role)) {
      throw new Error("PROFILE_ROLE_INVALID");
    }
    return { action, patch };
  }
  if (action === "appraisal.submit") {
    return {
      action,
      id: id(source.id),
      timepieceId: id(source.timepieceId),
      note: appraisalText(source.note, "NOTE_TOO_LONG", 256, false),
    };
  }
  if (action === "appraisal.return") {
    return {
      action,
      id: id(source.id),
      note: appraisalText(source.note, "APPRAISAL_RETURN_INVALID", 1_000),
    };
  }
  if (action === "appraisal.decide") {
    const decision = String(source.decision ?? "");
    if (decision === "refuse") {
      if (
        source.value !== undefined ||
        source.rangeLow !== undefined ||
        source.rangeHigh !== undefined
      ) {
        throw new Error("APPRAISAL_DECISION_INVALID");
      }
      return { action, id: id(source.id), decision };
    }
    if (decision !== "accept") throw new Error("APPRAISAL_DECISION_INVALID");
    if (
      source.value === undefined ||
      source.rangeLow === undefined ||
      source.rangeHigh === undefined
    ) {
      throw new Error("RANGE_REQUIRED");
    }
    const value = nonNegativeMoney(source.value, "APPRAISAL_DECISION_INVALID");
    const rangeLow = nonNegativeMoney(source.rangeLow, "APPRAISAL_DECISION_INVALID");
    const rangeHigh = nonNegativeMoney(source.rangeHigh, "APPRAISAL_DECISION_INVALID");
    if (rangeHigh < rangeLow) throw new Error("APPRAISAL_DECISION_INVALID");
    return { action, id: id(source.id), decision, value, rangeLow, rangeHigh };
  }
  if (action === "appraisal.reopen") {
    return {
      action,
      id: id(source.id),
      reason: appraisalText(source.reason, "APPRAISAL_REOPEN_INVALID", 1_000),
    };
  }
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
  if (action === "request.submit") {
    const parsed = {
      action,
      id: id(source.id),
      watchIds: requestWatchIds(source.watchIds),
      termMonths: term(source.termMonths),
      amount: requestAmount(source.amount),
      delivery: requestDelivery(source.delivery),
      note: requestNote(source.note),
    };
    if (source.agreementCode !== undefined) {
      parsed.agreementCode = boundedText(source.agreementCode, "LIVE_BOOK_OPERATION_INVALID", 40);
    }
    return parsed;
  }
  if (action === "request.deskReturn") {
    const decision = String(source.decision ?? "");
    if (!REQUEST_DESK_DECISIONS.includes(decision)) throw new Error("REQUEST_DECISION_INVALID");
    return { action, id: id(source.id), decision, note: requestNote(source.note), ...expectedRow(source) };
  }
  if (action === "request.decline" || action === "request.withdraw") {
    return { action, id: id(source.id), note: requestNote(source.note), ...expectedRow(source) };
  }
  if (action === "request.flagCustomerSuccess") {
    if (typeof source.flag !== "boolean") throw new Error("LIVE_BOOK_OPERATION_INVALID");
    return { action, id: id(source.id), flag: source.flag, note: requestNote(source.note) };
  }
  if (action === "request.signCollector") {
    const parsed = {
      action,
      id: id(source.id),
      typedName: typedName(source.typedName),
      snapshotHash: snapshotHash(source.snapshotHash),
      note: requestNote(source.note),
      ...expectedRow(source),
    };
    if (source.delivery !== undefined) parsed.delivery = requestDelivery(source.delivery);
    return parsed;
  }
  if (action === "request.recordDelivery" || action === "request.recordReturn") {
    return { action, id: id(source.id), note: requestNote(source.note), ...expectedRow(source) };
  }
  if (action === "request.inspect") {
    return {
      action,
      id: id(source.id),
      outcome: inspectOutcome(source.outcome),
      pieces: inspectPieces(source.pieces),
      note: requestNote(source.note),
      ...expectedRow(source),
    };
  }
  if (action === "request.executeMac") {
    return {
      action,
      id: id(source.id),
      typedName: typedName(source.typedName),
      snapshotHash: snapshotHash(source.snapshotHash),
      paymentReference: paymentReference(source.paymentReference),
      checklist: inspectChecklist(source.checklist),
      note: requestNote(source.note),
      ...expectedRow(source),
    };
  }
  if (action === "request.resendExecuted") {
    return { action, id: id(source.id), note: requestNote(source.note), ...expectedRow(source) };
  }
  if (action === "agreement.updateScale") {
    return { action, id: id(source.id), scale: scale(source.scale), termMonths: term(source.termMonths) };
  }
  if (action === "agreement.freezeScale") {
    return { action, id: id(source.id), scale: scale(source.scale) };
  }
  if (action === "agreement.clearEnd") {
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
    };
  }
  if (action === "agreement.remove" || action === "preview.remove" || action === "customer.remove") {
    return { action, id: id(source.id) };
  }
  if (action === "settings.update") {
    return { action, patch: validateSettingsPatch(source.patch) };
  }
  if (action === "tenant.create") {
    const tenant = parseTenantCreate(source);
    return { action, code: tenant.code, name: tenant.name };
  }
  if (action === "tenant.update") {
    return { action, id: id(source.id), patch: parseTenantUpdatePatch(source.patch) };
  }
  if (action === "catalog.upsert") {
    return { action, entry: catalogEntry(source.entry) };
  }
  if (action === "brand.upsert") {
    return { action, brand: catalogBrand(source.brand) };
  }
  if (action === "catalog.sparkle") {
    const kind = String(source.kind ?? "");
    if (kind !== "brand" && kind !== "model") throw new Error("CATALOG_ENTRY_INVALID");
    return { action, kind, id: id(source.id) };
  }
  if (action === "catalog.remove" || action === "shell.remove") {
    return { action, id: id(source.id) };
  }
  if (action === "shell.upsert") {
    return { action, shell: agreementShell(source.shell) };
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
    if (patch.role !== undefined && !isRetailRole(patch.role)) {
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
    if (isReservedDeskEmail(email)) {
      throw new Error("RESERVED_DESK_EMAIL");
    }
    if (!name || name.length > 120 || String(customer.phone ?? "").length > 40) {
      throw new Error("CUSTOMER_INVITE_INVALID");
    }
    const role = isRetailRole(customer.role) ? customer.role : "collector";
    return {
      action,
      customer: {
        id: id(customer.id),
        name,
        email,
        phone: String(customer.phone ?? "").trim(),
        role,
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
