"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { retailCatalog } from "@/lib/catalog-retail.mjs";
import { useStore } from "@/lib/store";

export default function PartnersPage() {
  const { brands, catalog } = useStore();
  const visible = retailCatalog(brands, catalog, false);

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Partners" backHref="/profile" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="text-[13px] leading-relaxed text-mac-muted">
          MAC buys and appraises independent and maison timepieces. These names are manufacturers
          in the catalog — Mechanical Art Capital is the desk.
        </p>
        {!visible.brands.length ? (
          <p className="mt-5 text-[14px] text-mac-muted">
            MAC is still reviewing which names to show.{" "}
            <Link href="/brands" className="text-mac-gold underline underline-offset-4">
              Brands we cover
            </Link>
          </p>
        ) : (
          <ul className="mt-5 divide-y divide-mac-line bg-mac-card">
            {visible.brands.map((brand) => (
              <li key={brand.id} className="px-4 py-3.5 text-[14px]">
                {brand.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
