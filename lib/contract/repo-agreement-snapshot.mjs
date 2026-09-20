import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { parseContractInput } from "./repo-contract.mjs";
import { CLAUSE_HEADINGS, TEMPLATE_VERSION, buildDraftClauses } from "./repo-clauses-sr-2.1-draft-1.mjs";
import { repurchaseSchedule, resolveScale } from "./repo-scale.mjs";
import { brandFromSettings } from "../theme.ts";

export const PENDING_COUNSEL_LABEL = "Draft — pending legal approval — for review, not for signature";
export const ATTESTATION_LABEL =
  "Draft — pending legal approval — software attestation, not counsel-approved";

/**
 * @param {unknown} stage
 */
export function counselLabelForStage(stage) {
  return stage === "collector_signed" || stage === "executed"
    ? ATTESTATION_LABEL
    : PENDING_COUNSEL_LABEL;
}

/**
 * @param {unknown} status
 */
export function documentStageForAgreementStatus(status) {
  if (status === "executed") return "executed";
  if (status === "collector_signed" || status === "inspecting") return "collector_signed";
  return "proposal";
}

/**
 * R44. Every proposal carries this sentence verbatim: a request is an offer
 * MAC may still decline after seeing the pieces. It rides in `facts`, so the
 * text, the HTML projection, and the PDF all print it from the same array.
 */
export const INSPECTION_CONDITION =
  "MAC accepts this request only after physical inspection of each timepiece and other checks, will re-appraise each timepiece on inspection, and reserves the right not to execute this agreement.";

export const TEMPLATE_LEGAL_STATUS = {
  pending_counsel: "pending_counsel",
  counsel_approved: "counsel_approved",
};

export const DOCUMENT_PROCESSING_STATUS = {
  building: "building",
  stored: "stored",
  failed: "failed",
};

const BUYER_NAME = "Mechanical Art Capital LLC";

/**
 * @param {unknown} scale
 */
export function hasFrozenScale(scale) {
  if (!scale || typeof scale !== "object") return false;
  const source = /** @type {Record<string, unknown>} */ (scale);
  return ["purchaseShare", "setupFee", "annualAdjustment", "earlyRepurchaseAmount"].every((key) =>
    Number.isFinite(Number(source[key])),
  );
}

/**
 * @param {number} amount
 */
function money(amount) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * @param {unknown} input
 */
export function buildAgreementSnapshot(input) {
  const record = input && typeof input === "object" ? /** @type {Record<string, unknown>} */ (input) : {};
  if (!hasFrozenScale(record.scale)) {
    return { ok: false, errors: ["SCALE_UNFROZEN"], value: null };
  }
  const parsed = parseContractInput(record);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, value: null };

  const scale = resolveScale(record.scale, parsed.value.termMonths);
  const schedule = repurchaseSchedule({ ...parsed.value, ...scale });
  if (!schedule.ok) return { ok: false, errors: schedule.errors, value: null };

  const collectionLines = parsed.value.timepieces.map((piece, index) => {
    const label = piece.name || `Timepiece ${index + 1}`;
    const extras = [piece.reference && `ref. ${piece.reference}`, piece.serial && `serial ${piece.serial}`]
      .filter(Boolean)
      .join(", ");
    return extras ? `${label} (${extras})` : label;
  });

  const clauses = buildDraftClauses({
    sellerName: parsed.value.sellerName,
    buyerName: BUYER_NAME,
    saleAmountLabel: money(parsed.value.saleAmount),
    termMonths: parsed.value.termMonths,
    startDate: parsed.value.startDate,
    collectionLines,
  });
  if (clauses.length !== CLAUSE_HEADINGS.length) {
    return { ok: false, errors: ["CLAUSE_SET_INCOMPLETE"], value: null };
  }

  const scheduleLines = schedule.rows.map(
    (row) => `${row.month}  ${row.date}  ${money(row.price)}  ${row.note}`,
  );
  const facts = factLines(parsed.value, collectionLines);
  const stage = typeof record.stage === "string" ? record.stage : "proposal";
  const label = counselLabelForStage(stage);
  const snapshotHash = typeof record.snapshotHash === "string" ? record.snapshotHash : "";
  const signatures = Array.isArray(record.signatures) ? record.signatures : [];
  const signatureLines = signatureBlockLines(signatures, snapshotHash);
  const text = [
    "Mechanical Art Capital — Sale and Repurchase Agreement",
    label,
    ...facts,
    ...clauses.map((clause) => `${clause.number}. ${clause.heading}\n${clause.body}`),
    "Monthly repurchase schedule",
    ...scheduleLines,
    ...signatureLines,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    ok: true,
    errors: [],
    value: {
      templateVersion: TEMPLATE_VERSION,
      templateLegalStatus: TEMPLATE_LEGAL_STATUS.pending_counsel,
      processingStatus: DOCUMENT_PROCESSING_STATUS.building,
      contract: parsed.value,
      scale,
      schedule,
      clauses,
      collectionLines,
      facts,
      stage,
      snapshotHash,
      signatures,
      label,
      text,
    },
  };
}

/**
 * @param {NonNullable<ReturnType<typeof buildAgreementSnapshot>["value"]>} snapshot
 */
