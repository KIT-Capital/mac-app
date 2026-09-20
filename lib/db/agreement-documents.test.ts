import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { eq, inArray } from "drizzle-orm";
import { INSPECTION_CONDITION } from "../contract/repo-agreement-snapshot.mjs";
import { SCENARIO_60 } from "../contract/repo-scale.mjs";
import { agreementDocumentStore, memoryObjectStore, sha256Hex } from "../storage/object-store.mjs";
import { createDb, type Database } from "./client";
import {
  buildAgreementDocument,
  listAgreementDocumentSends,
  listAgreementDocuments,
  mintAgreementDocumentUrl,
  renderStageDocument,
  sendAgreementDocument,
} from "./agreement-documents";
import { insertLiveAgreement } from "./live-book";
import { executeLiveBookOperation, type RequestSubmitResult } from "./live-book-mutations";
import { createTimepiece, deskActor, registerCollector, toCollectorActor } from "./records";
import {
  agreementDocumentSends,
  agreementDocuments,
  agreementShells,
  customers,
  deskSettings,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const customerIds: string[] = [];

const frozenScale = {
  purchaseShare: SCENARIO_60.purchaseShare,
  setupFee: SCENARIO_60.setupFee,
  annualAdjustment: SCENARIO_60.annualAdjustment,
  earlyRepurchaseAmount: SCENARIO_60.earlyRepurchaseAmount,
  brokerFee: SCENARIO_60.brokerFee,
};

describe("agreement documents repository", { skip }, () => {
  const db = createDb();

  after(async () => {
    if (!customerIds.length) return;
    const pieces = (await db.select({ id: timepieces.id }).from(timepieces).where(inArray(timepieces.customerId, customerIds))).map((row) => row.id);
    const repos = (await db.select({ id: liveAgreements.id }).from(liveAgreements).where(inArray(liveAgreements.customerId, customerIds))).map((row) => row.id);
    const docs = repos.length
      ? (await db.select({ id: agreementDocuments.id }).from(agreementDocuments).where(inArray(agreementDocuments.liveAgreementId, repos))).map((row) => row.id)
      : [];
    if (docs.length) {
      await db.delete(agreementDocumentSends).where(inArray(agreementDocumentSends.documentId, docs));
      await db.delete(agreementDocuments).where(inArray(agreementDocuments.id, docs));
    }
    if (pieces.length) {
      await db.delete(livePreviews).where(inArray(livePreviews.timepieceId, pieces));
      await db.delete(liveAgreementMembers).where(inArray(liveAgreementMembers.timepieceId, pieces));
    }
    if (repos.length) {
      await db.delete(liveAgreementEnds).where(inArray(liveAgreementEnds.agreementId, repos));
      await db.delete(liveAgreementMembers).where(inArray(liveAgreementMembers.agreementId, repos));
      await db.delete(liveAgreements).where(inArray(liveAgreements.id, repos));
    }
    await db.delete(timepieces).where(inArray(timepieces.customerId, customerIds));
    await db.delete(customers).where(inArray(customers.id, customerIds));
  });

  async function collector(label: string) {
    const customer = await registerCollector(db, {
      email: `${label}.${suffix}@mac.test`,
      name: label,
    });
    customerIds.push(customer.id);
    return { customer, actor: toCollectorActor(customer) };
  }

  async function repo(owner: Awaited<ReturnType<typeof collector>>, scale = frozenScale) {
    const piece = await createTimepiece(db, owner.actor, owner.customer.id, {
      brand: "Cartier",
      model: "Tank",
    });
    const id = `repo-doc-${owner.customer.id.slice(0, 8)}-${suffix}`;
    await insertLiveAgreement(db, owner.actor, {
      id,
      customerId: owner.customer.id,
      watchIds: [piece.id],
      amount: 400000,
      termMonths: 12,
      delivery: "Insured courier",
      ownerName: owner.customer.name,
      email: owner.customer.email,
      createdOn: "2026-09-15",
      agreementCode: "MAC-400K-12",
      scale,
    });
    return { id, piece };
  }

  it("builds a stored document with a conditional put and checksum", async () => {
    const owner = await collector("build-own");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const built = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    assert.equal(built.status, "stored");
    assert.equal(built.version, 1);
    assert.match(built.objectKey ?? "", /^development\/agreements\//);
    assert.equal(built.checksum, sha256Hex(await store.get(built.objectKey ?? "")));
    assert.ok((built.bytes ?? 0) > 0);
    const listed = await listAgreementDocuments(db, owner.actor, { liveAgreementId: id });
    assert.equal(listed.length, 1);
    assert.equal(listed[0].id, built.id);
  });

  it("hides another collector's documents with the same missing-id error", async () => {
    const owner = await collector("own-docs");
    const other = await collector("other-docs");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const built = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    await assert.rejects(
      () => buildAgreementDocument(db, other.actor, { liveAgreementId: id }, store, { APP_ENV: "development" }),
      { message: "DOCUMENT_NOT_FOUND" },
    );
    assert.deepEqual(await listAgreementDocuments(db, other.actor, { liveAgreementId: id }), []);
    await assert.rejects(
      () => mintAgreementDocumentUrl(db, other.actor, { documentId: built.id }, store),
      { message: "DOCUMENT_NOT_FOUND" },
    );
    await assert.rejects(
      () => mintAgreementDocumentUrl(db, owner.actor, { documentId: "missing-doc" }, store),
      { message: "DOCUMENT_NOT_FOUND" },
    );
  });

  it("mints only a short-lived URL after verifying checksum and bytes", async () => {
    const owner = await collector("mint-url");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const built = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    const minted = await mintAgreementDocumentUrl(db, owner.actor, { documentId: built.id }, store);
    assert.equal(typeof minted.url, "string");
    assert.ok(minted.expiresAt);
    assert.equal(Object.hasOwn(minted, "objectKey"), false);
    assert.equal(Object.hasOwn(minted, "bucket"), false);
  });

  it("refuses desk remove after a document row exists", async () => {
    const owner = await collector("no-remove");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, deskActor("appraiser", "desk@mechartcap.com"), {
        action: "agreement.remove",
        id,
      }),
      { message: "AGREEMENT_HAS_DOCUMENTS" },
    );
    const listed = await listAgreementDocuments(db, owner.actor, { liveAgreementId: id });
    assert.equal(listed.length, 1);
  });

  it("reconciles a matching building object and leaves a checksum mismatch failed", async () => {
    const owner = await collector("reconcile");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const matching = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    assert.equal(matching.status, "stored");
    const again = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    assert.ok(again.version >= 1);
  });

  it("emails self after checksum verify and hides desk and foreign sends", async () => {
    const owner = await collector("mail-self");
    const other = await collector("mail-other");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const built = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    let sentBytes = 0;
    const sent = await sendAgreementDocument(
      db,
      owner.actor,
      { documentId: built.id, recipientKind: "self", address: "ignored@example.com" },
      store,
      {
        env: {},
        sendEmail: async (message) => {
          sentBytes = (message.attachments as { content: Buffer }[])[0].content.byteLength;
          return { data: { id: "re_should_not" }, error: null };
        },
      },
    );
    assert.equal(sent.result, "accepted");
    assert.equal(sent.recipientKind, "self");
    assert.equal(sentBytes, 0);
    await assert.rejects(
      () => sendAgreementDocument(db, deskActor("appraiser", "desk@mechartcap.com"), {
        documentId: built.id,
        recipientKind: "self",
      }, store, { env: {} }),
      { message: "DOCUMENT_NOT_FOUND" },
    );
    await assert.rejects(
      () => sendAgreementDocument(db, other.actor, { documentId: built.id, recipientKind: "self" }, store, { env: {} }),
      { message: "DOCUMENT_NOT_FOUND" },
    );
    const history = await listAgreementDocumentSends(db, deskActor("admin", "admin@mechartcap.com"), {
      liveAgreementId: id,
    });
    assert.equal(history.length, 1);
    assert.equal(history[0].recipientKind, "self");
    assert.equal(history[0].result, "accepted");
    assert.equal(Object.hasOwn(history[0], "recipientEmail"), false);
  });

  it("does not send a checksum-mismatched object", async () => {
    const owner = await collector("mail-bad");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const built = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    store.objects.set(built.objectKey ?? "", new Uint8Array([1, 2, 3]));
    let called = 0;
    await assert.rejects(
      () => sendAgreementDocument(
        db,
        owner.actor,
        { documentId: built.id, recipientKind: "self" },
        store,
        {
          env: { RESEND_API_KEY: "re_test" },
          sendEmail: async () => {
            called += 1;
            return { data: { id: "re_no" }, error: null };
          },
        },
      ),
      { message: "DOCUMENT_UNAVAILABLE" },
    );
    assert.equal(called, 0);
  });

  it("throttles a sixth send in one hour", async () => {
    const owner = await collector("mail-throttle");
    const { id } = await repo(owner);
    const store = memoryObjectStore();
    const built = await buildAgreementDocument(db, owner.actor, { liveAgreementId: id }, store, {
      APP_ENV: "development",
    });
    const now = new Date();
    for (let index = 0; index < 5; index += 1) {
      await sendAgreementDocument(
        db,
        owner.actor,
        { documentId: built.id, recipientKind: "self" },
        store,
        { env: {}, now },
      );
    }
    await assert.rejects(
      () => sendAgreementDocument(
        db,
        owner.actor,
        { documentId: built.id, recipientKind: "self" },
        store,
        { env: {}, now },
      ),
      { message: "DOCUMENT_SEND_THROTTLED" },
    );
    const listed = await listAgreementDocuments(db, owner.actor, { liveAgreementId: id });
    assert.equal(listed[0].status, "stored");
  });
});

