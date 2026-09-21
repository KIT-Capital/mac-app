import { pieceCustody, type PieceCustody } from "@/lib/client-pieces";
import {
  BOOK_LABELS,
  addCalendarMonths,
  bookLabel,
  deskToday,
  isLiveBookLabel,
} from "@/lib/contract/repo-book.mjs";
import { retailMembers } from "@/lib/owners";
import { parseMemberId } from "@/lib/tenant.mjs";
import type { Agreement, ManagedUser, Timepiece } from "@/lib/types";

export const OPERATIONS_LEDGER_DISCLAIMER = "Operations analytics — not the official ledger.";

export type MixRow = { label: string; count: number; amount: number };
export type SeriesRow = { month: string; activeUsd: number; newRepos: number; buybacks: number };
export type AnalyticsTable = { title: string; headers: string[]; rows: string[][] };

export type OperationsAnalytics = {
  asOf: string;
  activeCount: number;
  activeAmount: number;
  draftCount: number;
  draftAmount: number;
  trailing: {
    boughtBack: MixRow;
    liquidated: MixRow;
    renewed: MixRow;
  };
  members: {
    total: number;
    collectors: number;
    dealers: number;
    newThisYear: number;
    vintage: MixRow[];
  };
  pieces: Record<PieceCustody, number>;
  bookMix: MixRow[];
  partyMix: MixRow[];
  series: SeriesRow[];
  tables: Record<string, AnalyticsTable>;
};

function monthKeys(today: string, count: number) {
  const keys: string[] = [];
  let cursor = `${today.slice(0, 7)}-01`;
  for (let i = 0; i < count; i += 1) {
    keys.unshift(cursor.slice(0, 7));
    cursor = addCalendarMonths(cursor, -1);
  }
  return keys;
}

