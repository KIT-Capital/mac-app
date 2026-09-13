"use client";

import { ScreenHeader } from "@/components/screen-header";
import { TIER_ONE_BRANDS } from "@/lib/catalog";

export default function PartnersPage() {
  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Partners" backHref="/profile" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="text-[13px] leading-relaxed text-mac-muted">
          MAC buys and appraises independent and maison timepieces. These names are manufacturers
          in the catalog — Mechanical Art Capital is the desk.
        </p>
        <ul className="mt-5 divide-y divide-mac-line bg-mac-card">
          {TIER_ONE_BRANDS.map((brand) => (
            <li key={brand} className="px-4 py-3.5 text-[14px]">
              {brand}
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
