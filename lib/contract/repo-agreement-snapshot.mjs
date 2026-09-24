import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { parseContractInput } from "./repo-contract.mjs";
import { CLAUSE_HEADINGS, TEMPLATE_VERSION, buildDraftClauses } from "./repo-clauses-sr-2.1-draft-1.mjs";
import { repurchaseSchedule, resolveScale } from "./repo-scale.mjs";
import { brandFromSettings } from "../theme.ts";

export const PENDING_COUNSEL_LABEL = "Draft — pending legal approval — for review, not for signature";
export const ATTESTATION_LABEL =
  "Draft — pending legal approval — software attestation, not counsel-approved";
/** Wording printed on the agreement itself. Mail may still use the longer counsel labels. */
export const AGREEMENT_FACE_LABEL = "Draft — pending legal approval";

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
  const signatureLines = signatureBlockLines(signatures);
  const text = [
    "SALE AND REPURCHASE AGREEMENT",
    AGREEMENT_FACE_LABEL,
    parsed.value.agreementCode ? `Agreement No. ${parsed.value.agreementCode}` : "",
    ...facts,
    ...clauses.map((clause) => `${clause.number}. ${clause.heading}\n${clause.body}`),
    "Schedule A — Monthly repurchase prices",
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
  const signatures = signatureBlockLines(snapshot.signatures ?? [])
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join("");
  return [
    `<p class="counsel-label">${escapeHtml(AGREEMENT_FACE_LABEL)}</p>`,
    snapshot.contract?.agreementCode
      ? `<p>Agreement No. ${escapeHtml(snapshot.contract.agreementCode)}.</p>`
      : "",
    ...snapshot.facts.map((line) => `<p>${escapeHtml(line)}</p>`),
    `<table>${rows}</table>`,
    clauses,
    signatures,
  ].join("");
}

/**
 * @param {NonNullable<ReturnType<typeof buildAgreementSnapshot>["value"]>} snapshot
 */
