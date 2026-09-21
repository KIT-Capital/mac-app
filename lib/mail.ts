import "server-only";
import { Resend } from "resend";
import { markMailFailed } from "@/lib/mail-delivery.mjs";
import { captureOperationalError } from "@/lib/observability.mjs";
import {
  MAIL_KINDS,
  type MailKind,
  type MailRequest,
  type OutboxItem,
  type RequestMailKind,
} from "@/lib/mail-types";
import { routeInternalRecipients } from "@/lib/internal-mail.mjs";
import {
  composeCollectorDeclineNotice,
  composeRequestNotices,
} from "@/lib/request-notice-mail.mjs";
import { DEFAULT_SETTINGS, brandFromSettings } from "@/lib/theme";
import { allowMailRequest as allowKeyedMailRequest } from "@/lib/mail-rate.mjs";

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

type MailEnvironment = Record<string, string | undefined>;
type SendEmailResult = {
  data: { id?: string } | null;
  error: unknown;
};
type MailDeliveryOptions = {
  env?: MailEnvironment;
  sendEmail?: (message: {
    from: string;
    to: string[];
    replyTo: string;
    subject: string;
    html: string;
    text: string;
    tags: { name: string; value: string }[];
  }, options?: { idempotencyKey?: string }) => Promise<SendEmailResult>;
};

const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const outbox: OutboxItem[] = [];

export function isMailKind(value: unknown): value is RequestMailKind {
  return typeof value === "string" && (MAIL_KINDS as readonly string[]).includes(value);
}

export function isEmail(value: string) {
  return EMAIL_RE.test(value.trim());
}

export function mailConfigured(env: MailEnvironment = process.env) {
  return Boolean(env.RESEND_API_KEY?.trim());
}

export function mailFrom(env: MailEnvironment = process.env) {
  return env.RESEND_FROM_EMAIL?.trim() || "Mechanical Art Capital <info@mechartcap.com>";
}

export function mailReplyTo(env: MailEnvironment = process.env) {
  const configured = env.RESEND_REPLY_TO?.trim() || DEFAULT_SETTINGS.financingEmail;
  return routeInternalRecipients([configured], env)[0];
}

export function listOutbox() {
  return [...outbox];
}

export function allowMailRequest(ip: string) {
  return allowKeyedMailRequest(ip);
}

export function parseMailRequest(input: unknown): MailRequest {
  if (!input || typeof input !== "object") throw new Error("Missing mail payload.");
  const body = input as Record<string, unknown>;
  if (!isMailKind(body.kind)) throw new Error("Unknown mail kind.");

  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  if (name.length < 1 || name.length > 120) throw new Error("Enter a name.");
  if (!isEmail(email)) throw new Error("Enter a valid email address.");

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
    termMonths: Number.isFinite(termMonths) ? termMonths : 0,
  };
}

export async function dispatchMail(
  request: MailRequest,
  options: MailDeliveryOptions = {},
) {
  const composed = composeMail(request);
  const results: OutboxItem[] = [];

  for (const mail of composed) {
    results.push(await deliver(mail, options));
  }

  return {
    preview: !mailConfigured(options.env),
    messages: results,
  };
}

export async function dispatchCollectorAccessMail(
  input: {
    to: string;
    name: string;
    action: "login" | "register" | "desk_login" | "desk_set_password";
    code?: string;
    url?: string;
    tokenId?: string;
  },
  options: MailDeliveryOptions = {},
) {
  const greeting = input.name.split(" ")[0] || "Collector";
  const isCode = Boolean(input.code);
  const mail = letter({
    kind: "access",
    to: [input.to],
    subject: isCode
      ? "Your Mechanical Art Capital sign-in code"
      : "Set your Mechanical Art Capital desk password",
    heading: isCode ? `${greeting}, enter your code` : `${greeting}, set your desk password`,
    intro: isCode
      ? "Enter this code in the app. It lasts 15 minutes and works once."
      : "Use the secure link below to set your desk password. It lasts 15 minutes and works once.",
    rows: [["Email", input.to]],
    body: input.code ?? input.url ?? "",
  });
  return deliver(
    mail,
    options,
    input.tokenId ? `collector-access/${input.tokenId}` : undefined,
    input.tokenId,
  );
}

