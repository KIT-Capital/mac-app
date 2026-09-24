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
  const navy = hexRgb(brand.palette.primary);
  const gold = hexRgb(brand.palette.accent);
  const ink = rgb(17 / 255, 17 / 255, 17 / 255);
  const muted = rgb(0.32, 0.3, 0.27);
  const wash = rgb(0.965, 0.953, 0.925);
  const left = 72;
  const width = 468;
  /** @type {import("pdf-lib").PDFPage} */
  let page = pdf.addPage([612, 792]);
  let y = 724;

  const continuePage = () => {
    page = pdf.addPage([612, 792]);
    y = 700;
    const running = latin1PdfText(`${brand.companyName}  ·  Sale and Repurchase Agreement`);
    page.drawText(running, { x: left, y: 748, size: 8, font: italic, color: muted });
    page.drawRectangle({ x: left, y: 740, width, height: 0.7, color: navy });
    page.drawRectangle({ x: left, y: 738, width, height: 0.35, color: gold });
  };

  const ensure = (height) => {
    if (y - height < 78) continuePage();
  };

  const leading = 14;

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

  const drawTracked = (text, { size = 12, type = bold, color = navy, gap = 6 } = {}) => {
    drawCentered(text, { size, type, color, gap });
  };

  const drawRules = () => {
    page.drawRectangle({ x: left, y, width, height: 1.15, color: navy });
    page.drawRectangle({ x: left, y: y - 2.4, width, height: 0.4, color: gold });
    y -= 16;
  };

  const drawExecutionField = (x, label, value) => {
    const lineY = y - 14;
    if (value) {
      page.drawText(latin1PdfText(value), { x, y: lineY + 4, size: 11, font: italic, color: ink });
    }
    page.drawRectangle({ x, y: lineY, width: 210, height: 0.6, color: ink });
    page.drawText(latin1PdfText(label), { x, y: lineY - 12, size: 8, font, color: muted });
  };

  drawTracked(brand.companyName.toUpperCase(), { size: 10, tracking: 2.2, gap: 10 });
  drawRules();
  y -= 8;
  drawTracked("SALE AND REPURCHASE AGREEMENT", { size: 13, tracking: 0.85, gap: 8 });
  drawCentered(AGREEMENT_FACE_LABEL, { size: 9, type: italic, color: muted, gap: 4 });
  const dated = formatAgreementDate(snapshot.contract?.startDate) || String(snapshot.contract?.startDate ?? "");
  const caption = [
    snapshot.contract?.agreementCode ? `No. ${snapshot.contract.agreementCode}` : "",
    dated,
  ].filter(Boolean).join("   ·   ");
  if (caption) drawCentered(caption, { size: 10, type: font, color: ink, gap: 8 });
  const sellerCaption = snapshot.contract?.sellerName ? String(snapshot.contract.sellerName) : "";
  if (sellerCaption) {
    drawCentered("between", { size: 9, type: italic, color: muted, gap: 2 });
    drawCentered(sellerCaption, { size: 11, type: font, color: ink, gap: 1 });
    drawCentered("and", { size: 9, type: italic, color: muted, gap: 2 });
    drawCentered(BUYER_NAME, { size: 11, type: font, color: ink, gap: 10 });
  }

  for (const line of snapshot.facts) drawBlock(line);
  for (const clause of snapshot.clauses) {
    ensure(leading + 8);
    draw(`${clause.number}.   ${clause.heading}`, { size: 12, type: bold, color: navy, gap: 6 });
    y -= 2;
    drawBlock(clause.body);
  }

  continuePage();
  drawTracked("SCHEDULE A", { size: 12, tracking: 2.4, gap: 4 });
  drawCentered("Monthly Repurchase Prices", { size: 11, type: italic, color: muted, gap: 12 });
  drawBlock(
    "This Schedule A is attached to and made a part of this Agreement. The price opposite each month is the repurchase price payable if Seller repurchases the Collection in that month.",
  );
  const colWidths = [52, 108, 108, 200];
  const tableWidth = colWidths.reduce((sum, item) => sum + item, 0);
  const tableLeft = (612 - tableWidth) / 2;
  const headers = ["Month", "Date", "Price", "Basis"];
  const aligns = ["center", "center", "right", "left"];
  const rowHeight = 18;
  const paintRow = (cells, { header = false, stripe = false } = {}) => {
    ensure(rowHeight + 2);
    const top = y + 13;
    page.drawRectangle({
      x: tableLeft,
      y: top - rowHeight,
      width: tableWidth,
      height: rowHeight,
      color: header ? navy : stripe ? wash : rgb(1, 1, 1),
    });
    let x = tableLeft;
    cells.forEach((cell, index) => {
      const size = header ? 8 : 8;
      const type = header ? bold : font;
      const safe = latin1PdfText(wrap(String(cell), type, size, colWidths[index] - 12)[0] || "");
      const textWidth = type.widthOfTextAtSize(safe, size);
      const align = header ? "center" : aligns[index];
      const textX = align === "right"
        ? x + colWidths[index] - 8 - textWidth
        : align === "left"
          ? x + 8
          : x + (colWidths[index] - textWidth) / 2;
      page.drawText(safe, {
        x: textX,
        y: top - 12,
        size,
        font: type,
        color: header ? rgb(1, 1, 1) : ink,
      });
      x += colWidths[index];
    });
    y -= rowHeight;
  };
  paintRow(headers, { header: true });
  snapshot.schedule.rows.forEach((row, index) => {
    paintRow(
      [String(row.month), String(row.date), money(row.price), String(row.note)],
      { stripe: index % 2 === 1 },
    );
  });
  page.drawRectangle({ x: tableLeft, y: y + 13, width: tableWidth, height: 0.7, color: gold });
  y -= 8;
  drawBlock(
    "If a date in this Schedule falls on a Saturday, Sunday, or a day on which commercial banks in New York, New York are authorized to close, that date is the next day on which those banks are open.",
    { size: 9, type: italic, color: muted, after: 0 },
  );

  continuePage();
  drawTracked("IN WITNESS WHEREOF", { size: 12, tracking: 1.6, gap: 12 });
  drawBlock(
    "The Parties have caused this Agreement to be executed as of the date first written above. Each Party shall sign below when the timepieces are delivered to Buyer. A signature in this block is that Party's acceptance of this Agreement.",
  );
  const seller = signatureParty(snapshot.signatures, "seller");
  const buyer = signatureParty(snapshot.signatures, "mac");
  const columns = [
    {
      title: "SELLER",
      entity: sellerCaption || seller?.name || "",
      fields: [
        ["Signature", ""],
        ["Name", seller?.name || sellerCaption],
        ["Date", seller?.date || ""],
      ],
    },
    {
      title: "BUYER",
      entity: BUYER_NAME,
      fields: [
        ["Signature", ""],
        ["Name", buyer?.name || ""],
        ["Title", ""],
        ["Date", buyer?.date || ""],
      ],
    },
  ];
  const columnTop = y;
  columns.forEach((column, index) => {
    const x = left + index * 246;
    y = columnTop;
    page.drawRectangle({ x, y: y + 8, width: 210, height: 1.1, color: gold });
    page.drawText(column.title, { x, y: y - 8, size: 10, font: bold, color: navy });
    y -= 24;
    if (column.entity) {
      page.drawText(latin1PdfText(column.entity), { x, y, size: 10, font: italic, color: ink });
    }
    y -= 26;
    for (const [label, value] of column.fields) {
      drawExecutionField(x, label, value);
      y -= 36;
    }
  });

  const pages = pdf.getPages();
  const code = latin1PdfText(String(snapshot.contract?.agreementCode || ""));
  pages.forEach((printed, index) => {
    printed.drawRectangle({ x: left, y: 48, width, height: 0.7, color: navy });
    printed.drawRectangle({ x: left, y: 46, width, height: 0.35, color: gold });
    if (code) printed.drawText(code, { x: left, y: 32, size: 8, font, color: muted });
    const draft = "DRAFT";
    const draftWidth = bold.widthOfTextAtSize(draft, 8);
    printed.drawText(draft, { x: (612 - draftWidth) / 2, y: 32, size: 8, font: bold, color: navy });
    const pageLabel = `Page ${index + 1} of ${pages.length}`;
    const pageWidth = font.widthOfTextAtSize(pageLabel, 8);
    printed.drawText(pageLabel, { x: left + width - pageWidth, y: 32, size: 8, font, color: muted });
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
 * Times is WinAnsi. Keep the dashes and quotation marks a law office would set,
 * and replace anything the face cannot draw.
 * @param {string} text
 */
export function latin1PdfText(text) {
  return String(text).replace(/[^\t\n\r\x20-\x7E\xA0-\xFF\u2013\u2014\u2018\u2019\u201C\u201D]/g, "?");
}

/**
 * @param {string} hex
 */
function hexRgb(hex) {
  const raw = String(hex).replace("#", "");
  return rgb(
    parseInt(raw.slice(0, 2), 16) / 255,
    parseInt(raw.slice(2, 4), 16) / 255,
    parseInt(raw.slice(4, 6), 16) / 255,
  );
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
