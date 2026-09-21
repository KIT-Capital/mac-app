import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  APPRAISAL_VALID_DAYS,
  addCalendarMonths,
  applyAgreementEnd,
  appraisalReviewControls,
  appraisalView,
  bookLabel,
  canRetailEditPiece,
  clearAgreementEnd,
  completedAppraisalDecisions,
  isAppraisalCurrent,
  isUnderReview,
  missingEvidenceKinds,
  nextAppraisalAttemptNo,
  piecesFinallyAcceptedForRepo,
  validateRecordedEndKind,
} from "./repo-book.mjs";

/** Hale demo fixture: 2021-03-14, 12 months, pending signature. Matches lib/seed.ts. */
const HALE = {
  id: "agr-31419",
  watchIds: ["rm-011", "pp-nautilus"],
  amount: 200000,
  termMonths: 12,
  delivery: "Desk arranges intake",
  ownerName: "Jonathan Hale",
  email: "jonathan.hale@mechartcap.com",
  status: "executed",
  createdAt: "2021-03-14",
  executedOn: "2021-03-14",
};

describe("addCalendarMonths", () => {
  it("adds whole calendar months on the same day of month", () => {
    assert.equal(addCalendarMonths("2021-03-14", 12), "2022-03-14");
    assert.equal(addCalendarMonths("2025-09-16", 12), "2026-09-16");
  });

  it("clamps March 31 instead of using Date.setMonth overflow", () => {
    assert.equal(addCalendarMonths("2021-03-31", 12), "2022-03-31");
    assert.equal(addCalendarMonths("2021-03-31", 1), "2021-04-30");
    assert.equal(addCalendarMonths("2021-01-31", 1), "2021-02-28");
    assert.equal(addCalendarMonths("2020-01-31", 1), "2020-02-29");
  });
});

describe("appraisal attempt predicates", () => {
  const attempts = [
    { timepieceId: "watch-a", attemptNo: 1, decisionNo: 1, status: "refused" },
    { timepieceId: "watch-a", attemptNo: 2, decisionNo: null, status: "returned" },
    { timepieceId: "watch-a", attemptNo: 3, decisionNo: 2, status: "accepted" },
    { timepieceId: "watch-b", attemptNo: 1, decisionNo: null, status: "under_review" },
  ];

  it("counts decisions separately from submission snapshots", () => {
    assert.equal(completedAppraisalDecisions(attempts, "watch-a"), 2);
    assert.equal(nextAppraisalAttemptNo(attempts, "watch-a"), 4);
    assert.equal(nextAppraisalAttemptNo(attempts, "watch-c"), 1);
  });

  it("finds the one open review and applies the retail edit lock", () => {
    assert.equal(isUnderReview(attempts, "watch-a"), false);
    assert.equal(isUnderReview(attempts, "watch-b"), true);
    assert.deepEqual(canRetailEditPiece(attempts, "watch-b", false), {
      ok: false,
      error: "REVIEW_LOCKED",
    });
    assert.deepEqual(canRetailEditPiece(attempts, "watch-a", true), {
      ok: false,
      error: "PIECE_HELD",
    });
    assert.deepEqual(canRetailEditPiece(attempts, "watch-a", false), { ok: true });
  });
});

