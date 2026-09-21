/**
 * Per-tenant brand overlay. The default MAC tenant stays Logo-FF.
 *
 * Plan: docs/plans/2026-09-19-desk-stores-whitelabel-analytics-plan.md
 * Decision: docs/decisions/0004-desk-stores-and-tenant-brand.md
 */

import {
  DEFAULT_TENANT_CODE,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  assertTenantPrefix,
} from "./tenant.mjs";

export const MAC_PALETTE = Object.freeze({
  primary: "#0E2A44",
  accent: "#FCB040",
  soft: "#E8D5C0",
});

const HEX = /^#[0-9A-Fa-f]{6}$/;
const FORBIDDEN_MARKS = /patek|philippe/i;
const FROM_NAME_MAX = 80;
const NAME_MAX = 80;
const LOGO_MAX = 500;

/**
 * @returns {{
 *   id: string,
 *   code: string,
 *   name: string,
 *   logoUrl: string,
 *   palette: { primary: string, accent: string, soft: string },
 *   fromName: string,
 * }}
 */
export function defaultMacTenant() {
  return {
    id: DEFAULT_TENANT_ID,
    code: DEFAULT_TENANT_CODE,
    name: DEFAULT_TENANT_NAME,
    logoUrl: "",
    palette: { ...MAC_PALETTE },
    fromName: DEFAULT_TENANT_NAME,
  };
}

/**
 * @param {string} code
 */
export function tenantIdForCode(code) {
  return `tenant-${assertTenantPrefix(code).toLowerCase()}`;
}

/**
 * @param {string} a
 * @param {string} b
 */
export function contrastRatio(a, b) {
  const first = relativeLuminance(a);
  const second = relativeLuminance(b);
  const hi = Math.max(first, second);
  const lo = Math.min(first, second);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * @param {unknown} value
 */
export function parseTenantPalette(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const palette = {
    primary: String(/** @type {{ primary?: unknown }} */ (source).primary ?? "").trim(),
    accent: String(/** @type {{ accent?: unknown }} */ (source).accent ?? "").trim(),
    soft: String(/** @type {{ soft?: unknown }} */ (source).soft ?? "").trim(),
  };
  if (!HEX.test(palette.primary) || !HEX.test(palette.accent) || !HEX.test(palette.soft)) {
    throw new Error("TENANT_PALETTE_INVALID");
  }
  if (
    contrastRatio("#FFFFFF", palette.primary) < 4.5
    || contrastRatio(palette.accent, palette.primary) < 3
  ) {
    throw new Error("TENANT_PALETTE_CONTRAST");
  }
  return palette;
}

/**
 * @param {unknown} value
 */
export function parseTenantName(value) {
  const name = String(value ?? "").trim();
  if (!name || name.length > NAME_MAX) throw new Error("TENANT_NAME_INVALID");
  assertNoForbiddenMarks(name);
  return name;
}

/**
 * @param {unknown} value
 */
export function parseFromName(value) {
  const fromName = String(value ?? "").trim();
  if (!fromName || fromName.length > FROM_NAME_MAX) throw new Error("TENANT_FROM_NAME_INVALID");
  assertNoForbiddenMarks(fromName);
  return fromName;
}

/**
 * @param {unknown} value
 */
export function parseLogoUrl(value) {
  const logoUrl = String(value ?? "").trim();
  if (!logoUrl) return "";
  if (logoUrl.length > LOGO_MAX) throw new Error("TENANT_LOGO_INVALID");
  if (logoUrl.startsWith("/")) {
    if (logoUrl.startsWith("//") || logoUrl.includes("..")) throw new Error("TENANT_LOGO_INVALID");
    assertNoForbiddenMarks(logoUrl);
    return logoUrl;
  }
  let parsed;
  try {
    parsed = new URL(logoUrl);
  } catch {
    throw new Error("TENANT_LOGO_INVALID");
  }
  if (parsed.protocol !== "https:") throw new Error("TENANT_LOGO_INVALID");
  assertNoForbiddenMarks(logoUrl);
  return logoUrl;
}

/**
 * @param {unknown} input
 */
export function parseTenantCreate(input) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const code = assertTenantPrefix(String(/** @type {{ code?: unknown }} */ (source).code ?? "").trim());
  if (code === DEFAULT_TENANT_CODE) throw new Error("MAC_BRAND_LOCKED");
  const name = parseTenantName(/** @type {{ name?: unknown }} */ (source).name);
  const tenant = {
    id: tenantIdForCode(code),
    code,
    name,
    logoUrl: "",
    palette: { ...MAC_PALETTE },
    fromName: name,
  };
  if (tenant.id === DEFAULT_TENANT_ID) throw new Error("MAC_BRAND_LOCKED");
  return tenant;
}

