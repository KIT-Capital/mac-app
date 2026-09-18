import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { isLiveBookEnabled } from "../env/live-book-flag.mjs";
import { allowMailRequest } from "../mail-rate.mjs";
import { renderRepoContractPdf } from "./repo-contract-pdf.mjs";
import { parseContractInput } from "./repo-contract.mjs";
import { assertScenario60Floors } from "./repo-scale.mjs";

export const PREVIEW_WATERMARK =
  "Temporary preview -- not stored -- Draft -- pending legal approval -- for review, not for signature";

const ERROR_TEXT = {
  INVALID_JSON: "The contract request was not valid JSON.",
  SELLER_NAME_REQUIRED: "Seller name is required.",
  SALE_AMOUNT_REQUIRED: "Sale amount is required.",
  SCALE_TERMS_INVALID: "Repurchase terms are invalid.",
  START_DATE_INVALID: "Agreement date is invalid.",
  TIMEPIECES_REQUIRED: "At least one timepiece is required.",
  TIMEPIECES_LIMIT: "A contract can list at most 24 timepieces.",
  CONTRACT_PDF_FAILED: "The contract PDF could not be created.",
  CONTRACT_FORBIDDEN_LANGUAGE: "Contract copy used forbidden language.",
  LIVE_PDF_JSON_REFUSED: "Live mode does not mint a PDF from request JSON.",
  PDF_ORIGIN_FORBIDDEN: "This preview can only be created from the Mechanical Art Capital app.",
  AGREEMENT_SCALE_INVALID: "Repurchase terms are below the Scenario 60 floor.",
  PDF_RATE_LIMITED: "Too many PDF requests from this device. Try again in a minute.",
};

/**
 * @param {{ env?: NodeJS.ProcessEnv, headers?: Headers | Record<string, string> }} input
 */
export function evaluatePdfMintPolicy({ env = process.env, headers = {} } = {}) {
  if (isLiveBookEnabled(env.MAC_LIVE_BOOK)) {
    return { ok: false, status: 403, code: "LIVE_PDF_JSON_REFUSED" };
  }
  const header = (name) => {
    if (headers && typeof headers.get === "function") return headers.get(name);
    const record = /** @type {Record<string, string>} */ (headers);
    return record[name] ?? record[name.toLowerCase()] ?? null;
  };
  if (header("sec-fetch-site") === "same-origin") {
    return { ok: true, status: 200, code: null };
  }
  const origin = String(header("origin") ?? "").trim();
  const allow = String(env.COLLECTOR_MAGIC_LINK_ORIGIN ?? "").trim();
  if (!origin || !allow) {
    return { ok: false, status: 403, code: "PDF_ORIGIN_FORBIDDEN" };
  }
  try {
    if (new URL(origin).origin === new URL(allow).origin) {
      return { ok: true, status: 200, code: null };
    }
  } catch {
    return { ok: false, status: 403, code: "PDF_ORIGIN_FORBIDDEN" };
  }
  return { ok: false, status: 403, code: "PDF_ORIGIN_FORBIDDEN" };
}

function jsonError(code, status, extras = []) {
  return Response.json(
    { error: ERROR_TEXT[code] ?? code, code, errors: extras.length ? extras : [code] },
    { status },
  );
}

export function previewClientIp(headers) {
  const real = String(headers.get("x-real-ip") ?? "").trim();
  if (real) return real;
  const forwarded = String(headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded.at(-1) || "local";
}

/**
 * @param {Uint8Array | ArrayBuffer} bytes
 */
export async function watermarkPreviewPdf(bytes) {
  const pdf = await PDFDocument.load(bytes);
  const font = await pdf.embedFont(StandardFonts.HelveticaBold);
  const color = rgb(0.45, 0.12, 0.12);
  for (const page of pdf.getPages()) {
    page.drawText(PREVIEW_WATERMARK, { x: 36, y: 24, size: 8, font, color });
  }
  return new Uint8Array(await pdf.save());
}

/**
 * @param {Request} request
 * @param {NodeJS.ProcessEnv} [env]
 */
export async function handleContractsPdf(request, env = process.env) {
  const policy = evaluatePdfMintPolicy({ env, headers: request.headers });
  if (!policy.ok) {
    return jsonError(policy.code, policy.status);
  }
  if (!allowMailRequest(previewClientIp(request.headers), env)) {
    return jsonError("PDF_RATE_LIMITED", 429);
  }
  const body = await request.json().catch(() => null);
  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return jsonError("INVALID_JSON", 400);
  }
  const record = /** @type {Record<string, unknown>} */ (body);
  if (record.scale && typeof record.scale === "object") {
    const floors = assertScenario60Floors(/** @type {Record<string, unknown>} */ (record.scale));
    if (!floors.ok) {
      return jsonError(floors.error, 400);
    }
  }
  const parsed = parseContractInput(body);
  if (!parsed.ok) {
    return jsonError(parsed.errors[0], 400, parsed.errors);
  }
  try {
    const pdf = await renderRepoContractPdf(parsed.value);
    if (!pdf.ok || !pdf.bytes) {
      return jsonError(pdf.errors[0] ?? "CONTRACT_PDF_FAILED", 400, pdf.errors);
    }
    const watermarked = await watermarkPreviewPdf(pdf.bytes);
    return new Response(Buffer.from(watermarked), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="mac-repurchase-preview.pdf"',
      },
    });
  } catch {
    return jsonError("CONTRACT_PDF_FAILED", 500);
  }
}
