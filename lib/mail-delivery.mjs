/** Record a Resend failure without failing the HTTP request. */

export function markMailFailed(item, error) {
  const message =
    error instanceof Error
      ? error.message
      : error && typeof error === "object" && typeof error.message === "string"
        ? error.message
        : "Resend could not send.";
  item.status = "failed";
  item.error = message;
  return item;
}
