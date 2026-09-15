import "server-only";
import { Resend } from "resend";
import { MAIL_KINDS, type MailKind, type MailRequest, type OutboxItem } from "@/lib/mail-types";
import { DEFAULT_SETTINGS } from "@/lib/theme";

export type { MailKind, MailRequest, OutboxItem };
export { MAIL_KINDS };

type ComposedMail = {
  kind: MailKind;
  to: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html: string;
};

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const outbox: OutboxItem[] = [];
const hits = new Map<string, { n: number; reset: number }>();

export function isMailKind(value: unknown): value is MailKind {
  return typeof value === "string" && (MAIL_KINDS as readonly string[]).includes(value);
}

export function isEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export function mailConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

export function mailFrom() {
  return process.env.RESEND_FROM_EMAIL?.trim() || "Mechanical Art Capital <onboarding@resend.dev>";
}

export function mailReplyTo() {
  return process.env.RESEND_REPLY_TO?.trim() || DEFAULT_SETTINGS.financingEmail;
}

export function listOutbox() {
  return [...outbox];
}

export function allowMailRequest(ip: string) {
  const now = Date.now();
  const limit = mailConfigured() ? 8 : 80;
  const slot = hits.get(ip);
  if (!slot || now > slot.reset) {
    hits.set(ip, { n: 1, reset: now + 60_000 });
    return true;
  }
  if (slot.n >= limit) return false;
  slot.n += 1;
  return true;
}

export function parseMailRequest(input: unknown): MailRequest {
  if (!input || typeof input !== "object") throw new Error("Missing mail payload.");
  const body = input as Record<string, unknown>;
  if (!isMailKind(body.kind)) throw new Error("Unknown mail kind.");

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (name.length < 1 || name.length > 120) throw new Error("Enter a name.");
  if (!isEmail(email)) throw new Error("Enter a valid email address.");

  const deskEmail = String(body.deskEmail ?? DEFAULT_SETTINGS.financingEmail).trim().toLowerCase();
  if (!isEmail(deskEmail)) throw new Error("Desk email is invalid.");

  const message = String(body.message ?? "").trim();
  if (message.length > 4000) throw new Error("Message is too long.");
  if (body.kind === "inquiry" && message.length < 4) throw new Error("Write a short message.");

  const role = String(body.role ?? "collector").trim().slice(0, 32);
  const phone = String(body.phone ?? "").trim().slice(0, 40);
  const watch = String(body.watch ?? "").trim().slice(0, 160);
  const amount = String(body.amount ?? "").trim().slice(0, 40);
  const delivery = String(body.delivery ?? "").trim().slice(0, 80);
  const termMonths = Number(body.termMonths ?? 0);

  return {
    kind: body.kind,
    name,
    email,
    message,
    role,
    phone,
    watch,
    amount,
    delivery,
    deskEmail,
    termMonths: Number.isFinite(termMonths) ? termMonths : 0,
  };
}

export async function dispatchMail(request: MailRequest) {
  const composed = composeMail(request);
  const results: OutboxItem[] = [];

  for (const mail of composed) {
    results.push(await deliver(mail));
  }

  return {
    preview: !mailConfigured(),
    messages: results,
  };
}

function composeMail(request: MailRequest): ComposedMail[] {
  const desk = request.deskEmail || DEFAULT_SETTINGS.financingEmail;
  const greeting = request.name.split(" ")[0] || request.name;

  switch (request.kind) {
    case "inquiry":
      return [
        letter({
          kind: "inquiry",
          to: [desk],
          replyTo: request.email,
          subject: `Desk inquiry from ${request.name}`,
          heading: "New collector inquiry",
          intro: `${request.name} wrote the New York desk.`,
          rows: [
            ["Name", request.name],
            ["Email", request.email],
            ["Phone", request.phone || "Not provided"],
          ],
          body: request.message || "No message.",
        }),
        letter({
          kind: "inquiry",
          to: [request.email],
          subject: "We received your Mechanical Art Capital inquiry",
          heading: `Thank you, ${greeting}`,
          intro:
            "A managing partner will review your collection requirements and reply privately within two hours during desk hours.",
          rows: [
            ["Desk", desk],
            ["Phone", DEFAULT_SETTINGS.phone],
          ],
          body: request.message,
        }),
      ];
    case "welcome":
      return [
        letter({
          kind: "welcome",
          to: [request.email],
          subject: "Your Mechanical Art Capital collection is open",
          heading: `Welcome, ${greeting}`,
          intro:
            "Your collection is ready. Register timepieces for market valuations. After you apply, MAC may purchase qualifying pieces and you may buy them back on a preset scale. This is not a loan.",
          rows: [
            ["Account", request.email],
          ],
        }),
      ];
    case "invite":
      return [
        letter({
          kind: "invite",
          to: [request.email],
          subject: `You are invited to Mechanical Art Capital as ${request.role || "collector"}`,
          heading: `${greeting}, you have been invited`,
          intro: `The desk added you as ${request.role || "collector"}. Sign in with this email to open the collector app or the admin desk.`,
          rows: [
            ["Role", request.role || "collector"],
            ["Email", request.email],
          ],
        }),
      ];
    case "appraisal":
      return [
        letter({
          kind: "appraisal",
          to: [desk, request.email],
          replyTo: request.email,
          subject: `Appraisal requested: ${request.watch || "timepiece"}`,
          heading: "Appraisal in review",
          intro: `${request.name} submitted a timepiece for appraisal. The desk will lock the profile and return a range.`,
          rows: [
            ["Collector", request.name],
            ["Email", request.email],
            ["Timepiece", request.watch || "Untitled"],
          ],
        }),
      ];
    case "financing":
      return [
        letter({
          kind: "financing",
          to: [desk, request.email],
          replyTo: request.email,
          subject: `Sale-and-repurchase application: ${request.watch || "timepiece"}`,
          heading: "Application received",
          intro: `${request.name} submitted a sale-and-repurchase application. MAC would purchase the timepiece; the collector may buy it back on the preset scale. This is not a loan.`,
          rows: [
            ["Seller", request.name],
            ["Email", request.email],
            ["Timepiece", request.watch || "Untitled"],
            ["Proposed sale", request.amount || "—"],
            ["Term", request.termMonths ? `${request.termMonths} months` : "—"],
            ["Delivery", request.delivery || "—"],
          ],
        }),
      ];
    case "membership":
      return [
        letter({
          kind: "membership",
          to: [request.email],
          subject: "Monthly appraisal membership is active",
          heading: "Membership confirmed",
          intro: `${greeting}, monthly mark-to-market certificates are now on your collection. Active sale-and-repurchase clients keep this complimentary while an agreement is live.`,
          rows: [
            ["Plan", `$${DEFAULT_SETTINGS.membershipMonthly.toFixed(2)} / month`],
            ["Account", request.email],
          ],
        }),
      ];
    case "test":
      return [
        letter({
          kind: "test",
          to: [request.email],
          subject: "Mechanical Art Capital Resend test",
          heading: "Resend is connected",
          intro: "This is a desk test from the Mechanical Art Capital prototype. If you can read this, outbound mail is live.",
          rows: [
            ["Sent to", request.email],
            ["Requested by", request.name],
          ],
        }),
      ];
  }
}

