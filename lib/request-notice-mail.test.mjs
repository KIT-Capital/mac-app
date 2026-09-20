import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INSPECTION_CONDITION } from "./contract/repo-agreement-snapshot.mjs";
import {
  composeCollectorDeclineNotice,
  composeRequestNotices,
  REQUEST_NOTICE_KINDS,
} from "./request-notice-mail.mjs";

const FORBIDDEN = /\b(loan|lender|interest|debt|financing|vesting|paid off|originated|advance|principal|balance|collateral|borrower)\b/i;

const sample = {
  name: "Ada Locke",
  email: "ada@mac.test",
  watch: "MAC-ABC123",
  amount: "$60,000.00",
  delivery: "Insured courier",
  termMonths: 12,
  deskEmail: "financing@mechartcap.com",
};

describe("request transition notices", () => {
  it("covers every planned letter with the not-a-loan line and R44", () => {
    for (const kind of REQUEST_NOTICE_KINDS) {
      const letters = kind === "request_declined"
        ? composeRequestNotices(kind, sample)
        : composeRequestNotices(kind, sample);
      assert.ok(letters.length >= 1, kind);
      for (const letter of letters) {
        const body = `${letter.subject}\n${letter.heading}\n${letter.intro}\n${letter.body}`;
        assert.match(body, /not a loan/i);
        assert.match(body, new RegExp(INSPECTION_CONDITION));
        assert.doesNotMatch(body.replaceAll("not a loan", ""), FORBIDDEN);
      }
    }
    const collectorDeclined = composeCollectorDeclineNotice(sample);
    assert.equal(collectorDeclined[0].audience, "desk");
    assert.match(collectorDeclined[0].body, /not a loan/i);
  });
});
