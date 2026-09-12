"use client";

import { FormEvent, useState } from "react";
import { ScreenHeader } from "@/components/screen-header";
import { Field, PillButton } from "@/components/field";
import { COMPANY } from "@/lib/catalog";

export default function ContactPage() {
  const [sent, setSent] = useState(false);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <main className="flex flex-1 flex-col">
      <ScreenHeader title="Contact us" />
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <p className="text-sm leading-6 text-white/65">
          Mechanical Art Capital provides confidential, overnight financing to the high-end watch
          community through sale-and-repurchase agreements. The desk is in New York. Closings
          typically take two business days.
        </p>
        <div className="space-y-2 text-sm">
          <p>{COMPANY.phone}</p>
          <p>{COMPANY.email}</p>
          <p>{COMPANY.financingEmail}</p>
          <p>{COMPANY.handle}</p>
        </div>
        {sent ? (
          <p className="rounded-md border border-[#FCB040]/30 px-4 py-3 text-sm text-[#FCB040]">
            Message received. A MAC partner will reply privately.
          </p>
        ) : (
          <form onSubmit={onSubmit} className="space-y-5">
            <Field label="Your name">
              <input required className="w-full bg-transparent py-1 text-[16px] outline-none" />
            </Field>
            <Field label="Email">
              <input required type="email" className="w-full bg-transparent py-1 text-[16px] outline-none" />
            </Field>
            <Field label="How can we help?">
              <textarea required rows={4} className="w-full resize-none bg-transparent py-1 text-[16px] outline-none" />
            </Field>
            <PillButton type="submit">Send message</PillButton>
          </form>
        )}
      </div>
    </main>
  );
}