/**
 * @param {unknown} patch
 */
export function parseTenantUpdatePatch(patch) {
  const source = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  if (/** @type {{ code?: unknown }} */ (source).code !== undefined) {
    throw new Error("TENANT_CODE_IMMUTABLE");
  }
  /** @type {{ name?: string, logoUrl?: string, palette?: { primary: string, accent: string, soft: string }, fromName?: string }} */
  const parsed = {};
  if (/** @type {{ name?: unknown }} */ (source).name !== undefined) {
    parsed.name = parseTenantName(/** @type {{ name?: unknown }} */ (source).name);
  }
  if (/** @type {{ logoUrl?: unknown }} */ (source).logoUrl !== undefined) {
    parsed.logoUrl = parseLogoUrl(/** @type {{ logoUrl?: unknown }} */ (source).logoUrl);
  }
  if (/** @type {{ palette?: unknown }} */ (source).palette !== undefined) {
    parsed.palette = parseTenantPalette(/** @type {{ palette?: unknown }} */ (source).palette);
  }
  if (/** @type {{ fromName?: unknown }} */ (source).fromName !== undefined) {
    parsed.fromName = parseFromName(/** @type {{ fromName?: unknown }} */ (source).fromName);
  }
  if (Object.keys(parsed).length === 0) throw new Error("TENANT_UPDATE_INVALID");
  return parsed;
}

/**
 * @param {{ id: string, code: string, name: string, logoUrl: string, palette: { primary: string, accent: string, soft: string }, fromName: string }} current
 * @param {unknown} patch
 */
export function applyTenantBrandPatch(current, patch) {
  const source = patch && typeof patch === "object" && !Array.isArray(patch) ? patch : {};
  if (/** @type {{ code?: unknown }} */ (source).code !== undefined) {
    throw new Error("TENANT_CODE_IMMUTABLE");
  }
  const next = { ...current, palette: { ...current.palette } };
  if (/** @type {{ name?: unknown }} */ (source).name !== undefined) {
    next.name = parseTenantName(/** @type {{ name?: unknown }} */ (source).name);
  }
  if (/** @type {{ logoUrl?: unknown }} */ (source).logoUrl !== undefined) {
    next.logoUrl = parseLogoUrl(/** @type {{ logoUrl?: unknown }} */ (source).logoUrl);
  }
  if (/** @type {{ palette?: unknown }} */ (source).palette !== undefined) {
    next.palette = parseTenantPalette(/** @type {{ palette?: unknown }} */ (source).palette);
  }
  if (/** @type {{ fromName?: unknown }} */ (source).fromName !== undefined) {
    next.fromName = parseFromName(/** @type {{ fromName?: unknown }} */ (source).fromName);
  }
  if (current.id === DEFAULT_TENANT_ID || current.code === DEFAULT_TENANT_CODE) {
    if (
      next.name !== current.name
      || next.logoUrl !== current.logoUrl
      || next.palette.primary !== current.palette.primary
      || next.palette.accent !== current.palette.accent
      || next.palette.soft !== current.palette.soft
    ) {
      throw new Error("MAC_BRAND_LOCKED");
    }
  }
  return next;
}

/**
 * @param {string} hex
 */
function relativeLuminance(hex) {
  const rgb = [0, 2, 4].map((offset) => {
    const channel = parseInt(hex.slice(offset + 1, offset + 3), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/**
 * @param {string} value
 */
function assertNoForbiddenMarks(value) {
  if (FORBIDDEN_MARKS.test(value)) throw new Error("TENANT_MARKS_FORBIDDEN");
}
