import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { maxPurchaseAmount } from "@/lib/catalog";
import {
  REQUEST_STATES,
  applyAgreementEnd,
  bookLabel,
  deskToday,
  isAppraisalCurrent,
  isLiveBookLabel,
  isRequestExpired,
  isUnderReview,
  validateRecordedEndKind,
} from "@/lib/contract/repo-book.mjs";
import { legacyAgreementToRequest } from "@/lib/contract/legacy-agreement.mjs";
import { planRenewal } from "@/lib/contract/repo-renewal.mjs";
import { applyTransition } from "@/lib/contract/request-transitions.mjs";
import {
  agreementScaleFromDesk,
  assertScenario60Floors,
} from "@/lib/contract/repo-scale.mjs";
import { parseLiveBookOperation } from "@/lib/live-book-operation.mjs";
import { dispatchMail } from "@/lib/mail";
import { isLiveBookEnabled } from "@/lib/env/live-book-flag.mjs";
import type { Agreement } from "@/lib/types";
import { DEFAULT_MIN_SALE_AMOUNT, DEFAULT_SETTINGS } from "@/lib/theme";
import type { Database } from "./client";
import {
  type DocumentStore,
  deskBrandPreset,
  insertStageDocumentRow,
  liveAgreementHasDocuments,
  recoverCurrentStageDocument,
  renderStageDocument,
  sendExecutedDocumentEmails,
} from "./agreement-documents";
import { consumeAccessRateLimit } from "./collector-sessions";
import { centsToDollars, dollarsToCents } from "./money.mjs";
import { closeExpiredRequest, recordAgreementEvent } from "./request-events";
import {
  assertAppraisalPhotoChangeAllowed,
  assertRetailPieceEditable,
  decideAppraisalAttempt,
  finalizeAcceptedAttempt,
  reopenAppraisalAttempt,
  returnAppraisalAttempt,
  reverseAcceptedAttempt,
  submitAppraisalAttempt,
  pieceHasAppraisalAttempt,
} from "./appraisal-attempts";
import {
  lockStaffForDeskMutation,
  writeDeskAudit,
} from "./staff-accounts";
import type { Actor } from "./records";
import { deskActor } from "./records";
import {
  agreements as preparedAgreements,
  agreementShells,
  allocations,
  appraisalAttempts,
  applications,
  catalogReferences,
  collectorSessions,
  customers,
  deskSettings,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  photoObjects,
  staffAccounts,
  timepieces,
  agreementDocuments,
  agreementEvents,
  agreementSignatures,
} from "./schema";

import { canEditAppraisal, canInspect, isDeskRole, isSuperAdmin, patchNeedsAppraisal } from "../roles.mjs";
import { normalizeRequiredPhotoKinds } from "../timepiece-shots.mjs";
import type { DeskRole } from "../types";

type Operation = ReturnType<typeof parseLiveBookOperation>;
type LiveAgreementRow = typeof liveAgreements.$inferSelect;

/** What the caller needs after the transaction: env, the object store, and the pool to render with. */
type OperationContext = {
  env: NodeJS.ProcessEnv;
  documentStore?: DocumentStore;
  rootDb: Database;
  clientAddress?: string;
  sendEmail?: (message: {
    from: string;
    to: string[];
    replyTo: string;
    subject: string;
    html: string;
    text: string;
    tags: { name: string; value: string }[];
  }, options?: { idempotencyKey?: string }) => Promise<{ data: { id?: string } | null; error: unknown }>;
};

/** A request row as the API returns it. `customerSuccess` is desk-only (KTD22). */
export type RequestProjection = {
  id: string;
  watchIds: string[];
  amount: number;
  termMonths: number;
  delivery: string;
  ownerName: string;
  email: string;
  status: string;
  createdAt: string;
  agreementCode?: string;
  version: number;
  lastActionAt: string;
  closeReason?: string;
  executedOn?: string;
  pieceCaps?: Record<string, number>;
  scale?: Record<string, unknown>;
  customerSuccess?: boolean;
};

export type RequestSubmitResult = {
  agreement: RequestProjection;
  /** Runs after the transaction commits, in order, as one chain. */
  afterCommit: Array<() => Promise<unknown>>;
};

export type RequestTransitionResult = {
  agreement: RequestProjection;
  afterCommit?: Array<() => Promise<unknown>>;
};

/** `applyTransition` is plain JS; this is the shape its two answers take. */
type TransitionOutcome =
  | { ok: false; error: string }
  | {
      ok: true;
      agreement: Agreement & { closeReason?: string; version: number };
      mintsStage?: string;
      event: {
        action: string;
        actorKind: string;
        actorId: string;
        fromStatus: string;
        toStatus: string;
        amount: number;
        version: number;
        note: string;
        internal: boolean;
        createdAt: string;
      };
    };

/** The four moves that need an expiry pre-pass before their own transaction (KTD12). */
const REQUEST_TRANSITIONS = new Set([
  "request.deskReturn",
  "request.decline",
  "request.withdraw",
  "request.flagCustomerSuccess",
  "request.signCollector",
  "request.recordDelivery",
  "request.inspect",
  "request.executeMac",
]);

const REQUEST_SUBMITS_PER_DAY = 5;
const DAY_MS = 86_400_000;
const AGREEMENT_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function mintAgreementCode() {
  const bytes = randomBytes(6);
  let code = "MAC-";
  for (const byte of bytes) code += AGREEMENT_CODE_ALPHABET[byte % AGREEMENT_CODE_ALPHABET.length];
  return code;
}

function isDesk(
  actor: Actor,
): actor is Extract<Actor, { role: DeskRole }> {
  return isDeskRole(actor.role);
}

function requireDesk(actor: Actor) {
  if (!isDesk(actor)) throw new Error("DESK_REQUIRED");
}

/**
 * Appraisal numbers and catalog ranges belong to appraisers and super admins.
 * Admins may read them and operate the rest of the desk (R5, KTD2).
 */
function requireAppraiser(actor: Actor) {
  requireDesk(actor);
  if (!canEditAppraisal(actor)) throw new Error("ROLE_FORBIDDEN");
}

async function ownedPiece(db: Database, actor: Actor, id: string) {
  const where = !isDesk(actor)
    ? and(eq(timepieces.id, id), eq(timepieces.customerId, actor.customerId))
    : eq(timepieces.id, id);
  const [piece] = await db.select().from(timepieces).where(where).limit(1);
  if (!piece) throw new Error("TIMEPIECE_NOT_FOUND");
  return piece;
}

async function lockedOwnedPiece(db: Database, actor: Actor, id: string) {
  const where = !isDesk(actor)
    ? and(eq(timepieces.id, id), eq(timepieces.customerId, actor.customerId))
    : eq(timepieces.id, id);
  const [piece] = await db
    .select()
    .from(timepieces)
    .where(where)
    .for("update")
    .limit(1);
  if (!piece) throw new Error("TIMEPIECE_NOT_FOUND");
  return piece;
}

async function ownedAgreement(db: Database, actor: Actor, id: string) {
  const where = !isDesk(actor)
    ? and(eq(liveAgreements.id, id), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, id);
  const [agreement] = await db.select().from(liveAgreements).where(where).for("update").limit(1);
  if (!agreement) throw new Error("AGREEMENT_NOT_FOUND");
  const [members, ends] = await Promise.all([
    db.select().from(liveAgreementMembers).where(eq(liveAgreementMembers.agreementId, id)),
    db.select().from(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, id)),
  ]);
  // A row written before the request columns existed still carries a legacy
  // status, and the mapping dates those. Every other row states its own date.
  const mapped = legacyAgreementToRequest({
    status: agreement.status,
    createdAt: agreement.createdOn,
    signedAt: agreement.signedOn ?? undefined,
    executedOn: agreement.executedOn ?? undefined,
  });
  return {
    ...agreement,
    amount: agreement.amountCents / 100,
    createdAt: agreement.createdOn,
    // A legacy row that recorded no signing day is still signed, and the terms
    // freeze on this date, so take the one the mapping gives it.
    signedAt: agreement.signedOn ?? mapped.signedAt ?? undefined,
    executedOn: agreement.executedOn ?? mapped.executedOn,
    closeReason: agreement.closeReason ?? undefined,
    lastActionAt: agreement.lastActionAt.toISOString(),
    watchIds: members.map((row) => row.timepieceId),
    bookEnd: ends[0]
      ? { kind: ends[0].kind, date: ends[0].endedOn, amount: ends[0].amountCents / 100 }
      : undefined,
  } as Agreement & { customerId: string; amountCents: number };
}

/**
 * A piece reserved for a request is spoken for just as firmly as one on the
 * book, and the held-piece index says so. These checks answer first, so that a
 * caller reads a named conflict instead of a unique violation.
 */
const HELD_MEMBER_STATUSES = ["reserved", "live"];

function requireMutableAgreement(agreement: Agreement) {
  // A recorded signature freezes the terms, exactly as the browser book does.
  if (agreement.signedAt || agreement.bookEnd) {
    throw new Error("AGREEMENT_IMMUTABLE");
  }
  // A request froze its scale at Apply and moves only through `request.*`;
  // a closed one is history. Legacy rows keep the rule above.
  if (REQUEST_STATES.includes(agreement.status) || agreement.status === "closed") {
    throw new Error("AGREEMENT_IMMUTABLE");
  }
}

