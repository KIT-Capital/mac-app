import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELIVERY_DAYS,
  REQUEST_RESPONSE_DAYS,
  applyTransition,
  isTerminalRequestStatus,
  nextAllowedActions,
  retailRequestWord,
} from "./request-transitions.mjs";

const RETAIL = { kind: "retail", id: "cust-1" };
const DESK_ADMIN = { kind: "desk", id: "staff-admin", role: "admin" };
const APPRAISER = { kind: "desk", id: "staff-dov", role: "appraiser" };
const SYSTEM = { kind: "system", id: "system" };

function request(patch = {}) {
  return {
    id: "req-1",
    status: "submitted",
    version: 1,
    amount: 120000,
    watchIds: ["rm-011"],
    lastActionAt: "2026-09-01T12:00:00.000Z",
    ...patch,
  };
}

const CTX = { now: "2026-09-10T12:00:00.000Z", today: "2026-09-10" };

describe("request transition table", () => {
  it("walks the happy path from apply to execution", () => {
    const submitted = request();
    // Nothing to argue down yet: the Desk owes the first answer.
    assert.deepEqual(nextAllowedActions(submitted, RETAIL), ["withdraw"]);

    const confirmed = applyTransition(submitted, { action: "deskReturn", decision: "confirm" }, {
      ...CTX,
      actor: DESK_ADMIN,
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.agreement.status, "returned");
    // Confirming the amount the collector already chose changes no money.
    assert.equal(confirmed.agreement.version, 1);
    assert.equal(confirmed.mintsStage, undefined);

    const signed = applyTransition(confirmed.agreement, { action: "signCollector" }, {
      ...CTX,
      actor: RETAIL,
    });
    assert.equal(signed.ok, true);
    assert.equal(signed.agreement.status, "collector_signed");
    assert.equal(signed.mintsStage, "collector_signed");

    const delivered = applyTransition(signed.agreement, { action: "recordDelivery" }, {
      ...CTX,
      actor: DESK_ADMIN,
    });
    assert.equal(delivered.agreement.status, "inspecting");

    const executed = applyTransition(delivered.agreement, { action: "executeMac" }, {
      ...CTX,
      actor: APPRAISER,
    });
    assert.equal(executed.ok, true);
    assert.equal(executed.agreement.status, "executed");
    assert.equal(executed.agreement.executedOn, "2026-09-10");
    assert.equal(executed.mintsStage, "executed");
  });

  it("lets no one move the amount before inspection", () => {
    // The app exists to avoid negotiation: the Desk confirms or declines, and
    // the owner signs, declines, or withdraws. There is no counter-offer cell.
    assert.deepEqual(
      applyTransition(
        request(),
        { action: "deskReturn", decision: "lower", amount: 90000 },
        { ...CTX, actor: DESK_ADMIN },
      ),
      { ok: false, error: "REQUEST_DECISION_INVALID" },
    );
    assert.deepEqual(
      applyTransition(
        request({ status: "returned" }),
        { action: "askLower", amount: 80000 },
        { ...CTX, actor: RETAIL },
      ),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
    // A confirm carries the amount the owner chose, even if one is sent along.
    const confirmed = applyTransition(
      request(),
      { action: "deskReturn", decision: "confirm", amount: 90000 },
      { ...CTX, actor: DESK_ADMIN },
    );
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.agreement.amount, 120000);
    assert.equal(confirmed.agreement.version, 1);
    assert.equal(confirmed.mintsStage, undefined);
  });

  it("bumps the version and mints a proposal only when inspection amends", () => {
    const amended = applyTransition(
      request({ status: "inspecting" }),
      { action: "amend", amount: 90000, watchIds: ["rm-011"] },
      { ...CTX, actor: APPRAISER },
    );
    assert.equal(amended.ok, true);
    assert.equal(amended.agreement.status, "returned");
    assert.equal(amended.agreement.version, 2);
    assert.equal(amended.agreement.amount, 90000);
    assert.equal(amended.mintsStage, "proposal");
  });

  it("refuses a round that changes nothing", () => {
    // Re-appraising to the same offer is not a new round. Minting a version and
    // a fresh proposal for it would ask the owner to sign the same paper twice.
    // An amendment that drops a piece is a real change at the same amount.
    const dropped = applyTransition(
      request({ status: "inspecting", watchIds: ["rm-011", "pp-nautilus"] }),
      { action: "amend", amount: 120000, watchIds: ["rm-011"] },
      { ...CTX, actor: APPRAISER },
    );
    assert.equal(dropped.ok, true);
    assert.equal(dropped.agreement.version, 2);
    assert.deepEqual(
      applyTransition(
        request({ status: "inspecting" }),
        { action: "amend", amount: 120000, watchIds: ["rm-011"] },
        { ...CTX, actor: APPRAISER },
      ),
      { ok: false, error: "REQUEST_NO_CHANGE" },
    );
  });

  it("never lets an amendment raise the amount", () => {
    assert.deepEqual(
      applyTransition(
        request({ status: "inspecting" }),
        { action: "amend", amount: 120001, watchIds: ["rm-011"] },
        { ...CTX, actor: APPRAISER },
      ),
      { ok: false, error: "AMOUNT_RAISE_FORBIDDEN" },
    );
    assert.deepEqual(
      applyTransition(
        request({ status: "inspecting" }),
        { action: "amend", watchIds: ["rm-011"] },
        { ...CTX, actor: APPRAISER },
      ),
      { ok: false, error: "AMOUNT_REQUIRED" },
    );
  });

  it("closes with the reason that matches who closed it", () => {
    const deskDecline = applyTransition(
      request(),
      { action: "deskReturn", decision: "decline", note: "Not a fit." },
      { ...CTX, actor: DESK_ADMIN },
    );
    assert.equal(deskDecline.agreement.status, "closed");
    assert.equal(deskDecline.agreement.closeReason, "declined_by_desk");

    const collectorDecline = applyTransition(
      request({ status: "returned" }),
      { action: "decline" },
      { ...CTX, actor: RETAIL },
    );
    assert.equal(collectorDecline.agreement.closeReason, "declined_by_collector");

    const withdrawn = applyTransition(request(), { action: "withdraw" }, { ...CTX, actor: RETAIL });
    assert.equal(withdrawn.agreement.closeReason, "withdrawn");

    const expired = applyTransition(
      request({ status: "returned" }),
      { action: "expire" },
      { ...CTX, actor: SYSTEM },
    );
    assert.equal(expired.agreement.closeReason, "expired");
  });

  it("refuses a cell that is not on the table", () => {
    assert.deepEqual(
      applyTransition(request({ status: "executed", executedOn: "2026-09-01" }), { action: "withdraw" }, {
        ...CTX,
        actor: RETAIL,
      }),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
    assert.deepEqual(
      applyTransition(request({ status: "closed", closeReason: "withdrawn" }), { action: "signCollector" }, {
        ...CTX,
        actor: RETAIL,
      }),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
    assert.deepEqual(
      applyTransition(request({ status: "collector_signed" }), { action: "askLower", amount: 1000 }, {
        ...CTX,
        actor: RETAIL,
      }),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
    // Each turn belongs to one side: nothing to decline before a proposal
    // exists, and the Desk does not replace a proposal the owner is holding.
    assert.deepEqual(
      applyTransition(request(), { action: "askLower", amount: 90000 }, { ...CTX, actor: RETAIL }),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
    assert.deepEqual(
      applyTransition(request(), { action: "decline" }, { ...CTX, actor: RETAIL }),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
    assert.deepEqual(
      applyTransition(
        request({ status: "returned" }),
        { action: "deskReturn", decision: "confirm" },
        { ...CTX, actor: DESK_ADMIN },
      ),
      { ok: false, error: "AGREEMENT_STATE_CONFLICT" },
    );
  });

  it("keeps each action with the actor kind that owns it", () => {
    assert.deepEqual(
      applyTransition(request(), { action: "deskReturn", decision: "confirm" }, { ...CTX, actor: RETAIL }),
      { ok: false, error: "ROLE_FORBIDDEN" },
    );
    assert.deepEqual(
      applyTransition(request({ status: "returned" }), { action: "signCollector" }, {
        ...CTX,
        actor: DESK_ADMIN,
      }),
      { ok: false, error: "ROLE_FORBIDDEN" },
    );
    assert.deepEqual(
      applyTransition(request({ status: "returned" }), { action: "expire" }, { ...CTX, actor: RETAIL }),
      { ok: false, error: "ROLE_FORBIDDEN" },
    );
  });

  it("reserves inspection and the MAC signature for an appraiser", () => {
    const inspecting = request({ status: "inspecting" });
    assert.deepEqual(
      applyTransition(inspecting, { action: "executeMac" }, { ...CTX, actor: DESK_ADMIN }),
      { ok: false, error: "ROLE_FORBIDDEN" },
    );
    assert.equal(
      applyTransition(inspecting, { action: "executeMac" }, { ...CTX, actor: APPRAISER }).ok,
      true,
    );
    const amended = applyTransition(
      inspecting,
      { action: "amend", amount: 100000, watchIds: ["rm-011"] },
      { ...CTX, actor: APPRAISER },
    );
    assert.equal(amended.agreement.status, "returned");
    assert.equal(amended.agreement.version, 2);
    assert.equal(amended.mintsStage, "proposal");
  });

  it("records one event per applied transition", () => {
    const declined = applyTransition(
      request(),
      { action: "deskReturn", decision: "decline", note: "Not a fit." },
      { ...CTX, actor: DESK_ADMIN },
    );
    assert.deepEqual(declined.event, {
      action: "deskReturn",
      actorKind: "desk",
      actorId: "staff-admin",
      fromStatus: "submitted",
      toStatus: "closed",
      amount: 120000,
      version: 1,
      note: "Not a fit.",
      internal: false,
      createdAt: "2026-09-10T12:00:00.000Z",
    });
  });

  it("offers the retail user only what their state allows", () => {
    assert.deepEqual(nextAllowedActions(request({ status: "returned" }), RETAIL), [
      "signCollector",
      "decline",
      "withdraw",
    ]);
    // Signed and shipped, but MAC has not signed or paid: the owner may still
    // pull out, and R27 then owes them a recorded return of the pieces.
    assert.deepEqual(nextAllowedActions(request({ status: "collector_signed" }), RETAIL), [
      "withdraw",
    ]);
    assert.deepEqual(nextAllowedActions(request({ status: "inspecting" }), RETAIL), ["withdraw"]);
    assert.deepEqual(nextAllowedActions(request({ status: "executed", executedOn: "2026-09-01" }), RETAIL), []);
    assert.deepEqual(nextAllowedActions(request({ status: "submitted" }), DESK_ADMIN), [
      "deskReturn",
      "flagCustomerSuccess",
    ]);
    // An admin reviews; only an appraiser inspects, amends, or signs for MAC.
    assert.deepEqual(nextAllowedActions(request({ status: "inspecting" }), DESK_ADMIN), [
      "flagCustomerSuccess",
    ]);
    assert.deepEqual(nextAllowedActions(request({ status: "inspecting" }), APPRAISER), [
      "amend",
      "executeMac",
      "declineAtInspection",
      "flagCustomerSuccess",
    ]);
  });

  it("speaks the four retail words and nothing internal", () => {
    assert.equal(retailRequestWord({ status: "submitted" }), "With MAC");
    assert.equal(retailRequestWord({ status: "returned" }), "Your turn");
    assert.equal(retailRequestWord({ status: "collector_signed" }), "With MAC");
    assert.equal(retailRequestWord({ status: "inspecting" }), "With MAC");
    assert.equal(retailRequestWord({ status: "executed" }), "Active");
    assert.equal(retailRequestWord({ status: "closed" }), "Closed");
  });

  it("treats a closed request as terminal", () => {
    assert.equal(isTerminalRequestStatus("closed"), true);
    assert.equal(isTerminalRequestStatus("executed"), true);
    assert.equal(isTerminalRequestStatus("returned"), false);
  });

  it("ships the expiry windows the server enforces", () => {
    assert.equal(REQUEST_RESPONSE_DAYS, 14);
    assert.equal(DELIVERY_DAYS, 30);
  });
});
