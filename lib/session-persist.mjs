/** Tab-only collector/desk identity. Collection rows stay in localStorage without `user`. */

export const SESSION_USER_KEY = "mac-app-session-user-v1";

export function persistableState(state) {
  return { ...state, user: null };
}

export function readSessionUser(storage) {
  try {
    const raw = storage?.getItem(SESSION_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || typeof parsed.email !== "string" || !parsed.email.trim()) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeSessionUser(storage, user) {
  if (!storage) return;
  if (!user) {
    storage.removeItem(SESSION_USER_KEY);
    return;
  }
  storage.setItem(SESSION_USER_KEY, JSON.stringify(user));
}

export function browserSessionStorage() {
  try {
    return sessionStorage;
  } catch {
    return null;
  }
}
