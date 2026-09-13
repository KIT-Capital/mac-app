"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";
import { Field, PillButton } from "@/components/field";
import { sendAppEmail } from "@/lib/send-mail";
import type { OutboxItem } from "@/lib/mail-types";

type MailStatus = {
  configured: boolean;
  from: string;
  messages: OutboxItem[];
};

export default function AdminMailPage() {
  const [status, setStatus] = useState<MailStatus | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("Desk test");
  const [selected, setSelected] = useState<OutboxItem | null>(null);

  async function refresh() {
    const response = await fetch("/api/mail");
    if (!response.ok) {
      setError("Could not load the outbox.");
      return;
    }
    setStatus((await response.json()) as MailStatus);
    setError("");
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function onTest(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await sendAppEmail({ kind: "test", name, email });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || "Test send failed.");
      return;
    }
    await refresh();
  }

  return (
    <AdminChrome title="Outbound mail">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Collector inquiries, vault welcomes, desk invites, appraisals, and repo drafts go out through Resend.
        Without an API key the messages stay in this session outbox so you can still read them.
      </p>

      {status ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">Transport</p>
          <p className="mt-2 text-[15px] text-white">
            {status.configured ? "Resend is live" : "Preview mode — add RESEND_API_KEY to deliver"}
          </p>
          <p className="mt-1 text-[12px] text-white/55">From {status.from}</p>
        </div>
      ) : (
        <p className="mb-6 text-sm text-white/45">Loading mail status…</p>
      )}

      <form onSubmit={onTest} className="mb-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Field label="Test recipient">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <Field label="Requested by">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full bg-transparent py-1 text-[16px] outline-none"
          />
        </Field>
        <PillButton type="submit" variant="gold" disabled={busy}>
          {busy ? "Sending…" : "Send Resend test"}
        </PillButton>
      </form>

      {error ? <p className="mb-4 text-sm text-red-400">{error}</p> : null}

      {!status?.messages.length ? (
        <p className="rounded-2xl border border-dashed border-white/15 bg-[#161B24] p-6 text-sm text-white/50">
          No outbound mail yet. Send an inquiry, invite a collector, or run a test above.
        </p>
      ) : (
        <AdminTable
          headers={["When", "Kind", "To", "Subject", "Status", ""]}
          rows={status.messages.map((message) => [
            new Date(message.createdAt).toLocaleString(),
            message.kind,
            message.to.join(", "),
            message.subject,
            message.status,
            <button key={message.id} type="button" className="text-[#FCB040]" onClick={() => setSelected(message)}>
              Read
            </button>,
          ])}
        />
      )}

      {selected ? (
        <article className="mt-6 rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-[#FCB040] uppercase">{selected.kind}</p>
              <h2 className="mt-1 text-lg text-white">{selected.subject}</h2>
              <p className="mt-1 text-[12px] text-white/50">To {selected.to.join(", ")}</p>
            </div>
            <button type="button" className="text-[12px] text-white/60 underline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <pre className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">{selected.text}</pre>
        </article>
      ) : null}
    </AdminChrome>
  );
}
