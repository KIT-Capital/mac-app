"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import {
  DEMO_CATALOG,
  DEMO_SETTINGS,
  DEMO_SHELLS,
  DEMO_USERS,
  photosFromWatches,
} from "@/lib/admin-seed";
import { isReservedDeskEmail } from "@/lib/auth";
import { maxPurchaseAmount } from "@/lib/catalog";
import {
  applyAppraisalDecision,
  applyAppraisalReopen,
  applyAppraisalReturn,
  applyAppraisalSubmit,
  browserPhotoMutationError,
} from "@/lib/appraisal-attempt-apply.mjs";
import { legacyAgreementToRequest } from "@/lib/contract/legacy-agreement.mjs";
import { planRenewal } from "@/lib/contract/repo-renewal.mjs";
import { agreementScaleFromDesk, applicationPurchaseShare } from "@/lib/contract/repo-scale.mjs";
import { applyTransition } from "@/lib/contract/request-transitions.mjs";
import { nextId } from "@/lib/ids";
import {
  mergeLocalDataPreviews,
  mergeLiveSettings,
  liveBookFailureState,
  liveDeskOverlay,
  freshReconciliationAction,
  operationDisposition,
  parseLiveBookResponse,
  parseLiveBookMutationResponse,
  readAfterInFlight,
  selectLiveUser,
  shouldApplyReconciliation,
  shouldPersistBrowserBook,
  shouldRecheckLiveBook,
} from "@/lib/live-book-mode.mjs";
import { ownedCounts } from "@/lib/owners";
import { mergePreferences } from "@/lib/preferences";
import {
  applyAgreementEnd,
  bookLabel,
  clearAgreementEnd as stripAgreementEnd,
  conflictingHeldWatchIds,
  isAppraisalCurrent,
  isLiveBookLabel,
  isRequestExpired,
  isUnderReview,
  heldWatchIds,
  LIVE_WATCH_CONFLICT,
  deskToday,
  validateRecordedEndKind,
} from "@/lib/contract/repo-book.mjs";
import { DEFAULT_MIN_SALE_AMOUNT, DEFAULT_SETTINGS, SERVER_SETTING_KEYS } from "@/lib/theme";
import { canEditAppraisal, canInspect, isDeskRole, isSuperAdmin, patchNeedsAppraisal } from "@/lib/roles.mjs";
import { REQUESTABLE_PHOTO_KINDS, normalizeRequiredPhotoKinds } from "@/lib/timepiece-shots.mjs";
import { ADMIN_PROFILE, DEMO_AGREEMENTS, DEMO_PROFILE, DEMO_TIMEPIECES, STAFF_PROFILE } from "@/lib/seed";
import {
  browserSessionStorage,
  persistableState,
  readSessionUser,
  writeSessionUser,
} from "@/lib/session-persist.mjs";
import type {
  Agreement,
  AgreementEnd,
  AgreementShell,
  AppSettings,
  AppState,
  CatalogEntry,
  ManagedUser,
  PhotoKind,
  PhotoRecord,
  Profile,
  Timepiece,
  UserPreferences,
} from "@/lib/types";

const STORAGE_KEY = "mac-app-state-v4";
const LEGACY_STORAGE_KEYS = ["mac-app-state-v3", "mac-app-state-v2", "mac-app-state-v1"];
const LIVE_PREVIEW_KEY = "mac-app-live-previews-v1";

export type StoreMode = "unknown" | "browser" | "live" | "unavailable";

type Store = AppState & {
  /** Server-authoritative book mode. `unavailable` replaces every route with the unavailable page. */
  bookMode: StoreMode;
  signIn: (profile?: Partial<Profile>) => void;
  signUp: (profile: Pick<Profile, "name" | "email"> & Partial<Profile>) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  completeOnboarding: () => void;
  addTimepiece: (watch: Timepiece) => Promise<OperationAck>;
  updateTimepiece: (id: string, patch: Partial<Timepiece>) => Promise<OperationAck>;
  removeTimepiece: (id: string) => Promise<OperationAck>;
  /** Apply: one request for the ticked pieces at a fixed amount (KTD8). */
  submitRequest: (input: RequestSubmitInput) => Promise<OperationAck & { agreementId?: string }>;
  /** The Desk's two answers to a request: confirm or decline (R12). */
  deskReturnRequest: (id: string, decision: RequestDeskDecision, note?: string) => Promise<OperationAck>;
  declineRequest: (id: string, note?: string) => Promise<OperationAck>;
  withdrawRequest: (id: string, note?: string) => Promise<OperationAck>;
  flagRequestCustomerSuccess: (id: string, flag: boolean, note?: string) => Promise<OperationAck>;
  signCollectorRequest: (
    id: string,
    input: { typedName: string; snapshotHash: string; delivery?: string; note?: string },
  ) => Promise<OperationAck>;
  recordDeliveryRequest: (id: string, note?: string) => Promise<OperationAck>;
  inspectRequest: (
    id: string,
    input: {
      outcome: "proceed" | "decline";
      pieces: Array<{ timepieceId: string; decision: "confirm" | "refuse" | "drop"; inspectedValueCents?: number }>;
      note?: string;
    },
  ) => Promise<OperationAck>;
  executeMacRequest: (
    id: string,
    input: {
      typedName: string;
      snapshotHash: string;
      paymentReference: string;
      checklist: Record<string, true>;
      note?: string;
    },
  ) => Promise<OperationAck>;
  recordReturnRequest: (id: string, note?: string) => Promise<OperationAck>;
  updateAgreement: (id: string, patch: Partial<Agreement>) => void;
  removeAgreement: (id: string) => Promise<OperationAck>;
  signAgreement: (id: string) => Promise<OperationAck>;
  recordAgreementEnd: (id: string, end: AgreementEnd) => Promise<{ ok: true } | { ok: false; error: string }>;
  renewAgreement: (id: string, closeDate: string) => Promise<{ ok: true; successor: Agreement } | { ok: false; error: string }>;
  clearAgreementEnd: (id: string) => Promise<boolean>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<OperationAck>;
  upsertUser: (user: ManagedUser) => Promise<OperationAck>;
  removeUser: (id: string) => Promise<OperationAck>;
  upsertCatalog: (entry: CatalogEntry) => Promise<OperationAck>;
  removeCatalog: (id: string) => Promise<OperationAck>;
  upsertShell: (shell: AgreementShell) => Promise<OperationAck>;
  removeShell: (id: string) => Promise<OperationAck>;
  upsertPhoto: (photo: PhotoRecord) => Promise<OperationAck>;
  removePhoto: (id: string) => Promise<OperationAck>;
  submitAppraisal: (input: { id: string; timepieceId: string; note?: string }) => Promise<OperationAck>;
  returnAppraisal: (input: { id: string; note: string }) => Promise<OperationAck>;
  decideAppraisal: (input: {
    id: string;
    decision: "accept" | "refuse";
    value?: number;
    rangeLow?: number;
    rangeHigh?: number;
  }) => Promise<OperationAck & { rangeWarning?: "below" | "above" }>;
  reopenAppraisal: (input: { id: string; reason: string }) => Promise<OperationAck>;
  resetDemo: () => void;
};

/**
 * Keep at most one photo per intake slot, in slot order, dropping any kind the
 * intake screen has no slot for. Mirrors what `requestPhotoUpload` accepts.
 */
function slotPhotosFor(watch: Timepiece) {
  const claimed = new Map<PhotoKind, string>();
  watch.images.forEach((url, index) => {
    const kind = watch.photoKinds?.[index] ?? REQUESTABLE_PHOTO_KINDS[index];
    if (!url || !kind || !REQUESTABLE_PHOTO_KINDS.includes(kind)) return;
    if (!claimed.has(kind as PhotoKind)) claimed.set(kind as PhotoKind, url);
  });
  return REQUESTABLE_PHOTO_KINDS
    .filter((kind) => claimed.has(kind as PhotoKind))
    .map((kind) => ({ kind: kind as PhotoKind, url: claimed.get(kind as PhotoKind) as string }));
}

const StoreContext = createContext<Store | null>(null);

function emptyState(): AppState {
  return {
    hydrated: false,
    user: null,
    timepieces: [],
    agreements: [],
    users: DEMO_USERS,
    catalog: DEMO_CATALOG,
    shells: DEMO_SHELLS,
    photos: [],
    appraisalAttempts: [],
    appraisalAttemptPhotos: [],
    settings: DEMO_SETTINGS,
    profiles: {},
  };
}

