import { isLiveBookAppEnv, isLiveBookEnabled } from "./env/live-book-flag.mjs";
import { APPLICATION_TERMS } from "./contract/repo-scale.mjs";
import { isDeskRole, isRetailRole } from "./roles.mjs";

/**
 * @typedef {"unknown" | "browser" | "live" | "unavailable"} StoreMode
 */

/**
 * The server mode is authoritative. An empty live book is still authoritative.
 */
export function chooseBookState(mode, browserBook, liveBook) {
  return mode === "live" ? liveBook : browserBook;
}

/**
 * Live mode never inherits demo catalog, shells, or settings from the browser
 * store. The server response owns all three slices.
 */
export function liveDeskOverlay(book) {
  const source = book && typeof book === "object" ? book : {};
  return {
    catalog: Array.isArray(source.catalog) ? source.catalog : [],
    shells: Array.isArray(source.shells) ? source.shells : [],
    settings:
      source.settings && typeof source.settings === "object" && !Array.isArray(source.settings)
        ? source.settings
        : null,
  };
}

export function mergeLiveSettings(serverSettings, localSettings, profile) {
  return {
    ...serverSettings,
    appearance:
      profile?.preferences?.appearance ??
      localSettings?.appearance ??
      serverSettings?.appearance,
  };
}

/**
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 * @returns {{ ok: true, mode: "browser" | "live" } | { ok: false, mode: "live", error: "LIVE_BOOK_APP_ENV_INVALID" }}
 */
export function evaluateLiveBookRuntime(env = process.env) {
  if (!isLiveBookEnabled(env.MAC_LIVE_BOOK)) return { ok: true, mode: "browser" };
  if (!isLiveBookAppEnv(String(env.APP_ENV ?? "").trim())) {
    return { ok: false, mode: "live", error: "LIVE_BOOK_APP_ENV_INVALID" };
  }
  return { ok: true, mode: "live" };
}

function validBook(book) {
  const purchaseShares = book?.applicationPurchaseShares;
  return Boolean(
    book &&
    typeof book === "object" &&
    Array.isArray(book.timepieces) &&
    Array.isArray(book.agreements) &&
    Array.isArray(book.users) &&
    Array.isArray(book.photos) &&
    Array.isArray(book.appraisalAttempts) &&
    Array.isArray(book.appraisalAttemptPhotos) &&
    Array.isArray(book.catalog) &&
    Array.isArray(book.shells) &&
    book.settings &&
    typeof book.settings === "object" &&
    !Array.isArray(book.settings) &&
    book.profiles &&
    typeof book.profiles === "object" &&
    !Array.isArray(book.profiles) &&
    purchaseShares &&
    typeof purchaseShares === "object" &&
    !Array.isArray(purchaseShares) &&
    APPLICATION_TERMS.every((termMonths) => {
      const share = purchaseShares[termMonths];
      return Number.isFinite(share) && share > 0 && share <= 1;
    }),
  );
}

function validViewer(viewer) {
  return Boolean(
    viewer &&
    typeof viewer === "object" &&
    (isRetailRole(viewer.role) || isDeskRole(viewer.role)) &&
    typeof viewer.email === "string" &&
    (!isRetailRole(viewer.role) || typeof viewer.customerId === "string"),
  );
}

function unavailableError(body) {
  return typeof body.error === "string" && body.error ? body.error : "LIVE_BOOK_UNAVAILABLE";
}

/**
 * A `{ mode: "unavailable" }` body is its own mode at any status: the server is
 * up but a live prerequisite is missing. It is never browser mode.
 */
export function parseLiveBookResponse(status, body) {
  if (body && typeof body === "object" && body.mode === "unavailable") {
    return { ok: false, mode: "unavailable", error: unavailableError(body) };
  }
  if (body && typeof body === "object" && body.error === "PASSWORD_ROTATION_REQUIRED") {
    return { ok: false, mode: "rotation", error: "PASSWORD_ROTATION_REQUIRED" };
  }
  if (status < 200 || status >= 300 || !body || typeof body !== "object") {
    return { ok: false, mode: "unknown" };
  }
  if (body.mode === "browser") return { ok: true, mode: "browser" };
  if (body.mode === "live" && validBook(body.book) && validViewer(body.viewer)) {
    return { ok: true, mode: "live", viewer: body.viewer, book: body.book };
  }
  return { ok: false, mode: "unknown" };
}

