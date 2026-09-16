import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { buildContractCopy } from "./repo-contract.mjs";

const NAVY = rgb(14 / 255, 42 / 255, 68 / 255);
const INK = rgb(17 / 255, 17 / 255, 17 / 255);
const MUTED = rgb(70 / 255, 70 / 255, 70 / 255);

/**
 * @param {import("./repo-contract.mjs").ContractInput} input
 */
export async function renderRepoContractPdf(input) {
  const copy = buildContractCopy(input);
  if (!copy.ok || !copy.model) {
    return { ok: false, errors: copy.errors, bytes: null };
  }

  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.addPage([612, 792]);
  let y = 744;

  const draw = (text, { size = 10, type = font, color = INK, x = 48 } = {}) => {
    const lines = wrap(text, type, size, 516);
    for (const line of lines) {
      if (y < 56) {
        page = pdf.addPage([612, 792]);
        y = 744;
      }
      page.drawText(winAnsi(line), { x, y, size, font: type, color });
      y -= size + 4;
    }
  };

  page.drawRectangle({ x: 0, y: 762, width: 612, height: 30, color: NAVY });
  page.drawText(winAnsi("Mechanical Art Capital"), {
    x: 48,
    y: 772,
    size: 12,
    font: bold,
    color: rgb(1, 1, 1),
  });

  draw("Repurchase Agreement", { size: 16, type: bold, color: NAVY });
  y -= 6;
  for (const paragraph of copy.model.paragraphs) {
    draw(paragraph, { size: 10 });
    y -= 4;
  }

  y -= 8;
  draw("Repurchase price if the seller buys back in this month", { size: 12, type: bold, color: NAVY });
  draw("Month     Date            Price                 Basis", { size: 9, type: bold, color: MUTED });
  for (const row of copy.model.schedule.rows) {
    const price = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    }).format(row.price);
    draw(
      `${String(row.month).padStart(2, "0")}        ${row.date}     ${price.padEnd(16, " ")} ${row.note}`,
      { size: 9 },
    );
  }

  const bytes = await pdf.save();
  return { ok: true, errors: [], bytes };
}

/**
 * @param {string} text
 * @param {import("pdf-lib").PDFFont} font
 * @param {number} size
 * @param {number} maxWidth
 */
function winAnsi(text) {
  return String(text).replace(/[^\t\n\r\x20-\x7E\xA0-\xFF]/g, "?");
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
