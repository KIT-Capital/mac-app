import { REQUEST_NOTICE_KINDS } from "./request-notice-mail.mjs";

const NOT_A_LOAN = "This is a sale and repurchase, not a loan.";

const INTROS = {
  request_submitted: "MAC has your request. A partner will confirm or decline.",
  request_confirmed: "It is your turn to sign. MAC still inspects every piece before it executes.",
  request_declined: "MAC declined this request. You can send another collection later.",
  request_withdrawn: "MAC recorded that this request was withdrawn.",
  request_signed: "MAC has your signature. Inspection still comes before execution.",
  request_inspected: "Inspection is complete. MAC will execute only after it signs last.",
  request_expired: "This request window closed. Send a new request if you still want MAC to look.",
};

/**
 * Short retail WhatsApp copy. No piece names, dollars, or login secrets.
 * @param {string} kind
 * @param {{ name?: string }} [input]
 */
export function composeWhatsAppNotice(kind, input = {}) {
  if (!REQUEST_NOTICE_KINDS.includes(kind)) {
    throw new Error("WHATSAPP_NOTICE_KIND_INVALID");
  }
  const greeting = String(input.name || "Collector").split(" ")[0] || "Collector";
  return `${greeting}, ${INTROS[kind]} ${NOT_A_LOAN}`;
}
