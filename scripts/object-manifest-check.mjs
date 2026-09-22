/**
 * Read-only manifest check for the restore drill (docs/runbooks/restore-drill.md).
 *
 * Reads stored `agreement_documents` and `photo_objects` rows from the supplied
 * MANIFEST_DATABASE_URL, HEADs every recorded R2 key, and compares size and SHA-256.
 * It never writes to the database or the bucket, and it prints counts and row
 * ids only: keys, checksums, URLs, credentials, addresses, and driver messages
 * stay out of the report so a drill record is safe to paste into a runbook.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import { neon } from "@neondatabase/serverless";
import { appEnvForEndpoint, NEON_PROJECT_ID, parseDatabaseUrl } from "../lib/env/database-mapping.mjs";
import { sha256Hex } from "../lib/storage/object-store.mjs";
import { createObjectStore } from "../lib/storage/r2-object-store.mjs";

const STORED = "stored";
const DEFAULT_IO_TIMEOUT_MS = 10_000;
const MAX_LEGACY_PDF_BYTES = 25 * 1024 * 1024;
const SHA256_HEX = /^[a-f0-9]{64}$/i;
export const MANIFEST_DEVELOPMENT_BRANCH_ID = "br-summer-truth-a52brhnv";
export const MANIFEST_STAGING_BRANCH_ID = "br-sweet-poetry-a5j7m69j";

const KEY_PREFIX_BY_PARENT = {
  [MANIFEST_DEVELOPMENT_BRANCH_ID]: "development/",
  [MANIFEST_STAGING_BRANCH_ID]: "staging/",
};

/**
 * @param {string | undefined} parentId
 * @returns {string | null}
 */
export function manifestKeyPrefix(parentId) {
  return KEY_PREFIX_BY_PARENT[(parentId ?? "").trim()] ?? null;
}

/**
 * @param {string[]} argv
 */
export function parseManifestCheckArgs(argv) {
  const unknown = [];
  let allowProductionRead = false;
  for (const arg of argv) {
    if (arg === "--allow-production-read") allowProductionRead = true;
    else unknown.push(arg);
  }
  return { allowProductionRead, unknown };
}

/**
 * The refusal runs before any client exists, so a production URL is never opened.
 * @param {Record<string, string | undefined>} env
 * @param {{ allowProductionRead?: boolean, unknown?: string[] }} [options]
 */
export function evaluateManifestAccess(env, options = {}) {
  const errors = [];
  if ((options.unknown ?? []).length > 0) errors.push("MANIFEST_ARG_INVALID");

  const appEnv = (env.APP_ENV ?? "").trim();
  const manifestUrl = env.MANIFEST_DATABASE_URL;
  const parsed = parseDatabaseUrl(manifestUrl);
  if (parsed.present && !parsed.parseError) {
    try {
      const protocol = new URL(manifestUrl).protocol;
      if (protocol !== "postgres:" && protocol !== "postgresql:") {
        parsed.parseError = true;
      }
    } catch {
      parsed.parseError = true;
    }
  }
  if (!parsed.present) errors.push("MANIFEST_DATABASE_URL_REQUIRED");
  else if (parsed.parseError) errors.push("DATABASE_URL_UNPARSEABLE");

  const urlAppEnv = parsed.present && !parsed.parseError ? appEnvForEndpoint(parsed.endpointId) : null;
  const exactProductionEndpoint = urlAppEnv === "production";
  const skipPreviewIdentity = options.allowProductionRead === true && exactProductionEndpoint;
  const touchesProduction = appEnv === "production" || exactProductionEndpoint;
  if (touchesProduction && !options.allowProductionRead) {
    errors.push("PRODUCTION_READ_NOT_ALLOWED");
  } else if (urlAppEnv === "development" || urlAppEnv === "staging" || urlAppEnv === "ci") {
    errors.push("RESTORE_PREVIEW_REQUIRED");
  } else if (!skipPreviewIdentity && parsed.present && !parsed.parseError) {
    collectPreviewIdentityErrors(env, parsed, errors);
  }

  return { ok: errors.length === 0, appEnv: appEnv || null, errors: [...new Set(errors)] };
}

function collectPreviewIdentityErrors(env, parsed, errors) {
  const projectId = (env.MANIFEST_NEON_PROJECT_ID ?? "").trim();
  const parentId = (env.MANIFEST_NEON_PARENT_BRANCH_ID ?? "").trim();
  const branchId = (env.MANIFEST_NEON_BRANCH_ID ?? "").trim();
  const endpointId = (env.MANIFEST_NEON_ENDPOINT_ID ?? "").trim();

  if (projectId !== NEON_PROJECT_ID) errors.push("MANIFEST_PROJECT_INVALID");
  if (!manifestKeyPrefix(parentId)) errors.push("MANIFEST_PARENT_BRANCH_INVALID");
  if (!branchId) errors.push("MANIFEST_BRANCH_ID_REQUIRED");
  else if (branchId === parentId) errors.push("MANIFEST_BRANCH_INVALID");
  if (!endpointId) errors.push("MANIFEST_ENDPOINT_ID_REQUIRED");
  else if (endpointId !== parsed.endpointId) errors.push("MANIFEST_ENDPOINT_MISMATCH");
}

