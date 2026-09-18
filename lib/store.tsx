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
import { planRenewal } from "@/lib/contract/repo-renewal.mjs";
import { agreementScaleFromDesk } from "@/lib/contract/repo-scale.mjs";
import { nextId } from "@/lib/ids";
import {
  mergeLocalDataPreviews,
  mergeLiveSettings,
  liveBookFailureState,
  liveDeskOverlay,
  operationDisposition,
  parseLiveBookResponse,
  parseLiveBookMutationResponse,
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
  conflictingLiveWatchIds,
  isEligibleLiveAddWatch,
  isLiveBookLabel,
  LIVE_WATCH_CONFLICT,
  utcToday,
  validateRecordedEndKind,
  validateSaleAmountRaise,
} from "@/lib/contract/repo-book.mjs";
import { DEFAULT_SETTINGS } from "@/lib/theme";
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
  PhotoRecord,
  Profile,
  Timepiece,
  UserPreferences,
} from "@/lib/types";

const STORAGE_KEY = "mac-app-state-v3";
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
  createAgreement: (input: Omit<Agreement, "id" | "createdAt" | "status">) => Promise<Agreement>;
  updateAgreement: (id: string, patch: Partial<Agreement>) => void;
  removeAgreement: (id: string) => Promise<OperationAck>;
  signAgreement: (id: string) => Promise<OperationAck>;
  recordAgreementEnd: (id: string, end: AgreementEnd) => Promise<{ ok: true } | { ok: false; error: string }>;
  renewAgreement: (id: string, closeDate: string) => Promise<{ ok: true; successor: Agreement } | { ok: false; error: string }>;
  addAgreementWatches: (id: string, watchIds: string[]) => Promise<{ ok: true } | { ok: false; error: string }>;
  setAgreementAmount: (id: string, amount: number) => Promise<{ ok: true } | { ok: false; error: string }>;
  clearAgreementEnd: (id: string) => Promise<boolean>;
  updateSettings: (patch: Partial<AppSettings>) => Promise<OperationAck>;
  upsertUser: (user: ManagedUser) => Promise<OperationAck>;
  removeUser: (id: string) => Promise<OperationAck>;
  upsertCatalog: (entry: CatalogEntry) => Promise<OperationAck>;
  removeCatalog: (id: string) => Promise<OperationAck>;
  upsertShell: (shell: AgreementShell) => Promise<OperationAck>;
  removeShell: (id: string) => Promise<OperationAck>;
  upsertPhoto: (photo: PhotoRecord) => void;
  removePhoto: (id: string) => Promise<OperationAck>;
  resetDemo: () => void;
};

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
type OperationAck = { ok: boolean; error?: string; mode?: "browser" | "live" };
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
  "timepieces" | "agreements" | "users" | "photos" | "profiles" | "catalog" | "shells" | "settings"
>;

