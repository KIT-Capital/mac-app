function segment(value) {
  const text = String(value ?? "");
  if (!text || text.includes("/") || text === "." || text === "..") {
    throw new Error("PHOTO_KEY_INVALID");
  }
  return text;
}

/**
 * Server-owned keys for one photo row. Clients never supply key segments.
 * @param {{ appEnv: string, customerId: string, photoId: string }} input
 */
export function photoObjectKeys(input) {
  const appEnv = segment(input.appEnv);
  const customerId = segment(input.customerId);
  const photoId = segment(input.photoId);
  return {
    originalKey: `${appEnv}/originals/${customerId}/${photoId}`,
    previewKey: `${appEnv}/previews/${customerId}/${photoId}`,
  };
}
