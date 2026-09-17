export async function endClientSession(signOut: () => void) {
  await Promise.all([
    fetch("/api/desk-session", {
      method: "DELETE",
      cache: "no-store",
      credentials: "include",
    }).catch(() => undefined),
    fetch("/api/collector-session", {
      method: "DELETE",
      cache: "no-store",
      credentials: "include",
    }).catch(() => undefined),
  ]);
  signOut();
}
