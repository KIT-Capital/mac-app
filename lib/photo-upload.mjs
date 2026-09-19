import { fetchWithTimeout } from "./fetch-timeout.mjs";

export async function putPhotoParts(upload, parts, fetcher = fetch, timeoutMs = 120_000) {
  const [original, preview] = await Promise.all([
    fetchWithTimeout(upload.original.url, {
      method: "PUT",
      headers: upload.original.headers,
      body: parts.original,
    }, timeoutMs, fetcher),
    fetchWithTimeout(upload.preview.url, {
      method: "PUT",
      headers: upload.preview.headers,
      body: parts.preview,
    }, timeoutMs, fetcher),
  ]);
  if ((!original.ok && original.status !== 412) || (!preview.ok && preview.status !== 412)) {
    throw new Error("PHOTO_UPLOAD_FAILED");
  }
}

export async function storePhoto({
  requestUpload,
  confirmUpload,
  parts,
  putter = putPhotoParts,
}) {
  const upload = await requestUpload();
  if (upload.status !== "stored") {
    if (!upload.original || !upload.preview) throw new Error("PHOTO_UPLOAD_FAILED");
    await putter(upload, parts);
  }
  const photo = await confirmUpload(upload.photoId);
  if (photo?.status !== "stored") throw new Error("PHOTO_UPLOAD_FAILED");
  return upload.photoId;
}