const SERVER_STATE = emptyState();
const PASSWORD_STATE = { ...SERVER_STATE, hydrated: true };
let snapshot: AppState = SERVER_STATE;
const listeners = new Set<() => void>();
let storeMode: StoreMode = "unknown";
const LIVE_BOOK_UNAVAILABLE = "LIVE_BOOK_UNAVAILABLE";
type OperationAck = {
  ok: boolean;
  error?: string;
  mode?: "browser" | "live";
  rangeWarning?: "below" | "above";
};
export type RequestSubmitInput = {
  watchIds: string[];
  termMonths: number;
  amount: number;
  delivery: string;
  note?: string;
};
export type RequestDeskDecision = "confirm" | "decline";
type RequestTransitionAction =
  | "deskReturn"
  | "decline"
  | "withdraw"
  | "flagCustomerSuccess"
  | "signCollector"
  | "recordDelivery"
  | "executeMac"
  | "declineAtInspection"
  | "amend";
/** `applyTransition` is typed through JSDoc; this is its answer read from TypeScript. */
type TransitionOutcome =
  | { ok: false; error: string }
  | { ok: true; agreement: Agreement; mintsStage?: string };
let liveWriteQueue: Promise<OperationAck> = Promise.resolve({ ok: true });
let loadStarted = false;
let optimisticGeneration = 0;
let liveBookReadInFlight: Promise<ReturnType<typeof parseLiveBookResponse>> | null = null;
const DESK_DATA_ACTIONS = new Set([
  "settings.update",
  "catalog.upsert",
  "catalog.remove",
  "shell.upsert",
  "shell.remove",
]);

type BookState = Pick<
  AppState,
  | "timepieces"
  | "agreements"
  | "users"
  | "photos"
  | "appraisalAttempts"
  | "appraisalAttemptPhotos"
  | "profiles"
  | "catalog"
  | "shells"
  | "settings"
  | "applicationPurchaseShares"
>;

/**
 * A book saved before the request model carried `draft | pending_signature |
 * signed` and no execution date. Upgrade it once, through the same mapping the
 * migration and the Desk import use, so a device that has been away keeps its
 * repos and reads the same labels as the server (KTD21).
 */
function upgradeStoredAgreement(agreement: Agreement): Agreement {
  if (agreement?.executedOn || agreement?.status === "closed") return agreement;
  const mapped = legacyAgreementToRequest(agreement);
  // Only a row the mapping actually converted gets its bookkeeping rewritten;
  // a row already on the new shape keeps its own clock.
  if (!mapped.event) return agreement;
  const upgraded: Agreement = {
    ...agreement,
    status: mapped.status,
    version: mapped.version,
    lastActionAt: mapped.lastActionAt,
  };
  if (mapped.executedOn) upgraded.executedOn = mapped.executedOn;
  if (mapped.closeReason) upgraded.closeReason = mapped.closeReason;
  if (mapped.signedAt) upgraded.signedAt = mapped.signedAt;
  return upgraded;
}

function readPersistedState(): AppState {
  const sessionUser = readSessionUser(browserSessionStorage());
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean) ??
      null;
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      const timepieces = Array.isArray(parsed.timepieces) ? parsed.timepieces : [];
      const agreements = (Array.isArray(parsed.agreements) ? parsed.agreements : []).map(
        upgradeStoredAgreement,
      );
      const appraisalAttempts = Array.isArray(parsed.appraisalAttempts)
        ? parsed.appraisalAttempts
        : [];
      const appraisalAttemptPhotos = Array.isArray(parsed.appraisalAttemptPhotos)
        ? parsed.appraisalAttemptPhotos
        : [];
      const counts = ownedCounts(sessionUser?.email, timepieces, agreements);
      return {
        ...withDeskDefaults({
          ...parsed,
          agreements,
          appraisalAttempts,
          appraisalAttemptPhotos,
          user: null,
        }, timepieces),
        user: normalizeUser(sessionUser, counts.pieces, counts.agreements),
      };
    }
  } catch {
    /* start empty */
  }
  const empty = { ...demoState(), user: null };
  if (!sessionUser) return empty;
  const counts = ownedCounts(sessionUser.email, empty.timepieces, empty.agreements);
  return {
    ...empty,
    user: normalizeUser(sessionUser, counts.pieces, counts.agreements),
  };
}

function notifyStore() {
  listeners.forEach((listener) => listener());
}

function isLiveStoreMode() {
  return storeMode === "live";
}

/**
 * The server said a live prerequisite is missing. Publish an empty hydrated
 * state with no user and stop every automatic re-check; only the unavailable
 * page's "Try again" full reload asks the server again.
 */
function enterUnavailableMode(base: AppState) {
  storeMode = "unavailable";
  snapshot = liveBookFailureState(base) as AppState;
  notifyStore();
}

function mergeBook(
  _base: AppState,
  book: BookState,
  viewer: { role: string; email: string; customerId?: string },
): AppState {
  const mergedBook = mergeLocalDataPreviews(book, readLiveDataPreviews()) as BookState;
  const storage = browserSessionStorage();
  const authenticated = selectLiveUser(viewer, readSessionUser(storage), mergedBook.profiles) as
    | Partial<Profile>
    | null;
  const sessionUser = isDeskRole(authenticated?.role)
    ? profileForEmail(viewer.email, { role: authenticated?.role })
    : authenticated as Profile | null;
  const counts = ownedCounts(sessionUser?.email, mergedBook.timepieces, mergedBook.agreements);
  try {
    if (sessionUser) writeSessionUser(storage, sessionUser);
  } catch {
    // The authoritative response still reconciles when browser storage is unavailable.
  }
  const desk = liveDeskOverlay(mergedBook);
  return {
    ...mergedBook,
    catalog: desk.catalog,
    shells: desk.shells,
    settings: mergeLiveSettings(
      desk.settings,
      _base.settings,
      sessionUser,
    ) as AppSettings,
    hydrated: true,
    user: normalizeUser(sessionUser, counts.pieces, counts.agreements),
  };
}

function readLiveDataPreviews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIVE_PREVIEW_KEY) ?? "{}");
    return {
      timepieces: Array.isArray(parsed.timepieces) ? parsed.timepieces : [],
      photos: Array.isArray(parsed.photos) ? parsed.photos : [],
    };
  } catch {
    return { timepieces: [], photos: [] };
  }
}

function persistLiveDataPreviews(state: AppState) {
  try {
    const timepieces = state.timepieces
      .map((piece) => {
        const indexes = piece.images.map((url, index) => ({ url, kind: piece.photoKinds?.[index] }))
          .filter((item) => item.url.startsWith("data:"));
        return {
          id: piece.id,
          images: indexes.map((item) => item.url),
          photoKinds: indexes.map((item) => item.kind ?? "other"),
        };
      })
      .filter((piece) => piece.images.length > 0);
    const photos = state.photos.filter((photo) => photo.url.startsWith("data:"));
    localStorage.setItem(LIVE_PREVIEW_KEY, JSON.stringify({ timepieces, photos }));
  } catch {
    // Live server state committed successfully; local preview caching is best-effort.
  }
}

function persistLiveSafeState(next: AppState) {
  let browser: Partial<AppState> = {};
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) browser = JSON.parse(raw) as AppState;
  } catch {
    browser = {};
  }
  const safe: Partial<AppState> = {
    ...browser,
    hydrated: true,
    user: null,
    timepieces: browser.timepieces ?? [],
    agreements: browser.agreements ?? [],
    users: browser.users ?? [],
    photos: browser.photos ?? [],
    appraisalAttempts: browser.appraisalAttempts ?? [],
    appraisalAttemptPhotos: browser.appraisalAttemptPhotos ?? [],
    profiles: browser.profiles ?? {},
    settings: {
      ...(browser.settings ?? {}),
      appearance: next.settings.appearance,
    } as AppSettings,
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState(safe)));
  } catch {
    // Live server state remains authoritative when browser storage is unavailable.
  }
  try {
    writeSessionUser(browserSessionStorage(), next.user);
  } catch {
    // A local session hint must not turn a committed mutation into a failure.
  }
}