function monthEnd(yearMonth: string) {
  const year = Number(yearMonth.slice(0, 4));
  const month = Number(yearMonth.slice(5, 7));
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function inWindow(date: string | undefined, start: string, end: string) {
  return Boolean(date && date >= start && date <= end);
}

function mix(label: string, rows: Agreement[]): MixRow {
  return {
    label,
    count: rows.length,
    amount: rows.reduce((sum, row) => sum + row.amount, 0),
  };
}

function partyKind(agreement: Agreement) {
  return agreement.partyKind === "dealer" ? "dealer" : "collector";
}

function liveOn(agreement: Agreement, day: string) {
  return Boolean(agreement.executedOn) && isLiveBookLabel(bookLabel(agreement, day));
}

export function deriveOperationsAnalytics(
  input: { agreements: Agreement[]; users: ManagedUser[]; timepieces: Timepiece[] },
  today = deskToday(),
): OperationsAnalytics {
  const agreements = input.agreements ?? [];
  const executed = agreements.filter((row) => Boolean(row.executedOn));
  const active = executed.filter((row) => liveOn(row, today));
  const drafts = agreements.filter((row) => !row.executedOn);
  const windowStart = addCalendarMonths(today, -12);
  const trailingRows = (kind: "bought_back" | "liquidated" | "renewed") =>
    executed.filter((row) => row.bookEnd?.kind === kind && inWindow(row.bookEnd.date, windowStart, today));

  const members = retailMembers(input.users ?? []);
  const thisYear = Number(today.slice(2, 4));
  const vintageMap = new Map<string, number>();
  for (const member of members) {
    const parsed = parseMemberId(member.memberId ?? "");
    const year = parsed ? String(parsed.year).padStart(2, "0") : "—";
    vintageMap.set(year, (vintageMap.get(year) ?? 0) + 1);
  }

  const pieces: Record<PieceCustody, number> = { free: 0, in_request: 0, locked: 0 };
  for (const piece of input.timepieces ?? []) {
    pieces[pieceCustody(agreements, piece.id)] += 1;
  }

  const bookLabels = [
    BOOK_LABELS.open,
    BOOK_LABELS.past_due,
    BOOK_LABELS.in_liquidation,
    BOOK_LABELS.bought_back,
    BOOK_LABELS.liquidated,
    BOOK_LABELS.renewed,
  ];
  const bookMix = bookLabels.map((label) =>
    mix(label, executed.filter((row) => bookLabel(row, today) === label)),
  );
  const partyMix = (["collector", "dealer"] as const).map((kind) =>
    mix(kind, executed.filter((row) => partyKind(row) === kind)),
  );

  const series = monthKeys(today, 12).map((month) => {
    const end = monthEnd(month);
    const start = `${month}-01`;
    return {
      month,
      activeUsd: executed.filter((row) => liveOn(row, end)).reduce((sum, row) => sum + row.amount, 0),
      newRepos: executed.filter((row) => inWindow(row.executedOn, start, end)).length,
      buybacks: executed.filter((row) =>
        row.bookEnd?.kind === "bought_back" && inWindow(row.bookEnd.date, start, end),
      ).length,
    };
  });

  const trailing = {
    boughtBack: mix("bought back", trailingRows("bought_back")),
    liquidated: mix("liquidated", trailingRows("liquidated")),
    renewed: mix("renewed", trailingRows("renewed")),
  };

  const dollar = (n: number) => String(n);
  const activeTable: AnalyticsTable = {
    title: "Active repos",
    headers: ["Code", "Member", "Party", "Book", "Sale amount"],
    rows: active.map((row) => [
      row.agreementCode || row.id,
      row.memberId || "",
      partyKind(row),
      String(bookLabel(row, today) ?? ""),
      dollar(row.amount),
    ]),
  };
  const draftTable: AnalyticsTable = {
    title: "Drafts",
    headers: ["Code", "Member", "Status", "Sale amount"],
    rows: drafts.map((row) => [
      row.agreementCode || row.id,
      row.memberId || "",
      row.status,
      dollar(row.amount),
    ]),
  };
  const trailingTable: AnalyticsTable = {
    title: "Trailing 12 months",
    headers: ["End", "Count", "Dollars"],
    rows: [
      ["bought back", String(trailing.boughtBack.count), dollar(trailing.boughtBack.amount)],
      ["liquidated", String(trailing.liquidated.count), dollar(trailing.liquidated.amount)],
      ["renewed", String(trailing.renewed.count), dollar(trailing.renewed.amount)],
    ],
  };
  const memberTable: AnalyticsTable = {
    title: "Members",
    headers: ["Name", "Member ID", "Party"],
    rows: members.map((row) => [row.name, row.memberId || "", row.role]),
  };
  const pieceTable: AnalyticsTable = {
    title: "Pieces",
    headers: ["Custody", "Count"],
    rows: [
      ["Free", String(pieces.free)],
      ["In a repo collection", String(pieces.in_request)],
      ["Locked in activated repo", String(pieces.locked)],
    ],
  };
  const bookTable: AnalyticsTable = {
    title: "Book labels",
    headers: ["Label", "Count", "Dollars"],
    rows: bookMix.map((row) => [row.label, String(row.count), dollar(row.amount)]),
  };
  const seriesTable: AnalyticsTable = {
    title: "Time series",
    headers: ["Month", "Active USD", "New repos", "Buybacks"],
    rows: series.map((row) => [
      row.month,
      dollar(row.activeUsd),
      String(row.newRepos),
      String(row.buybacks),
    ]),
  };

  return {
    asOf: today,
    activeCount: active.length,
    activeAmount: active.reduce((sum, row) => sum + row.amount, 0),
    draftCount: drafts.length,
    draftAmount: drafts.reduce((sum, row) => sum + row.amount, 0),
    trailing,
    members: {
      total: members.length,
      collectors: members.filter((row) => row.role === "collector").length,
      dealers: members.filter((row) => row.role === "dealer").length,
      newThisYear: members.filter((row) => parseMemberId(row.memberId ?? "")?.year === thisYear).length,
      vintage: [...vintageMap.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([label, count]) => ({ label, count, amount: 0 })),
    },
    pieces,
    bookMix,
    partyMix,
    series,
    tables: {
      active: activeTable,
      drafts: draftTable,
      trailing: trailingTable,
      members: memberTable,
      pieces: pieceTable,
      book: bookTable,
      series: seriesTable,
    },
  };
}

export function analyticsCsv(table: AnalyticsTable) {
  const lines = [
    OPERATIONS_LEDGER_DISCLAIMER,
    "",
    table.title,
    table.headers.join(","),
    ...table.rows.map((row) => row.map(csvCell).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

function csvCell(value: string) {
  if (/[",\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