describe("appraisalView", () => {
  const accepted = {
    id: "att-1",
    timepieceId: "watch-a",
    attemptNo: 1,
    decisionNo: 1,
    status: "accepted",
    valueCents: 12_000_000,
  };

  it("reads not sent for a piece with no attempt and no legacy status", () => {
    assert.deepEqual(appraisalView([], "watch-a", { status: "not_evaluated" }), {
      word: "not_sent",
      decisionsUsed: 0,
      value: undefined,
      openAttempt: undefined,
      returnedAttempt: undefined,
      latestDecision: undefined,
    });
  });

  it("shows the collector one word per state", () => {
    assert.equal(
      appraisalView([{ ...accepted, decisionNo: null, status: "under_review" }], "watch-a").word,
      "with_mac",
    );
    assert.equal(appraisalView([accepted], "watch-a").word, "accepted");
    assert.equal(
      appraisalView([{ ...accepted, status: "refused", valueCents: undefined }], "watch-a").word,
      "not_accepted",
    );
  });

  it("counts decisions rather than submissions and exposes the accepted value", () => {
    const view = appraisalView(
      [
        { ...accepted, id: "att-1", attemptNo: 1, decisionNo: 1, status: "refused", valueCents: undefined },
        { ...accepted, id: "att-2", attemptNo: 2, decisionNo: null, status: "returned", valueCents: undefined },
        { ...accepted, id: "att-3", attemptNo: 3, decisionNo: 2 },
      ],
      "watch-a",
    );
    assert.equal(view.decisionsUsed, 2);
    assert.equal(view.word, "accepted");
    assert.equal(view.value, 120_000);
    assert.equal(view.latestDecision.id, "att-3");
  });

  it("closes the piece after the third decision and reopens with the appraiser", () => {
    const three = [1, 2, 3].map((number) => ({
      ...accepted,
      id: `att-${number}`,
      attemptNo: number,
      decisionNo: number,
      status: "refused",
      valueCents: undefined,
    }));
    assert.equal(appraisalView(three, "watch-a").word, "closed");
    const reopened = three.map((attempt, index) =>
      index === 2 ? { ...attempt, status: "under_review" } : attempt,
    );
    assert.equal(appraisalView(reopened, "watch-a").word, "with_mac");
    assert.equal(appraisalView(reopened, "watch-a").openAttempt.id, "att-3");
  });

  it("surfaces a newest returned submission so the collector learns what to fix", () => {
    const returned = {
      id: "att-2",
      timepieceId: "watch-a",
      attemptNo: 2,
      decisionNo: null,
      status: "returned",
      responseNote: "Add a clearer caseback photo.",
    };
    const afterRefusal = appraisalView(
      [
        { ...accepted, id: "att-1", attemptNo: 1, decisionNo: 1, status: "refused", valueCents: undefined },
        returned,
      ],
      "watch-a",
    );
    assert.equal(afterRefusal.returnedAttempt?.responseNote, "Add a clearer caseback photo.");
    assert.equal(afterRefusal.decisionsUsed, 1);

    // A resubmission supersedes the return, so its note stops being current.
    const resubmitted = appraisalView(
      [
        { ...accepted, id: "att-1", attemptNo: 1, decisionNo: 1, status: "refused", valueCents: undefined },
        returned,
        { ...returned, id: "att-3", attemptNo: 3, status: "under_review", responseNote: undefined },
      ],
      "watch-a",
    );
    assert.equal(resubmitted.returnedAttempt, undefined);
    assert.equal(resubmitted.word, "with_mac");
  });

  it("reads a legacy reviewing piece with no submission as not sent", () => {
    // Nothing writes `reviewing` without an attempt any more, so a legacy row
    // must stay sendable instead of stranding on a review that cannot exist.
    assert.equal(appraisalView([], "watch-a", { status: "reviewing" }).word, "not_sent");
    assert.equal(appraisalView([], "watch-a", { status: "appraised" }).word, "accepted");
  });
});

describe("isAppraisalCurrent", () => {
  const today = "2026-09-20";
  const accepted = (daysAgo, patch = {}) => ({
    timepieceId: "watch-a",
    attemptNo: 1,
    decisionNo: 1,
    status: "accepted",
    decidedAt: `2026-09-${String(20 - daysAgo).padStart(2, "0")}T15:00:00.000Z`,
    ...patch,
  });

  it("ships a seven-day window (R42)", () => {
    assert.equal(APPRAISAL_VALID_DAYS, 7);
  });

  it("treats an Accept as current through its seventh day", () => {
    assert.equal(isAppraisalCurrent([accepted(6)], "watch-a", today), true);
    assert.equal(isAppraisalCurrent([accepted(7)], "watch-a", today), true);
    assert.equal(isAppraisalCurrent([accepted(8)], "watch-a", today), false);
  });

  it("counts a late-evening New York accept on the New York day, not UTC", () => {
    const evening = {
      timepieceId: "watch-a",
      attemptNo: 1,
      decisionNo: 1,
      status: "accepted",
      decidedAt: "2026-09-13T03:00:00.000Z",
    };
    assert.equal(isAppraisalCurrent([evening], "watch-a", "2026-09-19"), true);
    assert.equal(isAppraisalCurrent([evening], "watch-a", "2026-09-20"), false);
  });

  it("reads the latest accepted decision, not an older one", () => {
    // A fresh refusal after an old Accept leaves nothing current to apply on.
    const stale = accepted(20, { attemptNo: 1, decisionNo: 1 });
    const refused = accepted(2, { attemptNo: 2, decisionNo: 2, status: "refused" });
    assert.equal(isAppraisalCurrent([stale, refused], "watch-a", today), false);
    // Only this piece's attempts count.
    assert.equal(isAppraisalCurrent([accepted(1)], "watch-b", today), false);
  });

  it("is never current without a completed Accept", () => {
    assert.equal(isAppraisalCurrent([accepted(1, { status: "refused" })], "watch-a", today), false);
    assert.equal(
      isAppraisalCurrent([accepted(1, { decisionNo: null, status: "under_review" })], "watch-a", today),
      false,
    );
    assert.equal(isAppraisalCurrent([accepted(1, { decidedAt: undefined })], "watch-a", today), false);
    assert.equal(isAppraisalCurrent([], "watch-a", today), false);
  });

  it("honours a legacy appraised piece only through its evaluation date", () => {
    assert.equal(
      isAppraisalCurrent([], "watch-a", today, { status: "appraised", evaluatedAt: "2026-09-17" }),
      true,
    );
    assert.equal(
      isAppraisalCurrent([], "watch-a", today, { status: "appraised", evaluatedAt: "2026-09-12" }),
      false,
    );
    assert.equal(isAppraisalCurrent([], "watch-a", today, { status: "appraised" }), false);
    assert.equal(isAppraisalCurrent([], "watch-a", today, { status: "not_evaluated" }), false);
    // Once attempts exist they are the truth; the legacy status stops counting.
    assert.equal(
      isAppraisalCurrent([accepted(1, { status: "refused" })], "watch-a", today, {
        status: "appraised",
        evaluatedAt: "2026-09-19",
      }),
      false,
    );
  });
});

