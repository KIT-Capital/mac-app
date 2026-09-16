import { repurchaseSchedule, resolveScale } from "./repo-scale.mjs";

const FORBIDDEN = /\b(loan|interest|APR|lender|financing)\b/i;
const MAX_PIECES = 24;
const MAX_TEXT = 200;

/**
 * @typedef {{ name?: string, model?: string, brand?: string, reference?: string, serial?: string, condition?: string }} ContractPiece
 * @typedef {{
 *   sellerName: string,
 *   sellerEmail?: string,
 *   sellerPhone?: string,
 *   saleAmount: number,
 *   termMonths: number,
 *   startDate: string,
 *   delivery?: string,
 *   agreementCode?: string,
 *   scale?: Record<string, unknown>,
 *   timepieces: ContractPiece[],
 * }} ContractInput
 */

/**
 * @param {unknown} value
 */
function text(value) {
  return String(value ?? "").trim().slice(0, MAX_TEXT);
}

/**
 * @param {ContractInput} input
 */
export function parseContractInput(input) {
  const sellerName = text(input?.sellerName);
  const saleAmount = Number(input?.saleAmount);
  const termMonths = Number(input?.termMonths);
  const startDate = text(input?.startDate);
  const timepieces = Array.isArray(input?.timepieces) ? input.timepieces.slice(0, MAX_PIECES) : [];
  const scale = resolveScale(input?.scale && typeof input.scale === "object" ? input.scale : {}, termMonths);
  const errors = [];
  if (!sellerName) errors.push("SELLER_NAME_REQUIRED");
  if (!Number.isFinite(saleAmount) || saleAmount <= 0) errors.push("SALE_AMOUNT_REQUIRED");
  if (!Number.isFinite(termMonths) || termMonths < 1 || termMonths > 36 || scale.purchaseShare <= 0) {
    errors.push("SCALE_TERMS_INVALID");
  }
  if (!startDate || !/^\d{4}-\d{2}-\d{2}/.test(startDate)) errors.push("START_DATE_INVALID");
  if (!Array.isArray(input?.timepieces) || !input.timepieces.length) errors.push("TIMEPIECES_REQUIRED");
  if (Array.isArray(input?.timepieces) && input.timepieces.length > MAX_PIECES) errors.push("TIMEPIECES_LIMIT");
  return {
    ok: errors.length === 0,
    errors,
    value: {
      sellerName,
      sellerEmail: text(input?.sellerEmail),
      sellerPhone: text(input?.sellerPhone),
      saleAmount,
      termMonths,
      startDate,
      delivery: text(input?.delivery),
      agreementCode: text(input?.agreementCode),
      scale,
      timepieces: timepieces.map((piece) => ({
        name: text(piece?.name) || [text(piece?.brand), text(piece?.model)].filter(Boolean).join(" "),
        brand: text(piece?.brand),
        model: text(piece?.model),
        reference: text(piece?.reference),
        serial: text(piece?.serial),
        condition: text(piece?.condition),
      })),
    },
  };
}

/**
 * @param {ContractInput} input
 */
export function buildContractCopy(input) {
  const parsed = parseContractInput(input);
  if (!parsed.ok) return { ok: false, errors: parsed.errors, text: "", model: null };
  const contract = parsed.value;
  const schedule = repurchaseSchedule({ ...contract, ...contract.scale });
  if (!schedule.ok) return { ok: false, errors: schedule.errors, text: "", model: null };

  const pieceLines = contract.timepieces.map((piece, index) => {
    const label = piece.name || `Timepiece ${index + 1}`;
    const extras = [piece.reference && `ref. ${piece.reference}`, piece.serial && `serial ${piece.serial}`, piece.condition]
      .filter(Boolean)
      .join(", ");
    return extras ? `${label} (${extras})` : label;
  });

  const paragraphs = [
    "This is a sale and repurchase, not a loan. Mechanical Art Capital LLC purchases the listed timepieces at the sale amount. The seller may buy them back at the dollar price in the table for the month of repurchase.",
    `Seller: ${contract.sellerName}`,
    contract.sellerEmail ? `Seller email: ${contract.sellerEmail}` : "",
    contract.sellerPhone ? `Seller phone: ${contract.sellerPhone}` : "",
    "Buyer: Mechanical Art Capital LLC",
    `Agreement date: ${contract.startDate}`,
    contract.agreementCode ? `Contract: ${contract.agreementCode}` : "",
    `Sale amount: ${money(contract.saleAmount)}`,
    `Term: ${contract.termMonths} months`,
    contract.delivery ? `Delivery: ${contract.delivery}` : "",
    `Timepieces: ${pieceLines.join("; ")}`,
    `If the seller does not repurchase, MAC may sell the collection. Modeled liquidation value is ${money(schedule.liquidation)}; net after the named brokerage amount is ${money(schedule.liquidationNet)}.`,
    "After MAC pays the sale amount it does not owe the seller a remaining balance. Title is with MAC until a repurchase completes.",
  ].filter(Boolean);

  const textBody = [
    "Mechanical Art Capital — Repurchase Agreement",
    ...paragraphs,
    "Repurchase price by month",
    ...schedule.rows.map((row) => `${row.date}  ${money(row.price)}  ${row.note}`),
  ].join("\n");

  if (FORBIDDEN.test(textBody.replaceAll("not a loan", ""))) {
    return { ok: false, errors: ["CONTRACT_FORBIDDEN_LANGUAGE"], text: "", model: null };
  }

  return {
    ok: true,
    errors: [],
    text: textBody,
    model: { contract, schedule, paragraphs, pieceLines },
  };
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