function readPersistedState(): AppState {
  const sessionUser = readSessionUser(browserSessionStorage());
  try {
    const raw =
      localStorage.getItem(STORAGE_KEY) ??
      localStorage.getItem("mac-app-state-v2") ??
      localStorage.getItem("mac-app-state-v1");
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      const timepieces = Array.isArray(parsed.timepieces) ? parsed.timepieces : [];
      const agreements = Array.isArray(parsed.agreements) ? parsed.agreements : [];
      const counts = ownedCounts(sessionUser?.email, timepieces, agreements);
      return {
        ...withDeskDefaults({ ...parsed, agreements, user: null }, timepieces),
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
  const sessionUser = authenticated?.role === "admin" || authenticated?.role === "staff"
    ? profileForEmail(viewer.email, { role: authenticated.role })
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
      return { ok: true, mode: "live" };
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
  options: { operation?: unknown; deferLive?: boolean } = {},
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
    return queueLiveWrite(options.operation).then((result) => {
      if (result.ok && storeMode === "live") {
        snapshot = next;
        persistLiveSafeState(next);
        const action = (options.operation as { action?: string }).action;
        if (!action || !DESK_DATA_ACTIONS.has(action)) persistLiveDataPreviews(next);
        notifyStore();
        void reconcileLiveStore().catch(() => undefined);
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
    settings: DEMO_SETTINGS,
    profiles: seedProfiles(DEMO_PROFILE),
  };
}

function assignedRole(requested?: Profile["role"]) {
  if (requested === "admin" || requested === "staff") {
    return requested;
  }
  return "collector";
}

function profileForEmail(email: string, patch?: Partial<Profile>): Profile {
  const role = assignedRole(patch?.role);
  const preferences = mergePreferences(patch?.preferences);
  if (role === "admin") {
    return { ...ADMIN_PROFILE, ...patch, email, role, preferences };
  }
  if (role === "staff") {
    return { ...STAFF_PROFILE, ...patch, email, role, preferences };
  }
  return {
    name: patch?.name || "Collector",
    email,
    phone: patch?.phone || "",
    member: patch?.member ?? false,
    avatar: patch?.avatar || "/watches/patek-wrist.jpg",
    role: "collector",
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
  const role = user.role === "admin" || user.role === "staff" ? user.role : "collector";
  return {
    ...user,
    role,
    preferences: mergePreferences(user.preferences),
    onboardingComplete:
      user.onboardingComplete ?? (timepieceCount > 0 || role === "admin" || role === "staff"),
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
          photos: [
            ...watch.images.map((url, index) => ({
              id: nextId(`ph-${watch.id}-${index}`),
              url,
              kind: watch.photoKinds?.[index] ?? (["front", "back", "left", "right", "clasp"] as const)[index] ?? "other",
              assetId: watch.id,
              caption: `${watch.brand} ${watch.model}`,
              uploadedAt: new Date().toISOString().slice(0, 10),
              ownerEmail: watch.ownerEmail || prev.user?.email || "",
            })),
            ...prev.photos,
          ],
        }), { operation: { action: "timepiece.create", timepiece: watch }, deferLive: true }),
      updateTimepiece: async (id, patch) =>
        updateStore((prev) => ({
          ...prev,
          timepieces: prev.timepieces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        }), {
          operation: {
            action: state.user?.role === "collector" ? "timepiece.update" : "timepiece.deskUpdate",
            id,
            patch,
          },
          deferLive: true,
        }),
      removeTimepiece: async (id) =>
        updateStore((prev) => ({
          ...prev,
          timepieces: prev.timepieces.filter((w) => w.id !== id),
          photos: prev.photos.filter((p) => p.assetId !== id),
          agreements: prev.agreements
            .map((a) => ({ ...a, watchIds: a.watchIds.filter((wid) => wid !== id) }))
            .filter((a) => a.watchIds.length > 0),
        }), { operation: { action: "timepiece.remove", id }, deferLive: true }),
      createAgreement: async (input) => {
        const current = refreshStoreFromDisk();
        const conflicts = conflictingLiveWatchIds(input.watchIds, current.agreements);
        if (conflicts.length > 0) {
          throw new Error(LIVE_WATCH_CONFLICT);
        }
        const openShell = current.shells.find((shell) => shell.status === "open");
        const agreement: Agreement = {
          ...input,
          id: nextId("agr"),
          agreementCode: `MAC-${nextId("r").slice(-6).toUpperCase()}`,
          createdAt: new Date().toISOString().slice(0, 10),
          status: "pending_signature",
          scale: input.scale ?? agreementScaleFromDesk(current.settings, openShell, input.termMonths),
        };
        const acknowledgement = await updateStore((prev) => {
          const user = prev.user ? { ...prev.user, applicationSubmitted: true } : prev.user;
          return {
            ...prev,
            agreements: [agreement, ...prev.agreements],
            user,
            profiles: user ? { ...prev.profiles, [profileKey(user.email)]: user } : prev.profiles,
          };
        }, { operation: { action: "agreement.create", agreement }, deferLive: true });
        if (!acknowledgement.ok) throw new Error(acknowledgement.error);
        if (acknowledgement.mode === "live") {
          await reconcileLiveStore(true);
          return snapshot.agreements.find((item) => item.id === agreement.id) ?? agreement;
        }
        return agreement;
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
      signAgreement: async (id) =>
        updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((a) =>
            a.id === id
              ? { ...a, status: "signed", signedAt: new Date().toISOString().slice(0, 10) }
              : a
          ),
        }), {
          operation: {
            action: state.user?.role === "collector" ? "agreement.signCollector" : "agreement.markSigned",
            id,
          },
          deferLive: true,
        }),
      recordAgreementEnd: async (id, end) => {
        const recordable = validateRecordedEndKind(end.kind);
        if (!recordable.ok) return recordable;
        const currentState = refreshStoreFromDisk();
        const current = currentState.agreements.find((a) => a.id === id);
        if (!current) return { ok: false, error: "NOT_FOUND" };
        const result = applyAgreementEnd(current, end, utcToday());
        if (!result.ok) return { ok: false, error: result.error };
        const others = currentState.agreements.filter((a) => a.id !== id);
        if (
          isLiveBookLabel(bookLabel(result.agreement)) &&
          conflictingLiveWatchIds(result.agreement.watchIds, others).length > 0
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
        const planned = planRenewal(agreement, closeDate, utcToday(), successorScale);
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
          status: "pending_signature",
          createdAt: planned.successor.createdAt,
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
      addAgreementWatches: async (id, watchIds) => {
        const current = refreshStoreFromDisk();
        const agreement = current.agreements.find((item) => item.id === id);
        if (!agreement || !isLiveBookLabel(bookLabel(agreement))) {
          return { ok: false, error: "NOT_LIVE" };
        }
        const extras = watchIds.filter((watchId) => !agreement.watchIds.includes(watchId));
        const others = current.agreements.filter((item) => item.id !== id);
        if (conflictingLiveWatchIds(extras, others).length > 0) {
          return { ok: false, error: LIVE_WATCH_CONFLICT };
        }
        const eligible = extras.every((watchId) => {
          const watch = current.timepieces.find((item) => item.id === watchId);
          return isEligibleLiveAddWatch(watch, agreement.email);
        });
        if (!eligible) return { ok: false, error: "INELIGIBLE_PIECE" };
        if (extras.length === 0) return { ok: true };
        const acknowledgement = await updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((item) =>
            item.id === id ? { ...item, watchIds: [...item.watchIds, ...extras] } : item,
          ),
        }), { operation: { action: "agreement.addWatches", id, watchIds: extras }, deferLive: true });
        if (!acknowledgement.ok) return { ok: false, error: acknowledgement.error ?? "LIVE_BOOK_WRITE_FAILED" };
        return { ok: true };
      },
      setAgreementAmount: async (id, amount) => {
        const current = refreshStoreFromDisk();
        const agreement = current.agreements.find((item) => item.id === id);
        if (!agreement || !isLiveBookLabel(bookLabel(agreement))) {
          return { ok: false, error: "NOT_LIVE" };
        }
        const raised = validateSaleAmountRaise(agreement.amount, amount);
        if (!raised.ok) return raised;
        const openShell = current.shells.find((shell) => shell.status === "open");
        const share = openShell?.ltv || current.settings.maxLtv;
        const pieces = current.timepieces.filter((watch) => agreement.watchIds.includes(watch.id));
        const cap = pieces.reduce(
          (sum, watch) => sum + maxPurchaseAmount(watch.valueLow, watch.valueHigh, share),
          0,
        );
        if (amount > cap) return { ok: false, error: "OVER_LTV" };
        const acknowledgement = await updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((item) => (item.id === id ? { ...item, amount } : item)),
        }), { operation: { action: "agreement.setAmount", id, amount }, deferLive: true });
        if (!acknowledgement.ok) return { ok: false, error: acknowledgement.error ?? "LIVE_BOOK_WRITE_FAILED" };
        return { ok: true };
      },
      clearAgreementEnd: async (id) => {
        const current = refreshStoreFromDisk();
        const agreement = current.agreements.find((item) => item.id === id);
        if (!agreement?.bookEnd) return false;
        const others = current.agreements.filter((item) => item.id !== id);
        if (conflictingLiveWatchIds(agreement.watchIds, others).length > 0) {
          return false;
        }
        const acknowledgement = await updateStore((prev) => ({
          ...prev,
          agreements: prev.agreements.map((item) => (item.id === id ? stripAgreementEnd(item) : item)),
        }), { operation: { action: "agreement.clearEnd", id }, deferLive: true });
        return acknowledgement.ok;
      },
      updateSettings: (patch) => {
        const serverPatch = Object.fromEntries(
          [
            "maxLtv",
            "startingRate",
            "setupFee",
            "earlyRepurchaseAmount",
            "brokerFee",
            "minMonths",
            "earlyStartMonth",
            "earlyUntilMonth",
            "typicalTerm",
            "membershipMonthly",
            "vaultLocation",
          ]
            .filter((key) => patch[key as keyof AppSettings] !== undefined)
            .map((key) => [key, patch[key as keyof AppSettings]]),
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
      removeUser: async (id) =>
        updateStore(
          (prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) }),
          { operation: { action: "customer.remove", id }, deferLive: true },
        ),
      upsertCatalog: (entry) =>
        updateStore((prev) => {
          const exists = prev.catalog.some((c) => c.id === entry.id);
          return {
            ...prev,
            catalog: exists ? prev.catalog.map((c) => (c.id === entry.id ? entry : c)) : [entry, ...prev.catalog],
          };
        }, { operation: { action: "catalog.upsert", entry }, deferLive: true }),
      removeCatalog: (id) =>
        updateStore(
          (prev) => ({ ...prev, catalog: prev.catalog.filter((c) => c.id !== id) }),
          { operation: { action: "catalog.remove", id }, deferLive: true },
        ),
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
      upsertPhoto: (photo) =>
        updateStore((prev) => {
          const exists = prev.photos.some((p) => p.id === photo.id);
          return {
            ...prev,
            photos: exists ? prev.photos.map((p) => (p.id === photo.id ? photo : p)) : [photo, ...prev.photos],
          };
        }, {
          operation: photo.assetId && !photo.url.startsWith("data:")
            ? { action: "preview.upsert", id: photo.id, timepieceId: photo.assetId, kind: photo.kind, url: photo.url }
            : undefined,
        }),
      removePhoto: async (id) =>
        updateStore(
          (prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) }),
          {
            operation: state.photos.find((photo) => photo.id === id)?.url.startsWith("data:")
              ? undefined
              : { action: "preview.remove", id },
            deferLive: true,
          },
        ),
      resetDemo: () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("mac-app-state-v2");
        localStorage.removeItem("mac-app-state-v1");
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
