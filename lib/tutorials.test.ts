import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  COLLECTOR_TUTORIAL,
  DESK_TUTORIAL,
  type Tutorial,
} from "./tutorials";

const FORBIDDEN = /\b(loan|lender|interest|debt|vesting|paid off)\b/i;

function tutorialPlainText(tutorial: Tutorial) {
  return [tutorial.title, tutorial.lead, ...tutorial.steps.flatMap((step) => [step.title, step.body])].join("\n");
}

describe("in-app tutorials", () => {
  it("collector copy is sale-and-repurchase and never a loan", () => {
    const text = tutorialPlainText(COLLECTOR_TUTORIAL);
    assert.match(text, /sale and repurchase/i);
    assert.match(text, /buy them back/i);
    assert.doesNotMatch(text, FORBIDDEN);
    assert.doesNotMatch(text, /Get Estimate/i);
    assert.doesNotMatch(text, /Manhattan/i);
    assert.doesNotMatch(text, /vault/i);
    assert.doesNotMatch(text, /\d+%/);
  });

  it("desk tutorial stays behind admin language and names Scenario 60", () => {
    const text = tutorialPlainText(DESK_TUTORIAL);
    assert.match(text, /Scenario 60/);
    assert.match(text, /admin wall/i);
    assert.match(text, /Collectors never get a desk link/);
    assert.doesNotMatch(text, FORBIDDEN);
  });
});
