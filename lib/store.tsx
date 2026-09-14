"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEMO_CATALOG,
  DEMO_SETTINGS,
  DEMO_SHELLS,
  DEMO_USERS,
  photosFromWatches,
} from "@/lib/admin-seed";
import { deskRoleForEmail } from "@/lib/auth";
import { mergePreferences } from "@/lib/preferences";
import { ADMIN_PROFILE, DEMO_AGREEMENTS, DEMO_PROFILE, DEMO_TIMEPIECES, STAFF_PROFILE } from "@/lib/seed";
import type {
  Agreement,
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

type Store = AppState & {
  signIn: (profile?: Partial<Profile>) => void;
  signUp: (profile: Pick<Profile, "name" | "email"> & Partial<Profile>) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  completeOnboarding: () => void;
  addTimepiece: (watch: Timepiece) => void;
  updateTimepiece: (id: string, patch: Partial<Timepiece>) => void;
  removeTimepiece: (id: string) => void;
  createAgreement: (input: Omit<Agreement, "id" | "createdAt" | "status">) => Agreement;
  updateAgreement: (id: string, patch: Partial<Agreement>) => void;
  removeAgreement: (id: string) => void;
  signAgreement: (id: string) => void;
  updateSettings: (patch: Partial<AppSettings>) => void;
  upsertUser: (user: ManagedUser) => void;
  removeUser: (id: string) => void;
  upsertCatalog: (entry: CatalogEntry) => void;
  removeCatalog: (id: string) => void;
  upsertShell: (shell: AgreementShell) => void;
  removeShell: (id: string) => void;
  upsertPhoto: (photo: PhotoRecord) => void;
  removePhoto: (id: string) => void;
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
  };
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
  };
}

function assignedRole(email: string, requested?: Profile["role"]) {
  const desk = deskRoleForEmail(email);
  if (requested === "admin" || requested === "staff") {
    return desk === requested ? requested : "collector";
  }
  return "collector";
}

