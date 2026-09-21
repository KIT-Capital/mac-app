/**
 * Default tenant and member-ID format for Mechanical Art Capital.
 *
 * White-label is `tenant_id` plus a Super Admin overlay later. This module
 * is the data model: one seeded MAC tenant, prefix + five digits + UTC year.
 * Plan: docs/plans/2026-09-19-desk-stores-whitelabel-analytics-plan.md
 * Decision: docs/decisions/0004-desk-stores-and-tenant-brand.md
 */

export const DEFAULT_TENANT_ID = "tenant-mac";
export const DEFAULT_TENANT_CODE = "MAC";
export const DEFAULT_TENANT_NAME = "Mechanical Art Capital";

const PREFIX_PATTERN = /^[A-Z]{2,8}$/;
const MEMBER_ID_PATTERN = /^([A-Z]{2,8})(\d{5})-(\d{2})$/;
const MAX_SEQUENCE = 99999;

/**
 * @param {string} prefix
 * @returns {string}
 */
export function assertTenantPrefix(prefix) {
  if (typeof prefix !== "string" || !PREFIX_PATTERN.test(prefix)) {
    throw new Error("TENANT_PREFIX_INVALID");
  }
  return prefix;
}

/**
 * @param {string} prefix
 * @param {number} sequence
 * @param {Date} at
 */
export function formatMemberId(prefix, sequence, at) {
  assertTenantPrefix(prefix);
  if (!Number.isInteger(sequence) || sequence < 1 || sequence > MAX_SEQUENCE) {
    throw new Error("MEMBER_SEQUENCE_INVALID");
  }
  if (!(at instanceof Date) || Number.isNaN(at.getTime())) {
    throw new Error("MEMBER_YEAR_INVALID");
  }
  const year = String(at.getUTCFullYear() % 100).padStart(2, "0");
  return `${prefix}${String(sequence).padStart(5, "0")}-${year}`;
}

/**
 * @param {string} memberId
 * @returns {{ prefix: string, sequence: number, year: number } | null}
 */
export function parseMemberId(memberId) {
  if (typeof memberId !== "string") return null;
  const match = MEMBER_ID_PATTERN.exec(memberId);
  if (!match) return null;
  return {
    prefix: match[1],
    sequence: Number(match[2]),
    year: Number(match[3]),
  };
}

/**
 * @param {number} current
 */
export function nextMemberSequence(current) {
  if (!Number.isInteger(current) || current < 1 || current > MAX_SEQUENCE) {
    throw new Error("MEMBER_SEQUENCE_INVALID");
  }
  if (current === MAX_SEQUENCE) {
    throw new Error("MEMBER_SEQUENCE_EXHAUSTED");
  }
  return current + 1;
}