function projectRequestRow(
  row: LiveAgreementRow,
  watchIds: string[],
  actor: Actor,
): RequestProjection {
  const projection: RequestProjection = {
    id: row.id,
    watchIds,
    amount: row.amountCents / 100,
    termMonths: row.termMonths,
    delivery: row.delivery,
    ownerName: row.ownerName,
    email: row.email,
    status: row.status,
    createdAt: row.createdOn,
    version: row.version,
    lastActionAt: row.lastActionAt instanceof Date
      ? row.lastActionAt.toISOString()
      : String(row.lastActionAt),
  };
  if (row.agreementCode) projection.agreementCode = row.agreementCode;
  if (row.closeReason) projection.closeReason = row.closeReason;
  if (row.executedOn) projection.executedOn = row.executedOn;
  if (row.pieceCaps && typeof row.pieceCaps === "object") {
    projection.pieceCaps = row.pieceCaps as Record<string, number>;
  }
  if (row.scale && typeof row.scale === "object") projection.scale = row.scale as Record<string, unknown>;
  if (isDesk(actor)) projection.customerSuccess = row.customerSuccess;
  return projection;
}

function chainedJobs(jobs: Array<() => Promise<unknown>>) {
  return [async () => {
    for (const job of jobs) await job();
  }];
}

function noticeMail(
  kind:
    | "request_submitted"
    | "request_confirmed"
    | "request_declined"
    | "request_withdrawn"
    | "request_signed"
    | "request_inspected"
    | "request_expired",
  agreement: Pick<LiveAgreementRow, "ownerName" | "email" | "agreementCode" | "amountCents" | "delivery" | "termMonths">,
  context: OperationContext,
  message = "",
) {
  return async () => dispatchMail({
    kind,
    name: agreement.ownerName,
    email: agreement.email,
    watch: agreement.agreementCode ?? "",
    amount: String(centsToDollars(agreement.amountCents)),
    delivery: agreement.delivery,
    termMonths: agreement.termMonths,
    message,
    brandPreset: await deskBrandPreset(context.rootDb),
  }, { env: context.env, sendEmail: context.sendEmail });
}

function renderThen(
  context: OperationContext,
  documentId: string,
  extra: Array<() => Promise<unknown>> = [],
) {
  return chainedJobs([
    () => renderStageDocument(context.rootDb, documentId, context.documentStore, context.env),
    ...extra,
  ]);
}

/**
 * KTD12. A request whose retail window ran out is closed for real before any
 * move against it, in its own transaction, so the close stays committed even
 * though the move is then refused. Ownership answers before state: a retail
 * caller who does not own the row reads `AGREEMENT_NOT_FOUND`, never a state.
 */
async function closeIfExpiredBeforeMove(db: Database, actor: Actor, id: string, context: OperationContext) {
  const where = !isDesk(actor)
    ? and(eq(liveAgreements.id, id), eq(liveAgreements.customerId, actor.customerId))
    : eq(liveAgreements.id, id);
  const [row] = await db
    .select({ status: liveAgreements.status, lastActionAt: liveAgreements.lastActionAt })
    .from(liveAgreements)
    .where(where)
    .limit(1);
  if (!row) throw new Error("AGREEMENT_NOT_FOUND");
  if (!isRequestExpired({ status: row.status, lastActionAt: row.lastActionAt.toISOString() })) return;
  const closed = await db.transaction((tx) => closeExpiredRequest(tx as unknown as Database, id));
  if (closed) {
    await noticeMail("request_expired", closed, context)();
    throw new Error("REQUEST_EXPIRED");
  }
}

function pieceValues(timepiece: Record<string, unknown>, actor: Actor) {
  const collector = actor.role === "collector";
  const status = collector
    ? timepiece.status === "reviewing" ? "reviewing" : "not_evaluated"
    : timepiece.status === "appraised" || timepiece.status === "reviewing" ? timepiece.status : "not_evaluated";
  return {
    brand: String(timepiece.brand ?? "").trim(),
    model: String(timepiece.model ?? "").trim(),
    reference: String(timepiece.reference ?? "").trim() || null,
    status,
    financeable: collector ? false : Boolean(timepiece.financeable),
    condition: String(timepiece.condition ?? ""),
    boxPapers: String(timepiece.boxPapers ?? ""),
    caseMetal: String(timepiece.caseMetal ?? ""),
    caseType: String(timepiece.caseType ?? ""),
    caseDiameter: String(timepiece.caseDiameter ?? ""),
    dialColor: String(timepiece.dialColor ?? ""),
    buckle: String(timepiece.buckle ?? ""),
    band: timepiece.band === "bracelet" ? "bracelet" : "strap",
    bandMaterial: String(timepiece.bandMaterial ?? ""),
    complication: String(timepiece.complication ?? ""),
    assetCode: typeof timepiece.assetCode === "string" ? timepiece.assetCode : null,
  };
}

const toBasisPoints = (value: unknown) => Math.round(Number(value) * 10_000);

function settingsRowValues(source: Record<string, unknown>) {
  return {
    maxLtvBps: toBasisPoints(source.maxLtv),
    startingRateBps: toBasisPoints(source.startingRate),
    setupFeeBps: toBasisPoints(source.setupFee),
    earlyRepurchaseAmountBps: toBasisPoints(source.earlyRepurchaseAmount),
    brokerFeeBps: toBasisPoints(source.brokerFee),
    minMonths: Number(source.minMonths),
    earlyStartMonth: Number(source.earlyStartMonth),
    earlyUntilMonth: Number(source.earlyUntilMonth),
    typicalTerm: Number(source.typicalTerm),
    membershipMonthlyCents: Math.round(Number(source.membershipMonthly) * 100),
    vaultLocation: String(source.vaultLocation),
    requiredPhotoKinds: normalizeRequiredPhotoKinds(source.requiredPhotoKinds as string[] | undefined),
    brandPreset: source.brandPreset === "mbf" ? "mbf" : "mac",
  };
}

function settingsRowPatch(patch: Record<string, unknown>) {
  const values = settingsRowValues({ ...DEFAULT_SETTINGS, ...patch });
  const fields: Record<string, keyof typeof values> = {
    maxLtv: "maxLtvBps",
    startingRate: "startingRateBps",
    setupFee: "setupFeeBps",
    earlyRepurchaseAmount: "earlyRepurchaseAmountBps",
    brokerFee: "brokerFeeBps",
    minMonths: "minMonths",
    earlyStartMonth: "earlyStartMonth",
    earlyUntilMonth: "earlyUntilMonth",
    typicalTerm: "typicalTerm",
    membershipMonthly: "membershipMonthlyCents",
    vaultLocation: "vaultLocation",
    requiredPhotoKinds: "requiredPhotoKinds",
    brandPreset: "brandPreset",
  };
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([input]) => patch[input] !== undefined)
      .map(([, column]) => [column, values[column]]),
  );
}

function shellScale(shell: Record<string, unknown>) {
  return {
    purchaseShare: Number(shell.ltv),
    annualAdjustment: Number(shell.rate),
    setupFee: Number(shell.setupFee),
    earlyRepurchaseAmount: Number(shell.earlyRepurchaseAmount),
    brokerFee: Number(shell.brokerFee),
    minMonths: Number(shell.minMonths),
    earlyStartMonth: Number(shell.earlyStartMonth),
    earlyUntilMonth: Number(shell.earlyUntilMonth),
  };
}

function shellRowValues(shell: Record<string, unknown>) {
  return {
    id: String(shell.id),
    code: String(shell.code),
    title: String(shell.title),
    termMonths: Number(shell.termMonths),
    rateBps: toBasisPoints(shell.rate),
    ltvBps: toBasisPoints(shell.ltv),
    setupFeeBps: toBasisPoints(shell.setupFee),
    earlyRepurchaseAmountBps: toBasisPoints(shell.earlyRepurchaseAmount),
    brokerFeeBps: toBasisPoints(shell.brokerFee),
    minMonths: Number(shell.minMonths),
    earlyStartMonth: Number(shell.earlyStartMonth),
    earlyUntilMonth: Number(shell.earlyUntilMonth),
    status: String(shell.status),
    createdOn: String(shell.createdAt),
  };
}

async function serverAgreementScale(db: Database, termMonths: number) {
  const [settingRows, shellRows] = await Promise.all([
    db.select().from(deskSettings).where(eq(deskSettings.id, "default")).limit(1),
    db.select().from(agreementShells).where(eq(agreementShells.status, "open")).limit(1),
  ]);
  const setting = settingRows[0];
  const shell = shellRows[0];
  const settings = setting
    ? {
        ...DEFAULT_SETTINGS,
        maxLtv: setting.maxLtvBps / 10_000,
        startingRate: setting.startingRateBps / 10_000,
        setupFee: setting.setupFeeBps / 10_000,
        earlyRepurchaseAmount: setting.earlyRepurchaseAmountBps / 10_000,
        brokerFee: setting.brokerFeeBps / 10_000,
        minMonths: setting.minMonths,
        earlyStartMonth: setting.earlyStartMonth,
        earlyUntilMonth: setting.earlyUntilMonth,
        typicalTerm: setting.typicalTerm,
        membershipMonthly: setting.membershipMonthlyCents / 100,
        vaultLocation: setting.vaultLocation,
      }
    : DEFAULT_SETTINGS;
  const openShell = shell?.termMonths === termMonths
    ? {
        termMonths: shell.termMonths,
        rate: shell.rateBps / 10_000,
        ltv: shell.ltvBps / 10_000,
        setupFee: shell.setupFeeBps / 10_000,
        earlyRepurchaseAmount: shell.earlyRepurchaseAmountBps / 10_000,
        brokerFee: shell.brokerFeeBps / 10_000,
        minMonths: shell.minMonths,
        earlyStartMonth: shell.earlyStartMonth,
        earlyUntilMonth: shell.earlyUntilMonth,
      }
    : undefined;
  const scale = agreementScaleFromDesk(settings, openShell, termMonths);
  if (!assertScenario60Floors(scale).ok) throw new Error("AGREEMENT_SCALE_INVALID");
  return scale;
}