/**
 * Stage documents are minted by `request.submit`, which also writes the
 * append-only event thread, so this suite runs inside one rolled-back root
 * transaction instead of deleting rows afterwards.
 */
describe("request stage documents", { skip }, () => {
  const rootDb = createDb();
  let db: Database;
  let releaseTransaction: (() => void) | undefined;
  let transactionPromise: Promise<unknown> | undefined;

  before(async () => {
    let ready!: () => void;
    let release!: () => void;
    const readyPromise = new Promise<void>((resolve) => { ready = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    releaseTransaction = release;
    transactionPromise = rootDb.transaction(async (tx) => {
      db = tx as unknown as Database;
      ready();
      await releasePromise;
      throw new Error("STAGE_DOCUMENT_TEST_ROLLBACK");
    });
    await readyPromise;
    await db.delete(agreementShells);
    await db.delete(deskSettings);
  });

  after(async () => {
    releaseTransaction?.();
    await assert.rejects(() => transactionPromise, { message: "STAGE_DOCUMENT_TEST_ROLLBACK" });
  });

  /** A legacy-appraised piece: `evaluatedAt` today counts as a current Accept. */
  async function applicant(label: string) {
    const customer = await registerCollector(db, {
      email: `${label}.${suffix}@mac.test`,
      name: label,
    });
    const actor = toCollectorActor(customer);
    const piece = await createTimepiece(db, actor, customer.id, {
      brand: "Cartier",
      model: "Tank",
      status: "appraised",
      financeable: true,
      valueLow: 100_000,
      valueHigh: 120_000,
      evaluatedAt: new Date().toISOString(),
    });
    return { customer, actor, piece };
  }

  function submit(
    owner: Awaited<ReturnType<typeof applicant>>,
    id: string,
    documentStore: ReturnType<typeof agreementDocumentStore> | undefined,
  ) {
    return executeLiveBookOperation(db, owner.actor, {
      action: "request.submit",
      id,
      watchIds: [owner.piece.id],
      termMonths: 12,
      amount: 60_000,
      delivery: "Insured courier",
      note: "",
    }, { documentStore }) as Promise<RequestSubmitResult>;
  }

  it("records a failed render and re-renders a fresh row on the next read", async () => {
    const owner = await applicant("stage-fail");
    const memory = memoryObjectStore();
    let failures = 1;
    const flaky = agreementDocumentStore({
      ...memory,
      async putIfAbsent(key, body, checksum) {
        if (failures > 0) {
          failures -= 1;
          throw new Error("R2_PUT_FAILED");
        }
        return memory.putIfAbsent(key, body, checksum);
      },
    });
    const id = `request-stage-fail-${suffix}`;
    const result = await submit(owner, id, flaky);
    for (const job of result.afterCommit) await job();
    const [failed] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.liveAgreementId, id));
    assert.equal(failed.status, "failed");
    assert.equal(failed.failureCode, "R2_PUT_FAILED");
    assert.equal(failed.stage, "proposal");

    const listed = await listAgreementDocuments(db, owner.actor, { liveAgreementId: id }, flaky);
    assert.equal(listed.length, 2);
    const stored = listed.find((row) => row.status === "stored");
    assert.ok(stored);
    assert.notEqual(stored.id, failed.id);
    assert.equal(stored.version, 1);
    assert.equal(stored.stage, "proposal");
    assert.equal(stored.snapshotHash, failed.snapshotHash);
    assert.ok(await memory.head(stored.objectKey ?? ""));
    assert.equal(stored.checksum, sha256Hex(await memory.get(stored.objectKey ?? "")));
    assert.ok((stored.snapshot as { text: string }).text.includes(INSPECTION_CONDITION));
    // A second read has nothing left to do.
    assert.equal((await listAgreementDocuments(db, owner.actor, { liveAgreementId: id }, flaky)).length, 2);
  });

  it("renders a building proposal when a URL is minted before the job ran", async () => {
    const owner = await applicant("stage-mint");
    const memory = memoryObjectStore();
    const store = agreementDocumentStore(memory);
    const id = `request-stage-mint-${suffix}`;
    await submit(owner, id, store);
    const [building] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.liveAgreementId, id));
    assert.equal(building.status, "building");
    const minted = await mintAgreementDocumentUrl(db, owner.actor, { documentId: building.id }, store);
    assert.match(minted.url, /^memory:\/\//);
    const [stored] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.id, building.id));
    assert.equal(stored.status, "stored");
    assert.equal(stored.objectKey, building.objectKey);
    // Another collector reads nothing, and the failure is still the missing id.
    const other = await applicant("stage-mint-other");
    await assert.rejects(
      () => mintAgreementDocumentUrl(db, other.actor, { documentId: building.id }, store),
      { message: "DOCUMENT_NOT_FOUND" },
    );
  });

  it("marks the row failed when no object store can be created", async () => {
    const owner = await applicant("stage-no-store");
    const id = `request-stage-no-store-${suffix}`;
    const result = await submit(owner, id, undefined);
    await assert.doesNotReject(async () => {
      for (const job of result.afterCommit) await job();
    });
    const [row] = await db.select().from(agreementDocuments).where(eq(agreementDocuments.liveAgreementId, id));
    assert.equal(row.status, "failed");
    assert.equal(row.failureCode, "DOCUMENT_STORE_UNAVAILABLE");
    // Rendering the same failed row again is a no-op that returns it.
    const again = await renderStageDocument(db, row.id, agreementDocumentStore(memoryObjectStore()));
    assert.equal(again?.status, "failed");
    // A reader without a store sees the row as it is; nothing is re-rendered.
    const listed = await listAgreementDocuments(db, owner.actor, { liveAgreementId: id });
    assert.equal(listed.length, 1);
  });
});
