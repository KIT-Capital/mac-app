"use client";

import type { ReactNode } from "react";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import * as XLSX from "xlsx";
import { AdminChrome, StatCard } from "@/components/admin-chrome";
import {
  OPERATIONS_LEDGER_DISCLAIMER,
  analyticsCsv,
  deriveOperationsAnalytics,
  type AnalyticsTable,
} from "@/lib/analytics";
import { money } from "@/lib/catalog";
import { MAC } from "@/lib/theme";
import { useStore } from "@/lib/store";

const MIX_COLORS = [MAC.navy, MAC.gold, MAC.champagne, "#7A93A7", "#C9B08A", "#4A5D6E"];
const CHART_TOOLTIP = {
  background: "#161B24",
  border: "1px solid rgba(255,255,255,0.12)",
  color: "#fff",
};

function download(filename: string, mime: string, body: BlobPart) {
  const url = URL.createObjectURL(new Blob([body], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function exportTable(table: AnalyticsTable, kind: "csv" | "xlsx") {
  const slug = table.title.toLowerCase().replaceAll(" ", "-");
  if (kind === "csv") {
    download(`mac-ops-${slug}.csv`, "text/csv;charset=utf-8", analyticsCsv(table));
    return;
  }
  const sheet = XLSX.utils.aoa_to_sheet([
    [OPERATIONS_LEDGER_DISCLAIMER],
    [],
    [table.title],
    table.headers,
    ...table.rows,
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, table.title.slice(0, 31));
  const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  download(
    `mac-ops-${slug}.xlsx`,
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes,
  );
}

function Widget({
  title,
  table,
  children,
}: {
  title: string;
  table: AnalyticsTable;
  children: ReactNode;
}) {
  return (
    <section className="border border-white/25 bg-[#222] p-4">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[10px] tracking-[0.16em] text-white/40 uppercase">{title}</p>
        <div className="flex gap-2">
          <button
            type="button"
            className="text-[10px] tracking-[0.14em] text-mac-gold uppercase hover:text-white"
            onClick={() => exportTable(table, "csv")}
          >
            CSV
          </button>
          <button
            type="button"
            className="text-[10px] tracking-[0.14em] text-mac-gold uppercase hover:text-white"
            onClick={() => exportTable(table, "xlsx")}
          >
            XLSX
          </button>
        </div>
      </div>
      <div className="mt-4 h-48">{children}</div>
    </section>
  );
}

export function AdminAnalyticsDashboard() {
  const { agreements, users, timepieces } = useStore();
  const facts = deriveOperationsAnalytics({ agreements, users, timepieces });
  const bookChart = facts.bookMix.filter((row) => row.count > 0);
  const partyChart = facts.partyMix.filter((row) => row.count > 0);
  const pieceChart = [
    { label: "Free", count: facts.pieces.free },
    { label: "In a repo collection", count: facts.pieces.in_request },
    { label: "Locked in activated repo", count: facts.pieces.locked },
  ];

  return (
    <AdminChrome title="Dashboard">
      <p className="mb-4 text-[12px] text-white/55">{OPERATIONS_LEDGER_DISCLAIMER}</p>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard
          label="Outstanding sale dollars"
          value={money(facts.activeAmount)}
          hint={`${facts.activeCount} active repos`}
        />
        <StatCard
          label="Drafts"
          value={facts.draftCount}
          hint={money(facts.draftAmount)}
        />
        <StatCard
          label="Members"
          value={facts.members.total}
          hint={`${facts.members.collectors} collectors · ${facts.members.dealers} dealers`}
        />
        <StatCard
          label="Locked pieces"
          value={facts.pieces.locked}
          hint={`${facts.pieces.free} free · ${facts.pieces.in_request} in a repo collection`}
        />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-2">
        <Widget title="Book labels" table={facts.tables.book}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={bookChart} dataKey="count" nameKey="label" innerRadius={40} outerRadius={70}>
                {bookChart.map((row, index) => (
                  <Cell key={row.label} fill={MIX_COLORS[index % MIX_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </Widget>
        <Widget title="Party kind" table={facts.tables.members}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={partyChart}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" stroke="#ffffff60" />
              <YAxis stroke="#ffffff60" allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Bar dataKey="count" fill={MAC.gold} />
            </BarChart>
          </ResponsiveContainer>
        </Widget>
        <Widget title="Pieces" table={facts.tables.pieces}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={pieceChart}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" stroke="#ffffff60" />
              <YAxis stroke="#ffffff60" allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Bar dataKey="count" fill={MAC.champagne} />
            </BarChart>
          </ResponsiveContainer>
        </Widget>
        <Widget title="Vintage year" table={facts.tables.members}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={facts.members.vintage}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" stroke="#ffffff60" />
              <YAxis stroke="#ffffff60" allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Bar dataKey="count" fill={MAC.navy} />
            </BarChart>
          </ResponsiveContainer>
        </Widget>
        <Widget title="Trailing 12 months" table={facts.tables.trailing}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={[
                facts.trailing.boughtBack,
                facts.trailing.liquidated,
                facts.trailing.renewed,
              ]}
            >
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="label" stroke="#ffffff60" />
              <YAxis stroke="#ffffff60" />
              <Tooltip contentStyle={CHART_TOOLTIP} formatter={(value) => money(Number(value))} />
              <Bar dataKey="amount" fill={MAC.gold} />
            </BarChart>
          </ResponsiveContainer>
        </Widget>
        <Widget title="Time series" table={facts.tables.series}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={facts.series}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" />
              <XAxis dataKey="month" stroke="#ffffff60" tick={{ fontSize: 10 }} />
              <YAxis yAxisId="usd" stroke={MAC.gold} />
              <YAxis yAxisId="count" orientation="right" stroke={MAC.champagne} allowDecimals={false} />
              <Tooltip contentStyle={CHART_TOOLTIP} />
              <Legend />
              <Bar yAxisId="count" dataKey="newRepos" name="New repos" fill={MAC.navy} />
              <Bar yAxisId="count" dataKey="buybacks" name="Buybacks" fill={MAC.champagne} />
              <Line yAxisId="usd" dataKey="activeUsd" name="Active USD" stroke={MAC.gold} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </Widget>
      </div>
    </AdminChrome>
  );
}
