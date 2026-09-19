const FILTERED_EMAIL = "[Filtered Email]";
const FILTERED_CREDENTIAL = "[Filtered Credential]";
const FILTERED_OBJECT_KEY = "[Filtered Object Key]";
const FILTERED_URL = "[Filtered URL]";
const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const CAPTURED_ERROR = Symbol.for("mac.sentry.captured-error");
const capturedOperations = new Set();
const capturedOperationOrder = [];
const MAX_CAPTURED_OPERATIONS = 1_000;
const SENSITIVE_KEYS = new Set([
  "authorization",
  "collectorsessionsecret",
  "cookie",
  "cookies",
  "databaseurl",
  "databaseurlunpooled",
  "desksessionkeys",
  "desksessionsecret",
  "idempotencykey",
  "key",
  "objectkey",
  "originalkey",
  "previewkey",
  "querystring",
  "recipientemail",
  "resendapikey",
  "r2accesskeyid",
  "r2secretaccesskey",
  "setcookie",
  "sentryauthtoken",
  "to",
  "token",
]);

function normalizedKey(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sensitiveKey(value) {
  const normalized = normalizedKey(value);
  return SENSITIVE_KEYS.has(normalized) || normalized.startsWith("xamz");
}

function scrubString(value) {
  if (
    /(?:postgres|postgresql):\/\/\S+/i.test(value)
    || /\bBearer\s+\S+/i.test(value)
    || /\b(?:sntrys|re)_[A-Za-z0-9_-]{12,}\b/.test(value)
  ) {
    return FILTERED_CREDENTIAL;
  }
  if (/cloudflarestorage\.com/i.test(value) || /[?&]X-Amz-/i.test(value)) {
    return FILTERED_URL;
  }
  if (/(?:development|staging|production)\/(?:agreements|originals|previews)\//i.test(value)) {
    return FILTERED_OBJECT_KEY;
  }
  if (value.startsWith("/") || /^https?:\/\//i.test(value)) {
    try {
      const absolute = /^https?:\/\//i.test(value);
      const url = new URL(value, "https://local.invalid");
      url.search = "";
      url.hash = "";
      const safe = absolute ? `${url.origin}${url.pathname}` : url.pathname;
      return safe.replace(EMAIL_RE, FILTERED_EMAIL);
    } catch {
      // Fall through to plain-string scrubbing.
    }
  }
  if (/^\s*[\[{]/.test(value)) {
    try {
      return JSON.stringify(scrubValue(JSON.parse(value)));
    } catch {
      // The value is not JSON; scrub it as text.
    }
  }
  return value
    .replace(
      /(^|[?&\s])(token|cookie|idempotency[-_]?key|recipient[-_]?email|x-amz-[a-z0-9-]*)\s*[:=]\s*[^&,\s]*/gi,
      "$1$2=[Filtered]",
    )
    .replace(EMAIL_RE, FILTERED_EMAIL);
}

function scrubValue(value, seen = new WeakSet()) {
  if (typeof value === "string") return scrubString(value);
  if (Array.isArray(value)) return value.map((item) => scrubValue(item, seen));
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  const scrubbed = {};
  for (const [key, entry] of Object.entries(value)) {
    if (sensitiveKey(key)) continue;
    scrubbed[key] = scrubValue(entry, seen);
  }
  seen.delete(value);
  return scrubbed;
}

export function scrubSentryEvent(event) {
  return scrubValue(event);
}

export function filterSentryTransaction(event) {
  if (String(event?.transaction ?? "").includes("/api/health")) return null;
  return scrubSentryEvent(event);
}

export async function captureOperationalError(
  error,
  { operation, errorCode, recordId },
  {
    env = process.env,
    captureException,
  } = {},
) {
  if (!env.SENTRY_DSN?.trim()) return undefined;
  const exception = error instanceof Error ? error : new Error(errorCode);
  if (exception[CAPTURED_ERROR]) return undefined;
  try {
    const capture = captureException
      ?? (await import("@sentry/nextjs")).captureException;
    const eventId = capture(exception, {
      tags: {
        operation,
        error_code: errorCode,
        ...(recordId ? { record_id: recordId } : {}),
      },
    });
    Object.defineProperty(exception, CAPTURED_ERROR, { value: true });
    return eventId;
  } catch {
    return undefined;
  }
}

export async function captureOperationalErrorOnce(error, context, options = {}) {
  const env = options.env ?? process.env;
  if (!env.SENTRY_DSN?.trim()) return undefined;
  const key = [context.operation, context.errorCode, context.recordId].join(":");
  if (capturedOperations.has(key)) return undefined;
  capturedOperations.add(key);
  capturedOperationOrder.push(key);
  if (capturedOperationOrder.length > MAX_CAPTURED_OPERATIONS) {
    capturedOperations.delete(capturedOperationOrder.shift());
  }
  return captureOperationalError(error, context, options);
}