export const AUDITED_DESK_ACTIONS = new Set([
  "appraisal.return",
  "appraisal.decide",
  "appraisal.reopen",
  "customer.update",
  "customer.remove",
  "customer.invite",
  "timepiece.update",
  "timepiece.deskUpdate",
  "timepiece.remove",
  "request.deskReturn",
  "request.flagCustomerSuccess",
  "request.recordDelivery",
  "request.inspect",
  "request.executeMac",
  "request.resendExecuted",
  "request.recordReturn",
  "agreement.updateScale",
  "agreement.recordEnd",
  "agreement.clearEnd",
  "agreement.renew",
  "agreement.remove",
  "preview.remove",
  "settings.update",
  "catalog.upsert",
  "catalog.remove",
  "shell.upsert",
  "shell.remove",
]);
const LOCKED_APPRAISAL_ACTIONS = new Set([
  "appraisal.submit",
  "appraisal.return",
  "appraisal.decide",
  "appraisal.reopen",
  "timepiece.update",
  "timepiece.deskUpdate",
  "timepiece.remove",
  "preview.upsert",
  "preview.remove",
]);
const LOCKED_AGREEMENT_ACTIONS = new Set([
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
  "agreement.recordEnd",
  "agreement.clearEnd",
  "agreement.renew",
  "agreement.remove",
]);

function auditTargetId(operation: Operation & Record<string, unknown>) {
  if (typeof operation.id === "string") return operation.id;
  if (operation.action === "settings.update") return "default";
  if (operation.shell && typeof operation.shell === "object") {
    return String((operation.shell as Record<string, unknown>).id ?? "");
  }
  if (operation.entry && typeof operation.entry === "object") {
    return String((operation.entry as Record<string, unknown>).id ?? "");
  }
  if (operation.timepiece && typeof operation.timepiece === "object") {
    return String((operation.timepiece as Record<string, unknown>).id ?? "");
  }
  if (operation.customer && typeof operation.customer === "object") {
    return String((operation.customer as Record<string, unknown>).id ?? "");
  }
  return "";
}

function auditDetail(
  operation: Operation & Record<string, unknown>,
  result: unknown,
) {
  if (operation.action === "appraisal.reopen") {
    return { reason: String(operation.reason ?? "") };
  }
  if (
    operation.action === "appraisal.decide" &&
    result &&
    typeof result === "object"
  ) {
    const row = result as Record<string, unknown>;
    return {
      decision: operation.decision,
      decisionNo: row.decisionNo,
      ...(row.rangeWarning ? { rangeWarning: row.rangeWarning } : {}),
    };
  }
  if (operation.action === "appraisal.return") {
    return { note: String(operation.note ?? "") };
  }
  if (operation.action === "request.deskReturn") {
    return { decision: operation.decision, note: String(operation.note ?? "") };
  }
  if (operation.action === "request.flagCustomerSuccess") {
    return { flag: operation.flag, note: String(operation.note ?? "") };
  }
  if (operation.action === "request.recordDelivery" || operation.action === "request.recordReturn") {
    return { note: String(operation.note ?? "") };
  }
  if (operation.action === "request.inspect") {
    return { outcome: operation.outcome, note: String(operation.note ?? "") };
  }
  if (operation.action === "request.executeMac") {
    return { paymentReference: operation.paymentReference, note: String(operation.note ?? "") };
  }
  if (operation.action === "request.resendExecuted") {
    return { note: String(operation.note ?? "") };
  }
  return {};
}

function operationEnv(optionsEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (optionsEnv) return optionsEnv;
  if (process.env.NODE_TEST_CONTEXT) {
    return { ...process.env, RESEND_API_KEY: "" };
  }
  return process.env;
}

export async function executeLiveBookOperation(
  db: Database,
  actor: Actor,
  input: unknown,
  options: {
    clientAddress?: string;
    env?: NodeJS.ProcessEnv;
    documentStore?: DocumentStore;
    sendEmail?: OperationContext["sendEmail"];
  } = {},
) {
  const operation = parseLiveBookOperation(input) as Operation & Record<string, unknown>;
  const context: OperationContext = {
    env: operationEnv(options.env),
    documentStore: options.documentStore,
    rootDb: db,
    clientAddress: options.clientAddress,
    sendEmail: options.sendEmail,
  };
  if (operation.action === "request.submit" || operation.action === "request.withdraw") {
    await consumeRequestThrottle(db, actor, operation.action);
  }
  if (REQUEST_TRANSITIONS.has(operation.action)) {
    await closeIfExpiredBeforeMove(db, actor, String(operation.id), context);
  }
  if (
    isDesk(actor) &&
    isLiveBookEnabled(context.env.MAC_LIVE_BOOK) &&
    AUDITED_DESK_ACTIONS.has(operation.action)
  ) {
    if (!actor.staffId) throw new Error("SESSION_INVALID");
    const staffId = actor.staffId;
    return db.transaction(async (tx) => {
      const staff = await lockStaffForDeskMutation(tx, {
        id: staffId,
        email: actor.email,
        role: actor.role,
      });
      const trusted = deskActor(staff.role, staff.email, staff.id);
      const result = await executeLiveBookOperationCore(
        tx as unknown as Database,
        trusted,
        operation,
        context,
      );
      await writeDeskAudit(
        tx,
        staff,
        operation.action,
        auditTargetId(operation),
        options.clientAddress ?? "unknown",
        auditDetail(operation, result),
      );
      return result;
    });
  }
  if (
    LOCKED_AGREEMENT_ACTIONS.has(operation.action) ||
    LOCKED_APPRAISAL_ACTIONS.has(operation.action)
  ) {
    return db.transaction((tx) =>
      executeLiveBookOperationCore(tx as unknown as Database, actor, operation, context)
    );
  }
  return executeLiveBookOperationCore(db, actor, operation, context);
}