async function loadAuthoritativeStore() {
  const browser = readPersistedState();
  try {
    const result = await readLiveBookMode();
    if (result.ok && result.mode === "browser") {
      storeMode = "browser";
      snapshot = browser;
    } else if (result.ok && result.mode === "live") {
      storeMode = "live";
      persistLiveDataPreviews(browser);
      snapshot = mergeBook(browser, result.book, result.viewer);
    } else if (result.mode === "unavailable") {
      storeMode = "unavailable";
      snapshot = liveBookFailureState(browser) as AppState;
    } else if (result.mode === "rotation") {
      snapshot = { ...browser, hydrated: true };
      window.location.replace("/admin/password");
    } else {
      storeMode = "unknown";
      snapshot = liveBookFailureState(browser) as AppState;
    }
  } catch {
    storeMode = "unknown";
    snapshot = liveBookFailureState(browser) as AppState;
  }
  notifyStore();
  return snapshot;
}

function readLiveBookMode() {
  if (liveBookReadInFlight) return liveBookReadInFlight;
  const request = (async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch("/api/live-book", {
          cache: "no-store",
          credentials: "include",
          signal: controller.signal,
        });
        const parsed = parseLiveBookResponse(
          response.status,
          await response.json().catch(() => null),
        );
        // An unavailable body is a definitive answer; never retry it.
        if (parsed.ok || parsed.mode === "unavailable") return parsed;
      } catch {
        // Retry once below.
      } finally {
        window.clearTimeout(timeout);
      }
      if (attempt === 0) await new Promise((resolve) => window.setTimeout(resolve, 200));
    }
    return { ok: false, mode: "unknown" as const };
  })()
    .finally(() => {
      if (liveBookReadInFlight === request) liveBookReadInFlight = null;
    });
  liveBookReadInFlight = request;
  return request;
}

async function reconcileLiveStore(force = false) {
  if (!shouldRecheckLiveBook(storeMode)) return;
  const generation = optimisticGeneration;
  const result = await readLiveBookMode();
  if (result.mode === "unavailable") {
    enterUnavailableMode(snapshot);
    return;
  }
  if (result.mode === "rotation") {
    window.location.replace("/admin/password");
    return;
  }
  if (!result.ok || !shouldApplyReconciliation(force, generation, optimisticGeneration)) return;
  if (result.mode === "browser") {
    storeMode = "browser";
    snapshot = readPersistedState();
    notifyStore();
  } else {
    if (result.mode !== "live" || !("book" in result)) return;
    if (storeMode === "browser") persistLiveDataPreviews(snapshot);
    storeMode = "live";
    snapshot = mergeBook(snapshot, result.book, result.viewer);
    notifyStore();
  }
}

async function reconcileFreshLiveStore() {
  const result = await readAfterInFlight(
    liveBookReadInFlight,
    () => readLiveBookMode(),
  );
  if (result.mode === "unavailable") {
    enterUnavailableMode(snapshot);
    return;
  }
  if (result.mode === "rotation") {
    window.location.replace("/admin/password");
    return;
  }
  const action = freshReconciliationAction(result);
  if (action === "browser") {
    storeMode = "browser";
    snapshot = readPersistedState();
    notifyStore();
    return;
  }
  if (action !== "live" || result.mode !== "live" || !("book" in result)) return;
  if (storeMode === "browser") persistLiveDataPreviews(snapshot);
  storeMode = "live";
  snapshot = mergeBook(snapshot, result.book, result.viewer);
  notifyStore();
}

async function reloadAfterIdentityChange() {
  if (!shouldRecheckLiveBook(storeMode)) return;
  if (liveBookReadInFlight) await liveBookReadInFlight;
  await reconcileLiveStore();
}

function queueLiveWrite(operation: unknown) {
  liveWriteQueue = liveWriteQueue.catch(() => ({ ok: false, error: "LIVE_BOOK_WRITE_FAILED" })).then(async () => {
    const disposition = operationDisposition(storeMode);
    if (disposition === "refuse") return { ok: false, error: LIVE_BOOK_UNAVAILABLE };
    if (disposition !== "dispatch") {
      const discovered = await readLiveBookMode();
      if (discovered.mode === "unavailable") {
        enterUnavailableMode(snapshot);
        return { ok: false, error: LIVE_BOOK_UNAVAILABLE };
      }
      if (!discovered.ok) return { ok: false, error: "LIVE_BOOK_MODE_UNKNOWN" };
      if (discovered.mode === "browser") {
        storeMode = "browser";
        return { ok: true };
      }
      if (storeMode === "browser") persistLiveDataPreviews(snapshot);
      storeMode = "live";
    }
    if (!isLiveStoreMode()) return { ok: false, error: "LIVE_BOOK_MODE_UNKNOWN" };
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    const response = await fetch("/api/live-book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(operation),
      cache: "no-store",
      credentials: "include",
      signal: controller.signal,
    }).catch(() => null);
    window.clearTimeout(timeout);
    if (!response) {
      await reconcileLiveStore(true).catch(() => undefined);
      return { ok: false, error: "LIVE_BOOK_TIMEOUT" };
    }
    const body = await response.json().catch(() => null);
    const result = parseLiveBookMutationResponse(response.status, body);
    if (result.mode === "rotation") {
      window.location.replace("/admin/password");
      return { ok: false, error: "PASSWORD_ROTATION_REQUIRED" };
    }
    if (result.mode === "unavailable") {
      enterUnavailableMode(snapshot);
      return { ok: false, error: LIVE_BOOK_UNAVAILABLE };
    }
    if (result.ok && result.mode === "browser") {
      storeMode = "browser";
      snapshot = readPersistedState();
      notifyStore();
      return { ok: true, mode: "browser" };
    } else if (result.ok && result.mode === "live") {
      return {
        ok: true,
        mode: "live",
        ...("rangeWarning" in result && result.rangeWarning
          ? { rangeWarning: result.rangeWarning as "below" | "above" }
          : {}),
      };
    } else if (!result.ok) {
      await reconcileLiveStore(true).catch(() => undefined);
      return { ok: false, error: typeof body?.error === "string" ? body.error : "LIVE_BOOK_WRITE_FAILED" };
    }
    return { ok: false, error: "LIVE_BOOK_WRITE_FAILED" };
  });
  return liveWriteQueue;
}

function subscribeStore(listener: () => void) {
  listeners.add(listener);
  if (storeMode === "unknown" && !loadStarted) {
    loadStarted = true;
    void loadAuthoritativeStore().finally(() => {
      if (storeMode === "unknown") loadStarted = false;
    });
  }
  return () => {
    listeners.delete(listener);
  };
}

function subscribeWithoutLoad() {
  return () => {};
}

function getStoreSnapshot() {
  return snapshot;
}

function getServerStoreSnapshot() {
  return SERVER_STATE;
}

function getPasswordStoreSnapshot() {
  return PASSWORD_STATE;
}

function refreshStoreFromDisk() {
  if (storeMode === "browser") snapshot = readPersistedState();
  notifyStore();
  return snapshot;
}

function updateStore(
  recipe: (prev: AppState) => AppState,
  options: { operation?: unknown; deferLive?: boolean; applyOnAck?: boolean } = {},
) {
  if (storeMode === "unavailable") {
    return Promise.resolve({ ok: false, error: LIVE_BOOK_UNAVAILABLE } as OperationAck);
  }
  const prev = getStoreSnapshot();
  const next = recipe(prev);
  if (next === prev) return Promise.resolve({ ok: true } as OperationAck);
  const deferred = storeMode === "live" && options.deferLive && options.operation;
  if (!deferred) snapshot = next;
  let acknowledgement: Promise<OperationAck> = Promise.resolve({ ok: true });
  if (next.hydrated && !deferred) {
    if (storeMode === "live") {
      persistLiveSafeState(next);
      if ((options.operation as { action?: string } | undefined)?.action !== "timepiece.remove") {
        persistLiveDataPreviews(next);
      }
      if (options.operation) {
        optimisticGeneration += 1;
        acknowledgement = queueLiveWrite(options.operation);
        void acknowledgement.then((result) => {
          if (result.ok && result.mode === "live") return reconcileLiveStore();
        }).catch(() => undefined);
      }
    } else if (shouldPersistBrowserBook(storeMode)) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persistableState(next)));
      writeSessionUser(browserSessionStorage(), next.user);
    } else {
      writeSessionUser(browserSessionStorage(), next.user);
    }
  }
  if (!deferred) notifyStore();
  if (deferred) {
    optimisticGeneration += 1;
    return queueLiveWrite(options.operation).then(async (result) => {
      if (result.ok && storeMode === "live") {
        if (options.applyOnAck !== false) {
          snapshot = next;
          persistLiveSafeState(next);
          const action = (options.operation as { action?: string }).action;
          if (!action || !DESK_DATA_ACTIONS.has(action)) persistLiveDataPreviews(next);
          notifyStore();
          void reconcileLiveStore().catch(() => undefined);
        } else {
          await reconcileFreshLiveStore();
        }
      } else if (
        !result.ok &&
        storeMode === "live" &&
        (result.error === "REQUEST_EXPIRED" || result.error === "AGREEMENT_STATE_CONFLICT")
      ) {
        await reconcileFreshLiveStore();
      }
      return result;
    });
  }
  if (storeMode === "browser" && options.operation) {
    optimisticGeneration += 1;
    void queueLiveWrite(options.operation).then((result) => {
      if (result.ok && result.mode === "live") return reconcileLiveStore();
    }).catch(() => undefined);
  } else if (storeMode === "unknown" && options.operation) {
    optimisticGeneration += 1;
    acknowledgement = queueLiveWrite(options.operation);
    void acknowledgement.then((result) => {
      if (result.ok && result.mode === "live") return reconcileLiveStore();
    }).catch(() => undefined);
  }
  return acknowledgement;
}

