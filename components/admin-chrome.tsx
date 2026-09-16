"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Fragment, type ReactNode } from "react";
import {
  BookOpen,
  Camera,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  LogOut,
  Mail,
  Sliders,
  Smartphone,
  Users2,
} from "lucide-react";
import { MacLogoMark } from "@/components/mac-logo";
import { endClientSession } from "@/lib/session-client";
import { useStore } from "@/lib/store";
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
  const router = useRouter();
  const { signOut, user } = useStore();

  async function leaveDesk() {
    await endClientSession(signOut);
    router.replace("/login");
  }

  return (
    <div className="flex h-full min-h-0 w-full">
      <aside className="flex w-[200px] shrink-0 flex-col border-r border-white/10 bg-[#0E2A44] xl:w-[220px]">
        <div className="flex items-center gap-2 px-4 pt-5 pb-4">
          <span className="flex h-10 w-10 items-center justify-center">
            <MacLogoMark onDark />
          </span>
          <p className="text-[10px] tracking-[0.16em] text-[#FCB040] uppercase">Admin desk</p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-2" aria-label="Desk">
          {LINKS.map((link) => {
            const active = link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2.5 py-2 text-[11px] font-semibold tracking-[0.08em] uppercase",
                  active ? "bg-[#FCB040] text-[#0A0D14]" : "text-white/65 hover:bg-white/5 hover:text-white",
                )}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" />
                {link.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-white/10 px-3 py-3">
          <p className="truncate px-1 text-[11px] text-white/45">{user?.name || "Desk"}</p>
          <Link
            href="/collection"
            className="mt-2 flex items-center gap-2 rounded-md px-2 py-2 text-[11px] tracking-[0.08em] text-white/60 uppercase hover:bg-white/5 hover:text-white"
          >
            <Smartphone className="h-3.5 w-3.5" />
            Collector app
          </Link>
          <button
            type="button"
            onClick={() => void leaveDesk()}
            className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[11px] tracking-[0.08em] text-white/50 uppercase hover:bg-white/5 hover:text-white"
          >
            <LogOut className="h-3.5 w-3.5" />
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-[#10141D]">
        <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-6">
          <span className="text-[12px] font-bold tracking-[0.2em] text-[#FCB040] uppercase">
            Desk · {title}
          </span>
          <span className="text-[11px] tracking-[0.14em] text-white/35 uppercase">16:9 admin</span>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">{children}</div>
      </div>
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
  expandedRows,
  selectedRow,
  onRowSelect,
}: {
  headers: string[];
  rows: ReactNode[][];
  expandedRows?: Array<ReactNode | null>;
  selectedRow?: number | null;
  onRowSelect?: (index: number) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[#161B24]">
      <table className="w-full min-w-[540px] text-left text-[13px]">
        <thead className="border-b border-white/10 bg-[#0E2A44] text-[10px] font-bold tracking-[0.16em] text-white/70 uppercase">
          <tr>
            {headers.map((h, i) => (
              <th key={`${h}-${i}`} className="px-3.5 py-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {rows.map((row, i) => (
            <Fragment key={i}>
              <tr
                className={cn(
                  "transition hover:bg-white/[0.02]",
                  selectedRow === i ? "bg-white/[0.04]" : "",
                  onRowSelect ? "cursor-pointer" : "",
                )}
                onClick={onRowSelect ? () => onRowSelect(i) : undefined}
              >
                {row.map((cell, j) => (
                  <td key={j} className="px-3.5 py-3 align-middle text-white/80">
                    {cell}
                  </td>
                ))}
              </tr>
              {expandedRows?.[i] ? (
                <tr>
                  <td colSpan={headers.length} className="px-3.5 py-4">
                    {expandedRows[i]}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