describe("missingEvidenceKinds", () => {
  const required = ["front", "back", "clasp"];

  it("counts a stored object id and a browser data URL as evidence", () => {
    const photos = [
      { assetId: "watch-a", kind: "front", url: "ph-9f2c1" },
      { assetId: "watch-a", kind: "back", url: "data:image/jpeg;base64,abc" },
      { assetId: "watch-a", kind: "clasp", url: "ph-9f2c2" },
    ];
    assert.deepEqual(missingEvidenceKinds(photos, "watch-a", required), []);
  });

  it("refuses a legacy preview path, which the server cannot freeze", () => {
    const photos = [
      { assetId: "watch-a", kind: "front", url: "/watches/royal-oak.jpg" },
      { assetId: "watch-a", kind: "back", url: "https://cdn.example/back.jpg" },
      { assetId: "watch-a", kind: "clasp", url: "ph-9f2c2" },
    ];
    assert.deepEqual(missingEvidenceKinds(photos, "watch-a", required), ["front", "back"]);
  });

  it("ignores another piece's photographs", () => {
    const photos = [{ assetId: "watch-b", kind: "front", url: "ph-1" }];
    assert.deepEqual(missingEvidenceKinds(photos, "watch-a", required), required);
  });

  it("refuses a local data preview in live mode, where only stored objects count", () => {
    const photos = [
      { assetId: "watch-a", kind: "front", url: "data:image/jpeg;base64,abc" },
      { assetId: "watch-a", kind: "back", url: "ph-9f2c1" },
      { assetId: "watch-a", kind: "clasp", url: "ph-9f2c2" },
    ];
    assert.deepEqual(missingEvidenceKinds(photos, "watch-a", required, { allowDataUrls: false }), [
      "front",
    ]);
    assert.deepEqual(missingEvidenceKinds(photos, "watch-a", required), []);
  });
});

