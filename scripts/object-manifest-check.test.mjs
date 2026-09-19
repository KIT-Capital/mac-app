import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import { ENDPOINT_BY_APP_ENV } from "../lib/env/database-mapping.mjs";
import { sha256Hex } from "../lib/storage/object-store.mjs";
import {
  checkObjectManifest,
  parseManifestCheckArgs,
  rowLoaderFromSql,
  runObjectManifestCheck,
} from "./object-manifest-check.mjs";

const developmentUrl = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.development}-pooler.us-east-2.aws.neon.tech/neondb`;
const stagingUrl = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.staging}-pooler.us-east-2.aws.neon.tech/neondb`;
const productionUrl = `postgresql://u:p@${ENDPOINT_BY_APP_ENV.production}-pooler.us-east-2.aws.neon.tech/neondb`;
const previewUrl = "postgresql://u:p@ep-preview-drill-a5abc123-pooler.us-east-2.aws.neon.tech/neondb";
const legacyGetCapBytes = 25 * 1024 * 1024;

const pdfBody = new TextEncoder().encode("%PDF-1.7 agreement");
const originalBody = new TextEncoder().encode("original-photo-bytes");
const previewBody = new TextEncoder().encode("preview-photo-bytes");

/**
 * Deterministic store double. `sha256: null` models an object stored without a
 * checksum header; `bytes` may be overridden to model a size mismatch.
 */
function fakeStore(entries) {
  const objects = new Map(Object.entries(entries));
  const calls = { head: [], get: [] };
  return {
    calls,
    async headMetadata(key) {
      calls.head.push(key);
      const entry = objects.get(key);
      if (!entry) return null;
      if (entry.headThrows) throw new Error("R2_HEAD_FAILED");
      return {
        bytes: entry.bytes ?? entry.body.byteLength,
        sha256: "sha256" in entry ? entry.sha256 : sha256Hex(entry.body),
      };
    },
    async get(key) {
      calls.get.push(key);
      const entry = objects.get(key);
      if (!entry) throw new Error("OBJECT_NOT_FOUND");
      return entry.body;
    },
  };
}

function fixtureLoader({ agreements = [], photos = [], auditRows = 1 }) {
  return {
    async agreements() {
      return agreements;
    },
    async photos() {
      return photos;
    },
    async auditCount() {
      return auditRows;
    },
  };
}

function agreementRow(overrides = {}) {
  return {
    id: "doc_1",
    status: "stored",
    object_key: "development/agreements/cus_1/doc_1.pdf",
    checksum: sha256Hex(pdfBody),
    bytes: pdfBody.byteLength,
    ...overrides,
  };
}

function photoRow(overrides = {}) {
  return {
    id: "pho_1",
    status: "stored",
    original_key: "development/originals/cus_1/pho_1",
    original_checksum: sha256Hex(originalBody),
    original_bytes: originalBody.byteLength,
    preview_key: "development/previews/cus_1/pho_1",
    preview_checksum: sha256Hex(previewBody),
    preview_bytes: previewBody.byteLength,
    ...overrides,
  };
}

function matchingStore() {
  return fakeStore({
    "development/agreements/cus_1/doc_1.pdf": { body: pdfBody },
    "development/originals/cus_1/pho_1": { body: originalBody },
    "development/previews/cus_1/pho_1": { body: previewBody },
  });
}