function letter({
  kind,
  to,
  replyTo,
  subject,
  heading,
  intro,
  rows,
  body,
}: {
  kind: MailKind;
  to: string[];
  replyTo?: string;
  subject: string;
  heading: string;
  intro: string;
  rows?: [string, string][];
  body?: string;
}): ComposedMail {
  const safeHeading = escapeHtml(heading);
  const safeIntro = escapeHtml(intro);
  const safeBody = body ? escapeHtml(body).replaceAll("\n", "<br />") : "";
  const rowHtml = (rows ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:#E8D5C0;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;width:140px">${escapeHtml(label)}</td><td style="padding:6px 0;color:#ffffff;font-size:14px">${escapeHtml(value)}</td></tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html>
  <body style="margin:0;background:#10141D;font-family:Georgia,'Times New Roman',serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#10141D;padding:28px 12px">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#161B24;border:1px solid #2a3140">
            <tr>
              <td style="background:#0E2A44;padding:22px 28px">
                <p style="margin:0;color:#FCB040;letter-spacing:0.22em;font-size:11px;font-weight:700">MECHANICAL ART CAPITAL</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px">
                <h1 style="margin:0 0 12px;color:#ffffff;font-size:22px;font-weight:500">${safeHeading}</h1>
                <p style="margin:0 0 18px;color:#d5d8de;font-size:15px;line-height:1.55">${safeIntro}</p>
                ${rowHtml ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 18px">${rowHtml}</table>` : ""}
                ${safeBody ? `<p style="margin:0;padding:14px 16px;background:#10141D;border:1px solid #2a3140;color:#f3eee6;font-size:14px;line-height:1.55">${safeBody}</p>` : ""}
              </td>
            </tr>
            <tr>
              <td style="padding:16px 28px 22px;border-top:1px solid #2a3140;color:#8b93a3;font-size:12px;line-height:1.5">
                Mechanical Art Capital · ${escapeHtml(DEFAULT_SETTINGS.phone)} · ${escapeHtml(DEFAULT_SETTINGS.financingEmail)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textRows = (rows ?? []).map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = [heading, "", intro, textRows, body ? `\n${body}` : "", "", `Mechanical Art Capital · ${DEFAULT_SETTINGS.phone}`]
    .filter(Boolean)
    .join("\n");

  return { kind, to, replyTo, subject, text, html };
}

async function deliver(mail: ComposedMail): Promise<OutboxItem> {
  const item: OutboxItem = {
    id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: mail.kind,
    to: mail.to,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    createdAt: new Date().toISOString(),
    status: "preview",
  };

  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    remember(item);
    return item;
  }

  try {
    const resend = new Resend(apiKey);
    const { data, error } = await resend.emails.send({
      from: mailFrom(),
      to: mail.to,
      replyTo: mail.replyTo || mailReplyTo(),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "kind", value: mail.kind }],
    });

    if (error) {
      throw new Error(error.message);
    }

    item.status = "sent";
    item.resendId = data?.id;
    remember(item);
    return item;
  } catch (error) {
    item.status = "failed";
    item.error = error instanceof Error ? error.message : "Resend could not send.";
    remember(item);
    throw new Error(item.error);
  }
}

function remember(item: OutboxItem) {
  outbox.unshift(item);
  if (outbox.length > 80) outbox.length = 80;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