export async function renderAgreementSnapshotPdf(snapshot, options = {}) {
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const stamped = snapshotStamp(snapshot);
  pdf.setCreationDate(stamped);
  pdf.setModificationDate(stamped);
  const font = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const italic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const brand = brandFromSettings({ brandPreset: options.brandPreset });
  const primary = brand.palette.primary.replace("#", "");
  const navy = rgb(
    parseInt(primary.slice(0, 2), 16) / 255,
    parseInt(primary.slice(2, 4), 16) / 255,
    parseInt(primary.slice(4, 6), 16) / 255,
  );
  const ink = rgb(17 / 255, 17 / 255, 17 / 255);
  const muted = rgb(0.28, 0.26, 0.22);
  const rule = rgb(0.72, 0.66, 0.56);
  const left = 72;
  const width = 468;
  /** @type {import("pdf-lib").PDFPage} */
  let page = pdf.addPage([612, 792]);
  let y = 700;

  const continuePage = () => {
    page = pdf.addPage([612, 792]);
    y = 700;
    const running = latin1PdfText(`${brand.companyName}  ·  Sale and Repurchase Agreement`);
    page.drawText(running, { x: left, y: 742, size: 9, font: italic, color: muted });
    page.drawRectangle({ x: left, y: 734, width, height: 0.4, color: rule });
  };

  const ensure = (height) => {
    if (y - height < 78) continuePage();
  };

  const gold = rgb(252 / 255, 176 / 255, 64 / 255);
  const leading = 15;

  const draw = (text, { size = 11, type = font, color = ink, gap = 3 } = {}) => {
    const lines = wrap(text, type, size, width);
    for (const line of lines) {
      ensure(size + gap);
      page.drawText(latin1PdfText(line), { x: left, y, size, font: type, color });
      y -= size + gap;
    }
  };

  const drawCentered = (text, { size = 12, type = bold, color = navy, gap = 4 } = {}) => {
    const lines = wrap(text, type, size, width);
    for (const line of lines) {
      ensure(size + gap);
      const safe = latin1PdfText(line);
      const textWidth = type.widthOfTextAtSize(safe, size);
      page.drawText(safe, { x: (612 - textWidth) / 2, y, size, font: type, color });
      y -= size + gap;
    }
  };

  const drawBlock = (text, { size = 11, type = font, color = ink, after = 11 } = {}) => {
    const lines = wrap(text, type, size, width);
    lines.forEach((line, index) => {
      const words = line.split(/\s+/).filter(Boolean).map((word) => latin1PdfText(word));
      ensure(leading);
      const last = index === lines.length - 1 || words.length < 2;
      if (last) {
        page.drawText(words.join(" "), { x: left, y, size, font: type, color });
      } else {
        const widths = words.map((word) => type.widthOfTextAtSize(word, size));
        const used = widths.reduce((sum, item) => sum + item, 0);
        const gap = (width - used) / (words.length - 1);
        let x = left;
        words.forEach((word, wordIndex) => {
          page.drawText(word, { x, y, size, font: type, color });
          x += widths[wordIndex] + gap;
        });
      }
      y -= leading;
    });
    y -= after;
  };

  const drawColumnField = (x, label, value) => {
    page.drawText(latin1PdfText(label), { x, y, size: 8, font: bold, color: navy });
    const lineY = y - 18;
    if (value) {
      page.drawText(latin1PdfText(value), { x, y: lineY + 4, size: 11, font, color: ink });
    }
    page.drawRectangle({ x, y: lineY, width: 200, height: 0.7, color: ink });
  };

  drawCentered(brand.companyName.toUpperCase(), { size: 12, gap: 6 });
  page.drawRectangle({ x: 196, y: y + 2, width: 220, height: 1.25, color: gold });
  y -= 18;
  drawCentered("SALE AND REPURCHASE AGREEMENT", { size: 16, gap: 6 });
  page.drawRectangle({ x: 246, y: y + 2, width: 120, height: 0.4, color: navy });
  y -= 14;
  drawCentered(AGREEMENT_FACE_LABEL, { size: 10, type: italic, color: muted, gap: 3 });
  const dated = formatAgreementDate(snapshot.contract?.startDate) || String(snapshot.contract?.startDate ?? "");
  if (snapshot.contract?.agreementCode) {
    drawCentered(`Agreement No. ${snapshot.contract.agreementCode}`, { size: 11, type: font, color: ink, gap: 2 });
  }
  if (dated) drawCentered(dated, { size: 11, type: font, color: ink, gap: 14 });

  for (const line of snapshot.facts) drawBlock(line);
  for (const clause of snapshot.clauses) {
    ensure(leading + 8);
    draw(`${clause.number}.   ${clause.heading}`, { size: 12, type: bold, color: navy, gap: 6 });
    y -= 2;
    drawBlock(clause.body);
  }

  continuePage();
  drawCentered("Schedule A", { size: 13, gap: 2 });
  drawCentered("Monthly Repurchase Prices", { size: 11, type: italic, color: muted, gap: 12 });
  const colWidths = [52, 100, 96, 220];
  const tableWidth = colWidths.reduce((sum, item) => sum + item, 0);
  const tableLeft = (612 - tableWidth) / 2;
  const headers = ["Month", "Date", "Price", "Basis"];
  const rowHeight = 20;
  const paintRow = (cells, { header = false } = {}) => {
    ensure(rowHeight + 2);
    const top = y + 14;
    if (header) {
      page.drawRectangle({ x: tableLeft, y: top - rowHeight, width: tableWidth, height: rowHeight, color: navy });
    }
    let x = tableLeft;
    cells.forEach((cell, index) => {
      const size = header ? 9 : 8;
      const safe = latin1PdfText(wrap(String(cell), header ? bold : font, size, colWidths[index] - 10)[0] || "");
      const textWidth = (header ? bold : font).widthOfTextAtSize(safe, size);
      page.drawText(safe, {
        x: x + (colWidths[index] - textWidth) / 2,
        y: top - 14,
        size,
        font: header ? bold : font,
        color: header ? rgb(1, 1, 1) : ink,
      });
      x += colWidths[index];
    });
    if (!header) {
      page.drawRectangle({ x: tableLeft, y: top - rowHeight, width: tableWidth, height: 0.3, color: rule });
    }
    y -= rowHeight;
  };
  paintRow(headers, { header: true });
  for (const row of snapshot.schedule.rows) {
    paintRow([String(row.month), String(row.date), money(row.price), String(row.note)]);
  }
  page.drawRectangle({
    x: tableLeft,
    y: y + 6,
    width: tableWidth,
    height: 0.6,
    color: gold,
  });
  y -= 16;

  continuePage();
  drawCentered("IN WITNESS WHEREOF", { size: 13, gap: 12 });
  drawBlock(
    "The Parties have caused this Agreement to be executed, and shall sign below when the timepieces are delivered to Buyer. Each signature is that Party's acceptance of this Agreement.",
  );
  const seller = signatureParty(snapshot.signatures, "seller");
  const buyer = signatureParty(snapshot.signatures, "mac");
  const columns = [
    { title: "SELLER", entity: seller?.name || " ", fields: [["Signature", ""], ["Name", seller?.name || ""], ["Date", seller?.date || ""]] },
    { title: "BUYER", entity: BUYER_NAME, fields: [["Signature", ""], ["Name", buyer?.name || ""], ["Title", ""], ["Date", buyer?.date || ""]] },
  ];
  const columnTop = y;
  columns.forEach((column, index) => {
    const x = left + index * 246;
    y = columnTop;
    page.drawText(column.title, { x, y, size: 11, font: bold, color: navy });
    y -= 16;
    page.drawText(latin1PdfText(column.entity), { x, y, size: 10, font: italic, color: ink });
    y -= 28;
    for (const [label, value] of column.fields) {
      drawColumnField(x, label, value);
      y -= 42;
    }
  });
  y = columnTop - 28 - 32 * 4;

  const pages = pdf.getPages();
  const code = latin1PdfText(String(snapshot.contract?.agreementCode || ""));
  pages.forEach((printed, index) => {
    printed.drawRectangle({ x: left, y: 52, width, height: 0.4, color: rule });
    if (code) printed.drawText(code, { x: left, y: 36, size: 8, font, color: muted });
    const draft = "DRAFT";
    const draftWidth = font.widthOfTextAtSize(draft, 8);
    printed.drawText(draft, { x: (612 - draftWidth) / 2, y: 36, size: 8, font, color: muted });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
    printed.drawText(pageLabel, { x: left + width - pageWidth, y: 36, size: 8, font, color: muted });
  });

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
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * @param {unknown} value
 */
export function formatAgreementDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value ?? ""));
  if (!match) return "";
  const month = Number(match[2]);
  const date = Number(match[3]);
  if (month < 1 || month > 12 || date < 1 || date > 31) return "";
  return `${MONTHS[month - 1]} ${date}, ${match[1]}`;
}

