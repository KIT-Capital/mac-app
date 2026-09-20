import { Resend } from "resend";
import { ATTESTATION_LABEL, PENDING_COUNSEL_LABEL } from "./contract/repo-agreement-snapshot.mjs";

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

function mailFrom(env) {
  return env.RESEND_FROM_EMAIL?.trim() || "Mechanical Art Capital <info@mechartcap.com>";
}

function mailReplyTo(env) {
  return env.RESEND_REPLY_TO?.trim() || "financing@mechartcap.com";
}
export const SEND_WINDOW_MS = 60 * 60 * 1000;
export const SENDS_PER_HOUR = 5;

export function escapeMailHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[char] ?? char));
}

export function normalizeSendEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

export function confirmOtherRecipient(address, confirmAddress) {
  const first = normalizeSendEmail(address);
  const second = normalizeSendEmail(confirmAddress);
  if (!first || !second || first !== second || !EMAIL_RE.test(first)) {
    throw new Error("DOCUMENT_RECIPIENT_UNCONFIRMED");
  }
  return first;
}

export function resolveSendRecipient(actor, input) {
  const kind = String(input.recipientKind ?? "");
  if (kind === "self") {
    return { recipientKind: "self", recipientEmail: normalizeSendEmail(actor.email) };
  }
  if (kind === "other") {
    return {
      recipientKind: "other",
      recipientEmail: confirmOtherRecipient(input.address, input.confirmAddress),
    };
  }
  throw new Error("DOCUMENT_BODY_INVALID");
}

export function composeExecutedDocumentMail({ agreementCode, recipientEmail, inspectionCondition }) {
  const code = String(agreementCode || "MAC repurchase agreement").slice(0, 80);
  const subject = `${ATTESTATION_LABEL} — ${code}`;
  const text = [
    ATTESTATION_LABEL,
    "",
    `The attached PDF is the stored executed repurchase agreement ${code}.`,
    "This is a sale and repurchase, not a loan.",
    String(inspectionCondition || ""),
    "",
    "Mechanical Art Capital LLC",
  ].filter(Boolean).join("\n");
  const html = [
    `<p>${escapeMailHtml(ATTESTATION_LABEL)}</p>`,
    `<p>The attached PDF is the stored executed repurchase agreement ${escapeMailHtml(code)}.</p>`,
    "<p>This is a sale and repurchase, not a loan.</p>",
    inspectionCondition ? `<p>${escapeMailHtml(inspectionCondition)}</p>` : "",
  ].join("");
  return {
    to: [recipientEmail],
    subject,
    text,
    html,
    filename: `${code.replace(/[^\w.-]+/g, "-") || "mac-repurchase-agreement"}.pdf`,
  };
}

export function composeAgreementDocumentMail({ agreementCode, recipientEmail }) {
  const code = String(agreementCode || "MAC repurchase agreement").slice(0, 80);
  const subject = `${PENDING_COUNSEL_LABEL} — ${code}`;
  const text = [
    PENDING_COUNSEL_LABEL,
    "",
    `The attached PDF is the stored unsigned repurchase agreement ${code}.`,
    "It is for review, not for signature.",
    "",
    "Mechanical Art Capital LLC",
  ].join("\n");
  const safeCode = escapeMailHtml(code);
  const html = `<p>${escapeMailHtml(PENDING_COUNSEL_LABEL)}</p><p>The attached PDF is the stored unsigned repurchase agreement ${safeCode}.</p><p>It is for review, not for signature.</p>`;
  return {
    to: [recipientEmail],
    subject,
    text,
    html,
    filename: `${code.replace(/[^\w.-]+/g, "-") || "mac-repurchase-agreement"}.pdf`,
  };
}

/**
 * Sends the stored PDF as a Resend attachment. Never writes the desk outbox.
 * @param {{
 *   to: string[],
 *   subject: string,
 *   text: string,
 *   html: string,
 *   filename: string,
 *   bytes: Uint8Array,
 * }} mail
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   sendEmail?: (message: Record<string, unknown>) => Promise<{ data: { id?: string } | null, error: unknown }>,
 *   now?: number,
 * }} [options]
 */
export async function dispatchAgreementDocumentMail(mail, options = {}) {
  const env = options.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  const message = {
    from: mailFrom(env),
    to: mail.to,
    replyTo: mailReplyTo(env),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
    tags: [{ name: "kind", value: "agreement-document" }],
    attachments: [{ filename: mail.filename, content: Buffer.from(mail.bytes) }],
  };
  if (!apiKey) {
    return { status: "preview", id: null };
  }
  const send = options.sendEmail
    ?? ((payload) => new Resend(apiKey).emails.send(payload));
  try {
    const { data, error } = await send(message);
    if (error) throw new Error("DOCUMENT_SEND_FAILED");
    return { status: "accepted", id: data?.id ?? null };
  } catch (error) {
    if (error instanceof Error && error.message === "DOCUMENT_SEND_TIMEOUT") throw error;
    throw new Error("DOCUMENT_SEND_FAILED", { cause: error });
  }
}
