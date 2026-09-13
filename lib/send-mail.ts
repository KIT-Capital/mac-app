import type { MailRequest } from "@/lib/mail-types";

export type MailSendResult = {
  ok: boolean;
  preview: boolean;
  error?: string;
};

export async function sendAppEmail(payload: MailRequest): Promise<MailSendResult> {
  try {
    const response = await fetch("/api/mail", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await response.json()) as { error?: string; preview?: boolean };
    if (!response.ok) {
      return { ok: false, preview: Boolean(data.preview), error: data.error || "The desk could not send that email." };
    }
    return { ok: true, preview: Boolean(data.preview) };
  } catch {
    return { ok: false, preview: false, error: "The mail service is unreachable." };
  }
}
