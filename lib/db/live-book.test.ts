import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import { inArray } from "drizzle-orm";
import { createDb } from "./client";
import { readLiveBookState } from "./live-book-adapter";
import { executeLiveBookOperation } from "./live-book-mutations";
import { insertLiveAgreement } from "./live-book";
import { createTimepiece, deskActor, registerCollector, toCollectorActor } from "./records";
import {
  customers,
  liveAgreementEnds,
  liveAgreementMembers,
  liveAgreements,
  livePreviews,
  timepieces,
} from "./schema";

const skip = !process.env.DATABASE_URL;
const suffix = Date.now();
const customerIds: string[] = [];

describe("live-book operation repository", { skip }, () => {
  const db = createDb();

  after(async () => {
    if (!customerIds.length) return;
    const pieces = (await db.select({ id: timepieces.id }).from(timepieces).where(inArray(timepieces.customerId, customerIds))).map((row) => row.id);
    const repos = (await db.select({ id: liveAgreements.id }).from(liveAgreements).where(inArray(liveAgreements.customerId, customerIds))).map((row) => row.id);
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

  it("keeps collector reads isolated while desk reads all rows", async () => {
    const a = await collector("read-a");
    const b = await collector("read-b");
    await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    await createTimepiece(db, b.actor, b.customer.id, { brand: "Rolex", model: "Daytona" });
    const own = await readLiveBookState(db, a.actor);
    const all = await readLiveBookState(db, deskActor("staff", "desk@mechartcap.com"));
    assert.equal(own.timepieces.length, 1);
    assert.equal(own.timepieces[0].ownerEmail, a.customer.email);
    assert.ok(all.timepieces.some((row) => row.ownerEmail === a.customer.email));
    assert.ok(all.timepieces.some((row) => row.ownerEmail === b.customer.email));
    await assert.rejects(
      () => executeLiveBookOperation(db, b.actor, {
        action: "timepiece.update",
        id: own.timepieces[0].id,
        patch: { model: "Stolen" },
      }),
      { message: "TIMEPIECE_NOT_FOUND" },
    );
  });

  it("creates one collector piece without changing another customer's row", async () => {
    const a = await collector("write-a");
    const b = await collector("write-b");
    const existing = await createTimepiece(db, b.actor, b.customer.id, { brand: "Patek Philippe", model: "Nautilus" });
    await executeLiveBookOperation(db, a.actor, {
      action: "timepiece.create",
      timepiece: {
        id: `piece-a-${suffix}`,
        brand: "Audemars Piguet",
        model: "Royal Oak",
        status: "appraised",
        valueLow: 999999,
        assetCode: `ASSET-${suffix}`,
      },
    });
    const own = await readLiveBookState(db, a.actor);
    const untouched = await readLiveBookState(db, b.actor);
    assert.equal(own.timepieces[0].status, "not_evaluated");
    assert.equal(own.timepieces[0].valueLow, undefined);
    assert.equal(own.timepieces[0].assetCode, `ASSET-${suffix}`);
    assert.deepEqual(untouched.timepieces.map((row) => row.id), [existing.id]);
  });

  it("keeps valuation and end controls on the desk", async () => {
    const a = await collector("desk-control");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Crash" });
    const repoId = `repo-desk-${suffix}`;
    await insertLiveAgreement(db, a.actor, {
      id: repoId,
      customerId: a.customer.id,
      watchIds: [piece.id],
      amount: 60000,
      termMonths: 12,
      delivery: "",
      ownerName: a.customer.name,
      email: a.customer.email,
      createdOn: "2026-01-01",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "timepiece.deskUpdate",
        id: piece.id,
        patch: { status: "appraised", valueLow: 100000 },
      }),
      { message: "DESK_REQUIRED" },
    );
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "agreement.recordEnd",
        id: repoId,
        end: { kind: "bought_back", date: "2026-09-17", amount: 70000 },
      }),
      { message: "DESK_REQUIRED" },
    );
    await executeLiveBookOperation(db, deskActor("staff", "desk@mechartcap.com"), {
      action: "agreement.recordEnd",
      id: repoId,
      end: { kind: "bought_back", date: "2026-09-17", amount: 70000 },
    });
    const state = await readLiveBookState(db, a.actor);
    assert.equal(state.agreements[0].bookEnd?.kind, "bought_back");
  });

  it("allows only admin renewal and moves membership transactionally", async () => {
    const a = await collector("renew");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Richard Mille", model: "RM 011" });
    const repoId = `repo-renew-${suffix}`;
    await insertLiveAgreement(db, a.actor, {
      id: repoId,
      customerId: a.customer.id,
      watchIds: [piece.id],
      amount: 100000,
      termMonths: 12,
      delivery: "",
      ownerName: a.customer.name,
      email: a.customer.email,
      createdOn: "2025-09-17",
    });
    const operation = {
      action: "agreement.renew",
      id: repoId,
      closeDate: "2026-09-17",
      successorId: `repo-successor-${suffix}`,
      agreementCode: `MAC-${suffix}`,
      scale: { purchaseShare: 0.6, annualAdjustment: 0.185 },
    };
    await assert.rejects(
      () => executeLiveBookOperation(db, deskActor("staff", "desk@mechartcap.com"), operation),
      { message: "ADMIN_REQUIRED" },
    );
    await executeLiveBookOperation(db, deskActor("admin", "admin@mechartcap.com"), operation);
    const state = await readLiveBookState(db, a.actor);
    assert.equal(state.agreements.find((row) => row.id === repoId)?.bookEnd?.kind, "renewed");
    assert.deepEqual(state.agreements.find((row) => row.id === operation.successorId)?.watchIds, [piece.id]);
  });

  it("rejects canonical deletion when the piece is referenced", async () => {
    const a = await collector("remove");
    const piece = await createTimepiece(db, a.actor, a.customer.id, { brand: "Rolex", model: "Submariner" });
    await insertLiveAgreement(db, a.actor, {
      id: `repo-remove-${suffix}`,
      customerId: a.customer.id,
      watchIds: [piece.id],
      amount: 20000,
      termMonths: 12,
      delivery: "",
      ownerName: a.customer.name,
      email: a.customer.email,
      createdOn: "2026-09-17",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, { action: "timepiece.remove", id: piece.id }),
      { message: "TIMEPIECE_REFERENCED" },
    );
  });

  it("rejects an agreement id already owned by another customer", async () => {
    const a = await collector("repo-id-a");
    const b = await collector("repo-id-b");
    const pieceA = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    const pieceB = await createTimepiece(db, b.actor, b.customer.id, { brand: "Rolex", model: "Daytona" });
    const id = `shared-repo-id-${suffix}`;
    await insertLiveAgreement(db, b.actor, {
      id,
      customerId: b.customer.id,
      watchIds: [pieceB.id],
      amount: 50000,
      termMonths: 12,
      delivery: "",
      ownerName: b.customer.name,
      email: b.customer.email,
      createdOn: "2026-09-17",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "agreement.create",
        agreement: {
          id,
          watchIds: [pieceA.id],
          amount: 25000,
          termMonths: 12,
          delivery: "",
          ownerName: a.customer.name,
          email: a.customer.email,
          createdAt: "2026-09-17",
          agreementCode: `MAC-A-${suffix}`,
        },
      }),
      { message: "ID_COLLISION" },
    );
  });

  it("does not let one customer take another piece's preview id", async () => {
    const a = await collector("preview-a");
    const b = await collector("preview-b");
    const pieceA = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    const pieceB = await createTimepiece(db, b.actor, b.customer.id, { brand: "Rolex", model: "Daytona" });
    await executeLiveBookOperation(db, a.actor, {
      action: "preview.upsert",
      id: `shared-preview-${suffix}`,
      timepieceId: pieceA.id,
      kind: "front",
      url: "/preview-a.jpg",
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, b.actor, {
        action: "preview.upsert",
        id: `shared-preview-${suffix}`,
        timepieceId: pieceB.id,
        kind: "back",
        url: "/preview-b.jpg",
      }),
      { message: "PREVIEW_ID_COLLISION" },
    );
    assert.deepEqual((await readLiveBookState(db, a.actor)).photos.map((row) => row.url), ["/preview-a.jpg"]);
  });

  it("rejects unsafe agreement scale at the repository boundary", async () => {
    const a = await collector("scale");
    const piece = await createTimepiece(db, a.actor, a.customer.id, {
      brand: "Cartier",
      model: "Tank",
      status: "appraised",
      financeable: true,
      valueLow: 100000,
      valueHigh: 120000,
    });
    await assert.rejects(
      () => executeLiveBookOperation(db, a.actor, {
        action: "agreement.create",
        agreement: {
          id: `repo-scale-${suffix}`,
          watchIds: [piece.id],
          amount: 50000,
          termMonths: 12,
          delivery: "",
          ownerName: a.customer.name,
          email: a.customer.email,
          createdAt: "2026-09-17",
          scale: { purchaseShare: 1.5, setupFee: 0.01 },
        },
      }),
      { message: "AGREEMENT_SCALE_INVALID" },
    );
  });

  it("rejects unappraised and nonpurchaseable pieces on agreement creation", async () => {
    const a = await collector("agreement-piece-safety");
    const unappraised = await createTimepiece(db, a.actor, a.customer.id, {
      brand: "Cartier",
      model: "Tank",
      status: "reviewing",
      financeable: true,
      valueLow: 100000,
      valueHigh: 120000,
    });
    const nonpurchaseable = await createTimepiece(db, a.actor, a.customer.id, {
      brand: "Rolex",
      model: "Daytona",
      status: "appraised",
      financeable: false,
      valueLow: 100000,
      valueHigh: 120000,
    });
    for (const piece of [unappraised, nonpurchaseable]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, a.actor, {
          action: "agreement.create",
          agreement: {
            id: `repo-ineligible-${piece.id}`,
            watchIds: [piece.id],
            amount: 50000,
            termMonths: 12,
            delivery: "",
            ownerName: a.customer.name,
            email: a.customer.email,
            createdAt: "2026-09-17",
            scale: {
              purchaseShare: 0.6,
              setupFee: 0.01,
              annualAdjustment: 0.185,
              earlyRepurchaseAmount: 0.035,
              brokerFee: 0.035,
            },
          },
        }),
        { message: "INELIGIBLE_PIECE" },
      );
    }
  });

  it("lets desk mutate explicit customers, previews, and agreements safely", async () => {
    const empty = await collector("customer-empty");
    const linked = await collector("customer-linked");
    const desk = deskActor("staff", "desk@mechartcap.com");
    const invitedId = `customer-invited-${suffix}`;
    await executeLiveBookOperation(db, desk, {
      action: "customer.invite",
      customer: {
        id: invitedId,
        name: "Invited Collector",
        email: `INVITED.${suffix}@MAC.TEST`,
        phone: "",
        role: "collector",
        status: "active",
        member: false,
      },
    });
    customerIds.push(invitedId);
    const invited = (await readLiveBookState(db, desk)).users.find((row) => row.id === invitedId);
    assert.equal(invited?.status, "invited");
    assert.equal(invited?.email, `invited.${suffix}@mac.test`);
    await executeLiveBookOperation(db, desk, {
      action: "customer.update",
      id: empty.customer.id,
      patch: { name: "Updated Customer", status: "suspended" },
    });
    const piece = await createTimepiece(db, linked.actor, linked.customer.id, { brand: "Cartier", model: "Tank" });
    await assert.rejects(
      () => executeLiveBookOperation(db, desk, { action: "customer.remove", id: linked.customer.id }),
      { message: "CUSTOMER_REFERENCED" },
    );
    const repoId = `repo-remove-desk-${suffix}`;
    await insertLiveAgreement(db, linked.actor, {
      id: repoId,
      customerId: linked.customer.id,
      watchIds: [piece.id],
      amount: 10000,
      termMonths: 12,
      delivery: "",
      ownerName: linked.customer.name,
      email: linked.customer.email,
      createdOn: "2026-09-17",
    });
    await executeLiveBookOperation(db, linked.actor, {
      action: "preview.upsert",
      id: `preview-remove-${suffix}`,
      timepieceId: piece.id,
      kind: "front",
      url: "/preview.jpg",
    });
    await executeLiveBookOperation(db, desk, { action: "preview.remove", id: `preview-remove-${suffix}` });
    await executeLiveBookOperation(db, desk, { action: "agreement.remove", id: repoId });
    await executeLiveBookOperation(db, desk, { action: "customer.remove", id: empty.customer.id });
    await executeLiveBookOperation(db, desk, { action: "customer.remove", id: invitedId });
    customerIds.splice(customerIds.indexOf(empty.customer.id), 1);
    customerIds.splice(customerIds.indexOf(invitedId), 1);
    assert.equal((await readLiveBookState(db, linked.actor)).agreements.length, 0);
    assert.equal((await readLiveBookState(db, linked.actor)).photos.length, 0);
  });

  it("keeps signed and ended agreements immutable to desk edit and removal", async () => {
    const a = await collector("immutable");
    const desk = deskActor("staff", "desk@mechartcap.com");
    const first = await createTimepiece(db, a.actor, a.customer.id, { brand: "Cartier", model: "Tank" });
    const second = await createTimepiece(db, a.actor, a.customer.id, { brand: "Rolex", model: "Daytona" });
    const signedId = `repo-signed-${suffix}`;
    const endedId = `repo-ended-${suffix}`;
    for (const [id, piece] of [[signedId, first], [endedId, second]] as const) {
      await insertLiveAgreement(db, a.actor, {
        id,
        customerId: a.customer.id,
        watchIds: [piece.id],
        amount: 10000,
        termMonths: 12,
        delivery: "",
        ownerName: a.customer.name,
        email: a.customer.email,
        createdOn: "2026-01-01",
      });
    }
    await executeLiveBookOperation(db, desk, { action: "agreement.markSigned", id: signedId });
    await executeLiveBookOperation(db, desk, {
      action: "agreement.recordEnd",
      id: endedId,
      end: { kind: "bought_back", date: "2026-09-17", amount: 11000 },
    });
    for (const id of [signedId, endedId]) {
      await assert.rejects(
        () => executeLiveBookOperation(db, desk, {
          action: "agreement.updateScale",
          id,
          termMonths: 12,
          scale: {
            purchaseShare: 0.6,
            setupFee: 0.01,
            annualAdjustment: 0.185,
            earlyRepurchaseAmount: 0.035,
            brokerFee: 0.035,
          },
        }),
        { message: "AGREEMENT_IMMUTABLE" },
      );
      await assert.rejects(
        () => executeLiveBookOperation(db, desk, { action: "agreement.remove", id }),
        { message: "AGREEMENT_IMMUTABLE" },
      );
    }
  });
});
