const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const INTERNAL_MAC_EMAILS = new Set([
  "info@mechartcap.com",
  "finance@mechartcap.com",
  "financing@mechartcap.com",
]);

export const DEFAULT_INTERNAL_EMAIL = "ricardo.cidale@norfolkgroup.io";

function normalizeEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

/** @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env] */
export function internalEmail(env = process.env) {
  const email = normalizeEmail(env.MAC_INTERNAL_EMAIL || DEFAULT_INTERNAL_EMAIL);
  if (!EMAIL_RE.test(email)) {
    throw new Error("MAC_INTERNAL_EMAIL_INVALID");
  }
  return email;
}

/**
 * @param {string[]} recipients
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} [env]
 */
export function routeInternalRecipients(recipients, env = process.env) {
  const routed = recipients.map((recipient) => {
    const email = normalizeEmail(recipient);
    return INTERNAL_MAC_EMAILS.has(email) ? internalEmail(env) : email;
  });
  return [...new Set(routed)];
}
