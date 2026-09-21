"use client";

import Link from "next/link";
import { ScreenHeader } from "@/components/screen-header";
import { retailCatalog } from "@/lib/catalog-retail.mjs";
import { useStore } from "@/lib/store";

export default function BrandsPage() {
  const { brands, catalog } = useStore();
  const visible = retailCatalog(brands, catalog, false);
  const tierOne = visible.brands.filter((brand) => brand.tier === 1);
  const tierTwo = visible.brands.filter((brand) => brand.tier === 2);

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title="Brands we cover" backHref="/collection" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        <p className="text-[13px] leading-relaxed text-mac-muted">
          Names the Desk has reviewed for collector browse. No prices are shown here.
        </p>
        {!visible.brands.length ? (
          <p className="mt-6 text-[14px] text-mac-muted" data-testid="brands-empty">
            MAC is still reviewing which names to show.
          </p>
        ) : (
          <>
            <BrandList title="Tier One" brands={tierOne} />
            <BrandList title="Tier Two" brands={tierTwo} />
          </>
        )}
      </div>
    </main>
  );
}

function BrandList({
  title,
  brands,
}: {
  title: string;
  brands: { id: string; name: string; slug: string }[];
}) {
  if (!brands.length) return null;
  return (
    <section className="mt-6">
      <h2 className="text-[11px] uppercase tracking-[0.14em] text-mac-faint">{title}</h2>
      <ul className="mt-2 divide-y divide-mac-line bg-mac-card">
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link href={`/brands/${brand.slug}`} className="block px-4 py-3.5 text-[14px]">
              {brand.name}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