export function projectAgreementHtml(snapshot) {
  const rows = snapshot.schedule.rows
    .map(
      (row) =>
        `<tr><td>${row.month}</td><td>${row.date}</td><td>${money(row.price)}</td><td>${escapeHtml(row.note)}</td></tr>`,
    )
    .join("");
  const clauses = snapshot.clauses
    .map(
      (clause) =>
        `<section><h3>${clause.number}. ${escapeHtml(clause.heading)}</h3><p>${escapeHtml(clause.body)}</p></section>`,
    )
    .join("");
  const signatures = signatureBlockLines(snapshot.signatures ?? [], snapshot.snapshotHash ?? "")
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return [
    `<p class="counsel-label">${escapeHtml(snapshot.label || PENDING_COUNSEL_LABEL)}</p>`,
    ...snapshot.facts.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<table>${rows}</table>`,
    clauses,
    signatures,
  ].join("");
}

/**
 * @param {NonNullable<ReturnType<typeof buildAgreementSnapshot>["value"]>} snapshot
 */
export async function renderAgreementSnapshotPdf(snapshot) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const stamped = snapshotStamp(snapshot);
  pdf.setCreationDate(stamped);
  pdf.setModificationDate(stamped);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const brand = brandFromSettings({});
  const primary = brand.palette.primary.replace("#", "");
  const navy = rgb(
    parseInt(primary.slice(0, 2), 16) / 255,
    parseInt(primary.slice(2, 4), 16) / 255,
    parseInt(primary.slice(4, 6), 16) / 255,
  );
  const ink = rgb(17 / 255, 17 / 255, 17 / 255);
  let page = pdf.addPage([612, 792]);
  let y = 744;

  const draw = (text, { size = 10, type = font, color = ink } = {}) => {
    const lines = wrap(text, type, size, 516);
    for (const line of lines) {
      if (y < 56) {
        page = pdf.addPage([612, 792]);
        y = 744;
      }
      page.drawText(latin1PdfText(line), { x: 48, y, size, font: type, color });
      y -= size + 4;
    }
  };

  page.drawRectangle({ x: 0, y: 762, width: 612, height: 30, color: navy });
  page.drawText(brand.companyName, { x: 48, y: 772, size: 12, font: bold, color: rgb(1, 1, 1) });
  draw("Sale and Repurchase Agreement", { size: 16, type: bold, color: navy });
  draw(snapshot.label || PENDING_COUNSEL_LABEL, { size: 10, type: bold, color: navy });
  y -= 6;
  for (const line of snapshot.facts) {
    draw(line);
  }
  for (const clause of snapshot.clauses) {
    y -= 6;
    draw(`${clause.number}. ${clause.heading}`, { size: 11, type: bold, color: navy });
    draw(clause.body);
  }
  y -= 8;
  draw("Monthly repurchase schedule", { size: 12, type: bold, color: navy });
  for (const row of snapshot.schedule.rows) {
    draw(`${row.month}  ${row.date}  ${money(row.price)}  ${row.note}`, { size: 9 });
  }
  const signatureLines = signatureBlockLines(snapshot.signatures ?? [], snapshot.snapshotHash ?? "");
  if (signatureLines.length) {
    y -= 8;
    for (const line of signatureLines) {
      draw(line, { size: 9 });
    }
  }

  const bytes = await pdf.save();
  return { ok: true, errors: [], bytes };
}

/**
 * @param {string} value
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * Helvetica is WinAnsi. Map Unicode dashes so the counsel label does not become "?".
 * @param {string} text
 */
export function latin1PdfText(text) {
  return String(text)
    .replaceAll("\u2014", "--")
    .replaceAll("\u2013", "-")
    .replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, "?");
}

/**
 * @param {import("./repo-contract.mjs").ContractInput} contract
 * @param {string[]} collectionLines
 */
/**
 * @param {unknown} signatures
 * @param {string} snapshotHash
 */
function signatureBlockLines(signatures, snapshotHash) {
  const rows = Array.isArray(signatures) ? signatures : [];
  const lines = [];
  if (snapshotHash) lines.push(`Document snapshot: ${snapshotHash}`);
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const party = String(/** @type {Record<string, unknown>} */ (row).party ?? "");
    const typedName = String(/** @type {Record<string, unknown>} */ (row).typedName ?? "");
    const signedAt = String(/** @type {Record<string, unknown>} */ (row).signedAt ?? "");
    const hash = String(/** @type {Record<string, unknown>} */ (row).snapshotHash ?? "");
    if (!typedName) continue;
    const who = party === "mac" ? "MAC" : "Collector";
    lines.push(`${who}: ${typedName}  ${signedAt}  ${hash}`.trim());
  }
  return lines;
}

function factLines(contract, collectionLines) {
  return [
    `Seller: ${contract.sellerName}`,
    `Buyer: ${BUYER_NAME}`,
    `Agreement date: ${contract.startDate}`,
    contract.agreementCode ? `Transaction: ${contract.agreementCode}` : "",
    `Sale amount: ${money(contract.saleAmount)}`,
    `Term: ${contract.termMonths} months`,
    contract.delivery ? `Delivery: ${contract.delivery}` : "",
    `Collection: ${collectionLines.join("; ")}`,
    INSPECTION_CONDITION,
  ].filter(Boolean);
}

/**
 * PDFs stamp CreationDate/ModDate. Use the agreement date so two renders of
 * the same snapshot are byte-identical and `putIfAbsent` can treat a collision
 * as the same object.
 * @param {NonNullable<ReturnType<typeof buildAgreementSnapshot>["value"]>} snapshot
 */
function snapshotStamp(snapshot) {
  const start = String(snapshot?.contract?.startDate ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(start) ? new Date(`${start}T00:00:00.000Z`) : new Date(0);
}

function wrap(text, font, size, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
