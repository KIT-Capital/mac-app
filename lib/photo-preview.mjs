import { fetchWithTimeout } from "./fetch-timeout.mjs";

export async function fetchPhotoPreview(photoId, fetcher = fetch, timeoutMs = 10_000) {
  const response = await fetchWithTimeout("/api/photos", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "preview-url", photoId }),
  }, timeoutMs, fetcher);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.url || !body.expiresAt) {
    throw new Error(body?.error || "PHOTO_NOT_FOUND");
  }
  const expiresAt = Date.parse(body.expiresAt);
  if (!Number.isFinite(expiresAt)) throw new Error("PHOTO_NOT_FOUND");
  return { url: body.url, expiresAt };
}

export function shouldRefetchExpiredPreview(expiresAt, refreshCount, now = Date.now()) {
  return refreshCount === 0 && Number.isFinite(expiresAt) && expiresAt <= now;
}

export function setBoundedPreviewCache(cache, key, value, now = Date.now(), capacity = 64) {
  for (const [cachedKey, cached] of cache) {
    if (!Number.isFinite(cached.expiresAt) || cached.expiresAt <= now) cache.delete(cachedKey);
  }
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > capacity) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}