/**
 * @param {unknown} signatures
 * @param {"seller" | "mac"} party
 */
function signatureParty(signatures, party) {
  const rows = Array.isArray(signatures) ? signatures : [];
  const row = rows.find((item) => {
    if (!item || typeof item !== "object") return false;
    const who = String(/** @type {Record<string, unknown>} */ (item).party ?? "");
    const named = String(/** @type {Record<string, unknown>} */ (item).typedName ?? "").trim();
    if (!named) return false;
    return party === "mac" ? who === "mac" : who !== "mac";
  });
  if (!row || typeof row !== "object") return null;
  const record = /** @type {Record<string, unknown>} */ (row);
  return {
    name: String(record.typedName).trim(),
    date: formatAgreementDate(record.signedAt),
  };
}

/**
 * Signature lines for the writing. The snapshot hash stays in the record and
 * is not printed.
 * @param {unknown} signatures
 */
function signatureBlockLines(signatures) {
  const seller = signatureParty(signatures, "seller");
  const buyer = signatureParty(signatures, "mac");
  return [
    "IN WITNESS WHEREOF, the Parties have caused this Agreement to be executed, and shall sign below when the timepieces are delivered to Buyer.",
    "SELLER",
    seller?.name ? `Name: ${seller.name}` : "Name: ________________________________",
    "Signature: ________________________________",
    seller?.date ? `Date: ${seller.date}` : "Date: ________________________________",
    "BUYER",
    BUYER_NAME,
    "By: ________________________________",
    buyer?.name ? `Name: ${buyer.name}` : "Name: ________________________________",
    "Title: ________________________________",
    "Signature: ________________________________",
    buyer?.date ? `Date: ${buyer.date}` : "Date: ________________________________",
  ];
}

function factLines(contract, collectionLines) {
  const dated = formatAgreementDate(contract.startDate) || contract.startDate;
  return [
    `This Sale and Repurchase Agreement (this "Agreement") is entered into as of ${dated} (the "Effective Date"), by and between ${contract.sellerName} ("Seller") and ${BUYER_NAME} ("Buyer").`,
    `The purchase price for the Collection is ${money(contract.saleAmount)} (the "Sale Amount"). The Term is ${contract.termMonths} months.`,
    contract.delivery ? `Seller shall deliver the timepieces on the following terms: ${contract.delivery}.` : "",
    `The Collection consists of the following timepieces: ${collectionLines.join("; ")}.`,
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