describe("object-manifest-check report", () => {
  it("reports zero missing and zero mismatch when every stored object matches", async () => {
    const store = matchingStore();
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()], photos: [photoRow()] }),
      store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.outcome, "success");
    assert.equal(report.counts.objects, 3);
    assert.equal(report.counts.verified, 3);
    assert.equal(report.counts.missing, 0);
    assert.equal(report.counts.mismatch, 0);
    assert.equal(report.counts.failed, 0);
    assert.equal(report.counts.agreementRows, 1);
    assert.equal(report.counts.photoRows, 1);
    assert.equal(report.counts.auditRows, 1);
    assert.deepEqual(report.errors, []);
  });

  it("fails an empty stored-object inventory with counts retained", async () => {
    const report = await checkObjectManifest({
      loader: fixtureLoader({ auditRows: 7 }),
      store: matchingStore(),
    });

    assert.equal(report.ok, false);
    assert.equal(report.outcome, "failed");
    assert.equal(report.counts.objects, 0);
    assert.equal(report.counts.auditRows, 7);
    assert.deepEqual(report.errors, ["MANIFEST_EMPTY"]);
  });

  it("AE10: one mismatched stored PDF reports mismatch 1 and a failed outcome", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": { body: new TextEncoder().encode("%PDF-1.7 tampered") },
      "development/originals/cus_1/pho_1": { body: originalBody },
      "development/previews/cus_1/pho_1": { body: previewBody },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()], photos: [photoRow()] }),
      store,
    });

    assert.equal(report.ok, false);
    assert.equal(report.outcome, "failed");
    assert.equal(report.counts.mismatch, 1);
    assert.equal(report.counts.missing, 0);
    assert.deepEqual(report.rowIds.mismatch, ["doc_1"]);
  });

  it("reports a stored row whose object is absent as missing", async () => {
    const store = fakeStore({
      "development/originals/cus_1/pho_1": { body: originalBody },
      "development/previews/cus_1/pho_1": { body: previewBody },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()], photos: [photoRow()] }),
      store,
    });

    assert.equal(report.ok, false);
    assert.equal(report.counts.missing, 1);
    assert.equal(report.counts.mismatch, 0);
    assert.deepEqual(report.rowIds.missing, ["doc_1"]);
  });

  it("counts a stored agreement with no object key as a mismatch", async () => {
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        agreements: [agreementRow({ object_key: null })],
      }),
      store: matchingStore(),
    });

    assert.equal(report.ok, false);
    assert.equal(report.counts.objects, 1);
    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(report.rowIds.mismatch, ["doc_1"]);
  });

  it("skips pending, abandoned, building, and failed rows instead of counting them missing", async () => {
    const store = matchingStore();
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        agreements: [
          agreementRow(),
          agreementRow({ id: "doc_2", status: "building", object_key: "development/agreements/cus_1/doc_2.pdf" }),
          agreementRow({ id: "doc_3", status: "failed", object_key: "development/agreements/cus_1/doc_3.pdf" }),
        ],
        photos: [
          photoRow(),
          photoRow({ id: "pho_2", status: "pending", original_key: "development/originals/cus_1/pho_2" }),
          photoRow({ id: "pho_3", status: "abandoned", original_key: "development/originals/cus_1/pho_3" }),
        ],
      }),
      store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.counts.missing, 0);
    assert.equal(report.counts.mismatch, 0);
    assert.equal(report.counts.skipped, 4);
    assert.equal(report.counts.objects, 3);
    assert.equal(store.calls.head.length, 3);
  });

  it("verifies a legacy PDF without a checksum header by GET and hash", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": { body: pdfBody, sha256: null },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.counts.mismatch, 0);
    assert.equal(report.counts.legacyHashed, 1);
    assert.deepEqual(store.calls.get, ["development/agreements/cus_1/doc_1.pdf"]);
  });

  it("verifies a PDF with a checksum header without GET fallback", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": { body: pdfBody },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.counts.legacyHashed, 0);
    assert.deepEqual(store.calls.get, []);
  });

  it("counts a same-size wrong PDF checksum as a mismatch", async () => {
    const wrong = new TextEncoder().encode("%PDF-1.7 agreemenz");
    assert.equal(wrong.byteLength, pdfBody.byteLength);
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": { body: wrong },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.equal(report.counts.missing, 0);
  });

  it("counts a size-only PDF mismatch independently", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": {
        body: pdfBody,
        bytes: pdfBody.byteLength + 1,
        sha256: sha256Hex(pdfBody),
      },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.get, []);
  });

  it("counts a malformed recorded checksum as mismatch without object I/O", async () => {
    const store = matchingStore();
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow({ checksum: "not-sha256" })] }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.head, []);
    assert.deepEqual(store.calls.get, []);
  });

  it("counts a malformed HEAD checksum as mismatch without GET fallback", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": { body: pdfBody, sha256: "bad-header" },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.get, []);
  });

  it("counts a wrong legacy GET hash as mismatch", async () => {
    const wrong = new TextEncoder().encode("%PDF-1.7 agreemenz");
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": {
        body: wrong,
        bytes: pdfBody.byteLength,
        sha256: null,
      },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.get, ["development/agreements/cus_1/doc_1.pdf"]);
  });

  it("reports a legacy GET error as failed with code only", async () => {
    const calls = { head: [], get: [] };
    const store = {
      calls,
      async headMetadata(key) {
        calls.head.push(key);
        return { bytes: pdfBody.byteLength, sha256: null };
      },
      async get(key) {
        calls.get.push(key);
        throw new Error("secret driver details");
      },
    };
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.counts.failed, 1);
    assert.deepEqual(report.errors, ["OBJECT_CHECK_FAILED"]);
    assert.equal(JSON.stringify(report).includes("secret driver details"), false);
  });

  it("does not GET a legacy PDF larger than the cap", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": {
        body: pdfBody,
        bytes: legacyGetCapBytes + 1,
        sha256: null,
      },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        agreements: [agreementRow({ bytes: legacyGetCapBytes + 1 })],
      }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.get, []);
  });

  it("counts a photo object without a checksum header as a mismatch and never falls back to GET", async () => {
    const store = fakeStore({
      "development/originals/cus_1/pho_1": { body: originalBody, sha256: null },
      "development/previews/cus_1/pho_1": { body: previewBody },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ photos: [photoRow()] }),
      store,
    });

    assert.equal(report.ok, false);
    assert.equal(report.counts.mismatch, 1);
    assert.equal(report.counts.legacyHashed, 0);
    assert.deepEqual(store.calls.get, []);
    assert.deepEqual(report.rowIds.mismatch, ["pho_1"]);
  });

  it("counts a stored photo row with no recorded preview checksum as a mismatch", async () => {
    const store = matchingStore();
    const report = await checkObjectManifest({
      loader: fixtureLoader({ photos: [photoRow({ preview_checksum: null })] }),
      store,
    });

    assert.equal(report.ok, false);
    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(report.rowIds.mismatch, ["pho_1"]);
  });

  for (const [label, overrides] of [
    ["key only", { preview_checksum: null, preview_bytes: null }],
    ["checksum only", { preview_key: null, preview_bytes: null }],
    ["bytes only", { preview_key: null, preview_checksum: null }],
    ["whitespace key", { preview_key: "   " }],
  ]) {
    it(`counts incomplete preview metadata (${label}) as mismatch without preview I/O`, async () => {
      const store = matchingStore();
      const report = await checkObjectManifest({
        loader: fixtureLoader({ photos: [photoRow(overrides)] }),
        store,
      });

      assert.equal(report.counts.objects, 2);
      assert.equal(report.counts.mismatch, 1);
      assert.deepEqual(store.calls.head, ["development/originals/cus_1/pho_1"]);
    });
  }

  it("verifies only the original when a stored photo row has no preview key", async () => {
    const store = matchingStore();
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        photos: [photoRow({ preview_key: null, preview_checksum: null, preview_bytes: null })],
      }),
      store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.counts.objects, 1);
    assert.deepEqual(store.calls.head, ["development/originals/cus_1/pho_1"]);
  });

  it("rejects a staging-prefixed key without object I/O by default", async () => {
    const store = fakeStore({
      "staging/agreements/cus_1/doc_1.pdf": { body: pdfBody },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        agreements: [agreementRow({ object_key: "staging/agreements/cus_1/doc_1.pdf" })],
      }),
      store,
    });

    assert.equal(report.ok, false);
    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.head, []);
    assert.deepEqual(store.calls.get, []);
  });

  it("rejects a production-prefixed key without object I/O by default", async () => {
    const store = fakeStore({
      "production/agreements/cus_1/doc_1.pdf": { body: pdfBody },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        agreements: [agreementRow({ object_key: "production/agreements/cus_1/doc_1.pdf" })],
      }),
      store,
    });

    assert.equal(report.counts.mismatch, 1);
    assert.deepEqual(store.calls.head, []);
    assert.deepEqual(store.calls.get, []);
  });

  it("permits a production-prefixed key only with the explicit override", async () => {
    const key = "production/agreements/cus_1/doc_1.pdf";
    const store = fakeStore({ [key]: { body: pdfBody } });
    const report = await checkObjectManifest({
      loader: fixtureLoader({
        agreements: [agreementRow({ object_key: key })],
      }),
      store,
      allowProductionRead: true,
    });

    assert.equal(report.ok, true);
    assert.deepEqual(store.calls.head, [key]);
  });

  it("counts a store error as a failed row with a code only", async () => {
    const store = fakeStore({
      "development/agreements/cus_1/doc_1.pdf": { body: pdfBody, headThrows: true },
    });
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
    });

    assert.equal(report.ok, false);
    assert.equal(report.counts.failed, 1);
    assert.deepEqual(report.rowIds.failed, ["doc_1"]);
    assert.deepEqual(report.errors, ["OBJECT_CHECK_FAILED"]);
    assert.equal(JSON.stringify(report).includes("R2_HEAD_FAILED"), false);
  });

  it("times out a never-resolving object call with safe failure output", async () => {
    const store = {
      async headMetadata() {
        return await new Promise(() => {});
      },
      async get() {
        throw new Error("GET_NOT_EXPECTED");
      },
    };
    const report = await checkObjectManifest({
      loader: fixtureLoader({ agreements: [agreementRow()] }),
      store,
      ioTimeoutMs: 5,
    });

    assert.equal(report.counts.failed, 1);
    assert.deepEqual(report.errors, ["OBJECT_CHECK_FAILED"]);
  });

  it("prints row ids but never keys, checksums, or URLs", async () => {
    const store = fakeStore({
      "development/originals/cus_1/pho_1": { body: originalBody },
      "development/previews/cus_1/pho_1": { body: previewBody },
    });
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: previewUrl, DATABASE_URL: developmentUrl },
      argv: [],
      createLoader: () => fixtureLoader({ agreements: [agreementRow()], photos: [photoRow()] }),
      createStore: () => store,
    });
    const line = JSON.stringify(report);

    assert.ok(line.includes("doc_1"));
    assert.equal(line.includes("agreements/cus_1"), false);
    assert.equal(line.includes("originals/"), false);
    assert.equal(line.includes("previews/"), false);
    assert.equal(line.includes(sha256Hex(pdfBody)), false);
    assert.equal(line.includes(sha256Hex(originalBody)), false);
    assert.equal(line.includes("postgresql://"), false);
    assert.equal(line.includes("neon.tech"), false);
    assert.equal(line.includes("@"), false);
    assert.equal(line.includes("MANIFEST_DATABASE_URL"), false);
  });
});

