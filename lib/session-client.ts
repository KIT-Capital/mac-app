export async function endClientSession(signOut: () => void) {
  await fetch("/api/desk-session", { method: "DELETE" }).catch(() => undefined);
  signOut();
}
