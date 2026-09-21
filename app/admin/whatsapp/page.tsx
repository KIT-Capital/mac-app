"use client";

import { Suspense, use, useState } from "react";
import { AdminChrome, AdminTable } from "@/components/admin-chrome";

type WhatsAppRow = {
  id: string;
  direction: "inbound" | "outbound";
  phone: string;
  body: string;
  kind: string | null;
  createdAt: string;
};

type InboxStatus = {
  configured: boolean;
  messages: WhatsAppRow[];
};

type InboxLoad = { ok: true; status: InboxStatus } | { ok: false; error: string };

const inboxLoads = new Map<number, Promise<InboxLoad>>();

function loadInbox(version: number) {
  const existing = inboxLoads.get(version);
  if (existing) return existing;
  const request = fetch("/api/desk/whatsapp").then(async (response) => {
    if (!response.ok) {
      return { ok: false as const, error: "Could not load WhatsApp." };
    }
    return { ok: true as const, status: (await response.json()) as InboxStatus };
  });
  inboxLoads.set(version, request);
  return request;
}

function AdminWhatsAppBody() {
  const [selected, setSelected] = useState<WhatsAppRow | null>(null);
  const loaded = use(loadInbox(0));
  const status = loaded.ok ? loaded.status : null;
  const loadError = loaded.ok ? "" : loaded.error;

  return (
    <AdminChrome title="WhatsApp">
      <p className="mb-4 max-w-2xl text-sm text-white/55">
        Retail collectors and dealers who opt in receive short sale-and-repurchase notices.
        Replies land here for a person on the Desk. This is not a login channel and not a public inbox.
      </p>

      {status ? (
        <div className="mb-6 rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">Transport</p>
          <p className="mt-2 text-[15px] text-white">
            {status.configured ? "Twilio WhatsApp is set" : "Add TWILIO_WHATSAPP_FROM to send"}
          </p>
        </div>
      ) : (
        <p className="mb-6 text-sm text-white/45">WhatsApp status is unavailable.</p>
      )}

      {loadError ? <p className="mb-4 text-sm text-red-400">{loadError}</p> : null}

      {!status?.messages.length ? (
        <p className="rounded-2xl border border-dashed border-white/15 bg-[#161B24] p-6 text-sm text-white/50">
          No WhatsApp yet. Opted-in collectors receive short notices. Inbound replies land here.
        </p>
      ) : (
        <AdminTable
          headers={["When", "Direction", "Phone", "Kind", ""]}
          rows={status.messages.map((message) => [
            new Date(message.createdAt).toLocaleString(),
            message.direction,
            message.phone,
            message.kind ?? "—",
            <button key={message.id} type="button" className="text-mac-gold" onClick={() => setSelected(message)}>
              Read
            </button>,
          ])}
        />
      )}

      {selected ? (
        <article className="mt-6 rounded-2xl border border-white/10 bg-[#161B24] p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-semibold tracking-[0.16em] text-mac-gold uppercase">
                {selected.direction}
              </p>
              <p className="mt-1 text-[12px] text-white/50">{selected.phone}</p>
            </div>
            <button type="button" className="text-[12px] text-white/60 underline" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>
          <pre className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-white/80">{selected.body}</pre>
        </article>
      ) : null}
    </AdminChrome>
  );
}

export default function AdminWhatsAppPage() {
  return (
    <Suspense
      fallback={
        <AdminChrome title="WhatsApp">
          <p className="text-sm text-white/45">Loading WhatsApp…</p>
        </AdminChrome>
      }
    >
      <AdminWhatsAppBody />
    </Suspense>
  );
}