describe("appraisalReviewControls", () => {
  const decided = {
    id: "att-1",
    status: "refused",
    decisionNo: 1,
    decidedByStaffId: "staff-a",
  };
  const open = { id: "att-2", status: "under_review", decisionNo: null };
  const appraiserA = { role: "appraiser", staffId: "staff-a" };
  const appraiserB = { role: "appraiser", staffId: "staff-b" };
  const superAdmin = { role: "super_admin", staffId: "staff-rc" };
  const admin = { role: "admin", staffId: "staff-admin" };

  it("lets an appraiser decide an open review but never an admin", () => {
    assert.equal(appraisalReviewControls(open, appraiserA).canDecide, true);
    assert.equal(appraisalReviewControls(open, appraiserB).canDecide, true);
    assert.equal(appraisalReviewControls(open, admin).canDecide, false);
    assert.equal(appraisalReviewControls(open, admin).readOnly, true);
  });

  it("reserves reopen for the deciding appraiser and a super admin", () => {
    assert.equal(appraisalReviewControls(decided, appraiserA).canReopen, true);
    assert.equal(appraisalReviewControls(decided, appraiserB).canReopen, false);
    assert.equal(appraisalReviewControls(decided, superAdmin).canReopen, true);
    assert.equal(appraisalReviewControls(decided, admin).canReopen, false);
  });

  it("offers no decision controls on an attempt that is not under review", () => {
    assert.equal(appraisalReviewControls(decided, appraiserA).canDecide, false);
    assert.equal(appraisalReviewControls(decided, appraiserA).canReturn, false);
    assert.equal(appraisalReviewControls(open, appraiserA).canReopen, false);
  });

  it("refuses a desk actor with no identity at all", () => {
    assert.equal(appraisalReviewControls(open, { role: "appraiser" }).canDecide, false);
  });

  it("identifies a browser-book appraiser by email and keeps reopen with its owner", () => {
    const browserOwner = { role: "appraiser", email: "Desk@mechartcap.com" };
    const browserOther = { role: "appraiser", email: "other@mechartcap.com" };
    const browserDecided = { ...decided, decidedByStaffId: "browser:desk@mechartcap.com" };
    assert.equal(appraisalReviewControls(open, browserOwner).canDecide, true);
    assert.equal(appraisalReviewControls(browserDecided, browserOwner).canReopen, true);
    assert.equal(appraisalReviewControls(browserDecided, browserOther).canReopen, false);
  });

  it("defers to the server when the decision id cannot be compared", () => {
    // A live desk client knows its email, never its staff account id.
    const liveClient = { role: "appraiser", email: "dov@mechartcap.com" };
    assert.equal(appraisalReviewControls(decided, liveClient).canReopen, true);
  });

  it("keeps a re-decision after reopen with its owner", () => {
    const reopened = { ...decided, status: "under_review" };
    assert.equal(appraisalReviewControls(reopened, appraiserA).canDecide, true);
    assert.equal(appraisalReviewControls(reopened, appraiserB).canDecide, false);
    assert.equal(appraisalReviewControls(reopened, superAdmin).canDecide, true);
  });
});

