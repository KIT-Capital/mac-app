"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import {
  BookOpen,
  Camera,
  ChevronLeft,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Mail,
  Sliders,
  Users2,
} from "lucide-react";
import { MacLogoMark } from "@/components/mac-logo";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/config", label: "Configure", icon: Sliders },
  { href: "/admin/access", label: "Access & Roles", icon: Users2 },
  { href: "/admin/catalog", label: "Timepiece Catalog", icon: BookOpen },
  { href: "/admin/assets", label: "Client Assets", icon: FileSpreadsheet },
  { href: "/admin/agreements", label: "Repo Agreements", icon: FileText },
  { href: "/admin/photos", label: "Photo Vault", icon: Camera },
  { href: "/admin/mail", label: "Outbound Mail", icon: Mail },
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
    <div className="flex flex-1 flex-col bg-[#10141D]">
      {/* Admin Top Navigation */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 bg-[#0E2A44] px-4">
        <Link
          href="/collection"
          className="mac-tap flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-white/80 uppercase hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Collector App
        </Link>
        <span className="flex items-center gap-2 text-[12px] font-bold tracking-[0.2em] text-[#FCB040] uppercase">
          <span className="flex h-8 w-8 items-center justify-center">
            <MacLogoMark onDark />
          </span>
          Desk · {title}
        </span>
        <div className="w-16" />
      </header>

      {/* Horizontal Tab Subnavigation */}
      <nav className="flex gap-1 overflow-x-auto border-b border-white/10 bg-[#161B24] px-2 py-1.5 no-scrollbar">
        {LINKS.map((link) => {
          const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
          const Icon = link.icon;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] font-semibold tracking-wider whitespace-nowrap uppercase transition",
                active
                  ? "bg-[#FCB040] text-[#0A0D14] shadow-sm"
                  : "text-white/60 hover:bg-white/5 hover:text-white",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {link.label}
            </Link>
          );
        })}
      </nav>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
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
    <div className="rounded-2xl border border-white/10 bg-[#161B24] p-4 shadow-sm">
      <p className="text-[10px] font-semibold tracking-[0.16em] text-white/50 uppercase">{label}</p>
      <p className="mt-2 text-2xl font-bold text-[#FCB040]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-white/60">{hint}</p> : null}
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
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#161B24]">
      <table className="w-full min-w-[540px] text-left text-[13px]">
        <thead className="border-b border-white/10 bg-[#0E2A44] text-[10px] font-bold tracking-[0.16em] text-white/70 uppercase">
          <tr>
            {headers.map((h) => (
              <th key={h} className="px-3.5 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, i) => (
            <tr key={i} className="transition hover:bg-white/[0.02]">
              {row.map((cell, j) => (
                <td key={j} className="px-3.5 py-3 align-middle text-white/80">
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
