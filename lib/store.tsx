"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { DEMO_AGREEMENTS, DEMO_PROFILE, DEMO_TIMEPIECES } from "@/lib/seed";
import type { Agreement, AppState, Profile, Timepiece } from "@/lib/types";

const STORAGE_KEY = "mac-app-state-v1";

type Store = AppState & {
  signIn: (profile?: Partial<Profile>) => void;
  signOut: () => void;
  updateProfile: (patch: Partial<Profile>) => void;
  addTimepiece: (watch: Timepiece) => void;
  updateTimepiece: (id: string, patch: Partial<Timepiece>) => void;
  createAgreement: (input: Omit<Agreement, "id" | "createdAt" | "status">) => Agreement;
  signAgreement: (id: string) => void;
  resetDemo: () => void;
};

const StoreContext = createContext<Store | null>(null);

function emptyState(): AppState {
  return { hydrated: false, user: null, timepieces: [], agreements: [] };
}

function demoState(): AppState {
  return {
    hydrated: true,
    user: DEMO_PROFILE,
    timepieces: DEMO_TIMEPIECES,
    agreements: DEMO_AGREEMENTS,
  };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(emptyState);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AppState;
        setState({ ...parsed, hydrated: true });
        return;
      }
    } catch {
      /* use demo */
    }
    setState({ hydrated: true, user: null, timepieces: [], agreements: [] });
  }, []);

  useEffect(() => {
    if (!state.hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      signIn: (profile) =>
        setState((prev) => ({
          ...prev,
          user: { ...DEMO_PROFILE, ...profile },
          timepieces: prev.timepieces.length ? prev.timepieces : DEMO_TIMEPIECES,
          agreements: prev.agreements.length ? prev.agreements : DEMO_AGREEMENTS,
        })),
      signOut: () => setState({ hydrated: true, user: null, timepieces: [], agreements: [] }),
      updateProfile: (patch) =>
        setState((prev) =>
          prev.user ? { ...prev, user: { ...prev.user, ...patch } } : prev
        ),
      addTimepiece: (watch) =>
        setState((prev) => ({ ...prev, timepieces: [watch, ...prev.timepieces] })),
      updateTimepiece: (id, patch) =>
        setState((prev) => ({
          ...prev,
          timepieces: prev.timepieces.map((w) => (w.id === id ? { ...w, ...patch } : w)),
        })),
      createAgreement: (input) => {
        const agreement: Agreement = {
          ...input,
          id: `agr-${Date.now().toString().slice(-6)}`,
          createdAt: new Date().toISOString().slice(0, 10),
          status: "pending_signature",
        };
        setState((prev) => ({ ...prev, agreements: [agreement, ...prev.agreements] }));
        return agreement;
      },
      signAgreement: (id) =>
        setState((prev) => ({
          ...prev,
          agreements: prev.agreements.map((a) =>
            a.id === id
              ? { ...a, status: "signed", signedAt: new Date().toISOString().slice(0, 10) }
              : a
          ),
        })),
      resetDemo: () => {
        localStorage.removeItem(STORAGE_KEY);
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