describe("bookLabel", () => {
  it("reads Hale with no end as past due while signature stays pending", () => {
    assert.equal(bookLabel(HALE, "2026-09-16"), "past due");
    assert.equal(HALE.status, "executed");
  });

  it("reads a new agreement created today with no end as open", () => {
    const today = "2026-09-16";
    const fresh = { ...HALE, id: "agr-new", createdAt: today, executedOn: today, termMonths: 12 };
    assert.equal(bookLabel(fresh, today), "open");
  });

    it("lets a recorded end win: bought back, in liquidation, liquidated, renewed", () => {
    const bought = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    assert.equal(bought.ok, true);
    assert.equal(bookLabel(bought.agreement, "2026-09-16"), "bought back");

    const liquidating = applyAgreementEnd(
      HALE,
      { kind: "in_liquidation", date: "2023-01-02", amount: 180000 },
      "2026-09-16",
    );
    assert.equal(bookLabel(liquidating.agreement, "2026-09-16"), "in liquidation");

    const liquidated = applyAgreementEnd(
      HALE,
      { kind: "liquidated", date: "2023-06-01", amount: 150000 },
      "2026-09-16",
    );
    assert.equal(bookLabel(liquidated.agreement, "2026-09-16"), "liquidated");

    const renewed = applyAgreementEnd(
      HALE,
      { kind: "renewed", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    assert.equal(renewed.ok, true);
    assert.equal(bookLabel(renewed.agreement, "2026-09-16"), "renewed");
  });

  it("rejects a renewed end that is missing a date or amount", () => {
    const today = "2026-09-16";
    const missingDate = applyAgreementEnd(HALE, { kind: "renewed", date: "", amount: 245000 }, today);
    const missingAmount = applyAgreementEnd(HALE, { kind: "renewed", date: "2022-03-14" }, today);
    assert.equal(missingDate.ok, false);
    assert.deepEqual(missingDate.agreement, HALE);
    assert.equal(missingAmount.ok, false);
    assert.deepEqual(missingAmount.agreement, HALE);
    assert.equal(HALE.bookEnd, undefined);
  });

  it("keeps a renewed end when signature is later marked signed", () => {
    const ended = applyAgreementEnd(
      HALE,
      { kind: "renewed", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const signed = {
      ...ended.agreement,
      status: "signed",
      signedAt: "2026-09-16",
    };
    assert.equal(bookLabel(signed, "2026-09-16"), "renewed");
    assert.equal(signed.status, "signed");
    assert.deepEqual(signed.bookEnd, ended.agreement.bookEnd);
  });

  it("keeps the book label when signature is marked signed", () => {
    const ended = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const signed = {
      ...ended.agreement,
      status: "signed",
      signedAt: "2026-09-16",
    };
    assert.equal(bookLabel(signed, "2026-09-16"), "bought back");
    assert.equal(signed.status, "signed");
    assert.deepEqual(signed.bookEnd, ended.agreement.bookEnd);
    assert.equal(bookLabel(HALE, "2026-09-16"), "past due");
  });

  it("treats the term date as inclusive last open day", () => {
    const fixture = { ...HALE, createdAt: "2025-09-16", executedOn: "2025-09-16", termMonths: 12 };
    assert.equal(bookLabel(fixture, "2026-09-16"), "open");
    assert.equal(bookLabel(fixture, "2026-09-17"), "past due");
  });

  it("returns past due after staff clears Hale's end", () => {
    const ended = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const cleared = clearAgreementEnd(ended.agreement);
    assert.equal(bookLabel(cleared, "2026-09-16"), "past due");
    assert.equal(cleared.status, "executed");
    assert.equal(cleared.bookEnd, undefined);
  });

  it("never auto-toggles in liquidation from modeled liquidation dollars", () => {
    const modeled = { ...HALE, modeledLiquidation: 88000 };
    assert.equal(bookLabel(modeled, "2026-09-16"), "past due");
  });
});

describe("validateRecordedEndKind", () => {
  it("reserves renewed for the admin renewal transaction", () => {
    assert.deepEqual(validateRecordedEndKind("bought_back"), { ok: true });
    assert.deepEqual(validateRecordedEndKind("in_liquidation"), { ok: true });
    assert.deepEqual(validateRecordedEndKind("liquidated"), { ok: true });
    assert.deepEqual(validateRecordedEndKind("renewed"), {
      ok: false,
      error: "ADMIN_RENEW_REQUIRED",
    });
  });
});

describe("applyAgreementEnd", () => {
  it("rejects missing date, date before createdAt, date after today, or non-finite amount", () => {
    const today = "2026-09-16";
    const cases = [
      { kind: "bought_back", date: "", amount: 100 },
      { kind: "bought_back", date: "2021-03-13", amount: 100 },
      { kind: "bought_back", date: "2026-09-17", amount: 100 },
      { kind: "bought_back", date: "2022-03-14", amount: Number.NaN },
      { kind: "bought_back", date: "2022-03-14", amount: Number.POSITIVE_INFINITY },
      { kind: "bought_back", date: "2022-03-14", amount: -1 },
    ];

    for (const input of cases) {
      const result = applyAgreementEnd(HALE, input, today);
      assert.equal(result.ok, false, `expected reject for ${JSON.stringify(input)}`);
      assert.deepEqual(result.agreement, HALE);
    }
  });

  it("overwrites an existing end without changing signature status", () => {
    const first = applyAgreementEnd(
      HALE,
      { kind: "bought_back", date: "2022-03-14", amount: 245000 },
      "2026-09-16",
    );
    const next = applyAgreementEnd(
      first.agreement,
      { kind: "liquidated", date: "2023-06-01", amount: 150000 },
      "2026-09-16",
    );
    assert.equal(next.ok, true);
    assert.equal(bookLabel(next.agreement, "2026-09-16"), "liquidated");
    assert.equal(next.agreement.status, "executed");
  });
});

describe("piecesFinallyAcceptedForRepo", () => {
  it("refuses execute until every included piece is finalized for this repo", () => {
    assert.equal(piecesFinallyAcceptedForRepo([], ["w1"], "agr-1"), false);
    assert.equal(
      piecesFinallyAcceptedForRepo(
        [{ timepieceId: "w1", status: "accepted", finalizedAt: "2026-09-21T12:00:00.000Z", finalizedAgreementId: "agr-1" }],
        ["w1"],
        "agr-1",
      ),
      true,
    );
    assert.equal(
      piecesFinallyAcceptedForRepo(
        [{ timepieceId: "w1", status: "accepted", finalizedAt: "2026-09-21T12:00:00.000Z", finalizedAgreementId: "agr-1" }],
        ["w1", "w2"],
        "agr-1",
      ),
      false,
    );
    assert.equal(
      piecesFinallyAcceptedForRepo(
        [{ timepieceId: "w1", status: "accepted", finalizedAt: "2026-09-21T12:00:00.000Z", finalizedAgreementId: "other" }],
        ["w1"],
        "agr-1",
      ),
      false,
    );
    assert.equal(
      piecesFinallyAcceptedForRepo(
        [{ timepieceId: "w1", status: "under_review", finalizedAt: "2026-09-21T12:00:00.000Z", finalizedAgreementId: "agr-1" }],
        ["w1"],
        "agr-1",
      ),
      false,
    );
    assert.equal(
      piecesFinallyAcceptedForRepo(
        [{ timepieceId: "w1", status: "refused", finalizedAt: "2026-09-21T12:00:00.000Z", finalizedAgreementId: "agr-1" }],
        ["w1"],
        "agr-1",
      ),
      false,
    );
  });
});
