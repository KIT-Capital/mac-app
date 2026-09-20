"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Mail, MapPin, Phone, Send } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
import { hasApplication } from "@/lib/catalog";
import { sendAppEmail } from "@/lib/send-mail";
import { useStore } from "@/lib/store";

export default function ContactPage() {
  const { settings, user, updateProfile, agreements } = useStore();
  const [sent, setSent] = useState(false);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const resolvedName = name || user?.name || "";
  const resolvedEmail = email || user?.email || "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!resolvedEmail.includes("@")) return;
    setBusy(true);
    setError("");
    const result = await sendAppEmail({
      kind: "inquiry",
      name: resolvedName,
      email: resolvedEmail,
      message,
      phone: user?.phone,
    });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "The desk could not send that inquiry.");
      return;
    }
    updateProfile({ applicationSubmitted: true });
    setPreview(result.preview);
    setSent(true);
  }

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Direct Deal Desk" />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Desk Introduction */}
        <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
          <span className="text-[10px] font-bold tracking-[0.16em] text-mac-gold uppercase">
            Private Horology Partners
          </span>
          <h2 className="mt-1 text-[18px] font-semibold text-mac-fg">Private desk</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-mac-muted">
            For sale-and-repurchase applications or multi-piece collections, write the desk. MAC
            buys qualifying timepieces; you may buy them back on a preset scale. This is not a loan.
            Custody details follow after an application.
          </p>

          <div className="mt-4 space-y-2.5 border-t border-mac-line pt-3 text-[13px]">
            <a
              href={`tel:${settings.phone}`}
              className="flex items-center gap-3 text-mac-muted transition hover:text-mac-gold"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-mac-gold">
                <Phone className="h-3.5 w-3.5" />
              </span>
              <span>{settings.phone}</span>
            </a>
            <a
              href={`mailto:${settings.financingEmail}`}
              className="flex items-center gap-3 text-mac-muted transition hover:text-mac-gold"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-mac-gold">
                <Mail className="h-3.5 w-3.5" />
              </span>
              <span>{settings.financingEmail}</span>
            </a>
            {hasApplication(user, agreements) ? (
              <div className="flex items-center gap-3 text-mac-muted">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-mac-gold">
                  <MapPin className="h-3.5 w-3.5" />
                </span>
                <span>{settings.vaultLocation} (By appointment only)</span>
              </div>
            ) : null}
          </div>
        </div>

        {/* Contact Form */}
        <div className="rounded-2xl border border-mac-line bg-mac-card p-4">
          <h3 className="text-[13px] font-bold tracking-[0.14em] text-mac-champagne uppercase">
            Send Encrypted Inquiry
          </h3>

          {sent ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />
              <p className="text-[14px] font-semibold text-mac-fg">Inquiry Received</p>
              <p className="text-[12px] text-mac-muted">
                A managing partner will review your collection requirements and respond privately within two hours.
              </p>
              {preview ? (
                <p className="text-[11px] text-mac-gold">
                  Preview only — add a Resend API key to deliver the email.
                </p>
              ) : null}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
              <Field label="Your Name">
                <input
                  value={resolvedName}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Jonathan Hale"
                  className="w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
                />
              </Field>

              <Field label="Direct Email">
                <input
                  type="email"
                  value={resolvedEmail}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="collector@domain.com"
                  className="w-full bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
                />
              </Field>

              <Field label="Message & Reference Details">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={3}
                  placeholder="Timepieces you may wish to sell and later repurchase..."
                  className="w-full resize-none bg-transparent text-[15px] text-mac-fg outline-none placeholder:text-mac-faint"
                />
              </Field>

              {error ? <p className="text-center text-xs text-red-400">{error}</p> : null}
              <PillButton type="submit" variant="gold" className="mt-2" disabled={busy}>
                <Send className="mr-2 h-4 w-4" /> {busy ? "Sending…" : "Send Inquiry"}
              </PillButton>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
