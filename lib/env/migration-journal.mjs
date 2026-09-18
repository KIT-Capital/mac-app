/**
 * Journal order must be trustworthy before any apply or generate
 * (plan 2026-09-17-003, KTD3).
 */

export const MIGRATION_JOURNAL_INVALID = "MIGRATION_JOURNAL_INVALID";

/**
 * @param {{ when?: unknown }[]} entries
 * @param {number} [now]
 * @returns {{ ok: true, whens: number[] } | { ok: false, error: typeof MIGRATION_JOURNAL_INVALID }}
 */
export function evaluateJournalEntries(entries, now = Date.now()) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return { ok: false, error: MIGRATION_JOURNAL_INVALID };
  }
  const whens = [];
  for (const entry of entries) {
    const when = Number(entry?.when);
    if (!Number.isFinite(when) || when <= 0) {
      return { ok: false, error: MIGRATION_JOURNAL_INVALID };
    }
    if (whens.length > 0 && when <= whens[whens.length - 1]) {
      return { ok: false, error: MIGRATION_JOURNAL_INVALID };
    }
    if (when >= now) {
      return { ok: false, error: MIGRATION_JOURNAL_INVALID };
    }
    whens.push(when);
  }
  return { ok: true, whens };
}

/**
 * Applied `created_at` values must be a prefix of the journal `when` list.
 *
 * @param {number[]} journalWhens
 * @param {number[]} appliedCreatedAts
 */
export function evaluateAppliedJournalOrder(journalWhens, appliedCreatedAts) {
  if (!Array.isArray(journalWhens) || !Array.isArray(appliedCreatedAts)) {
    return { ok: false, error: MIGRATION_JOURNAL_INVALID };
  }
  if (appliedCreatedAts.length > journalWhens.length) {
    return { ok: false, error: MIGRATION_JOURNAL_INVALID };
  }
  for (let i = 0; i < appliedCreatedAts.length; i += 1) {
    if (Number(appliedCreatedAts[i]) !== Number(journalWhens[i])) {
      return { ok: false, error: MIGRATION_JOURNAL_INVALID };
    }
  }
  return { ok: true };
}

/**
 * A newly generated `when` must be greater than every earlier journal entry.
 *
 * @param {number[]} previousWhens
 * @param {number} nextWhen
 */
export function evaluateGeneratedWhen(previousWhens, nextWhen) {
  const when = Number(nextWhen);
  if (!Number.isFinite(when) || when <= 0) {
    return { ok: false, error: MIGRATION_JOURNAL_INVALID };
  }
  if (previousWhens.some((value) => when <= Number(value))) {
    return { ok: false, error: MIGRATION_JOURNAL_INVALID };
  }
  return { ok: true };
}
