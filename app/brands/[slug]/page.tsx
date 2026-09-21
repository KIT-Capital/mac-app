"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ScreenHeader } from "@/components/screen-header";
import { WatchPhoto } from "@/components/watch-photo";
import { retailCatalog } from "@/lib/catalog-retail.mjs";
import { useStore } from "@/lib/store";

export default function BrandModelsPage() {
  const params = useParams<{ slug: string }>();
  const slug = String(params.slug ?? "");
  const { brands, catalog } = useStore();
  const visible = retailCatalog(brands, catalog, false);
  const brand = visible.brands.find((row) => row.slug === slug);
  const models = brand ? visible.catalog.filter((entry) => entry.brandId === brand.id) : [];

  return (
    <main className="flex flex-1 flex-col bg-mac-bg text-mac-fg">
      <ScreenHeader title={brand?.name ?? "Brand"} backHref="/brands" />
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {!brand ? (
          <p className="text-[14px] text-mac-muted">This name is not on collector browse.</p>
        ) : !models.length ? (
          <p className="text-[14px] text-mac-muted" data-testid="models-coming-soon">
            Models coming soon
          </p>
        ) : (
          <ul className="space-y-6">
            {models.map((entry) => (
              <li key={entry.id} className="bg-mac-card p-4">
                <div className="aspect-square overflow-hidden bg-mac-bg">
                  {entry.photoSourceUrl || entry.photoObjectKey ? (
                    <WatchPhoto
                      src={entry.photoSourceUrl || entry.photoObjectKey}
                      alt={`${entry.brand} ${entry.model}`}
                      watch={{ brand: entry.brand, model: entry.model }}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[12px] uppercase tracking-[0.14em] text-mac-faint">
                      {entry.brand.slice(0, 3)}
                    </div>
                  )}
                </div>
                <p className="mt-3 text-[14px]">{entry.model}</p>
                <p className="text-[13px] text-mac-muted">{entry.reference}</p>
                <Link
                  href={`/collection/add?brand=${encodeURIComponent(entry.brand)}&model=${encodeURIComponent(entry.model)}`}
                  className="mt-3 inline-block text-[13px] text-mac-gold underline underline-offset-4"
                >
                  Add this piece
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