function profileForEmail(email: string, patch?: Partial<Profile>): Profile {
  const role = assignedRole(email, patch?.role);
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

function normalizeUser(
  user: Profile | null,
  timepieceCount: number,
  agreementCount = 0,
): Profile | null {
  if (!user) return null;
  const desk = deskRoleForEmail(user.email);
  const role = desk && (user.role === "admin" || user.role === "staff") ? desk : "collector";
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

function withDeskDefaults(state: Partial<AppState>, timepieces: Timepiece[]): AppState {
  return {
    hydrated: true,
    user: state.user ?? null,
    timepieces,
    agreements: state.agreements ?? [],
    users: state.users?.length ? state.users : DEMO_USERS,
    catalog: state.catalog?.length ? state.catalog : DEMO_CATALOG,
    shells: state.shells?.length ? state.shells : DEMO_SHELLS,
    photos: state.photos?.length ? state.photos : photosFromWatches(timepieces),
    settings: {
      ...DEMO_SETTINGS,
      ...state.settings,
      appearance: state.settings?.appearance ?? DEMO_SETTINGS.appearance,
    },
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);

  useEffect(() => {
    try {
      const raw =
        localStorage.getItem(STORAGE_KEY) ??
        localStorage.getItem("mac-app-state-v2") ??
        localStorage.getItem("mac-app-state-v1");
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        const timepieces = parsed.timepieces && parsed.timepieces.length > 0 ? parsed.timepieces : DEMO_TIMEPIECES;
        setState({
          ...withDeskDefaults(parsed, timepieces),
          user: normalizeUser(parsed.user, timepieces.length, parsed.agreements?.length ?? 0),
        });
        return;
      }
    } catch {
      /* start empty */
    }
    setState(demoState());
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      signIn: (profile) =>
        setState((prev) => {
          const email = (profile?.email ?? prev.user?.email ?? DEMO_PROFILE.email).trim();
          const lower = email.toLowerCase();
          const switching = Boolean(prev.user?.email && prev.user.email.toLowerCase() !== lower);

          if (lower === DEMO_PROFILE.email.toLowerCase() && (switching || !prev.timepieces.length)) {
            return { ...demoState(), user: { ...DEMO_PROFILE, ...profile, email: DEMO_PROFILE.email } };
          }

          if (switching || !prev.user) {
            const user = profileForEmail(email, profile);
            const keepDesk =
              prev.users.length || prev.catalog.length
                ? prev
                : withDeskDefaults({}, []);
            return {
              ...keepDesk,
              hydrated: true,
              user,
              timepieces: user.role === "collector" ? [] : prev.timepieces,
              agreements: user.role === "collector" ? [] : prev.agreements,
            };
          }

          return {
            ...prev,
            user: normalizeUser(
              {
                ...prev.user,
                ...profile,
                email,
                role: assignedRole(email, profile?.role ?? prev.user.role),
                preferences: mergePreferences({ ...prev.user.preferences, ...profile?.preferences }),
              },
              prev.timepieces.length,
              prev.agreements.length,
            ),
          };
        }),
      signUp: (profile) =>
        setState((prev) => ({
          ...prev,
          hydrated: true,
          user: profileForEmail(profile.email, { ...profile, role: "collector", onboardingComplete: false }),
          timepieces: [],
          agreements: [],
        })),
      signOut: () =>
        setState((prev) => ({
          ...prev,
          user: null,
        })),
      updateProfile: (patch) =>
        setState((prev) =>
          prev.user
            ? {
                ...prev,
                user: {
                  ...prev.user,
                  ...patch,
                  preferences: mergePreferences({ ...prev.user.preferences, ...patch.preferences }),
                },
              }
            : prev,
        ),
      updatePreferences: (patch) =>
        setState((prev) => {
          const nextPrefs = mergePreferences({ ...prev.user?.preferences, ...patch });
          return {
            ...prev,
            settings: patch.appearance ? { ...prev.settings, appearance: patch.appearance } : prev.settings,
            user: prev.user ? { ...prev.user, preferences: nextPrefs } : prev.user,
          };
        }),
      completeOnboarding: () =>
        setState((prev) =>
          prev.user ? { ...prev, user: { ...prev.user, onboardingComplete: true } } : prev
        ),
      addTimepiece: (watch) =>
        setState((prev) => ({
          ...prev,
          timepieces: [watch, ...prev.timepieces],
          photos: [
            ...watch.images.map((url, index) => ({
              id: `ph-${watch.id}-${index}-${Date.now()}`,
              url,
              kind: (["front", "back", "left", "more"] as const)[index] ?? "other",
              assetId: watch.id,
              caption: `${watch.brand} ${watch.model}`,
              uploadedAt: new Date().toISOString().slice(0, 10),
              ownerEmail: watch.ownerEmail || prev.user?.email || "",
            })),
            ...prev.photos,
          ],
        })),
      updateTimepiece: (id, patch) =>
        setState((prev) => ({
          ...prev,
          timepieces: prev.timepieces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),
      removeTimepiece: (id) =>
        setState((prev) => ({
          ...prev,
          timepieces: prev.timepieces.filter((w) => w.id !== id),
          photos: prev.photos.filter((p) => p.assetId !== id),
          agreements: prev.agreements
            .map((a) => ({ ...a, watchIds: a.watchIds.filter((wid) => wid !== id) }))
            .filter((a) => a.watchIds.length > 0),
        })),
      createAgreement: (input) => {
        const agreement: Agreement = {
          ...input,
          id: `agr-${Date.now().toString().slice(-6)}`,
          agreementCode: `MAC-${Date.now().toString().slice(-5)}`,
          createdAt: new Date().toISOString().slice(0, 10),
          status: "pending_signature",
        };
        setState((prev) => ({
          ...prev,
          agreements: [agreement, ...prev.agreements],
          user: prev.user ? { ...prev.user, applicationSubmitted: true } : prev.user,
        }));
        return agreement;
      },
      updateAgreement: (id, patch) =>
        setState((prev) => ({
          ...prev,
          agreements: prev.agreements.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
      removeAgreement: (id) =>
        setState((prev) => ({
          ...prev,
          agreements: prev.agreements.filter((a) => a.id !== id),
        })),
      signAgreement: (id) =>
        setState((prev) => ({
          ...prev,
          agreements: prev.agreements.map((a) =>
            a.id === id
              ? { ...a, status: "signed", signedAt: new Date().toISOString().slice(0, 10) }
              : a
          ),
        })),
      updateSettings: (patch) =>
        setState((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } })),
      upsertUser: (user) =>
        setState((prev) => {
          const exists = prev.users.some((u) => u.id === user.id);
          return {
            ...prev,
            users: exists ? prev.users.map((u) => (u.id === user.id ? user : u)) : [user, ...prev.users],
          };
        }),
      removeUser: (id) =>
        setState((prev) => ({ ...prev, users: prev.users.filter((u) => u.id !== id) })),
      upsertCatalog: (entry) =>
        setState((prev) => {
          const exists = prev.catalog.some((c) => c.id === entry.id);
          return {
            ...prev,
            catalog: exists ? prev.catalog.map((c) => (c.id === entry.id ? entry : c)) : [entry, ...prev.catalog],
          };
        }),
      removeCatalog: (id) =>
        setState((prev) => ({ ...prev, catalog: prev.catalog.filter((c) => c.id !== id) })),
      upsertShell: (shell) =>
        setState((prev) => {
          const exists = prev.shells.some((s) => s.id === shell.id);
          return {
            ...prev,
            shells: exists ? prev.shells.map((s) => (s.id === shell.id ? shell : s)) : [shell, ...prev.shells],
          };
        }),
      removeShell: (id) =>
        setState((prev) => ({ ...prev, shells: prev.shells.filter((s) => s.id !== id) })),
      upsertPhoto: (photo) =>
        setState((prev) => {
          const exists = prev.photos.some((p) => p.id === photo.id);
          return {
            ...prev,
            photos: exists ? prev.photos.map((p) => (p.id === photo.id ? photo : p)) : [photo, ...prev.photos],
          };
        }),
      removePhoto: (id) =>
        setState((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== id) })),
      resetDemo: () => {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem("mac-app-state-v1");
        setState(demoState());
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
