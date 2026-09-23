import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DELIVERY_DAYS,
  REQUEST_RESPONSE_DAYS,
  applyTransition,
  deskEventLine,
  deskRequestTab,
  forbiddenCopyWarning,
  hasRecordReturn,
  inspectPreview,
  isRequestRow,
  isTerminalRequestStatus,
  nextAllowedActions,
  releasedWatchIds,
  retailEventLine,
  retailListWord,
  retailRequestLine,
  retailRequestWord,
  startAgainHref,
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
    // The collector may accept the terms now. The Desk may still answer first.
    assert.deepEqual(nextAllowedActions(submitted, RETAIL), ["signCollector", "withdraw"]);

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

  it("accepts the terms from the request the collector just sent", () => {
    const accepted = applyTransition(request(), { action: "signCollector" }, {
      ...CTX,
      actor: RETAIL,
    });
    assert.equal(accepted.ok, true);
    assert.equal(accepted.agreement.status, "collector_signed");
    assert.equal(accepted.mintsStage, "collector_signed");
    assert.equal(accepted.agreement.version, 1);
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

  it("does not move lastActionAt on an internal desk flag", () => {
    const flagged = applyTransition(
      request({ lastActionAt: "2026-09-01T12:00:00.000Z" }),
      { action: "flagCustomerSuccess" },
      { ...CTX, actor: DESK_ADMIN },
    );
    assert.equal(flagged.ok, true);
    assert.equal(flagged.agreement.status, "submitted");
    assert.equal(flagged.agreement.lastActionAt, "2026-09-01T12:00:00.000Z");
    assert.equal(flagged.agreement.version, 1);
    assert.equal(flagged.event.internal, true);
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
    assert.equal(
      retailRequestWord({ status: "returned", lastActionAt: "2026-08-01T12:00:00.000Z" }, "2026-09-20"),
      "Closed",
    );
    assert.equal(
      retailRequestWord({ status: "returned", lastActionAt: "2026-09-19T12:00:00.000Z" }, "2026-09-20"),
      "Your turn",
    );
  });

  it("treats unexecuted request statuses as request rows", () => {
    assert.equal(isRequestRow({ status: "submitted" }), true);
    assert.equal(isRequestRow({ status: "closed" }), true);
    assert.equal(isRequestRow({ status: "executed", executedOn: "2026-09-01" }), false);
    assert.equal(isRequestRow({ status: "pending_signature" }), false);
    assert.equal(isRequestRow({ status: "signed", signedAt: "2026-09-01" }), false);
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

  it("groups list rows under the four retail words", () => {
    assert.equal(retailListWord({ status: "returned" }), "Your turn");
    assert.equal(retailListWord({ status: "submitted" }), "With MAC");
    assert.equal(retailListWord({ status: "executed", executedOn: "2026-09-01" }), "Active");
    assert.equal(
      retailListWord({ status: "executed", executedOn: "2026-09-01", bookEnd: { kind: "bought_back" } }),
      "Closed",
    );
    assert.equal(retailListWord({ status: "closed" }), "Closed");
  });

  it("writes one retail line per request word and never an internal status", () => {
    assert.equal(retailRequestLine({ status: "submitted" }), "MAC is reviewing your request.");
    assert.equal(retailRequestLine({ status: "returned", version: 1 }), "MAC confirmed your request.");
    assert.equal(
      retailRequestLine({ status: "returned", version: 2 }),
      "MAC inspected the pieces. Sign the new amount.",
    );
    assert.equal(retailRequestLine({ status: "collector_signed" }), "Awaiting inspection.");
    assert.equal(
      retailRequestLine({ status: "closed", deliveredOn: "2026-09-18" }),
      "Awaiting return of your pieces.",
    );
    assert.equal(
      retailRequestLine({
        status: "closed",
        deliveredOn: "2026-09-18",
        events: [{ action: "recordReturn" }],
      }),
      "This request is closed.",
    );
    assert.match(retailRequestLine({ status: "submitted" }), /^(?!.*\b(submitted|returned|inspecting|collector_signed)\b).*$/i);
  });

  it("labels the thread without internal status words", () => {
    assert.equal(retailEventLine({ action: "submit" }), "You sent this request.");
    assert.equal(retailEventLine({ action: "deskReturn", toStatus: "returned" }), "MAC confirmed your request.");
    assert.equal(retailEventLine({ action: "deskReturn", toStatus: "closed" }), "MAC declined this request.");
    assert.equal(retailEventLine({ action: "flagCustomerSuccess" }), "");
    assert.equal(retailEventLine({ action: "flagCustomerSuccess", internal: true, note: "VIP handling." }), "");
    assert.match(retailEventLine({ action: "signCollector" }), /^(?!.*\b(submitted|returned|inspecting|collector_signed)\b).*$/i);
  });

  it("starts again with the original pieces and names released ones", () => {
    const row = {
      watchIds: ["kept"],
      pieceCaps: { kept: 30000, dropped: 30000 },
    };
    assert.deepEqual(releasedWatchIds(row), ["dropped"]);
    assert.equal(startAgainHref(row), "/repurchase/new?watches=kept,dropped");
  });

  it("puts Desk rows on Queue through Closed, and Hale on Book", () => {
    assert.equal(deskRequestTab(request({ status: "submitted" })), "queue");
    assert.equal(deskRequestTab(request({ status: "returned" })), "awaiting-collector");
    assert.equal(deskRequestTab(request({ status: "collector_signed" })), "awaiting-intake");
    assert.equal(deskRequestTab(request({ status: "inspecting" })), "inspection");
    assert.equal(deskRequestTab(request({ status: "closed" })), "closed");
    assert.equal(deskRequestTab({ status: "executed", executedOn: "2019-03-14" }), "book");
    assert.equal(hasRecordReturn({ events: [{ action: "recordReturn" }] }), true);
    assert.equal(hasRecordReturn({ events: [{ action: "executeMac" }] }), false);
  });

  it("previews inspection without letting the appraiser type the amount", () => {
    const signed = request({ amount: 180000, scale: { purchaseShare: 0.6 } });
    const three = [
      { timepieceId: "a", decision: "confirm", inspectedValueCents: 12_000_000 },
      { timepieceId: "b", decision: "confirm", inspectedValueCents: 12_000_000 },
      { timepieceId: "c", decision: "drop" },
    ];
    const returned = inspectPreview(signed, three);
    assert.equal(returned.kind, "return");
    assert.equal(returned.amount, 144000);
    assert.equal(inspectPreview(signed, [
      { timepieceId: "a", decision: "confirm", inspectedValueCents: 12_000_000 },
      { timepieceId: "b", decision: "confirm", inspectedValueCents: 12_000_000 },
      { timepieceId: "c", decision: "confirm", inspectedValueCents: 12_000_000 },
    ]).kind, "execute");
    assert.equal(inspectPreview(signed, [
      { timepieceId: "a", decision: "refuse" },
      { timepieceId: "b", decision: "drop" },
    ]).kind, "decline");
  });

  it("labels the desk thread, including the customer-success flag", () => {
    assert.equal(deskEventLine({ action: "flagCustomerSuccess" }), "Customer-success flag updated.");
    assert.equal(deskEventLine({ action: "deskReturn", toStatus: "returned" }), "Desk confirmed this request.");
    assert.match(deskEventLine({ action: "signCollector" }), /Collector signed/);
  });

  it("warns before sending a desk note that uses a forbidden word", () => {
    assert.equal(forbiddenCopyWarning("Called the collector about intake."), "");
    assert.match(forbiddenCopyWarning("This is not a loan."), /word MAC does not use/i);
  });
});