/**
 * Stored rows only. The status filter is the skip rule for pending, building,
 * failed, and abandoned rows.
 * @param {(strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>} sql
 */
export function rowLoaderFromSql(sql) {
  return {
    async agreements() {
      return await sql`
        select id, status, object_key, checksum, bytes
        from agreement_documents
        where status = 'stored'
        order by id
      `;
    },
    async photos() {
      return await sql`
        select
          id,
          status,
          original_key,
          original_checksum,
          original_bytes,
          preview_key,
          preview_checksum,
          preview_bytes
        from photo_objects
        where status = 'stored'
        order by id
      `;
    },
    async auditCount() {
      const rows = await sql`
        select count(*)::integer as count
        from desk_audit_log
      `;
      return Number(rows[0]?.count ?? 0);
    },
  };
}

/**
 * @param {string} url
 */
export function neonRowLoader(url) {
  return rowLoaderFromSql(neon(url));
}

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function size(value) {
  const bytes = Number(value);
  return Number.isFinite(bytes) && bytes >= 0 ? bytes : null;
}

function validChecksum(value) {
  return typeof value === "string" && SHA256_HEX.test(value);
}

function entryHasRecordedMetadata(entry) {
  return Boolean(entry.key && validChecksum(entry.checksum) && entry.bytes !== null);
}

function withTimeout(operation, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("MANIFEST_IO_TIMEOUT")), timeoutMs);
  });
  return Promise.race([Promise.resolve().then(operation), timeout]).finally(() => {
    clearTimeout(timer);
  });
}

/**
 * Keys are taken verbatim from the row so a restored branch keeps its own
 * bucket prefix; the runner's APP_ENV never contributes a key segment.
 */
function agreementEntries(row) {
  return [{
    key: text(row.object_key),
    checksum: text(row.checksum),
    bytes: size(row.bytes),
    allowGetFallback: true,
  }];
}

function photoEntries(row) {
  const entries = [
    {
      key: text(row.original_key),
      checksum: text(row.original_checksum),
      bytes: size(row.original_bytes),
      allowGetFallback: false,
    },
  ];
  const previewPresent = [row.preview_key, row.preview_checksum, row.preview_bytes]
    .some((value) => value !== null && value !== undefined);
  if (previewPresent) {
    entries.push({
      key: text(row.preview_key),
      checksum: text(row.preview_checksum),
      bytes: size(row.preview_bytes),
      allowGetFallback: false,
    });
  }
  return entries;
}

/**
 * @param {{ headMetadata: (key: string) => Promise<{ bytes: number, sha256: string | null } | null>, get: (key: string) => Promise<Uint8Array> }} store
 */
async function verifyEntry(store, entry, options) {
  if (!entry.key || !validChecksum(entry.checksum) || entry.bytes === null) {
    return { state: "mismatch" };
  }
  const keyPrefix = options.keyPrefix ?? "development/";
  if (!options.allowProductionRead && !entry.key.startsWith(keyPrefix)) {
    return { state: "mismatch" };
  }
  try {
    const head = await withTimeout(
      () => store.headMetadata(entry.key),
      options.ioTimeoutMs,
    );
    if (!head) return { state: "missing" };
    if (size(head.bytes) !== entry.bytes) return { state: "mismatch" };

    const recorded = entry.checksum.toLowerCase();
    const headChecksum = text(head.sha256);
    if (headChecksum) {
      if (!validChecksum(headChecksum)) return { state: "mismatch" };
      return { state: headChecksum.toLowerCase() === recorded ? "match" : "mismatch" };
    }
    // Legacy agreement PDFs were stored before checksum mode. Photos and modern
    // PDFs always carry the header, so an absent header there is a mismatch.
    if (!entry.allowGetFallback) return { state: "mismatch" };
    if (entry.bytes > MAX_LEGACY_PDF_BYTES || size(head.bytes) > MAX_LEGACY_PDF_BYTES) {
      return { state: "mismatch" };
    }
    const body = await withTimeout(
      () => store.get(entry.key),
      options.ioTimeoutMs,
    );
    if (size(body.byteLength) !== entry.bytes) return { state: "mismatch" };
    return sha256Hex(body) === recorded
      ? { state: "match", legacyHashed: true }
      : { state: "mismatch" };
  } catch {
    return { state: "failed" };
  }
}

/**
 * @param {{
 *   loader: {
 *     agreements: () => Promise<Record<string, unknown>[]>,
 *     photos: () => Promise<Record<string, unknown>[]>,
 *     auditCount: () => Promise<number>,
 *   },
 *   store: object,
 *   appEnv?: string | null,
 *   allowProductionRead?: boolean,
 *   keyPrefix?: string,
 *   ioTimeoutMs?: number,
 * }} input
 */