export function selectLiveUser(viewer, sessionUser, profiles) {
  if (!viewer) return null;
  const normalizedProfiles = Object.fromEntries(
    Object.entries(profiles ?? {}).map(([email, profile]) => [email.trim().toLowerCase(), profile]),
  );
  const viewerEmail = String(viewer.email ?? "").trim().toLowerCase();
  if (isDeskRole(viewer.role)) {
    return { role: viewer.role, email: viewerEmail };
  }
  return normalizedProfiles[viewerEmail] ?? null;
}

export function shouldPersistBrowserBook(mode) {
  return mode === "browser";
}

/**
 * @param {StoreMode} mode
 * @returns {"dispatch" | "browser-only" | "discover" | "refuse"}
 */
export function operationDisposition(mode) {
  if (mode === "live") return "dispatch";
  if (mode === "browser") return "browser-only";
  if (mode === "unavailable") return "refuse";
  return "discover";
}

/**
 * While unavailable the store never re-checks on focus, visibility, new
 * subscribers, or identity changes. Only the "Try again" full reload asks again.
 * @param {StoreMode} mode
 */
export function shouldRecheckLiveBook(mode) {
  return mode !== "unavailable";
}

export function shouldApplyReconciliation(force, startedGeneration, currentGeneration) {
  return Boolean(force || startedGeneration === currentGeneration);
}

/**
 * Mutation acknowledgement must not reuse a GET that began before the POST.
 * Wait for that read only to discard it, then start a guaranteed fresh read.
 */
export async function readAfterInFlight(inFlight, startFresh) {
  if (inFlight) await Promise.resolve(inFlight).catch(() => undefined);
  return startFresh();
}

export function freshReconciliationAction(result) {
  if (!result?.ok) return "ignore";
  if (result.mode === "browser") return "browser";
  if (result.mode === "live" && "book" in result) return "live";
  return "ignore";
}

export function parseLiveBookMutationResponse(status, body) {
  if (!body || typeof body !== "object") return { ok: false, mode: "unknown", error: "LIVE_BOOK_WRITE_FAILED" };
  if (body.mode === "unavailable") {
    return { ok: false, mode: "unavailable", error: unavailableError(body) };
  }
  if (body.error === "PASSWORD_ROTATION_REQUIRED") {
    return { ok: false, mode: "rotation", error: "PASSWORD_ROTATION_REQUIRED" };
  }
  if (status >= 200 && status < 300 && body.mode === "browser") return { ok: true, mode: "browser" };
  if (status >= 200 && status < 300 && body.mode === "live" && body.acknowledged === true) {
    return {
      ok: true,
      mode: "live",
      acknowledged: true,
      ...(validViewer(body.viewer) ? { viewer: body.viewer } : {}),
      ...(["below", "above"].includes(body.rangeWarning)
        ? { rangeWarning: body.rangeWarning }
        : {}),
    };
  }
  return {
    ok: false,
    mode: body.mode === "live" ? "live" : "unknown",
    error: typeof body.error === "string" ? body.error : "LIVE_BOOK_WRITE_FAILED",
  };
}

export function liveBookFailureState(base) {
  return {
    ...base,
    hydrated: true,
    user: null,
    timepieces: [],
    agreements: [],
    users: [],
    photos: [],
    appraisalAttempts: [],
    appraisalAttemptPhotos: [],
    profiles: {},
  };
}

export function mergeLocalDataPreviews(serverBook, localBook) {
  const serverIds = new Set((serverBook.timepieces ?? []).map((row) => row.id));
  const localPieces = new Map((localBook.timepieces ?? []).map((row) => [row.id, row]));
  const timepieces = (serverBook.timepieces ?? []).map((serverPiece) => {
    const localPiece = localPieces.get(serverPiece.id);
    const localImages = (localPiece?.images ?? []).filter((url) => String(url).startsWith("data:"));
    const localKinds = (localPiece?.photoKinds ?? []).filter((_, index) =>
      String(localPiece?.images?.[index] ?? "").startsWith("data:"),
    );
    return {
      ...serverPiece,
      images: [...(serverPiece.images ?? []), ...localImages.filter((url) => !(serverPiece.images ?? []).includes(url))],
      photoKinds: [...(serverPiece.photoKinds ?? []), ...localKinds],
    };
  });
  const localPhotos = (localBook.photos ?? []).filter((row) =>
    serverIds.has(row.assetId) && String(row.url ?? "").startsWith("data:"),
  );
  return {
    ...serverBook,
    timepieces,
    photos: [...(serverBook.photos ?? []), ...localPhotos],
  };
}
