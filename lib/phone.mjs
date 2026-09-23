const E164_RE = /^\+[1-9]\d{7,14}$/;

export function phoneDigits(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 10) return `1${digits}`;
  return digits;
}

export function normalizeCollectorPhone(value) {
  const digits = phoneDigits(value);
  const e164 = `+${digits}`;
  if (!E164_RE.test(e164)) {
    throw new Error("COLLECTOR_PHONE_INVALID");
  }
  return e164;
}

/** Registration and account edits must include the country code. */
export function requireCountryCodePhone(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("+")) {
    throw new Error("COLLECTOR_PHONE_INVALID");
  }
  return normalizeCollectorPhone(raw);
}