function composeMail(request: MailRequest): ComposedMail[] {
  const desk = DEFAULT_SETTINGS.financingEmail;
  const greeting = request.name.split(" ")[0] || request.name;
  const brandedLetter = (fields: Parameters<typeof letter>[0]) =>
    letter({ ...fields, brandPreset: request.brandPreset });

  switch (request.kind) {
    case "inquiry":
      return [
        brandedLetter({
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
        brandedLetter({
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
        brandedLetter({
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
        brandedLetter({
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
        brandedLetter({
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
    case "repurchase":
      return [
        brandedLetter({
          kind: "repurchase",
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
    case "request_submitted":
    case "request_confirmed":
    case "request_withdrawn":
    case "request_signed":
    case "request_inspected":
    case "request_expired":
      return composeRequestNotices(request.kind, {
        name: request.name,
        email: request.email,
        watch: request.watch,
        amount: request.amount,
        delivery: request.delivery,
        termMonths: request.termMonths,
        deskEmail: desk,
      }).map((notice) => noticeToLetter(request.kind, notice, request.brandPreset));
    case "request_declined":
      return (
        request.message === "collector"
          ? composeCollectorDeclineNotice({
            name: request.name,
            email: request.email,
            watch: request.watch,
            deskEmail: desk,
          })
          : composeRequestNotices("request_declined", {
            name: request.name,
            email: request.email,
            watch: request.watch,
            amount: request.amount,
            delivery: request.delivery,
            termMonths: request.termMonths,
            deskEmail: desk,
          })
      ).map((notice) => noticeToLetter(request.kind, notice, request.brandPreset));
    case "membership":
      return [
        brandedLetter({
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
        brandedLetter({
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

function noticeToLetter(kind: MailKind, notice: {
  to: string[];
  replyTo?: string;
  subject: string;
  heading: string;
  intro: string;
  rows?: string[][];
  body?: string;
}, brandPreset?: "mac" | "mbf") {
  const rows = (notice.rows ?? [])
    .filter((row) => row.length >= 2)
    .map((row) => [String(row[0]), String(row[1])] as [string, string]);
  return letter({
    kind,
    to: notice.to,
    replyTo: notice.replyTo,
    subject: notice.subject,
    heading: notice.heading,
    intro: notice.intro,
    rows,
    body: notice.body,
    brandPreset,
  });
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
  brandPreset,
}: {
  kind: MailKind;
  to: string[];
  replyTo?: string;
  subject: string;
  heading: string;
  intro: string;
  rows?: [string, string][];
  body?: string;
  brandPreset?: "mac" | "mbf";
}): ComposedMail {
  const brand = brandFromSettings({ brandPreset });
  const safeHeading = escapeHtml(heading);
  const safeIntro = escapeHtml(intro);
  const safeBody = body ? escapeHtml(body).replaceAll("\n", "<br />") : "";
  const rowHtml = (rows ?? [])
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 0;color:${brand.palette.soft};font-size:11px;letter-spacing:0.14em;text-transform:uppercase;width:140px">${escapeHtml(label)}</td><td style="padding:6px 0;color:#ffffff;font-size:14px">${escapeHtml(value)}</td></tr>`,
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
              <td style="background:${brand.palette.primary};padding:22px 28px">
                <p style="margin:0;color:${brand.palette.accent};letter-spacing:0.22em;font-size:11px;font-weight:700">${escapeHtml(brand.companyName.toUpperCase())}</p>
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
                ${escapeHtml(brand.companyName)} · ${escapeHtml(DEFAULT_SETTINGS.phone)} · ${escapeHtml(DEFAULT_SETTINGS.financingEmail)}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const textRows = (rows ?? []).map(([label, value]) => `${label}: ${value}`).join("\n");
  const text = [heading, "", intro, textRows, body ? `\n${body}` : "", "", `${brand.companyName} · ${DEFAULT_SETTINGS.phone}`]
    .filter(Boolean)
    .join("\n");

  return { kind, to, replyTo, subject, text, html };
}

async function deliver(
  mail: ComposedMail,
  options: MailDeliveryOptions = {},
  idempotencyKey?: string,
  recordId?: string,
): Promise<OutboxItem> {
  const env = options.env ?? process.env;
  const apiKey = env.RESEND_API_KEY?.trim();
  const accessMail = mail.kind === "access";
  if (accessMail && !apiKey) {
    throw new Error("COLLECTOR_ACCESS_EMAIL_REQUIRED");
  }

  const recipients = routeInternalRecipients(mail.to, env);
  const item: OutboxItem = {
    id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    kind: mail.kind,
    to: recipients,
    subject: mail.subject,
    text: mail.text,
    html: mail.html,
    createdAt: new Date().toISOString(),
    status: "preview",
  };

  if (!apiKey) {
    remember(item);
    return item;
  }

  try {
    const message = {
      from: mailFrom(env),
      to: recipients,
      replyTo: mail.replyTo || mailReplyTo(env),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      tags: [{ name: "kind", value: mail.kind }],
    };
    const { data, error } = options.sendEmail
      ? await options.sendEmail(message, { idempotencyKey })
      : await new Resend(apiKey).emails.send(message, { idempotencyKey });

    if (error) {
      markMailFailed(item, error);
      if (accessMail) throw new Error("COLLECTOR_ACCESS_EMAIL_FAILED");
      await captureOperationalError(
        error,
        { operation: "mail.send", errorCode: "MAIL_SEND_FAILED", recordId: recordId ?? item.id },
      );
      remember(item);
      return item;
    }

    item.status = "sent";
    item.resendId = data?.id;
    if (!accessMail) remember(item);
    return item;
  } catch (error) {
    await captureOperationalError(
      error,
      {
        operation: accessMail ? "collector_access_mail.send" : "mail.send",
        errorCode: accessMail ? "COLLECTOR_ACCESS_EMAIL_FAILED" : "MAIL_SEND_FAILED",
        recordId: recordId ?? item.id,
      },
    );
    if (accessMail) {
      throw new Error("COLLECTOR_ACCESS_EMAIL_FAILED", { cause: error });
    }
    remember(markMailFailed(item, error));
    return item;
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