function expireRequestRow(row: Agreement, now: Date): Agreement | null {
  const result = applyTransition(
    { ...row, version: row.version ?? 1 },
    { action: "expire" },
    {
      now: now.toISOString(),
      today: deskToday(now),
      actor: { kind: "system", id: "system" },
    },
  ) as TransitionOutcome;
  return result.ok ? result.agreement : null;
}

/**
 * One request move through the shared transition table (R25). The browser
 * book plans the next row first and returns the same refusal codes the live
 * book would; in live mode the row is only replaced by the server's answer.
 */
function transitionRequest(
  id: string,
  action: RequestTransitionAction,
  input: {
    decision?: RequestDeskDecision;
    flag?: boolean;
    note?: string;
    extra?: Record<string, unknown>;
    amount?: number;
    watchIds?: string[];
  },
): Promise<OperationAck> {
  const current = getStoreSnapshot();
  const user = current.user;
  if (!user) return Promise.resolve({ ok: false, error: "SESSION_REQUIRED" });
  const desk = isDeskRole(user.role);
  const row = current.agreements.find((item) => item.id === id);
  // Ownership resolves first, so a foreign id is never a state error (KTD13).
  if (!row || (!desk && profileKey(row.email) !== profileKey(user.email))) {
    return Promise.resolve({ ok: false, error: "AGREEMENT_NOT_FOUND" });
  }
  const now = new Date();
  if (isRequestExpired(row, deskToday(now))) {
    const expired = expireRequestRow(row, now);
    if (expired && storeMode !== "live") {
      return updateStore((prev) => ({
        ...prev,
        agreements: prev.agreements.map((item) => (item.id === id ? expired : item)),
      })).then(() => ({ ok: false, error: "REQUEST_EXPIRED" } as OperationAck));
    }
    return Promise.resolve({ ok: false, error: "REQUEST_EXPIRED" });
  }
  const expectedStatus = row.status;
  const expectedVersion = row.version ?? 1;
  const result = applyTransition(
    { ...row, version: expectedVersion },
    {
      action,
      decision: input.decision,
      note: String(input.note ?? ""),
      amount: input.amount,
      watchIds: input.watchIds,
    },
    {
      now: now.toISOString(),
      today: deskToday(now),
      actor: desk
        ? { kind: "desk", id: user.email, role: user.role }
        : { kind: "retail", id: user.email },
    },
  ) as TransitionOutcome;
  if (!result.ok) return Promise.resolve({ ok: false, error: result.error });
  let next: Agreement =
    action === "flagCustomerSuccess"
      ? { ...result.agreement, customerSuccess: Boolean(input.flag) }
      : result.agreement;
  if (action === "signCollector") {
    next = {
      ...next,
      delivery: typeof input.extra?.delivery === "string" ? input.extra.delivery : next.delivery,
      signatures: [
        ...(row.signatures ?? []),
        {
          id: nextId("sig"),
          version: next.version ?? 1,
          party: "collector",
          typedName: String(input.extra?.typedName ?? ""),
          snapshotHash: String(input.extra?.snapshotHash ?? ""),
          book: "browser",
          signedAt: now.toISOString(),
        },
      ],
    };
  }
  if (action === "executeMac") {
    next = {
      ...next,
      paymentReference: String(input.extra?.paymentReference ?? ""),
      signatures: [
        ...(row.signatures ?? []),
        {
          id: nextId("sig"),
          version: next.version ?? 1,
          party: "mac",
          typedName: String(input.extra?.typedName ?? ""),
          snapshotHash: String(input.extra?.snapshotHash ?? ""),
          book: "browser",
          signedAt: now.toISOString(),
        },
      ],
    };
  }
  return updateStore(
    (prev) => ({
      ...prev,
      agreements: prev.agreements.map((item) => (item.id === id ? next : item)),
    }),
    {
      operation: {
        action: `request.${action}`,
        id,
        ...(action === "deskReturn" ? { decision: input.decision } : {}),
        ...(action === "flagCustomerSuccess" ? { flag: Boolean(input.flag) } : {}),
        note: String(input.note ?? ""),
        expectedStatus,
        expectedVersion,
        ...(input.extra ?? {}),
      },
      deferLive: true,
      applyOnAck: false,
    },
  );
}

function demoState(): AppState {
  return {
    hydrated: true,
    user: DEMO_PROFILE,
    timepieces: DEMO_TIMEPIECES,
    agreements: DEMO_AGREEMENTS,
    users: DEMO_USERS,
    catalog: DEMO_CATALOG,
    shells: DEMO_SHELLS,
    photos: photosFromWatches(DEMO_TIMEPIECES),
    appraisalAttempts: [],
    appraisalAttemptPhotos: [],
    settings: DEMO_SETTINGS,
    profiles: seedProfiles(DEMO_PROFILE),
  };
}

function assignedRole(requested?: Profile["role"]): Profile["role"] {
  if (isDeskRole(requested)) return requested;
  if (requested === "dealer") return "dealer";
  return "collector";
}

function profileForEmail(email: string, patch?: Partial<Profile>): Profile {
  const role = assignedRole(patch?.role);
  const preferences = mergePreferences(patch?.preferences);
  if (isDeskRole(role)) {
    const base = role === "appraiser" ? STAFF_PROFILE : ADMIN_PROFILE;
    return { ...base, ...patch, email, role, preferences };
  }
  return {
    name: patch?.name || "Collector",
    email,
    phone: patch?.phone || "",
    member: patch?.member ?? false,
    avatar: patch?.avatar || "/watches/patek-wrist.jpg",
    role,
    onboardingComplete: patch?.onboardingComplete ?? false,
    applicationSubmitted: patch?.applicationSubmitted ?? false,
    promoCode: patch?.promoCode ?? null,
    preferences,
  };
}

function normalizeUser(user: Profile, timepieceCount: number, agreementCount?: number): Profile;
function normalizeUser(user: Profile | null, timepieceCount: number, agreementCount?: number): Profile | null;
function normalizeUser(
  user: Profile | null,
  timepieceCount: number,
  agreementCount = 0,
): Profile | null {
  if (!user) return null;
  const role = assignedRole(user.role);
  return {
    ...user,
    role,
    preferences: mergePreferences(user.preferences),
    onboardingComplete:
      user.onboardingComplete ?? (timepieceCount > 0 || isDeskRole(role)),
    applicationSubmitted: user.applicationSubmitted ?? agreementCount > 0,
    promoCode: user.promoCode ?? null,
  };
}

function profileKey(email: string) {
  return email.trim().toLowerCase();
}

function seedProfiles(current?: Profile | null): Record<string, Profile> {
  const profiles: Record<string, Profile> = {
    [profileKey(DEMO_PROFILE.email)]: DEMO_PROFILE,
    [profileKey(ADMIN_PROFILE.email)]: ADMIN_PROFILE,
    [profileKey(STAFF_PROFILE.email)]: STAFF_PROFILE,
  };
  if (current) profiles[profileKey(current.email)] = current;
  return profiles;
}