export async function checkObjectManifest(input) {
  const { loader, store } = input;
  const ioTimeoutMs = input.ioTimeoutMs ?? DEFAULT_IO_TIMEOUT_MS;
  const verifyOptions = {
    allowProductionRead: input.allowProductionRead === true,
    keyPrefix: input.keyPrefix,
    ioTimeoutMs,
  };
  const counts = {
    agreementRows: 0,
    photoRows: 0,
    photoRowsWithPreview: 0,
    skipped: 0,
    objects: 0,
    verified: 0,
    missing: 0,
    mismatch: 0,
    failed: 0,
    legacyHashed: 0,
    auditRows: 0,
  };
  const rowIds = { missing: new Set(), mismatch: new Set(), failed: new Set() };
  const errors = new Set();

  const groups = [
    { loadRows: () => loader.agreements(), entriesOf: agreementEntries, countKey: "agreementRows" },
    { loadRows: () => loader.photos(), entriesOf: photoEntries, countKey: "photoRows" },
  ];

  for (const group of groups) {
    const rows = await withTimeout(group.loadRows, ioTimeoutMs);
    for (const row of rows ?? []) {
      const status = text(row.status);
      if (status && status !== STORED) {
        counts.skipped += 1;
        continue;
      }
      counts[group.countKey] += 1;
      const id = String(row.id ?? "");
      const entries = group.entriesOf(row);
      if (group.countKey === "photoRows"
        && entries.length === 2
        && entries.every(entryHasRecordedMetadata)) {
        counts.photoRowsWithPreview += 1;
      }
      for (const entry of entries) {
        counts.objects += 1;
        const result = await verifyEntry(store, entry, verifyOptions);
        if (result.state === "match") {
          counts.verified += 1;
          if (result.legacyHashed) counts.legacyHashed += 1;
          continue;
        }
        counts[result.state] += 1;
        rowIds[result.state].add(id);
        if (result.state === "failed") errors.add("OBJECT_CHECK_FAILED");
      }
    }
  }

  counts.auditRows = await withTimeout(() => loader.auditCount(), ioTimeoutMs);
  if (counts.objects === 0) errors.add("MANIFEST_EMPTY");
  else if (counts.agreementRows === 0 || counts.photoRows === 0 || counts.photoRowsWithPreview === 0) {
    errors.add("MANIFEST_INVENTORY_INCOMPLETE");
  }

  const ok = counts.objects > 0
    && counts.agreementRows > 0
    && counts.photoRows > 0
    && counts.photoRowsWithPreview > 0
    && counts.missing === 0
    && counts.mismatch === 0
    && counts.failed === 0;
  return {
    ok,
    outcome: ok ? "success" : "failed",
    appEnv: input.appEnv ?? null,
    counts,
    rowIds: {
      missing: [...rowIds.missing],
      mismatch: [...rowIds.mismatch],
      failed: [...rowIds.failed],
    },
    errors: [...errors],
  };
}

function haltReport(appEnv, outcome, errors) {
  return {
    ok: false,
    outcome,
    appEnv,
    counts: null,
    rowIds: null,
    errors,
  };
}

/**
 * @param {{
 *   env?: Record<string, string | undefined>,
 *   argv?: string[],
 *   createLoader?: (url: string) => object,
 *   createStore?: (env: Record<string, string | undefined>) => object,
 *   ioTimeoutMs?: number,
 * }} [input]
 */
export async function runObjectManifestCheck(input = {}) {
  const env = input.env ?? process.env;
  const args = parseManifestCheckArgs(input.argv ?? []);
  const access = evaluateManifestAccess(env, args);
  if (!access.ok) {
    return haltReport(access.appEnv, "refused", access.errors);
  }

  const createLoader = input.createLoader ?? neonRowLoader;
  const createStore = input.createStore ?? createObjectStore;
  let loader;
  let store;
  try {
    loader = createLoader(env.MANIFEST_DATABASE_URL);
    store = createStore(env);
  } catch {
    return haltReport(access.appEnv, "refused", ["MANIFEST_CLIENT_UNAVAILABLE"]);
  }

  try {
    return await checkObjectManifest({
      loader,
      store,
      appEnv: access.appEnv,
      allowProductionRead: args.allowProductionRead,
      keyPrefix: manifestKeyPrefix(env.MANIFEST_NEON_PARENT_BRANCH_ID) ?? undefined,
      ioTimeoutMs: input.ioTimeoutMs,
    });
  } catch {
    return haltReport(access.appEnv, "failed", ["MANIFEST_READ_FAILED"]);
  }
}

function isCliEntry() {
  if (!process.argv[1]) return false;
  return path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
}

if (isCliEntry()) {
  const report = await runObjectManifestCheck({ env: process.env, argv: process.argv.slice(2) });
  const stream = report.ok ? process.stdout : process.stderr;
  const exitCode = report.ok ? 0 : 1;
  stream.write(`${JSON.stringify(report)}\n`, () => process.exit(exitCode));
}