describe("object-manifest-check row loader", () => {
  it("selects stored object rows and the audit history count", async () => {
    const queries = [];
    const sql = (strings) => {
      const query = strings.join("?");
      queries.push(query);
      return Promise.resolve(query.includes("desk_audit_log") ? [{ count: 4 }] : []);
    };
    const loader = rowLoaderFromSql(sql);
    await loader.agreements();
    await loader.photos();
    assert.equal(await loader.auditCount(), 4);

    assert.equal(queries.length, 3);
    assert.match(queries[0], /from\s+agreement_documents/i);
    assert.match(queries[0], /status\s*=\s*'stored'/i);
    assert.match(queries[1], /from\s+photo_objects/i);
    assert.match(queries[1], /status\s*=\s*'stored'/i);
    assert.match(queries[2], /count\(\*\)::integer\s+as\s+count/i);
    assert.match(queries[2], /from\s+desk_audit_log/i);
  });
});

describe("object-manifest-check access guard", () => {
  it("refuses APP_ENV=production before creating a database or object-store client", async () => {
    let created = 0;
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "production", MANIFEST_DATABASE_URL: productionUrl },
      argv: [],
      createLoader: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
      createStore: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
    });

    assert.equal(report.ok, false);
    assert.equal(report.outcome, "refused");
    assert.ok(report.errors.includes("PRODUCTION_READ_NOT_ALLOWED"));
    assert.equal(created, 0);
  });

  it("refuses a production database URL even when APP_ENV is development", async () => {
    let created = 0;
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: productionUrl },
      argv: [],
      createLoader: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
      createStore: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
    });

    assert.equal(report.outcome, "refused");
    assert.ok(report.errors.includes("PRODUCTION_READ_NOT_ALLOWED"));
    assert.equal(created, 0);
  });

  for (const [label, url] of [
    ["development", developmentUrl],
    ["staging", stagingUrl],
  ]) {
    it(`refuses the known live ${label} endpoint before creating clients`, async () => {
      let created = 0;
      const report = await runObjectManifestCheck({
        env: { APP_ENV: "development", MANIFEST_DATABASE_URL: url },
        argv: [],
        createLoader: () => {
          created += 1;
          return fixtureLoader({});
        },
        createStore: () => {
          created += 1;
          return matchingStore();
        },
      });

      assert.equal(report.outcome, "refused");
      assert.deepEqual(report.errors, ["RESTORE_PREVIEW_REQUIRED"]);
      assert.equal(created, 0);
    });
  }

  it("refuses when no MANIFEST_DATABASE_URL is supplied", async () => {
    let created = 0;
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development" },
      argv: [],
      createLoader: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
      createStore: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
    });

    assert.equal(report.outcome, "refused");
    assert.ok(report.errors.includes("MANIFEST_DATABASE_URL_REQUIRED"));
    assert.equal(created, 0);
  });

  it("ignores DATABASE_URL and uses MANIFEST_DATABASE_URL only", async () => {
    const store = matchingStore();
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", DATABASE_URL: developmentUrl, MANIFEST_DATABASE_URL: previewUrl },
      argv: [],
      createLoader: (url) => {
        assert.equal(url, previewUrl);
        assert.notEqual(url, developmentUrl);
        return fixtureLoader({ agreements: [agreementRow()], photos: [photoRow()] });
      },
      createStore: () => store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.outcome, "success");
    assert.equal(report.counts.verified, 3);
  });

  it("does not treat DATABASE_URL as a substitute for a missing preview branch URL", async () => {
    let created = 0;
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", DATABASE_URL: developmentUrl },
      argv: [],
      createLoader: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
      createStore: () => {
        created += 1;
        throw new Error("CLIENT_CREATED");
      },
    });

    assert.equal(report.outcome, "refused");
    assert.ok(report.errors.includes("MANIFEST_DATABASE_URL_REQUIRED"));
    assert.equal(created, 0);
  });

  it("runs against a restored preview branch URL without a refusal", async () => {
    const store = matchingStore();
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: previewUrl },
      argv: [],
      createLoader: (url) => {
        assert.equal(url, previewUrl);
        return fixtureLoader({ agreements: [agreementRow()], photos: [photoRow()] });
      },
      createStore: () => store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.outcome, "success");
    assert.equal(report.counts.verified, 3);
  });

  it("reads production only with --allow-production-read", async () => {
    const key = "production/agreements/cus_1/doc_1.pdf";
    const store = fakeStore({ [key]: { body: pdfBody } });
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "production", MANIFEST_DATABASE_URL: productionUrl },
      argv: ["--allow-production-read"],
      createLoader: () => fixtureLoader({
        agreements: [agreementRow({ object_key: key })],
      }),
      createStore: () => store,
    });

    assert.equal(report.ok, true);
    assert.equal(report.outcome, "success");
    assert.deepEqual(report.errors, []);
  });

  it("refuses a malformed manifest URL before clients and never echoes it", async () => {
    const malformed = "https://user:secret@example.com/database";
    let created = 0;
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: malformed },
      argv: [],
      createLoader: () => {
        created += 1;
        return fixtureLoader({});
      },
      createStore: () => {
        created += 1;
        return matchingStore();
      },
    });

    assert.equal(report.outcome, "refused");
    assert.deepEqual(report.errors, ["DATABASE_URL_UNPARSEABLE"]);
    assert.equal(created, 0);
    assert.equal(JSON.stringify(report).includes(malformed), false);
  });

  it("maps a loader rejection to MANIFEST_READ_FAILED without raw details", async () => {
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: previewUrl },
      argv: [],
      createLoader: () => ({
        async agreements() {
          throw new Error("postgres password leaked");
        },
        async photos() {
          return [];
        },
        async auditCount() {
          return 0;
        },
      }),
      createStore: () => matchingStore(),
      ioTimeoutMs: 5,
    });

    assert.equal(report.outcome, "failed");
    assert.deepEqual(report.errors, ["MANIFEST_READ_FAILED"]);
    assert.equal(JSON.stringify(report).includes("postgres password leaked"), false);
  });

  it("maps an audit-count rejection to MANIFEST_READ_FAILED", async () => {
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: previewUrl },
      argv: [],
      createLoader: () => ({
        async agreements() {
          return [agreementRow()];
        },
        async photos() {
          return [];
        },
        async auditCount() {
          throw new Error("raw audit query failure");
        },
      }),
      createStore: () => matchingStore(),
      ioTimeoutMs: 5,
    });

    assert.equal(report.outcome, "failed");
    assert.deepEqual(report.errors, ["MANIFEST_READ_FAILED"]);
    assert.equal(JSON.stringify(report).includes("raw audit query failure"), false);
  });

  it("maps a loader timeout to MANIFEST_READ_FAILED", async () => {
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: previewUrl },
      argv: [],
      createLoader: () => ({
        async agreements() {
          return await new Promise(() => {});
        },
        async photos() {
          return [];
        },
        async auditCount() {
          return 0;
        },
      }),
      createStore: () => matchingStore(),
      ioTimeoutMs: 5,
    });

    assert.equal(report.outcome, "failed");
    assert.deepEqual(report.errors, ["MANIFEST_READ_FAILED"]);
  });

  it("refuses an unknown flag", async () => {
    let created = 0;
    const report = await runObjectManifestCheck({
      env: { APP_ENV: "development", MANIFEST_DATABASE_URL: developmentUrl },
      argv: ["--delete-branch"],
      createLoader: () => {
        created += 1;
        return fixtureLoader({});
      },
      createStore: () => {
        created += 1;
        return matchingStore();
      },
    });

    assert.equal(report.outcome, "refused");
    assert.ok(report.errors.includes("MANIFEST_ARG_INVALID"));
    assert.equal(created, 0);
  });

  it("parses the allow flag without defaulting it on", () => {
    assert.equal(parseManifestCheckArgs([]).allowProductionRead, false);
    assert.equal(parseManifestCheckArgs(["--allow-production-read"]).allowProductionRead, true);
    assert.deepEqual(parseManifestCheckArgs(["--nope"]).unknown, ["--nope"]);
  });
});

