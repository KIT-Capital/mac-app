"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { MacWordmark } from "@/components/mac-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/config", label: "Configure" },
  { href: "/admin/access", label: "Access" },
  { href: "/admin/catalog", label: "Catalog" },
  { href: "/admin/assets", label: "Assets" },
  { href: "/admin/agreements", label: "Agreements" },
  { href: "/admin/photos", label: "Photos" },
];

export function AdminChrome({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-black md:flex-row">
      <aside className="shrink-0 border-b border-white/10 bg-[#0E2A44] md:w-56 md:border-r md:border-b-0">
        <div className="px-4 py-4">
          <MacWordmark className="w-[150px]" />
          <p className="mt-2 text-[10px] tracking-[0.2em] text-[#FCB040] uppercase">Admin desk</p>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 md:flex-col md:overflow-visible md:px-3 md:pb-6">
          {LINKS.map((link) => {
            const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "mac-tap whitespace-nowrap px-3 text-[11px] tracking-[0.14em] text-white/55 uppercase",
                  active && "bg-black/25 text-white",
                )}
              >
                {link.label}
              </Link>
            );
          })}
          <Link href="/collection" className="mac-tap px-3 text-[11px] tracking-[0.14em] text-[#E8D5C0] uppercase">
            Collector app
          </Link>
        </nav>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-white/10 px-5">
          <h1 className="text-[13px] font-medium tracking-[0.22em] uppercase">{title}</h1>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </section>
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="border border-white/10 bg-[#111] px-4 py-4">
      <p className="text-[10px] tracking-[0.16em] text-white/40 uppercase">{label}</p>
      <p className="mt-2 text-2xl text-[#FCB040]">{value}</p>
      {hint ? <p className="mt-1 text-[12px] text-white/45">{hint}</p> : null}
    </div>
  );
}

export function AdminTable({
  headers,
  rows,
}: {
  headers: string[];
  rows: ReactNode[][];
}) {
  return (
    <div className="overflow-x-auto border border-white/10">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead className="bg-[#0E2A44] text-[10px] tracking-[0.16em] text-white/70 uppercase">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-white/8">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-3 align-top text-white/80">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