function asManagedUser(user: Profile): ManagedUser {
  return {
    id: `usr-${profileKey(user.email).replace(/[^a-z0-9]/g, "")}`,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    status: "active",
    member: user.member,
    lastActive: new Date().toISOString().slice(0, 10),
  };
}

function rememberUser(users: ManagedUser[], user: Profile) {
  const key = profileKey(user.email);
  if (users.some((item) => profileKey(item.email) === key)) return users;
  return [asManagedUser(user), ...users];
}

function withDeskDefaults(state: Partial<AppState>, timepieces: Timepiece[]): AppState {
  const profiles = { ...seedProfiles(state.user), ...state.profiles };
  if (state.user) profiles[profileKey(state.user.email)] = state.user;
  const seedDeskDefaults = storeMode !== "live";
  return {
    hydrated: true,
    user: state.user ?? null,
    timepieces,
    agreements: state.agreements ?? [],
    users: state.users?.length ? state.users : DEMO_USERS,
    catalog: state.catalog?.length ? state.catalog : seedDeskDefaults ? DEMO_CATALOG : [],
    shells: state.shells?.length ? state.shells : seedDeskDefaults ? DEMO_SHELLS : [],
    photos: state.photos?.length ? state.photos : photosFromWatches(timepieces),
    appraisalAttempts: state.appraisalAttempts ?? [],
    appraisalAttemptPhotos: state.appraisalAttemptPhotos ?? [],
    settings: seedDeskDefaults
      ? {
          ...DEMO_SETTINGS,
          ...state.settings,
          appearance: state.settings?.appearance ?? DEMO_SETTINGS.appearance,
        }
      : state.settings ?? { ...DEFAULT_SETTINGS },
    profiles,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const skipLiveBook = pathname === "/admin/password";
  const state = useSyncExternalStore(
    skipLiveBook ? subscribeWithoutLoad : subscribeStore,
    skipLiveBook ? getPasswordStoreSnapshot : getStoreSnapshot,
    skipLiveBook ? getPasswordStoreSnapshot : getServerStoreSnapshot,
  );
  useEffect(() => {
    if (skipLiveBook) return;
    let lastCheck = 0;
    const recheck = () => {
      if (!shouldRecheckLiveBook(storeMode)) return;
      const now = Date.now();
      if (now - lastCheck < 5_000) return;
      lastCheck = now;
      void reconcileLiveStore().catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") recheck();
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [skipLiveBook]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      bookMode: storeMode,
      signIn: (profile) => {
        updateStore((prev) => {
          const email = (profile?.email ?? prev.user?.email ?? DEMO_PROFILE.email).trim();
          const key = profileKey(email);
          const saved = prev.profiles[key];
          const base = saved ?? profileForEmail(email, profile);
          const counts = ownedCounts(email, prev.timepieces, prev.agreements);
          const user = normalizeUser(
            {
              ...base,
              ...profile,
              email,
              role: assignedRole(profile?.role ?? base.role),
              preferences: mergePreferences({ ...base.preferences, ...profile?.preferences }),
            },
            counts.pieces,
            counts.agreements,
          );

          let timepieces = prev.timepieces;
          let agreements = prev.agreements;
          let photos = prev.photos;
          if (storeMode !== "live" && key === profileKey(DEMO_PROFILE.email)) {
            const haleOwns = timepieces.some(
              (watch) => profileKey(watch.ownerEmail || DEMO_PROFILE.email) === key,
            );
            if (!haleOwns) {
              timepieces = [...DEMO_TIMEPIECES, ...timepieces];
              photos = [...photosFromWatches(DEMO_TIMEPIECES), ...photos];
            }
            if (!agreements.some((item) => profileKey(item.email) === key)) {
              agreements = [...DEMO_AGREEMENTS, ...agreements];
            }
          }

          return {
            ...prev,
            hydrated: true,
            user,
            timepieces,
            agreements,
            photos,
            users: rememberUser(prev.users, user),
            profiles: { ...prev.profiles, [key]: user },
          };
        });
        void reloadAfterIdentityChange().catch(() => undefined);
      },
      signUp: (profile) => {
        updateStore((prev) => {
          const user = profileForEmail(profile.email, {
            ...profile,
            role: "collector",
            onboardingComplete: false,
          });
          const key = profileKey(user.email);
          return {
            ...prev,
            hydrated: true,
            user,
            users: rememberUser(prev.users, user),
            profiles: { ...prev.profiles, [key]: user },
          };
        });
        void reloadAfterIdentityChange().catch(() => undefined);
      },
      signOut: () =>
        updateStore((prev) => ({
          ...prev,
          user: null,
        })),
      updateProfile: (patch) =>
        updateStore((prev) => {
          if (!prev.user) return prev;
          const nextEmail = (storeMode === "live" ? prev.user.email : (patch.email ?? prev.user.email)).trim();
          if (prev.user.role === "collector" && isReservedDeskEmail(nextEmail)) {
            return prev;
          }
          const nextUser = {
            ...prev.user,
            ...patch,
            email: nextEmail,
            preferences: mergePreferences({ ...prev.user.preferences, ...patch.preferences }),
          };
          const oldKey = profileKey(prev.user.email);
          const newKey = profileKey(nextEmail);
          const profiles = { ...prev.profiles };
          if (oldKey !== newKey) delete profiles[oldKey];
          profiles[newKey] = nextUser;
          return {
            ...prev,
            user: nextUser,
            profiles,
            timepieces:
              oldKey === newKey
                ? prev.timepieces
                : prev.timepieces.map((watch) =>
                    profileKey(watch.ownerEmail || "") === oldKey
                      ? { ...watch, ownerEmail: nextEmail }
                      : watch,
                  ),
            agreements:
              oldKey === newKey
                ? prev.agreements
                : prev.agreements.map((item) =>
                    profileKey(item.email) === oldKey ? { ...item, email: nextEmail } : item,
                  ),
            users: prev.users.map((item) =>
              profileKey(item.email) === oldKey
                ? { ...item, name: nextUser.name, email: nextEmail, phone: nextUser.phone, member: nextUser.member }
                : item,
            ),
          };
        }, { operation: { action: "profile.update", patch } }),
      updatePreferences: (patch) =>
        updateStore((prev) => {
          const nextPrefs = mergePreferences({ ...prev.user?.preferences, ...patch });
          const user = prev.user ? { ...prev.user, preferences: nextPrefs } : prev.user;
          return {
            ...prev,
            settings: patch.appearance ? { ...prev.settings, appearance: patch.appearance } : prev.settings,
            user,
            profiles: user ? { ...prev.profiles, [profileKey(user.email)]: user } : prev.profiles,
          };
        }, { operation: { action: "profile.update", patch: { preferences: { ...state.user?.preferences, ...patch } } } }),
      completeOnboarding: () =>
        updateStore((prev) => {
          if (!prev.user) return prev;
          const user = { ...prev.user, onboardingComplete: true };
          return {
            ...prev,
            user,
            profiles: { ...prev.profiles, [profileKey(user.email)]: user },
          };
        }, { operation: { action: "profile.update", patch: { onboardingComplete: true } } }),
      addTimepiece: async (watch) =>
        updateStore((prev) => ({
          ...prev,
          timepieces: [watch, ...prev.timepieces],
          // One photo per intake slot, matching the live book's bound (R7).
          photos: [
            ...slotPhotosFor(watch).map(({ url, kind }, index) => ({
              id: nextId(`ph-${watch.id}-${index}`),
              url,
              kind,
              assetId: watch.id,
              caption: `${watch.brand} ${watch.model}`,
              uploadedAt: new Date().toISOString().slice(0, 10),
              ownerEmail: watch.ownerEmail || prev.user?.email || "",
            })),
            ...prev.photos,
          ],
        }), { operation: { action: "timepiece.create", timepiece: watch }, deferLive: true }),
      updateTimepiece: async (id, patch) => {
        const desk = isDeskRole(state.user?.role);
        const current = state.timepieces.find((piece) => piece.id === id);
        const attempted = state.appraisalAttempts.some(
          (attempt) => attempt.timepieceId === id,
        );
        // Same fences the live book enforces, so both books answer alike (R25):
        // admins never write appraisal numbers (R5), and moving a piece off
        // `appraised` erases an appraiser's decision, so it needs the same role (R1).
        const demotesAppraisal =
          state.timepieces.find((w) => w.id === id)?.status === "appraised" &&
          patch.status !== undefined &&
          patch.status !== "appraised";
        if (
          desk &&
          (patchNeedsAppraisal(patch) || demotesAppraisal) &&
          !canEditAppraisal(state.user)
        ) {
          return { ok: false, error: "ROLE_FORBIDDEN" };
        }
        if (
          desk &&
          attempted &&
          (patchNeedsAppraisal(patch) || demotesAppraisal)
        ) {
          return { ok: false, error: "ATTEMPT_STATE_CONFLICT" };
        }
        if (patch.images && isUnderReview(state.appraisalAttempts, id)) {
          return { ok: false, error: "REVIEW_LOCKED" };
        }
        if (current && attempted && patch.images) {
          const before = new Map(
            current.images.map((url, index) => [
              current.photoKinds?.[index] ?? REQUESTABLE_PHOTO_KINDS[index],
              url,
            ]),
          );
          const after = new Map(
            patch.images.map((url, index) => [
              patch.photoKinds?.[index] ?? REQUESTABLE_PHOTO_KINDS[index],
              url,
            ]),
          );
          const replacesOrDeletes = [...before].some(
            ([kind, url]) => !kind || after.get(kind) !== url,
          );
          if (replacesOrDeletes) return { ok: false, error: "PHOTO_KIND_TAKEN" };
        }
        if (!desk) {
          if (isUnderReview(state.appraisalAttempts, id)) {
            return { ok: false, error: "REVIEW_LOCKED" };
          }
          if (heldWatchIds(state.agreements).has(id)) {
            return { ok: false, error: "PIECE_HELD" };
          }
        }
        return updateStore((prev) => {
          const before = prev.timepieces.find((piece) => piece.id === id);
          const updated = before ? { ...before, ...patch } : null;
          if (!updated || !patch.images) {
            return {
              ...prev,
              timepieces: prev.timepieces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
            };
          }
          const otherPhotos = prev.photos.filter((photo) => photo.assetId !== id);
          const previousByKind = new Map(
            prev.photos
              .filter((photo) => photo.assetId === id)
              .map((photo) => [photo.kind, photo]),
          );
          const synced = slotPhotosFor(updated).map(({ kind, url }, index) => {
            const previous = previousByKind.get(kind);
            return {
              id: previous?.id ?? nextId(`ph-${id}-${index}`),
              url,
              kind,
              assetId: id,
              caption: `${updated.brand} ${updated.model}`,
              uploadedAt: previous?.uploadedAt ?? new Date().toISOString().slice(0, 10),
              ownerEmail: updated.ownerEmail || prev.user?.email || "",
            };
          });
          return {
            ...prev,
            timepieces: prev.timepieces.map((piece) => (piece.id === id ? updated : piece)),
            photos: [...synced, ...otherPhotos],
          };
        }, {
          operation: {
            action: desk ? "timepiece.deskUpdate" : "timepiece.update",
            id,
            patch,
          },
          deferLive: true,
        });
      },
      removeTimepiece: async (id) =>
        isUnderReview(state.appraisalAttempts, id)
          ? { ok: false, error: "REVIEW_LOCKED" }
          : state.appraisalAttempts.some((attempt) => attempt.timepieceId === id) ||
              heldWatchIds(state.agreements).has(id)
            ? { ok: false, error: "TIMEPIECE_REFERENCED" }
            : updateStore((prev) => ({
          ...prev,
          timepieces: prev.timepieces.filter((w) => w.id !== id),
          photos: prev.photos.filter((p) => p.assetId !== id),
          agreements: prev.agreements
            .map((a) => ({ ...a, watchIds: a.watchIds.filter((wid) => wid !== id) }))
            .filter((a) => a.watchIds.length > 0),
        }), { operation: { action: "timepiece.remove", id }, deferLive: true }),
      submitRequest: async (input) => {
        // The same fences, in the same order, as the live book's
        // `request.submit`, so both books answer an Apply alike (R25, AE9).
        const current = getStoreSnapshot();
        const user = current.user;
        if (!user) return { ok: false, error: "SESSION_REQUIRED" };
        if (isDeskRole(user.role)) return { ok: false, error: "COLLECTOR_REQUIRED" };
        const watchIds = [...new Set(input.watchIds)];
        if (watchIds.length === 0) return { ok: false, error: "WATCH_IDS_REQUIRED" };
        const owner = profileKey(user.email);
        const today = deskToday();
        const pieces: Timepiece[] = [];
        for (const watchId of watchIds) {
          const piece = current.timepieces.find((item) => item.id === watchId);
          if (!piece || profileKey(piece.ownerEmail || "") !== owner) {
            return { ok: false, error: "TIMEPIECE_NOT_OWNED" };
          }
          if (isUnderReview(current.appraisalAttempts, watchId)) {
            return { ok: false, error: "REVIEW_LOCKED" };
          }
          if (piece.status !== "appraised" || !piece.financeable) {
            return { ok: false, error: "INELIGIBLE_PIECE" };
          }
          if (!isAppraisalCurrent(current.appraisalAttempts, watchId, today, piece)) {
            return { ok: false, error: "APPRAISAL_EXPIRED" };
          }
          pieces.push(piece);
        }
        if (conflictingHeldWatchIds(watchIds, current.agreements, today).length > 0) {
          return { ok: false, error: LIVE_WATCH_CONFLICT };
        }
        if (!Number.isInteger(input.amount)) return { ok: false, error: "AMOUNT_WHOLE_DOLLARS" };
        // `minAdvance` is the browser book's minimum until KTD20 renames it;
        // live settings do not carry it, so they read the server's own default.
        const minimum =
          typeof current.settings.minAdvance === "number" && current.settings.minAdvance > 0
            ? current.settings.minAdvance
            : DEFAULT_MIN_SALE_AMOUNT;
        if (input.amount < minimum) return { ok: false, error: "AMOUNT_BELOW_MINIMUM" };
        const openShell = current.shells.find((shell) => shell.status === "open");
        const share = applicationPurchaseShare(
          current.applicationPurchaseShares,
          current.settings,
          openShell,
          input.termMonths,
        );
        const pieceCaps = Object.fromEntries(
          pieces.map((piece) => [piece.id, maxPurchaseAmount(piece.valueLow, piece.valueHigh, share)]),
        );
        const cap = Object.values(pieceCaps).reduce((sum, value) => sum + value, 0);
        if (input.amount > cap) return { ok: false, error: "AMOUNT_ABOVE_CAP" };

        const id = nextId("agr");
        const agreementCode = `MAC-${nextId("r").slice(-6).toUpperCase()}`;
        const note = String(input.note ?? "").trim();
        const agreement: Agreement = {
          id,
          agreementCode,
          watchIds,
          amount: input.amount,
          termMonths: input.termMonths,
          delivery: input.delivery,
          ownerName: user.name,
          email: user.email,
          createdAt: today,
          // A request reserves its pieces from the moment it exists; the term
          // clock only starts once MAC executes (KTD7).
          status: "submitted",
          version: 1,
          lastActionAt: new Date().toISOString(),
          pieceCaps,
          scale: agreementScaleFromDesk(current.settings, openShell, input.termMonths),
        };
        const now = new Date();
        const acknowledgement = await updateStore((prev) => {
          const nextUser = prev.user ? { ...prev.user, applicationSubmitted: true } : prev.user;
          const closed = prev.agreements.map((item) => {
            if (!isRequestExpired(item, today)) return item;
            if (!item.watchIds.some((watchId) => watchIds.includes(watchId))) return item;
            return expireRequestRow(item, now) ?? item;
          });
          return {
            ...prev,
            agreements: [agreement, ...closed],
            user: nextUser,
            profiles: nextUser ? { ...prev.profiles, [profileKey(nextUser.email)]: nextUser } : prev.profiles,
          };
        }, {
          operation: {
            action: "request.submit",
            id,
            agreementCode,
            watchIds,
            termMonths: input.termMonths,
            amount: input.amount,
            delivery: input.delivery,
            note,
          },
          deferLive: true,
          applyOnAck: false,
        });
        if (!acknowledgement.ok) return acknowledgement;
        return { ...acknowledgement, agreementId: id };
      },
      deskReturnRequest: (id, decision, note) =>
        transitionRequest(id, "deskReturn", { decision, note }),
      declineRequest: (id, note) => transitionRequest(id, "decline", { note }),
      withdrawRequest: (id, note) => transitionRequest(id, "withdraw", { note }),
      flagRequestCustomerSuccess: (id, flag, note) =>
        transitionRequest(id, "flagCustomerSuccess", { flag, note }),
      signCollectorRequest: (id, input) =>
        transitionRequest(id, "signCollector", {
          note: input.note,
          extra: { typedName: input.typedName, snapshotHash: input.snapshotHash, delivery: input.delivery },
        }),
      recordDeliveryRequest: (id, note) => transitionRequest(id, "recordDelivery", { note }),
      inspectRequest: async (id, input) => {
        const current = getStoreSnapshot();
        const user = current.user;
        if (!user) return { ok: false, error: "SESSION_REQUIRED" };
        if (!canInspect(user) || !isDeskRole(user.role)) {
          return { ok: false, error: "ROLE_FORBIDDEN" };
        }
        const row = current.agreements.find((item) => item.id === id);
        if (!row) return { ok: false, error: "AGREEMENT_NOT_FOUND" };
        const now = new Date();
        if (isRequestExpired(row, deskToday(now))) {
          return { ok: false, error: "REQUEST_EXPIRED" };
        }
        const kept = input.pieces.filter((piece) => piece.decision === "confirm");
        const dropped = kept.length !== input.pieces.length;
        const share = row.scale?.purchaseShare ?? 0.6;
        const maximum = kept.reduce((sum, piece) => {
          const dollars = (piece.inspectedValueCents ?? 0) / 100;
          return sum + maxPurchaseAmount(dollars, dollars, share);
        }, 0);
        const closes = input.outcome === "decline" || !kept.length;
        const returns = !closes && (dropped || row.amount > maximum);
        const actor = { kind: "desk" as const, id: user.email, role: user.role };
        const transition = closes
          ? applyTransition(
              { ...row, version: row.version ?? 1 },
              { action: "declineAtInspection", note: String(input.note ?? "") },
              { now: now.toISOString(), today: deskToday(now), actor },
            ) as TransitionOutcome
          : returns
            ? applyTransition(
                { ...row, version: row.version ?? 1 },
                {
                  action: "amend",
                  note: String(input.note ?? ""),
                  amount: Math.min(row.amount, maximum),
                  watchIds: kept.map((piece) => piece.timepieceId),
                },
                { now: now.toISOString(), today: deskToday(now), actor },
              ) as TransitionOutcome
            : null;
        if (transition && !transition.ok) return { ok: false, error: transition.error };
        return updateStore((prev) => ({
          ...prev,
          agreements: transition && transition.ok
            ? prev.agreements.map((item) => (item.id === id ? transition.agreement : item))
            : prev.agreements,
          appraisalAttempts: input.outcome === "decline"
            ? prev.appraisalAttempts
            : prev.appraisalAttempts.map((attempt) => {
                const piece = input.pieces.find((item) => item.timepieceId === attempt.timepieceId);
                if (!piece || attempt.status !== "accepted" || attempt.finalizedAt) return attempt;
                if (piece.decision === "refuse") {
                  return {
                    ...attempt,
                    status: "refused" as const,
                    valueCents: undefined,
                    rangeLowCents: undefined,
                    rangeHighCents: undefined,
                    inspectedValueCents: undefined,
                  };
                }
                if (piece.decision !== "confirm") return attempt;
                return {
                  ...attempt,
                  finalizedAt: now.toISOString(),
                  finalizedAgreementId: id,
                  inspectedValueCents: piece.inspectedValueCents,
                };
              }),
        }), {
          operation: {
            action: "request.inspect",
            id,
            outcome: input.outcome,
            pieces: input.pieces,
            note: input.note ?? "",
            expectedStatus: row.status,
            expectedVersion: row.version ?? 1,
          },
          deferLive: true,
          applyOnAck: false,
        });
      },
      executeMacRequest: (id, input) =>
        transitionRequest(id, "executeMac", {
          note: input.note,
          extra: {
            typedName: input.typedName,
            snapshotHash: input.snapshotHash,
            paymentReference: input.paymentReference,
            checklist: input.checklist,
          },
        }),
      recordReturnRequest: (id, note) => {
        const current = getStoreSnapshot();
        const row = current.agreements.find((item) => item.id === id);
        if (!row) return Promise.resolve({ ok: false, error: "AGREEMENT_NOT_FOUND" });
        if (row.status !== "closed") return Promise.resolve({ ok: false, error: "AGREEMENT_STATE_CONFLICT" });
        if (!row.deliveredOn) return Promise.resolve({ ok: false, error: "RETURN_NOT_APPLICABLE" });
        return updateStore((prev) => prev, {
          operation: {
            action: "request.recordReturn",
            id,
            note: note ?? "",
            expectedStatus: row.status,
            expectedVersion: row.version ?? 1,
          },
          deferLive: true,
          applyOnAck: false,
        });
      },
      updateAgreement: (id, patch) =>
        updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        }), {
          operation: {
            action: "agreement.updateScale",
            id,
            scale: patch.scale ?? {},
            termMonths: patch.termMonths ?? state.agreements.find((item) => item.id === id)?.termMonths ?? 12,
          },
        }),
      removeAgreement: async (id) =>
        updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.filter((a) => a.id !== id),
        }), { operation: { action: "agreement.remove", id }, deferLive: true }),
      signAgreement: async (id) => {
        const current = refreshStoreFromDisk();
        const row = current.agreements.find((item) => item.id === id);
        if (!row) return { ok: false, error: "AGREEMENT_NOT_FOUND" };
        if (row.status === "returned") {
          return { ok: false, error: "DOCUMENT_NOT_READY" };
        }
        // A book row already executed: record the day only. Request signing
        // is request.signCollector.
        return updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((item) =>
            item.id === id ? { ...item, signedAt: item.signedAt ?? deskToday() } : item
          ),
        }));
      },
      recordAgreementEnd: async (id, end) => {
        const recordable = validateRecordedEndKind(end.kind);
        if (!recordable.ok) return recordable;
        const currentState = refreshStoreFromDisk();
        const current = currentState.agreements.find((a) => a.id === id);
        if (!current) return { ok: false, error: "NOT_FOUND" };
        const result = applyAgreementEnd(current, end, deskToday());
        if (!result.ok) return { ok: false, error: result.error };
        const others = currentState.agreements.filter((a) => a.id !== id);
        if (
          isLiveBookLabel(bookLabel(result.agreement)) &&
          conflictingHeldWatchIds(result.agreement.watchIds, others).length > 0
        ) {
          return { ok: false, error: LIVE_WATCH_CONFLICT };
        }
        const acknowledgement = await updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((a) => (a.id === id ? result.agreement : a)),
        }), { operation: { action: "agreement.recordEnd", id, end: result.agreement.bookEnd }, deferLive: true });
        if (!acknowledgement.ok) return { ok: false, error: acknowledgement.error ?? "LIVE_BOOK_WRITE_FAILED" };
        return { ok: true };
      },
      renewAgreement: async (id, closeDate) => {
        const current = refreshStoreFromDisk();
        const agreement = current.agreements.find((item) => item.id === id);
        if (!agreement) return { ok: false, error: "NOT_FOUND" };
        const openShell = current.shells.find((shell) => shell.status === "open");
        const successorScale = agreementScaleFromDesk(current.settings, openShell, 12);
        const planned = planRenewal(agreement, closeDate, deskToday(), successorScale);
        if (!planned.ok) return { ok: false, error: planned.error };
        const successor: Agreement = {
          id: nextId("agr"),
          agreementCode: `MAC-${nextId("r").slice(-6).toUpperCase()}`,
          watchIds: planned.successor.watchIds,
          amount: planned.successor.amount,
          termMonths: planned.successor.termMonths,
          delivery: planned.successor.delivery,
          ownerName: planned.successor.ownerName,
          email: planned.successor.email,
          // The pieces never left MAC, so a successor opens executed (KTD21).
          status: planned.successor.status,
          createdAt: planned.successor.createdAt,
          executedOn: planned.successor.executedOn,
          version: 1,
          lastActionAt: new Date().toISOString(),
          scale: successorScale,
        };
        const acknowledgement = await updateStore((prev) => ({
          ...prev,
          agreements: [
            successor,
            ...prev.agreements.map((item) =>
              item.id === id ? { ...item, bookEnd: planned.end } : item,
            ),
          ],
        }), {
          operation: {
            action: "agreement.renew",
            id,
            closeDate,
            successorId: successor.id,
            agreementCode: successor.agreementCode,
          },
          deferLive: true,
        });
        if (!acknowledgement.ok) return { ok: false, error: acknowledgement.error ?? "LIVE_BOOK_WRITE_FAILED" };
        if (acknowledgement.mode === "live") {
          await reconcileLiveStore(true);
          return {
            ok: true,
            successor: snapshot.agreements.find((item) => item.id === successor.id) ?? successor,
          };
        }
        return { ok: true, successor };
      },
      clearAgreementEnd: async (id) => {
        const current = refreshStoreFromDisk();
        const agreement = current.agreements.find((item) => item.id === id);
        if (!agreement?.bookEnd) return false;
        const others = current.agreements.filter((item) => item.id !== id);
        if (conflictingHeldWatchIds(agreement.watchIds, others).length > 0) {
          return false;
        }
        const acknowledgement = await updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((item) => (item.id === id ? stripAgreementEnd(item) : item)),
        }), { operation: { action: "agreement.clearEnd", id }, deferLive: true });
        return acknowledgement.ok;
      },
      updateSettings: (patch) => {
        // The live book reserves the photo policy for a super admin and repairs
        // the value; the default book must answer the same way (R6, R25).
        // The config form submits every field, so only a real change is fenced.
        if (patch.requiredPhotoKinds !== undefined) {
          const next = normalizeRequiredPhotoKinds(patch.requiredPhotoKinds) as PhotoKind[];
          const current = normalizeRequiredPhotoKinds(state.settings.requiredPhotoKinds);
          const changed = next.length !== current.length
            || next.some((kind, index) => kind !== current[index]);
          if (changed && !isSuperAdmin(state.user)) {
            return Promise.resolve({ ok: false, error: "ROLE_FORBIDDEN" } as OperationAck);
          }
          patch = { ...patch, requiredPhotoKinds: next };
        }
        const serverPatch = Object.fromEntries(
          SERVER_SETTING_KEYS
            .filter((key) => patch[key] !== undefined)
            .map((key) => [key, patch[key]]),
        );
        return updateStore(
          (prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }),
          {
            operation: Object.keys(serverPatch).length
              ? { action: "settings.update", patch: serverPatch }
              : undefined,
            deferLive: Object.keys(serverPatch).length > 0,
          },
        );
      },
      upsertUser: async (user) =>
        updateStore((prev) => {
          const exists = prev.users.some((u) => u.id === user.id);
          return {
            ...prev,
            users: exists ? prev.users.map((u) => (u.id === user.id ? user : u)) : [user, ...prev.users],
          };
        }, {
          operation: state.users.some((existing) => existing.id === user.id)
            ? {
                action: "customer.update",
                id: user.id,
                patch: { name: user.name, phone: user.phone, status: user.status, member: user.member },
              }
            : { action: "customer.invite", customer: user },
          deferLive: true,
        }),
      removeUser: async (id) => {
        const target = state.users.find((user) => user.id === id);
        const targetPieceIds = new Set(
          state.timepieces
            .filter(
              (piece) =>
                piece.ownerEmail?.toLowerCase() === target?.email.toLowerCase(),
            )
            .map((piece) => piece.id),
        );
        if (
          state.appraisalAttempts.some((attempt) =>
            targetPieceIds.has(attempt.timepieceId)
          )
        ) {
          return { ok: false, error: "CUSTOMER_REFERENCED" };
        }
        return updateStore(
          (prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) }),
          { operation: { action: "customer.remove", id }, deferLive: true },
        );
      },
      upsertCatalog: async (entry) => {
        if (!canEditAppraisal(state.user)) return { ok: false, error: "ROLE_FORBIDDEN" };
        return updateStore((prev) => {
          const exists = prev.catalog.some((c) => c.id === entry.id);
          return {
            ...prev,
            catalog: exists ? prev.catalog.map((c) => (c.id === entry.id ? entry : c)) : [entry, ...prev.catalog],
          };
        }, { operation: { action: "catalog.upsert", entry }, deferLive: true });
      },
      removeCatalog: async (id) => {
        if (!canEditAppraisal(state.user)) return { ok: false, error: "ROLE_FORBIDDEN" };
        return updateStore(
          (prev) => ({ ...prev, catalog: prev.catalog.filter((c) => c.id !== id) }),
          { operation: { action: "catalog.remove", id }, deferLive: true },
        );
      },
      upsertShell: (shell) =>
        updateStore((prev) => {
          const exists = prev.shells.some((s) => s.id === shell.id);
          return {
            ...prev,
            shells: exists ? prev.shells.map((s) => (s.id === shell.id ? shell : s)) : [shell, ...prev.shells],
          };
        }, { operation: { action: "shell.upsert", shell }, deferLive: true }),
      removeShell: (id) =>
        updateStore(
          (prev) => ({ ...prev, shells: prev.shells.filter((s) => s.id !== id) }),
          { operation: { action: "shell.remove", id }, deferLive: true },
        ),
      upsertPhoto: async (photo) => {
        const appraisalError = browserPhotoMutationError(state, photo);
        if (appraisalError) return { ok: false, error: appraisalError };
        return updateStore((prev) => {
          const exists = prev.photos.some((p) => p.id === photo.id);
          return {
            ...prev,
            photos: exists ? prev.photos.map((p) => (p.id === photo.id ? photo : p)) : [photo, ...prev.photos],
          };
        }, {
          operation: photo.assetId && !photo.url.startsWith("data:")
            ? { action: "preview.upsert", id: photo.id, timepieceId: photo.assetId, kind: photo.kind, url: photo.url }
            : undefined,
        });
      },
      removePhoto: async (id) => {
        const photo = state.photos.find((row) => row.id === id);
        if (
          photo?.assetId &&
          state.appraisalAttempts.some((attempt) => attempt.timepieceId === photo.assetId)
        ) {
          return { ok: false, error: "PHOTO_REFERENCED" };
        }
        return updateStore(
          (prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) }),
          {
            operation: state.photos.find((photo) => photo.id === id)?.url.startsWith("data:")
              ? undefined
              : { action: "preview.remove", id },
            deferLive: true,
          },
        );
      },
      submitAppraisal: async (input) => {
        const planned = applyAppraisalSubmit(
          getStoreSnapshot(),
          state.user,
          input,
        );
        if (!("state" in planned)) return { ok: false, error: planned.error };
        const acknowledgement = await updateStore(
          () => planned.state as AppState,
          {
            operation: { action: "appraisal.submit", ...input },
            deferLive: true,
            applyOnAck: false,
          },
        );
        return acknowledgement;
      },
      returnAppraisal: async (input) => {
        const planned = applyAppraisalReturn(getStoreSnapshot(), state.user, input);
        if (!("state" in planned)) return { ok: false, error: planned.error };
        return updateStore(
          () => planned.state as AppState,
          {
            operation: { action: "appraisal.return", ...input },
            deferLive: true,
            applyOnAck: false,
          },
        );
      },
      decideAppraisal: async (input) => {
        const planned = applyAppraisalDecision(
          getStoreSnapshot(),
          state.user,
          input,
        );
        if (!("state" in planned)) return { ok: false, error: planned.error };
        const acknowledgement = await updateStore(
          () => planned.state as AppState,
          {
            operation: { action: "appraisal.decide", ...input },
            deferLive: true,
            applyOnAck: false,
          },
        );
        return {
          ...acknowledgement,
          rangeWarning:
            acknowledgement.rangeWarning ??
            ("rangeWarning" in planned
              ? planned.rangeWarning as "below" | "above" | undefined
              : undefined),
        };
      },
      reopenAppraisal: async (input) => {
        const planned = applyAppraisalReopen(getStoreSnapshot(), state.user, input);
        if (!("state" in planned)) return { ok: false, error: planned.error };
        return updateStore(
          () => planned.state as AppState,
          {
            operation: { action: "appraisal.reopen", ...input },
            deferLive: true,
            applyOnAck: false,
          },
        );
      },
      resetDemo: () => {
        localStorage.removeItem(STORAGE_KEY);
        for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);
        localStorage.removeItem(LIVE_PREVIEW_KEY);
        writeSessionUser(browserSessionStorage(), null);
        updateStore(
          () => (storeMode === "live" ? { ...snapshot, hydrated: true, user: null } : demoState()),
        );
      },
    }),
    [state]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
