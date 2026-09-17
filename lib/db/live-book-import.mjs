const DESK_EMAILS = new Set(["admin@mechartcap.com", "desk@mechartcap.com"]);
const HALE_DEMO_AGREEMENT = "agr-31419";
const HALE_DEMO_EMAIL = "jonathan.hale@mechartcap.com";

export function normalizeImportEmail(email) {
  return (email || "").trim().toLowerCase();
}

export function liveBookFlagOn(env = process.env) {
  const value = (env.MAC_LIVE_BOOK || "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "on";
}

export function isDataUrl(value) {
  return typeof value === "string" && value.startsWith("data:");
}

function looksLikeDemoHale(payload) {
  const agreements = Array.isArray(payload?.agreements) ? payload.agreements : [];
  return agreements.some(
    (agreement) =>
      agreement?.id === HALE_DEMO_AGREEMENT ||
      normalizeImportEmail(agreement?.email) === HALE_DEMO_EMAIL,
  );
}

function customerIdFor(email, users) {
  const key = normalizeImportEmail(email);
  const listed = (users ?? []).find((user) => normalizeImportEmail(user.email) === key && typeof user.id === "string");
  return listed?.id || `cust-${key}`;
}

/**
 * Plan a staff import of persistableState. No database I/O.
 *
 * @param {object} payload
 * @param {{ existingCustomers?: Array<{id: string, email: string}>, flagOn?: boolean, confirmLiveImport?: boolean, env?: NodeJS.ProcessEnv | Record<string, string | undefined> }} [options]
 */
export function planLiveBookImport(payload, options = {}) {
  if (options.flagOn || liveBookFlagOn(options.env)) {
    return { ok: false, error: "LIVE_BOOK_FLAG_ON", rejects: [], customers: [], timepieces: [], agreements: [], previews: [] };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "INVALID_EXPORT", rejects: [], customers: [], timepieces: [], agreements: [], previews: [] };
  }

  const timepieces = Array.isArray(payload.timepieces) ? payload.timepieces : [];
  const agreements = Array.isArray(payload.agreements) ? payload.agreements : [];
  const users = Array.isArray(payload.users) ? payload.users : [];
  const existing = options.existingCustomers ?? [];
  const existingById = new Map(existing.map((row) => [row.id, row]));
  const existingByEmail = new Map(existing.map((row) => [normalizeImportEmail(row.email), row]));

  const rejects = [];
  const customerByEmail = new Map();

  function addCustomer(email, name) {
    const key = normalizeImportEmail(email);
    if (!key || !key.includes("@")) {
      rejects.push({ code: "INVALID_EMAIL", email });
      return null;
    }
    if (DESK_EMAILS.has(key)) {
      rejects.push({ code: "RESERVED_DESK_EMAIL", email: key });
      return null;
    }
    if (customerByEmail.has(key)) return customerByEmail.get(key);
    const id = customerIdFor(key, users);
    const byId = existingById.get(id);
    const byEmail = existingByEmail.get(key);
    if (byEmail && byEmail.id !== id) {
      rejects.push({ code: "EMAIL_COLLISION", email: key, existingId: byEmail.id, id });
      return null;
    }
    if (byId && normalizeImportEmail(byId.email) !== key) {
      rejects.push({ code: "ID_COLLISION", id, email: key });
      return null;
    }
    const row = {
      id,
      email: key,
      name: (name || "").trim() || key,
      action: byId || byEmail ? "upsert" : "insert",
    };
    customerByEmail.set(key, row);
    return row;
  }

  for (const agreement of agreements) {
    addCustomer(agreement?.email, agreement?.ownerName);
  }
  for (const watch of timepieces) {
    addCustomer(watch?.ownerEmail, watch?.ownerEmail);
  }

  const plannedTimepieces = [];
  for (const watch of timepieces) {
    if (!watch || typeof watch.id !== "string" || !watch.id) {
      rejects.push({ code: "MISSING_TIMEPIECE_ID" });
      continue;
    }
    const owner = customerByEmail.get(normalizeImportEmail(watch.ownerEmail));
    if (!owner) {
      rejects.push({ code: "TIMEPIECE_OWNER", id: watch.id });
      continue;
    }
    const previewUrl =
      Array.isArray(watch.images) && watch.images.find((image) => typeof image === "string" && image && !isDataUrl(image));
    plannedTimepieces.push({
      id: watch.id,
      customerId: owner.id,
      brand: watch.brand || "",
      model: watch.model || "",
      reference: watch.reference || null,
      status: watch.status || "not_evaluated",
      financeable: Boolean(watch.financeable),
      condition: watch.condition || "",
      boxPapers: watch.boxPapers || "",
      caseMetal: watch.caseMetal || "",
      caseType: watch.caseType || "",
      caseDiameter: watch.caseDiameter || "",
      dialColor: watch.dialColor || "",
      buckle: watch.buckle || "",
      band: watch.band || "strap",
      bandMaterial: watch.bandMaterial || "",
      complication: watch.complication || "",
      assetCode: watch.assetCode || null,
      valueLow: watch.valueLow,
      valueHigh: watch.valueHigh,
      previewUrl: previewUrl || null,
      deferredPreview: Array.isArray(watch.images) && watch.images.some(isDataUrl),
    });
  }

  const plannedAgreements = [];
  for (const agreement of agreements) {
    if (!agreement || typeof agreement.id !== "string" || !agreement.id) {
      rejects.push({ code: "MISSING_AGREEMENT_ID" });
      continue;
    }
    if (!Array.isArray(agreement.watchIds) || agreement.watchIds.length === 0) {
      rejects.push({ code: "MISSING_WATCH_IDS", id: agreement.id });
      continue;
    }
    const owner = customerByEmail.get(normalizeImportEmail(agreement.email));
    if (!owner) {
      rejects.push({ code: "AGREEMENT_OWNER", id: agreement.id });
      continue;
    }
    plannedAgreements.push({
      id: agreement.id,
      customerId: owner.id,
      watchIds: [...agreement.watchIds],
      amount: agreement.amount,
      termMonths: agreement.termMonths,
      delivery: agreement.delivery || "",
      ownerName: agreement.ownerName || owner.name,
      email: owner.email,
      status: agreement.status || "pending_signature",
      createdOn: agreement.createdAt,
      signedOn: agreement.signedAt || null,
      agreementCode: agreement.agreementCode || null,
      scale: agreement.scale || null,
      bookEnd: agreement.bookEnd || null,
    });
  }

  const previews = plannedTimepieces
    .filter((watch) => watch.previewUrl)
    .map((watch) => ({
      id: `preview-${watch.id}-legacy`,
      timepieceId: watch.id,
      kind: "legacy_preview",
      previewUrl: watch.previewUrl,
    }));

  if (looksLikeDemoHale(payload) && !options.confirmLiveImport) {
    rejects.push({ code: "DEMO_CONFIRM_REQUIRED" });
  }

  const failCodes = new Set([
    "RESERVED_DESK_EMAIL",
    "EMAIL_COLLISION",
    "ID_COLLISION",
    "MISSING_WATCH_IDS",
    "INVALID_EXPORT",
    "DEMO_CONFIRM_REQUIRED",
  ]);
  const blocking = rejects.filter((item) => failCodes.has(item.code));
  return {
    ok: blocking.length === 0,
    error: blocking[0]?.code,
    rejects,
    customers: [...customerByEmail.values()],
    timepieces: plannedTimepieces,
    agreements: plannedAgreements,
    previews,
    demoConfirmRequired: looksLikeDemoHale(payload) && !options.confirmLiveImport,
  };
}
