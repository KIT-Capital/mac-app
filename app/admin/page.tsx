"use client";

import { AdminChrome, StatCard } from "@/components/admin-chrome";
import { money } from "@/lib/catalog";
import { useStore } from "@/lib/store";

export default function AdminOverviewPage() {
  const { timepieces, agreements, users, catalog, photos, settings } = useStore();
  const appraised = timepieces.filter((w) => w.status === "appraised");
  const reviewing = timepieces.filter((w) => w.status === "reviewing");
  const book = appraised.reduce((sum, w) => sum + (w.valueLow || 0), 0);
  const pipeline = agreements.reduce((sum, a) => sum + a.amount, 0);
  const maxBar = Math.max(appraised.length, reviewing.length, timepieces.length - appraised.length - reviewing.length, 1);

  const bars = [
    { label: "Appraised", n: appraised.length, color: "var(--brand-primary)" },
    { label: "Reviewing", n: reviewing.length, color: "var(--brand-accent)" },
    { label: "Draft", n: timepieces.length - appraised.length - reviewing.length, color: "var(--brand-soft)" },
  ];

  return (
    <AdminChrome title="Desk overview">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Assets" value={timepieces.length} hint={`${appraised.length} appraised`} />
        <StatCard label="Catalog refs" value={catalog.length} hint="Timepiece database" />
        <StatCard label="Agreements" value={agreements.length} hint={money(pipeline)} />
        <StatCard label="Photos" value={photos.length} hint={`${users.length} users`} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <section className="border border-white/25 bg-[#222] p-4">
          <p className="text-[10px] tracking-[0.16em] text-white/40 uppercase">Collection status</p>
          <div className="mt-4 flex h-40 items-end gap-4">
            {bars.map((bar) => (
              <div key={bar.label} className="flex flex-1 flex-col items-center justify-end">
                <div
                  className="w-full max-w-16"
                  style={{ height: `${Math.max(8, (bar.n / maxBar) * 140)}px`, background: bar.color }}
                />
                <p className="mt-2 text-[11px] text-white/55">{bar.label}</p>
                <p className="text-[13px]">{bar.n}</p>
              </div>
            ))}
          </div>
        </section>
        <section className="border border-white/25 bg-[#222] p-4">
          <p className="text-[10px] tracking-[0.16em] text-white/40 uppercase">Policy in force</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-white/40">Buyback scale</dt>
              <dd>{Math.round(settings.startingRate * 100)}%</dd>
            </div>
            <div>
              <dt className="text-white/40">Max purchase</dt>
              <dd>{Math.round(settings.maxLtv * 100)}%</dd>
            </div>
            <div>
              <dt className="text-white/40">Min purchase</dt>
              <dd>{money(settings.minAdvance)}</dd>
            </div>
            <div>
              <dt className="text-white/40">Close</dt>
              <dd>{settings.closeBusinessDays} days</dd>
            </div>
            <div>
              <dt className="text-white/40">Vault</dt>
              <dd>{settings.vaultLocation}</dd>
            </div>
            <div>
              <dt className="text-white/40">Appraised book</dt>
              <dd>{money(book)}</dd>
            </div>
          </dl>
        </section>
      </div>
    </AdminChrome>
  );
}