async function executeLiveBookOperationCore(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
) {
  const action = operation.action;

  if (action === "request.submit") return submitRequest(db, actor, operation, context);

  if (action === "request.signCollector") return signCollectorRequest(db, actor, operation, context);
  if (action === "request.recordDelivery") return recordDeliveryRequest(db, actor, operation);
  if (action === "request.inspect") return inspectRequest(db, actor, operation, context);
  if (action === "request.executeMac") return executeMacRequest(db, actor, operation, context);
  if (action === "request.resendExecuted") return resendExecutedRequest(db, actor, operation, context);
  if (action === "request.recordReturn") return recordReturnRequest(db, actor, operation);
  if (REQUEST_TRANSITIONS.has(action)) return transitionRequest(db, actor, operation, context);

  if (action === "appraisal.submit") {
    return submitAppraisalAttempt(db, actor, {
      id: String(operation.id),
      timepieceId: String(operation.timepieceId),
      note: String(operation.note ?? ""),
    });
  }

  if (action === "appraisal.return") {
    return returnAppraisalAttempt(db, actor, {
      id: String(operation.id),
      note: String(operation.note),
    });
  }

  if (action === "appraisal.decide") {
    return decideAppraisalAttempt(db, actor, {
      id: String(operation.id),
      decision: operation.decision === "accept" ? "accept" : "refuse",
      value: operation.value as number | undefined,
      rangeLow: operation.rangeLow as number | undefined,
      rangeHigh: operation.rangeHigh as number | undefined,
    });
  }

  if (action === "appraisal.reopen") {
    return reopenAppraisalAttempt(db, actor, {
      id: String(operation.id),
      reason: String(operation.reason),
    });
  }

  if (action === "settings.update") {
    requireDesk(actor);
    const patch = operation.patch as Record<string, unknown>;
    // Desk-wide photo policy is a super-admin decision (R6).
    if (patch.requiredPhotoKinds !== undefined && !isSuperAdmin(actor)) {
      throw new Error("ROLE_FORBIDDEN");
    }
    if (patch.brandPreset !== undefined && !isSuperAdmin(actor)) {
      throw new Error("ROLE_FORBIDDEN");
    }
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('mac-desk-settings'))`);
    const [current] = await db.select().from(deskSettings)
      .where(eq(deskSettings.id, "default"))
      .for("update")
      .limit(1);
    const currentSettings = current
      ? {
          ...DEFAULT_SETTINGS,
          maxLtv: current.maxLtvBps / 10_000,
          startingRate: current.startingRateBps / 10_000,
          setupFee: current.setupFeeBps / 10_000,
          earlyRepurchaseAmount: current.earlyRepurchaseAmountBps / 10_000,
          brokerFee: current.brokerFeeBps / 10_000,
          minMonths: current.minMonths,
          earlyStartMonth: current.earlyStartMonth,
          earlyUntilMonth: current.earlyUntilMonth,
          typicalTerm: current.typicalTerm,
          membershipMonthly: current.membershipMonthlyCents / 100,
          vaultLocation: current.vaultLocation,
          requiredPhotoKinds: normalizeRequiredPhotoKinds(current.requiredPhotoKinds),
          brandPreset: current.brandPreset === "mbf" ? "mbf" : "mac",
        }
      : DEFAULT_SETTINGS;
    const nextSettings = { ...currentSettings, ...patch };
    const terms = {
      purchaseShare: nextSettings.maxLtv,
      annualAdjustment: nextSettings.startingRate,
      setupFee: nextSettings.setupFee,
      earlyRepurchaseAmount: nextSettings.earlyRepurchaseAmount,
      brokerFee: nextSettings.brokerFee,
    };
    if (
      !assertScenario60Floors(terms).ok ||
      nextSettings.minMonths > nextSettings.typicalTerm ||
      nextSettings.earlyStartMonth >= nextSettings.earlyUntilMonth ||
      nextSettings.earlyUntilMonth > nextSettings.typicalTerm
    ) {
      throw new Error("AGREEMENT_SCALE_INVALID");
    }
    const update = settingsRowPatch(patch);
    if (current) {
      await db.update(deskSettings)
        .set({ ...update, updatedAt: new Date() })
        .where(eq(deskSettings.id, "default"));
    } else {
      await db.insert(deskSettings).values({
        id: "default",
        ...settingsRowValues(nextSettings),
      });
    }
    return;
  }

  if (action === "catalog.upsert") {
    requireAppraiser(actor);
    const entry = operation.entry as Record<string, unknown>;
    const typicalLowCents = dollarsToCents(Number(entry.typicalLow));
    const typicalHighCents = dollarsToCents(Number(entry.typicalHigh));
    if (typicalLowCents === null || typicalHighCents === null) {
      throw new Error("CATALOG_ENTRY_INVALID");
    }
    const values = {
      id: String(entry.id),
      brand: String(entry.brand),
      model: String(entry.model),
      reference: String(entry.reference),
      caseMetal: String(entry.caseMetal),
      caseDiameter: String(entry.caseDiameter),
      typicalLowCents,
      typicalHighCents,
      financeable: Boolean(entry.financeable),
      notes: String(entry.notes),
    };
    await db.insert(catalogReferences).values(values).onConflictDoUpdate({
      target: catalogReferences.id,
      set: {
        brand: values.brand,
        model: values.model,
        reference: values.reference,
        caseMetal: values.caseMetal,
        caseDiameter: values.caseDiameter,
        typicalLowCents: values.typicalLowCents,
        typicalHighCents: values.typicalHighCents,
        financeable: values.financeable,
        notes: values.notes,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (action === "catalog.remove") {
    requireAppraiser(actor);
    const result = await db.delete(catalogReferences)
      .where(eq(catalogReferences.id, String(operation.id)))
      .returning({ id: catalogReferences.id });
    if (!result.length) throw new Error("CATALOG_ENTRY_NOT_FOUND");
    return;
  }

  if (action === "shell.upsert") {
    requireDesk(actor);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('mac-open-agreement-shell'))`);
    const shell = operation.shell as Record<string, unknown>;
    const terms = shellScale(shell);
    if (!assertScenario60Floors(terms).ok) throw new Error("AGREEMENT_SCALE_INVALID");
    const values = shellRowValues(shell);
    const [open] = await db.select({ id: agreementShells.id })
      .from(agreementShells)
      .where(eq(agreementShells.status, "open"))
      .for("update")
      .limit(1);
    if (open?.id === values.id && values.status !== "open") {
      throw new Error("AGREEMENT_OPEN_SHELL_REQUIRED");
    }
    if (values.status === "open" && open && open.id !== values.id) {
      await db.update(agreementShells)
        .set({ status: "assigned", updatedAt: new Date() })
        .where(eq(agreementShells.id, open.id));
    }
    await db.insert(agreementShells).values(values).onConflictDoUpdate({
      target: agreementShells.id,
      set: {
        code: values.code,
        title: values.title,
        termMonths: values.termMonths,
        rateBps: values.rateBps,
        ltvBps: values.ltvBps,
        setupFeeBps: values.setupFeeBps,
        earlyRepurchaseAmountBps: values.earlyRepurchaseAmountBps,
        brokerFeeBps: values.brokerFeeBps,
        minMonths: values.minMonths,
        earlyStartMonth: values.earlyStartMonth,
        earlyUntilMonth: values.earlyUntilMonth,
        status: values.status,
        createdOn: values.createdOn,
        updatedAt: new Date(),
      },
    });
    return;
  }

  if (action === "shell.remove") {
    requireDesk(actor);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('mac-open-agreement-shell'))`);
    const [target] = await db.select({ status: agreementShells.status })
      .from(agreementShells)
      .where(eq(agreementShells.id, String(operation.id)))
      .for("update")
      .limit(1);
    if (!target) throw new Error("AGREEMENT_SHELL_NOT_FOUND");
    if (target.status === "open") throw new Error("AGREEMENT_OPEN_SHELL_REQUIRED");
    const result = await db.delete(agreementShells)
      .where(eq(agreementShells.id, String(operation.id)))
      .returning({ id: agreementShells.id });
    if (!result.length) throw new Error("AGREEMENT_SHELL_NOT_FOUND");
    return;
  }

  if (action === "profile.update") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const patch = operation.patch as Record<string, unknown>;
    await db.update(customers).set({
      name: typeof patch.name === "string" ? patch.name.trim() : undefined,
      phone: typeof patch.phone === "string" ? patch.phone.trim() : undefined,
      avatar: typeof patch.avatar === "string" ? patch.avatar : undefined,
      onboardingComplete: typeof patch.onboardingComplete === "boolean" ? patch.onboardingComplete : undefined,
      preferences: patch.preferences && typeof patch.preferences === "object" ? patch.preferences : undefined,
      updatedAt: new Date(),
    }).where(eq(customers.id, actor.customerId));
    return;
  }

  if (action === "customer.update") {
    requireDesk(actor);
    const id = String(operation.id);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const patch = operation.patch as Record<string, unknown>;
    const nextStatus = patch.status === "suspended" || patch.status === "invited" || patch.status === "active"
      ? patch.status
      : undefined;
    await db.transaction(async (tx) => {
      await tx.update(customers).set({
        name: typeof patch.name === "string" ? patch.name.trim() : undefined,
        phone: typeof patch.phone === "string" ? patch.phone.trim() : undefined,
        status: nextStatus,
        member: typeof patch.member === "boolean" ? patch.member : undefined,
        updatedAt: new Date(),
      }).where(eq(customers.id, id));
      if (nextStatus && nextStatus !== "active") {
        await tx.update(collectorSessions).set({
          revokedAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(collectorSessions.customerId, id),
          isNull(collectorSessions.revokedAt),
        ));
      }
    });
    return;
  }

  if (action === "customer.invite") {
    requireDesk(actor);
    const customer = operation.customer as Record<string, unknown>;
    const id = String(customer.id);
    const email = String(customer.email);
    await db.execute(sql`select pg_advisory_xact_lock(hashtext(${email}))`);
    const [customerCollision, staffCollision] = await Promise.all([
      db.select({ id: customers.id, email: customers.email })
        .from(customers)
        .where(or(eq(customers.id, id), eq(customers.email, email)))
        .limit(1),
      db.select({ id: staffAccounts.id }).from(staffAccounts)
        .where(eq(staffAccounts.email, email))
        .limit(1),
    ]);
    if (customerCollision[0]) throw new Error("ID_COLLISION");
    if (staffCollision[0]) throw new Error("RESERVED_DESK_EMAIL");
    await db.insert(customers).values({
      id,
      email,
      name: String(customer.name),
      phone: String(customer.phone),
      role: "collector",
      status: "invited",
      member: Boolean(customer.member),
      preferences: {},
    });
    return;
  }

  if (action === "customer.remove") {
    requireDesk(actor);
    const id = String(operation.id);
    const [customer] = await db.select({ id: customers.id }).from(customers).where(eq(customers.id, id)).limit(1);
    if (!customer) throw new Error("CUSTOMER_NOT_FOUND");
    const [piece, agreement, attempt] = await Promise.all([
      db.select({ id: timepieces.id }).from(timepieces).where(eq(timepieces.customerId, id)).limit(1),
      db.select({ id: liveAgreements.id }).from(liveAgreements).where(eq(liveAgreements.customerId, id)).limit(1),
      db.select({ id: appraisalAttempts.id }).from(appraisalAttempts).where(eq(appraisalAttempts.customerId, id)).limit(1),
    ]);
    if (piece[0] || agreement[0] || attempt[0]) throw new Error("CUSTOMER_REFERENCED");
    await db.delete(customers).where(eq(customers.id, id));
    return;
  }

  if (action === "timepiece.create") {
    if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
    const timepiece = operation.timepiece as Record<string, unknown>;
    const values = pieceValues(timepiece, actor);
    if (!values.brand || !values.model) throw new Error("TIMEPIECE_IDENTITY_REQUIRED");
    const [existing] = await db.select({ id: timepieces.id })
      .from(timepieces)
      .where(eq(timepieces.id, String(timepiece.id)))
      .limit(1);
    if (existing) throw new Error("ID_COLLISION");
    await db.insert(timepieces).values({
      id: String(timepiece.id),
      customerId: actor.customerId,
      ...values,
    });
    return;
  }

  if (action === "timepiece.update" || action === "timepiece.deskUpdate") {
    const patch = operation.patch as Record<string, unknown>;
    if (action === "timepiece.deskUpdate") requireDesk(actor);
    // A desk actor is fenced on either action name; `pieceValues` lets desk
    // actors set `appraised`, so `timepiece.update` must not be a side door.
    if (isDesk(actor) && patchNeedsAppraisal(patch)) requireAppraiser(actor);
    const id = String(operation.id);
    const current = await lockedOwnedPiece(db, actor, id);
    if (actor.role === "collector") {
      await assertRetailPieceEditable(db, current.id);
    }
    // Moving a piece off `appraised` erases an appraiser's recorded decision,
    // so it needs the same fence as making one (R1, R5).
    if (
      isDesk(actor) &&
      current.status === "appraised" &&
      patch.status !== undefined &&
      patch.status !== "appraised"
    ) {
      requireAppraiser(actor);
    }
    if (
      isDesk(actor) &&
      (patchNeedsAppraisal(patch) ||
        (current.status === "appraised" &&
          patch.status !== undefined &&
          patch.status !== "appraised")) &&
      await pieceHasAppraisalAttempt(db, current.id)
    ) {
      throw new Error("ATTEMPT_STATE_CONFLICT");
    }
    const values = pieceValues(patch, actor);
    const update: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of Object.keys(patch)) {
      if (key in values) update[key] = values[key as keyof typeof values];
    }
    if (isDesk(actor)) {
      if (patch.valueLow !== undefined) update.valueLowCents = dollarsToCents(Number(patch.valueLow));
      if (patch.valueHigh !== undefined) update.valueHighCents = dollarsToCents(Number(patch.valueHigh));
      if (patch.financeable !== undefined) update.financeable = Boolean(patch.financeable);
      if (patch.evaluatedAt !== undefined) update.evaluatedAt = patch.evaluatedAt ? new Date(String(patch.evaluatedAt)) : null;
      if (patch.assetCode !== undefined) update.assetCode = String(patch.assetCode);
    }
    await db.update(timepieces).set(update).where(eq(timepieces.id, id));
    return;
  }

  if (action === "timepiece.remove") {
    const id = String(operation.id);
    if (actor.role === "collector") await lockedOwnedPiece(db, actor, id);
    else await ownedPiece(db, actor, id);
    if (actor.role === "collector") {
      const [openReview] = await db
        .select({ id: appraisalAttempts.id })
        .from(appraisalAttempts)
        .where(
          and(
            eq(appraisalAttempts.timepieceId, id),
            eq(appraisalAttempts.status, "under_review"),
          ),
        )
        .limit(1);
      if (openReview) throw new Error("REVIEW_LOCKED");
    }
    const [live, app, prepared, allocation, original, attempt] = await Promise.all([
      db.select({ id: liveAgreementMembers.id }).from(liveAgreementMembers).where(eq(liveAgreementMembers.timepieceId, id)).limit(1),
      db.select({ id: applications.id }).from(applications).where(eq(applications.timepieceId, id)).limit(1),
      db.select({ id: preparedAgreements.id }).from(preparedAgreements).where(eq(preparedAgreements.timepieceId, id)).limit(1),
      db.select({ id: allocations.id }).from(allocations).where(eq(allocations.timepieceId, id)).limit(1),
      db
        .select({ id: photoObjects.id })
        .from(photoObjects)
        .where(and(eq(photoObjects.timepieceId, id), ne(photoObjects.status, "abandoned")))
        .limit(1),
      db
        .select({ id: appraisalAttempts.id })
        .from(appraisalAttempts)
        .where(eq(appraisalAttempts.timepieceId, id))
        .limit(1),
    ]);
    if (live[0] || app[0] || prepared[0] || allocation[0] || original[0] || attempt[0]) {
      throw new Error("TIMEPIECE_REFERENCED");
    }
    await db.transaction(async (tx) => {
      await tx.delete(livePreviews).where(eq(livePreviews.timepieceId, id));
      await tx
        .delete(photoObjects)
        .where(and(eq(photoObjects.timepieceId, id), eq(photoObjects.status, "abandoned")));
      await tx.delete(timepieces).where(eq(timepieces.id, id));
    });
    return;
  }

  if (action === "agreement.updateScale") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    requireMutableAgreement(agreement);
    await db.update(liveAgreements).set({
      scale: operation.scale as Record<string, unknown>,
      termMonths: Number(operation.termMonths),
      updatedAt: new Date(),
    }).where(eq(liveAgreements.id, String(operation.id)));
    return;
  }

  if (action === "agreement.remove") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    requireMutableAgreement(agreement);
    if (await liveAgreementHasDocuments(db, agreement.id)) {
      throw new Error("AGREEMENT_HAS_DOCUMENTS");
    }
    await db.transaction(async (tx) => {
      await tx.delete(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, agreement.id));
      await tx.delete(liveAgreementMembers).where(eq(liveAgreementMembers.agreementId, agreement.id));
      await tx.delete(liveAgreements).where(eq(liveAgreements.id, agreement.id));
    });
    return;
  }

  if (action === "agreement.recordEnd") {
    requireDesk(actor);
    const recordable = validateRecordedEndKind(
      (operation.end as { kind?: string }).kind,
    );
    if (!recordable.ok) throw new Error(recordable.error);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const checked = applyAgreementEnd(
      agreement,
      operation.end as NonNullable<Agreement["bookEnd"]>,
    );
    if (!checked.ok) throw new Error(checked.error);
    const end = checked.agreement.bookEnd!;
    if (isLiveBookLabel(bookLabel(checked.agreement))) {
      const conflicts = await db.select().from(liveAgreementMembers).where(and(
        inArray(liveAgreementMembers.timepieceId, agreement.watchIds),
        inArray(liveAgreementMembers.status, HELD_MEMBER_STATUSES),
        ne(liveAgreementMembers.agreementId, agreement.id),
      ));
      if (conflicts.length) throw new Error("LIVE_WATCH_CONFLICT");
    }
    const amountCents = dollarsToCents(end.amount);
    if (amountCents === null) throw new Error("INVALID_DOLLAR_AMOUNT");
    await db.transaction(async (tx) => {
      await tx.insert(liveAgreementEnds).values({
        agreementId: agreement.id,
        kind: end.kind,
        endedOn: end.date,
        amountCents,
      }).onConflictDoUpdate({
        target: liveAgreementEnds.agreementId,
        set: { kind: end.kind, endedOn: end.date, amountCents },
      });
      await tx.update(liveAgreementMembers).set({
        status: isLiveBookLabel(bookLabel(checked.agreement)) ? "live" : "released",
      }).where(eq(liveAgreementMembers.agreementId, agreement.id));
    });
    return;
  }

  if (action === "agreement.clearEnd") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const conflicts = await db.select().from(liveAgreementMembers).where(and(
      inArray(liveAgreementMembers.timepieceId, agreement.watchIds),
      inArray(liveAgreementMembers.status, HELD_MEMBER_STATUSES),
      ne(liveAgreementMembers.agreementId, agreement.id),
    ));
    if (conflicts.length) throw new Error("LIVE_WATCH_CONFLICT");
    await db.transaction(async (tx) => {
      await tx.delete(liveAgreementEnds).where(eq(liveAgreementEnds.agreementId, agreement.id));
      await tx.update(liveAgreementMembers).set({ status: "live" }).where(eq(liveAgreementMembers.agreementId, agreement.id));
    });
    return;
  }

  if (action === "agreement.renew") {
    requireDesk(actor);
    const agreement = await ownedAgreement(db, actor, String(operation.id));
    const scale = await serverAgreementScale(db, 12);
    const planned = planRenewal(
      agreement,
      String(operation.closeDate),
      undefined,
      scale,
    );
    if (!planned.ok) throw new Error(planned.error);
    const successorId = String(operation.successorId);
    const amountCents = dollarsToCents(planned.successor.amount);
    const endCents = dollarsToCents(planned.end.amount);
    if (amountCents === null || endCents === null) throw new Error("INVALID_DOLLAR_AMOUNT");
    await db.transaction(async (tx) => {
      await tx.insert(liveAgreementEnds).values({
        agreementId: agreement.id,
        kind: "renewed",
        endedOn: planned.end.date,
        amountCents: endCents,
      }).onConflictDoUpdate({
        target: liveAgreementEnds.agreementId,
        set: { kind: "renewed", endedOn: planned.end.date, amountCents: endCents },
      });
      await tx.update(liveAgreementMembers).set({ status: "released" }).where(eq(liveAgreementMembers.agreementId, agreement.id));
      await tx.insert(liveAgreements).values({
        id: successorId,
        customerId: agreement.customerId,
        amountCents,
        termMonths: 12,
        delivery: planned.successor.delivery,
        ownerName: planned.successor.ownerName,
        email: agreement.email,
        // A renewal succeeds a repo that was already on the book, so the
        // successor goes on it too, dated from the day the old one closed.
        status: "executed",
        executedOn: String(operation.closeDate),
        agreementCode: String(operation.agreementCode),
        createdOn: String(operation.closeDate),
        scale,
      });
      await tx.insert(liveAgreementMembers).values(agreement.watchIds.map((timepieceId) => ({
        id: `${successorId}:${timepieceId}`,
        agreementId: successorId,
        timepieceId,
        status: "live",
      })));
    });
    return;
  }

  if (action === "preview.upsert") {
    const timepieceId = String(operation.timepieceId);
    await lockedOwnedPiece(db, actor, timepieceId);
    if (actor.role === "collector") await assertRetailPieceEditable(db, timepieceId);
    const [existing] = await db
      .select({
        timepieceId: livePreviews.timepieceId,
        kind: livePreviews.kind,
        previewUrl: livePreviews.previewUrl,
        photoObjectId: livePreviews.photoObjectId,
      })
      .from(livePreviews)
      .where(eq(livePreviews.id, String(operation.id)))
      .limit(1);
    if (existing && existing.timepieceId !== timepieceId) {
      throw new Error("PREVIEW_ID_COLLISION");
    }
    if (
      existing &&
      await pieceHasAppraisalAttempt(db, timepieceId) &&
      (
        existing.kind !== String(operation.kind) ||
        existing.previewUrl !== String(operation.url) ||
        existing.photoObjectId !== null
      )
    ) {
      throw new Error("PHOTO_REFERENCED");
    }
    await assertAppraisalPhotoChangeAllowed(
      db,
      timepieceId,
      String(operation.kind),
      String(operation.id),
    );
    await db.insert(livePreviews).values({
      id: String(operation.id),
      timepieceId,
      kind: String(operation.kind),
      previewUrl: String(operation.url),
    }).onConflictDoUpdate({
      target: livePreviews.id,
      set: { kind: String(operation.kind), previewUrl: String(operation.url) },
    });
    return;
  }

  if (action === "preview.remove") {
    requireDesk(actor);
    const id = String(operation.id);
    const [locator] = await db
      .select({
        id: livePreviews.id,
        timepieceId: livePreviews.timepieceId,
      })
      .from(livePreviews)
      .where(eq(livePreviews.id, id))
      .limit(1);
    if (!locator) throw new Error("PREVIEW_NOT_FOUND");
    await lockedOwnedPiece(db, actor, locator.timepieceId);
    const [preview] = await db
      .select({ id: livePreviews.id })
      .from(livePreviews)
      .where(
        and(
          eq(livePreviews.id, id),
          eq(livePreviews.timepieceId, locator.timepieceId),
        ),
      )
      .limit(1);
    if (!preview) throw new Error("PREVIEW_NOT_FOUND");
    if (await pieceHasAppraisalAttempt(db, locator.timepieceId)) {
      throw new Error("PHOTO_REFERENCED");
    }
    await db.delete(livePreviews).where(eq(livePreviews.id, id));
    return;
  }

  throw new Error("LIVE_BOOK_ACTION_INVALID");
}

/**
 * KTD23. Count the attempt on the root connection so a later refusal inside
 * the request transaction cannot roll the hit back. Submit and withdraw are
 * two separate daily buckets.
 */
async function consumeRequestThrottle(
  db: Database,
  actor: Actor,
  action: "request.submit" | "request.withdraw",
) {
  if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
  const throttle = await consumeAccessRateLimit(db, {
    scope: action,
    key: actor.customerId,
    limit: REQUEST_SUBMITS_PER_DAY,
    windowMs: DAY_MS,
  });
  if (!throttle.allowed) throw new Error("THROTTLED");
}

/**
 * Apply (R12, R26). The daily throttle is consumed before this transaction.
 * Inside it: id, pieces locked and owned, appraisal currency, expired holders
 * closed, caps, amount, row, members, event, and the v1 proposal row. The
 * PDF is rendered after commit by the returned job.
 */
async function submitRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
): Promise<RequestSubmitResult> {
  if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
  const id = String(operation.id);
  const watchIds = [...(operation.watchIds as string[])].sort();
  const termMonths = Number(operation.termMonths);
  const amount = Number(operation.amount);

  const [existing] = await db.select({ id: liveAgreements.id })
    .from(liveAgreements)
    .where(eq(liveAgreements.id, id))
    .limit(1);
  if (existing) throw new Error("ID_COLLISION");

  const pieces = await db.select().from(timepieces)
    .where(inArray(timepieces.id, watchIds))
    .orderBy(timepieces.id)
    .for("update");
  if (pieces.length !== watchIds.length || pieces.some((row) => row.customerId !== actor.customerId)) {
    throw new Error("TIMEPIECE_NOT_OWNED");
  }

  const attemptRows = await db.select({
    timepieceId: appraisalAttempts.timepieceId,
    attemptNo: appraisalAttempts.attemptNo,
    decisionNo: appraisalAttempts.decisionNo,
    status: appraisalAttempts.status,
    decidedAt: appraisalAttempts.decidedAt,
  })
    .from(appraisalAttempts)
    .where(inArray(appraisalAttempts.timepieceId, watchIds));
  const attempts = attemptRows.map((row) => ({
    ...row,
    decidedAt: row.decidedAt?.toISOString(),
  }));
  const today = deskToday();
  for (const piece of pieces) {
    if (isUnderReview(attempts, piece.id)) throw new Error("REVIEW_LOCKED");
    if (piece.status !== "appraised" || !piece.financeable) throw new Error("INELIGIBLE_PIECE");
    const current = isAppraisalCurrent(attempts, piece.id, today, {
      status: piece.status,
      evaluatedAt: piece.evaluatedAt?.toISOString(),
    });
    if (!current) throw new Error("APPRAISAL_EXPIRED");
  }

  // KTD12: a holder whose retail window ran out is closed here, in this same
  // transaction, so its pieces are free for this Apply. Anything else holding
  // a piece is a named conflict.
  const holders = await db.select({
    agreementId: liveAgreements.id,
    status: liveAgreements.status,
    lastActionAt: liveAgreements.lastActionAt,
  })
    .from(liveAgreementMembers)
    .innerJoin(liveAgreements, eq(liveAgreementMembers.agreementId, liveAgreements.id))
    .where(and(
      inArray(liveAgreementMembers.timepieceId, watchIds),
      inArray(liveAgreementMembers.status, HELD_MEMBER_STATUSES),
    ))
    .orderBy(liveAgreements.id);
  const seen = new Set<string>();
  const expiredNotices: Array<() => Promise<unknown>> = [];
  for (const holder of holders) {
    if (seen.has(holder.agreementId)) continue;
    seen.add(holder.agreementId);
    const expired =
      REQUEST_STATES.includes(holder.status) &&
      isRequestExpired({ status: holder.status, lastActionAt: holder.lastActionAt.toISOString() }, today);
    if (expired) {
      const closed = await closeExpiredRequest(db, holder.agreementId);
      if (closed) {
        expiredNotices.push(noticeMail("request_expired", closed, context));
        continue;
      }
    }
    throw new Error("LIVE_WATCH_CONFLICT");
  }

  const scale = await serverAgreementScale(db, termMonths);
  const pieceCaps = Object.fromEntries(pieces.map((row) => [
    row.id,
    maxPurchaseAmount(
      (row.valueLowCents ?? 0) / 100,
      (row.valueHighCents ?? 0) / 100,
      scale.purchaseShare,
    ),
  ]));
  const maximum = Object.values(pieceCaps).reduce((sum, cap) => sum + cap, 0);

  if (!Number.isInteger(amount)) throw new Error("AMOUNT_WHOLE_DOLLARS");
  const [setting] = await db.select({ minSaleAmountCents: deskSettings.minSaleAmountCents })
    .from(deskSettings)
    .where(eq(deskSettings.id, "default"))
    .limit(1);
  const minimum = (setting?.minSaleAmountCents ?? DEFAULT_MIN_SALE_AMOUNT * 100) / 100;
  if (amount < minimum) throw new Error("AMOUNT_BELOW_MINIMUM");
  if (amount > maximum) throw new Error("AMOUNT_ABOVE_CAP");
  const amountCents = dollarsToCents(amount);
  if (amountCents === null) throw new Error("INVALID_DOLLAR_AMOUNT");

  const [owner] = await db.select().from(customers).where(eq(customers.id, actor.customerId)).limit(1);
  if (!owner || owner.email !== actor.email) throw new Error("COLLECTOR_NOT_FOUND");

  const now = new Date();
  const note = String(operation.note ?? "");
  const [row] = await db.insert(liveAgreements).values({
    id,
    customerId: actor.customerId,
    amountCents,
    termMonths,
    delivery: String(operation.delivery),
    ownerName: owner.name,
    email: owner.email,
    status: "submitted",
    version: 1,
    lastActionAt: now,
    createdOn: deskToday(now),
    agreementCode: mintAgreementCode(),
    scale,
    pieceCaps,
  }).returning();
  await db.insert(liveAgreementMembers).values(watchIds.map((timepieceId) => ({
    id: `${id}:${timepieceId}`,
    agreementId: id,
    timepieceId,
    status: "reserved",
  })));
  await recordAgreementEvent(db, {
    agreementId: id,
    actorKind: "retail",
    actorId: actor.customerId,
    action: "submit",
    fromStatus: null,
    toStatus: "submitted",
    amountCents,
    version: 1,
    note,
    internal: false,
    createdAt: now,
  });
  const document = await insertStageDocumentRow(db, row, "proposal", actor, context.env);
  return {
    agreement: projectRequestRow(row, watchIds, actor),
    afterCommit: chainedJobs([
      ...expiredNotices,
      ...renderThen(context, document.id, [noticeMail("request_submitted", row, context)]),
    ]),
  };
}

/**
 * One request move through the shared table (R25). The caller has already
 * closed the row if it expired; here the row is locked, the caller's expected
 * status and version are checked, and the transition's answer is persisted.
 */
async function transitionRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
): Promise<RequestTransitionResult> {
  const id = String(operation.id);
  const action = operation.action.slice("request.".length);
  const agreement = await ownedAgreement(db, actor, id);
  if (action !== "flagCustomerSuccess") {
    if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
      throw new Error("AGREEMENT_STATE_CONFLICT");
    }
  }
  const now = new Date();
  const transitionActor = isDesk(actor)
    ? { kind: "desk", id: actor.staffId ?? actor.email, role: actor.role }
    : { kind: "retail", id: actor.customerId };
  const result = applyTransition(
    { ...agreement, version: agreement.version ?? 1 },
    {
      action,
      decision: operation.decision as string | undefined,
      note: String(operation.note ?? ""),
    },
    { now: now.toISOString(), today: deskToday(now), actor: transitionActor },
  ) as TransitionOutcome;
  if (!result.ok) throw new Error(result.error);
  const next = result.agreement;
  const [row] = await db.update(liveAgreements).set({
    status: next.status,
    version: next.version,
    closeReason: next.closeReason ?? null,
    customerSuccess: action === "flagCustomerSuccess" ? Boolean(operation.flag) : undefined,
    // Internal flags keep the collector's expiry clock (KTD12).
    lastActionAt: result.event.fromStatus !== result.event.toStatus ? now : undefined,
    executedOn: next.status === "executed" ? (next.executedOn ?? deskToday(now)) : null,
    updatedAt: now,
  }).where(and(
    eq(liveAgreements.id, id),
    eq(liveAgreements.status, agreement.status),
    eq(liveAgreements.version, agreement.version ?? 1),
  )).returning();
  if (!row) throw new Error("AGREEMENT_STATE_CONFLICT");
  if (next.status === "closed") {
    await db.update(liveAgreementMembers)
      .set({ status: "released" })
      .where(and(
        eq(liveAgreementMembers.agreementId, id),
        eq(liveAgreementMembers.status, "reserved"),
      ));
  }
  const amountCents = dollarsToCents(result.event.amount);
  await recordAgreementEvent(db, {
    agreementId: id,
    actorKind: result.event.actorKind as "retail" | "desk" | "system",
    actorId: result.event.actorId,
    action: result.event.action,
    fromStatus: result.event.fromStatus,
    toStatus: result.event.toStatus,
    amountCents,
    version: result.event.version,
    note: result.event.note,
    internal: result.event.internal,
    createdAt: now,
  });
  const jobs: Array<() => Promise<unknown>> = [];
  if (result.event.action === "deskReturn" && next.status === "returned") {
    jobs.push(noticeMail("request_confirmed", row, context));
  }
  if (result.event.action === "deskReturn" && next.status === "closed") {
    jobs.push(noticeMail("request_declined", row, context));
  }
  if (result.event.action === "decline") {
    jobs.push(noticeMail("request_declined", row, context, "collector"));
  }
  if (result.event.action === "withdraw") {
    jobs.push(noticeMail("request_withdrawn", row, context));
  }
  return {
    agreement: projectRequestRow(row, agreement.watchIds, actor),
    afterCommit: jobs.length ? chainedJobs(jobs) : [],
  };
}

function transitionActorOf(actor: Actor) {
  return isDesk(actor)
    ? { kind: "desk" as const, id: actor.staffId ?? actor.email, role: actor.role }
    : { kind: "retail" as const, id: actor.customerId };
}

async function persistTransition(
  db: Database,
  actor: Actor,
  agreement: Awaited<ReturnType<typeof ownedAgreement>>,
  input: Parameters<typeof applyTransition>[1],
  now: Date,
  extra: Partial<typeof liveAgreements.$inferInsert> = {},
) {
  const result = applyTransition(
    { ...agreement, version: agreement.version ?? 1 },
    input,
    { now: now.toISOString(), today: deskToday(now), actor: transitionActorOf(actor) },
  ) as TransitionOutcome;
  if (!result.ok) throw new Error(result.error);
  const next = result.agreement;
  const [row] = await db.update(liveAgreements).set({
    status: next.status,
    version: next.version,
    amountCents: dollarsToCents(next.amount) ?? agreement.amountCents,
    closeReason: next.closeReason ?? null,
    lastActionAt: result.event.fromStatus !== result.event.toStatus ? now : undefined,
    executedOn: next.status === "executed" ? (next.executedOn ?? deskToday(now)) : null,
    signedOn: next.status === "collector_signed" || next.status === "executed"
      ? (agreement.signedAt ?? deskToday(now))
      : agreement.signedAt ?? null,
    updatedAt: now,
    ...extra,
  }).where(and(
    eq(liveAgreements.id, agreement.id),
    eq(liveAgreements.status, agreement.status),
    eq(liveAgreements.version, agreement.version ?? 1),
  )).returning();
  if (!row) throw new Error("AGREEMENT_STATE_CONFLICT");
  if (next.status === "closed") {
    await db.update(liveAgreementMembers)
      .set({ status: "released" })
      .where(and(
        eq(liveAgreementMembers.agreementId, agreement.id),
        eq(liveAgreementMembers.status, "reserved"),
      ));
  }
  await recordAgreementEvent(db, {
    agreementId: agreement.id,
    actorKind: result.event.actorKind as "retail" | "desk" | "system",
    actorId: result.event.actorId,
    action: result.event.action,
    fromStatus: result.event.fromStatus,
    toStatus: result.event.toStatus,
    amountCents: dollarsToCents(result.event.amount),
    version: result.event.version,
    note: result.event.note,
    internal: result.event.internal,
    createdAt: now,
  });
  return { result, row };
}

async function bindSignature(
  db: Database,
  input: {
    agreementId: string;
    version: number;
    party: "collector" | "mac";
    signerId: string;
    typedName: string;
    documentId: string;
    snapshotHash: string;
    clientAddress?: string;
  },
) {
  await db.insert(agreementSignatures).values({
    id: randomUUID(),
    agreementId: input.agreementId,
    version: input.version,
    party: input.party,
    signerId: input.signerId,
    typedName: input.typedName,
    documentId: input.documentId,
    snapshotHash: input.snapshotHash,
    clientAddress: input.clientAddress ?? null,
    book: "live",
  });
}

async function signCollectorRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
): Promise<RequestSubmitResult> {
  if (actor.role !== "collector") throw new Error("COLLECTOR_REQUIRED");
  const agreement = await ownedAgreement(db, actor, String(operation.id));
  if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
    throw new Error("AGREEMENT_STATE_CONFLICT");
  }
  const proposal = await recoverCurrentStageDocument(
    db,
    agreement.id,
    agreement.version ?? 1,
    "proposal",
    context.documentStore,
    context.env,
  );
  if (proposal.snapshotHash !== operation.snapshotHash) throw new Error("DOCUMENT_STALE");
  const now = new Date();
  const persisted = await persistTransition(db, actor, agreement, {
    action: "signCollector",
    note: String(operation.note ?? ""),
  }, now, {
    delivery: operation.delivery ? String(operation.delivery) : undefined,
  });
  await bindSignature(db, {
    agreementId: agreement.id,
    version: persisted.row.version,
    party: "collector",
    signerId: actor.customerId,
    typedName: String(operation.typedName),
    documentId: proposal.id,
    snapshotHash: proposal.snapshotHash,
    clientAddress: context.clientAddress,
  });
  const document = await insertStageDocumentRow(db, persisted.row, "collector_signed", actor, context.env);
  return {
    agreement: projectRequestRow(persisted.row, agreement.watchIds, actor),
    afterCommit: renderThen(context, document.id, [noticeMail("request_signed", persisted.row, context)]),
  };
}

async function recordDeliveryRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
): Promise<RequestTransitionResult> {
  requireDesk(actor);
  const agreement = await ownedAgreement(db, actor, String(operation.id));
  if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
    throw new Error("AGREEMENT_STATE_CONFLICT");
  }
  const now = new Date();
  const persisted = await persistTransition(db, actor, agreement, {
    action: "recordDelivery",
    note: String(operation.note ?? ""),
  }, now, { deliveredOn: deskToday(now) });
  return { agreement: projectRequestRow(persisted.row, agreement.watchIds, actor) };
}

async function inspectRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
): Promise<RequestSubmitResult> {
  if (!canInspect(actor) || !isDesk(actor)) throw new Error("ROLE_FORBIDDEN");
  if (!actor.staffId) throw new Error("SESSION_INVALID");
  const agreement = await ownedAgreement(db, actor, String(operation.id));
  if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
    throw new Error("AGREEMENT_STATE_CONFLICT");
  }
  const pieces = operation.pieces as Array<{
    timepieceId: string;
    decision: "confirm" | "refuse" | "drop";
    inspectedValueCents?: number;
  }>;
  const reserved = await db.select().from(liveAgreementMembers).where(and(
    eq(liveAgreementMembers.agreementId, agreement.id),
    eq(liveAgreementMembers.status, "reserved"),
  ));
  const reservedIds = new Set(reserved.map((row) => row.timepieceId));
  if (
    reserved.length !== pieces.length ||
    pieces.some((piece) => !reservedIds.has(piece.timepieceId))
  ) {
    throw new Error("INSPECTION_INCOMPLETE");
  }
  const now = new Date();
  if (operation.outcome === "decline") {
    const persisted = await persistTransition(db, actor, agreement, {
      action: "declineAtInspection",
      note: String(operation.note ?? ""),
    }, now);
    await db.update(liveAgreementMembers)
      .set({ status: "released" })
      .where(and(
        eq(liveAgreementMembers.agreementId, agreement.id),
        eq(liveAgreementMembers.status, "reserved"),
      ));
    return {
      agreement: projectRequestRow(persisted.row, [], actor),
      afterCommit: chainedJobs([noticeMail("request_declined", persisted.row, context)]),
    };
  }

  const kept: string[] = [];
  const inspectedCaps: Record<string, number> = {};
  let dropped = false;
  const scale = agreement.scale as { purchaseShare?: number } | undefined;
  const share = Number(scale?.purchaseShare ?? 0.6);
  for (const piece of pieces) {
    if (piece.decision === "confirm") {
      if (piece.inspectedValueCents == null) throw new Error("INSPECTED_VALUE_REQUIRED");
      await finalizeAcceptedAttempt(db, {
        timepieceId: piece.timepieceId,
        agreementId: agreement.id,
        staffId: actor.staffId,
        inspectedValueCents: piece.inspectedValueCents,
        now,
      });
      const dollars = centsToDollars(piece.inspectedValueCents);
      inspectedCaps[piece.timepieceId] = maxPurchaseAmount(dollars, dollars, share);
      kept.push(piece.timepieceId);
    } else if (piece.decision === "refuse") {
      await reverseAcceptedAttempt(db, { timepieceId: piece.timepieceId, now });
      await db.update(liveAgreementMembers)
        .set({ status: "released" })
        .where(and(
          eq(liveAgreementMembers.agreementId, agreement.id),
          eq(liveAgreementMembers.timepieceId, piece.timepieceId),
        ));
      dropped = true;
    } else {
      await db.update(liveAgreementMembers)
        .set({ status: "released" })
        .where(and(
          eq(liveAgreementMembers.agreementId, agreement.id),
          eq(liveAgreementMembers.timepieceId, piece.timepieceId),
        ));
      dropped = true;
    }
  }
  const maximum = Object.values(inspectedCaps).reduce((sum, cap) => sum + cap, 0);
  const signedAmount = agreement.amount;
  if (!kept.length) {
    const persisted = await persistTransition(db, actor, agreement, {
      action: "declineAtInspection",
      note: String(operation.note ?? ""),
    }, now);
    return {
      agreement: projectRequestRow(persisted.row, [], actor),
      afterCommit: chainedJobs([noticeMail("request_declined", persisted.row, context)]),
    };
  }
  const needsReturn = dropped || signedAmount > maximum;
  if (!needsReturn) {
    await recordAgreementEvent(db, {
      agreementId: agreement.id,
      actorKind: "desk",
      actorId: actor.staffId,
      action: "inspect",
      fromStatus: agreement.status,
      toStatus: "inspecting",
      amountCents: agreement.amountCents,
      version: agreement.version ?? 1,
      note: String(operation.note ?? ""),
      createdAt: now,
    });
    const [row] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, agreement.id));
    return { agreement: projectRequestRow(row, kept, actor), afterCommit: [] };
  }
  const nextAmount = Math.min(signedAmount, maximum);
  const persisted = await persistTransition(db, actor, agreement, {
    action: "amend",
    amount: nextAmount,
    watchIds: kept,
    note: String(operation.note ?? ""),
  }, now, { pieceCaps: inspectedCaps });
  for (const member of reserved) {
    if (!kept.includes(member.timepieceId)) {
      await db.update(liveAgreementMembers)
        .set({ status: "released" })
        .where(eq(liveAgreementMembers.id, member.id));
    }
  }
  const document = await insertStageDocumentRow(db, persisted.row, "proposal", actor, context.env);
  return {
    agreement: projectRequestRow(persisted.row, kept, actor),
    afterCommit: renderThen(context, document.id, [noticeMail("request_inspected", persisted.row, context)]),
  };
}

async function executeMacRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
): Promise<RequestSubmitResult> {
  if (!canInspect(actor) || !isDesk(actor)) throw new Error("ROLE_FORBIDDEN");
  if (!actor.staffId) throw new Error("SESSION_INVALID");
  const agreement = await ownedAgreement(db, actor, String(operation.id));
  if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
    throw new Error("AGREEMENT_STATE_CONFLICT");
  }
  const [collectorSignature] = await db.select().from(agreementSignatures).where(and(
    eq(agreementSignatures.agreementId, agreement.id),
    eq(agreementSignatures.version, agreement.version ?? 1),
    eq(agreementSignatures.party, "collector"),
  )).limit(1);
  if (!collectorSignature) throw new Error("SIGNATURE_STALE");
  const [signatureDocument] = await db.select().from(agreementDocuments).where(
    eq(agreementDocuments.id, collectorSignature.documentId),
  ).limit(1);
  if (
    !signatureDocument ||
    signatureDocument.liveAgreementId !== agreement.id ||
    signatureDocument.version !== (agreement.version ?? 1) ||
    signatureDocument.stage !== "proposal"
  ) {
    throw new Error("SIGNATURE_STALE");
  }
  const signed = await recoverCurrentStageDocument(
    db,
    agreement.id,
    agreement.version ?? 1,
    "collector_signed",
    context.documentStore,
    context.env,
  );
  if (signed.snapshotHash !== operation.snapshotHash) throw new Error("DOCUMENT_STALE");
  const reserved = await db.select().from(liveAgreementMembers).where(and(
    eq(liveAgreementMembers.agreementId, agreement.id),
    eq(liveAgreementMembers.status, "reserved"),
  ));
  if (!reserved.length) throw new Error("INSPECTION_INCOMPLETE");
  for (const member of reserved) {
    const [attempt] = await db.select({ finalizedAt: appraisalAttempts.finalizedAt })
      .from(appraisalAttempts)
      .where(and(
        eq(appraisalAttempts.timepieceId, member.timepieceId),
        eq(appraisalAttempts.finalizedAgreementId, agreement.id),
      ))
      .limit(1);
    if (!attempt?.finalizedAt) throw new Error("INSPECTION_INCOMPLETE");
  }
  const now = new Date();
  const persisted = await persistTransition(db, actor, agreement, {
    action: "executeMac",
    note: String(operation.note ?? ""),
  }, now, { paymentReference: String(operation.paymentReference) });
  await db.update(liveAgreementMembers)
    .set({ status: "live" })
    .where(and(
      eq(liveAgreementMembers.agreementId, agreement.id),
      eq(liveAgreementMembers.status, "reserved"),
    ));
  await bindSignature(db, {
    agreementId: agreement.id,
    version: persisted.row.version,
    party: "mac",
    signerId: actor.staffId,
    typedName: String(operation.typedName),
    documentId: signed.id,
    snapshotHash: signed.snapshotHash,
    clientAddress: context.clientAddress,
  });
  const document = await insertStageDocumentRow(db, persisted.row, "executed", actor, context.env);
  return {
    agreement: projectRequestRow(persisted.row, reserved.map((row) => row.timepieceId), actor),
    afterCommit: renderThen(context, document.id, [
      () => sendExecutedDocumentEmails(context.rootDb, document.id, context.documentStore, {
        env: context.env,
        sendEmail: context.sendEmail,
      }),
    ]),
  };
}

async function resendExecutedRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
  context: OperationContext,
): Promise<RequestSubmitResult> {
  requireDesk(actor);
  const agreement = await ownedAgreement(db, actor, String(operation.id));
  if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
    throw new Error("AGREEMENT_STATE_CONFLICT");
  }
  if (agreement.status !== "executed") throw new Error("AGREEMENT_STATE_CONFLICT");
  const [document] = await db
    .select({ id: agreementDocuments.id })
    .from(agreementDocuments)
    .where(and(
      eq(agreementDocuments.liveAgreementId, agreement.id),
      eq(agreementDocuments.version, agreement.version ?? 1),
      eq(agreementDocuments.stage, "executed"),
    ))
    .limit(1);
  if (!document) throw new Error("DOCUMENT_NOT_READY");
  const [row] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, agreement.id)).limit(1);
  if (!row) throw new Error("AGREEMENT_NOT_FOUND");
  return {
    agreement: projectRequestRow(row, agreement.watchIds, actor),
    afterCommit: chainedJobs([
      async () => {
        const recovered = await recoverCurrentStageDocument(
          context.rootDb,
          agreement.id,
          agreement.version ?? 1,
          "executed",
          context.documentStore,
          context.env,
        );
        await sendExecutedDocumentEmails(context.rootDb, recovered.id, context.documentStore, {
          env: context.env,
          requirePending: true,
        });
      },
    ]),
  };
}

async function recordReturnRequest(
  db: Database,
  actor: Actor,
  operation: Operation & Record<string, unknown>,
): Promise<RequestTransitionResult> {
  requireDesk(actor);
  const agreement = await ownedAgreement(db, actor, String(operation.id));
  if (operation.expectedStatus !== agreement.status || operation.expectedVersion !== agreement.version) {
    throw new Error("AGREEMENT_STATE_CONFLICT");
  }
  if (agreement.status !== "closed") throw new Error("AGREEMENT_STATE_CONFLICT");
  if (!agreement.deliveredOn) throw new Error("RETURN_NOT_APPLICABLE");
  const alreadyReturned = await db.select({ id: agreementEvents.id }).from(agreementEvents).where(and(
    eq(agreementEvents.agreementId, agreement.id),
    eq(agreementEvents.action, "recordReturn"),
  )).limit(1);
  if (alreadyReturned.length) throw new Error("AGREEMENT_STATE_CONFLICT");
  const now = new Date();
  await recordAgreementEvent(db, {
    agreementId: agreement.id,
    actorKind: "desk",
    actorId: isDesk(actor) ? actor.staffId ?? actor.email : actor.email,
    action: "recordReturn",
    fromStatus: "closed",
    toStatus: "closed",
    amountCents: agreement.amountCents,
    version: agreement.version ?? 1,
    note: String(operation.note ?? ""),
    createdAt: now,
  });
  const [row] = await db.select().from(liveAgreements).where(eq(liveAgreements.id, agreement.id));
  return { agreement: projectRequestRow(row, agreement.watchIds, actor) };
}
