import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  evaluateAppliedJournalOrder,
  evaluateGeneratedWhen,
  evaluateJournalEntries,
  MIGRATION_JOURNAL_INVALID,
} from "./migration-journal.mjs";

const past = [1_700_000_000_000, 1_700_000_000_100, 1_700_000_000_200];

describe("evaluateJournalEntries", () => {
  it("accepts strictly increasing past timestamps", () => {
    const result = evaluateJournalEntries(
      past.map((when) => ({ when })),
      1_800_000_000_000,
    );
    assert.equal(result.ok, true);
    assert.deepEqual(result.whens, past);
  });

  it("refuses a non-increasing entry", () => {
    const result = evaluateJournalEntries(
      [{ when: 2 }, { when: 2 }],
      1_800_000_000_000,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, MIGRATION_JOURNAL_INVALID);
  });

  it("refuses a future when", () => {
    const result = evaluateJournalEntries(
      [{ when: 1 }, { when: 9_999_999_999_999 }],
      1_800_000_000_000,
    );
    assert.equal(result.ok, false);
    assert.equal(result.error, MIGRATION_JOURNAL_INVALID);
  });
});

describe("evaluateAppliedJournalOrder", () => {
  it("accepts an empty applied prefix", () => {
    assert.equal(evaluateAppliedJournalOrder(past, []).ok, true);
  });

  it("accepts a matching prefix", () => {
    assert.equal(evaluateAppliedJournalOrder(past, past.slice(0, 2)).ok, true);
  });

  it("refuses a mismatched order", () => {
    const result = evaluateAppliedJournalOrder(past, [past[1], past[0]]);
    assert.equal(result.ok, false);
    assert.equal(result.error, MIGRATION_JOURNAL_INVALID);
  });
});

describe("evaluateGeneratedWhen", () => {
  it("accepts a when larger than every earlier entry", () => {
    assert.equal(evaluateGeneratedWhen(past, past[2] + 1).ok, true);
  });

  it("refuses a when that is not the largest", () => {
    const result = evaluateGeneratedWhen(past, past[1]);
    assert.equal(result.ok, false);
    assert.equal(result.error, MIGRATION_JOURNAL_INVALID);
  });
});