describe("object-manifest-check CLI", () => {
  const script = fileURLToPath(new URL("./object-manifest-check.mjs", import.meta.url));

  function runCli(env, args = []) {
    return spawnSync(process.execPath, [script, ...args], {
      encoding: "utf8",
      env: {
        ...process.env,
        DATABASE_URL: undefined,
        DATABASE_URL_UNPOOLED: undefined,
        MANIFEST_DATABASE_URL: undefined,
        R2_ACCOUNT_ID: undefined,
        R2_S3_ENDPOINT: undefined,
        R2_BUCKET: undefined,
        R2_ACCESS_KEY_ID: undefined,
        R2_SECRET_ACCESS_KEY: undefined,
        ...env,
      },
    });
  }

  it("exits non-zero on a production refusal and prints no URL", () => {
    const result = runCli({ APP_ENV: "production", MANIFEST_DATABASE_URL: productionUrl });

    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr.trim().split("\n").at(-1));
    assert.equal(body.outcome, "refused");
    assert.ok(body.errors.includes("PRODUCTION_READ_NOT_ALLOWED"));
    assert.equal(result.stderr.includes("postgresql://"), false);
    assert.equal(result.stdout, "");
  });

  it("exits non-zero when the object-store client is unavailable", () => {
    const result = runCli({ APP_ENV: "development", MANIFEST_DATABASE_URL: previewUrl });

    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr.trim().split("\n").at(-1));
    assert.equal(body.ok, false);
    assert.deepEqual(body.errors, ["MANIFEST_CLIENT_UNAVAILABLE"]);
    assert.equal(result.stderr.includes("neon.tech"), false);
  });

  it("exits non-zero when only DATABASE_URL is present", () => {
    const result = runCli({ APP_ENV: "development", DATABASE_URL: developmentUrl });

    assert.notEqual(result.status, 0);
    const body = JSON.parse(result.stderr.trim().split("\n").at(-1));
    assert.equal(body.outcome, "refused");
    assert.deepEqual(body.errors, ["MANIFEST_DATABASE_URL_REQUIRED"]);
    assert.equal(result.stderr.includes("postgresql://"), false);
  });
});

describe("object-manifest-check wiring", () => {
  it("runs through Doppler dev and never bakes in the production allow flag", () => {
    const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
    const script = scripts["db:manifest-check"];

    assert.ok(script);
    assert.ok(script.startsWith("doppler run --"));
    assert.ok(script.includes("scripts/object-manifest-check.mjs"));
    assert.equal(script.includes("tools/harness/object-manifest-check"), false);
    assert.equal(script.includes("--allow-production-read"), false);
    assert.equal(script.includes("--config prd"), false);
  });

  it("is on the unit test list", () => {
    const scripts = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts;
    assert.ok(scripts["test:unit"].includes("scripts/object-manifest-check.test.mjs"));
    assert.equal(scripts["test:unit"].includes("tools/harness/object-manifest-check.test.mjs"), false);
  });
});
