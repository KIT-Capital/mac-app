"use client";

import { FormEvent, useState } from "react";
import { CheckCircle2, Mail, MapPin, Phone, Send } from "lucide-react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
import { useStore } from "@/lib/store";

export default function ContactPage() {
  const { settings } = useStore();
  const [sent, setSent] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!email.includes("@")) return;
    setSent(true);
  }

  return (
    <main className="flex flex-1 flex-col bg-[#10141D]">
      <ScreenHeader title="Direct Deal Desk" />
      <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
        {/* Desk Introduction */}
        <div className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <span className="text-[10px] font-bold tracking-[0.16em] text-[#FCB040] uppercase">
            Private Horology Partners
          </span>
          <h2 className="mt-1 text-[18px] font-semibold text-white">New York Trading Desk</h2>
          <p className="mt-1 text-[12px] leading-relaxed text-white/70">
            For bespoke sale-and-repurchase requests, physical vault showings in Manhattan, or
            large multi-piece portfolios, contact our managing partners directly.
          </p>

          <div className="mt-4 space-y-2.5 border-t border-white/10 pt-3 text-[13px]">
            <a
              href={`tel:${settings.phone}`}
              className="flex items-center gap-3 text-white/80 transition hover:text-[#FCB040]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[#FCB040]">
                <Phone className="h-3.5 w-3.5" />
              </span>
              <span>{settings.phone}</span>
            </a>
            <a
              href={`mailto:${settings.financingEmail}`}
              className="flex items-center gap-3 text-white/80 transition hover:text-[#FCB040]"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[#FCB040]">
                <Mail className="h-3.5 w-3.5" />
              </span>
              <span>{settings.financingEmail}</span>
            </a>
            <div className="flex items-center gap-3 text-white/80">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/5 text-[#FCB040]">
                <MapPin className="h-3.5 w-3.5" />
              </span>
              <span>{settings.vaultLocation} (By appointment only)</span>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <h3 className="text-[13px] font-bold tracking-[0.14em] text-[#E8D5C0] uppercase">
            Send Encrypted Inquiry
          </h3>

          {sent ? (
            <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center space-y-2">
              <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-400" />
              <p className="text-[14px] font-semibold text-white">Inquiry Received</p>
              <p className="text-[12px] text-white/70">
                A managing partner will review your collection requirements and respond privately within two hours.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-4 space-y-3.5">
              <Field label="Your Name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  placeholder="Jonathan Hale"
                  className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
                />
              </Field>

              <Field label="Direct Email">
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="collector@domain.com"
                  className="w-full bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
                />
              </Field>

              <Field label="Message & Reference Details">
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  rows={3}
                  placeholder="Details regarding your timepieces or liquidity timeline..."
                  className="w-full resize-none bg-transparent text-[15px] text-white outline-none placeholder:text-white/30"
                />
              </Field>

              <PillButton type="submit" variant="gold" className="mt-2">
                <Send className="mr-2 h-4 w-4" /> Send Inquiry
              </PillButton>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
