import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";
import {
  assertMigrationTarget,
  parseMigrationArgs,
} from "../../lib/env/development-migration.mjs";
import {
  evaluateAppliedJournalOrder,
  evaluateGeneratedWhen,
  evaluateJournalEntries,
  MIGRATION_JOURNAL_INVALID,
} from "../../lib/env/migration-journal.mjs";

const drizzleRoot = join(process.cwd(), "drizzle");
const journalPath = join(drizzleRoot, "meta", "_journal.json");
const drizzleKit = join(process.cwd(), "node_modules", "drizzle-kit", "bin.cjs");

function fail(errors) {
  console.error(JSON.stringify({ ok: false, errors }));
  process.exit(1);
}

function readJournal() {
  return JSON.parse(readFileSync(journalPath, "utf8"));
}

function listDrizzleFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.push(path);
    }
  };
  walk(drizzleRoot);
  return files.sort();
}

function runDrizzle(args) {
  return spawnSync(process.execPath, [drizzleKit, ...args], {
    encoding: "utf8",
    env: process.env,
  });
}

function assertJournalFile() {
  const journal = readJournal();
  const evaluated = evaluateJournalEntries(journal.entries);
  if (!evaluated.ok) fail([evaluated.error]);
  return { journal, whens: evaluated.whens };
}

async function readAppliedCreatedAts(url) {
  const sql = neon(url);
  try {
    const rows = await sql`select created_at from drizzle.__drizzle_migrations order by created_at`;
    return rows.map((row) => Number(row.created_at));
  } catch {
    return [];
  }
}

async function readAppliedSummary(url) {
  const sql = neon(url);
  const rows = await sql`
    select hash, created_at
    from drizzle.__drizzle_migrations
    order by created_at
  `;
  return {
    appliedCount: rows.length,
    applied: rows.map((row) => ({ hash: row.hash, createdAt: Number(row.created_at) })),
  };
}

function schemaCheck() {
  const check = runDrizzle(["check"]);
  if (check.status !== 0) {
    if (check.stdout) process.stdout.write(check.stdout);
    if (check.stderr) process.stderr.write(check.stderr);
    fail(["SCHEMA_DRIFT"]);
  }
  const journalBefore = readFileSync(journalPath);
  const before = new Set(listDrizzleFiles());
  const generated = runDrizzle(["generate", "--name", "schema_drift_probe"]);
  if (generated.status !== 0) {
    writeFileSync(journalPath, journalBefore);
    fail(["SCHEMA_DRIFT"]);
  }
  const added = listDrizzleFiles().filter((path) => !before.has(path));
  if (added.length > 0) {
    writeFileSync(journalPath, journalBefore);
    for (const path of added) {
      if (existsSync(path)) unlinkSync(path);
    }
    fail(["SCHEMA_DRIFT"]);
  }
  console.log(JSON.stringify({ ok: true, errors: [] }));
}

function generateMigration() {
  const journal = readJournal();
  const previousWhens = journal.entries.map((entry) => Number(entry.when));
  if (previousWhens.some((when, index) => !Number.isFinite(when) || when <= 0 || (index > 0 && when <= previousWhens[index - 1]))) {
    fail([MIGRATION_JOURNAL_INVALID]);
  }
  const journalBefore = readFileSync(journalPath);
  const before = new Set(listDrizzleFiles());
  const generated = runDrizzle(["generate"]);
  if (generated.status !== 0) {
    writeFileSync(journalPath, journalBefore);
    process.exit(generated.status ?? 1);
  }
  const nextJournal = readJournal();
  if (nextJournal.entries.length > journal.entries.length) {
    const nextWhen = nextJournal.entries[nextJournal.entries.length - 1]?.when;
    const allowed = evaluateGeneratedWhen(previousWhens, nextWhen);
    if (!allowed.ok) {
      writeFileSync(journalPath, journalBefore);
      for (const path of listDrizzleFiles().filter((file) => !before.has(file))) {
        unlinkSync(path);
      }
      fail([allowed.error]);
    }
  }
  if (generated.stdout) process.stdout.write(generated.stdout);
  console.log(JSON.stringify({ ok: true, errors: [] }));
}

async function applyMigration(args) {
  const mapping = assertMigrationTarget(process.env, {
    target: args.target,
    confirmProduction: args.confirmProduction,
  });
  const { whens } = assertJournalFile();
  const applied = await readAppliedCreatedAts(process.env.DATABASE_URL_UNPOOLED);
  const order = evaluateAppliedJournalOrder(whens, applied);
  if (!order.ok) fail([order.error]);

  const result = runDrizzle(["migrate"]);
  if (result.status !== 0) {
    if (result.stdout) process.stdout.write(result.stdout);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exit(result.status ?? 1);
  }
  if (result.stdout) process.stdout.write(result.stdout);

  const summary = await readAppliedSummary(process.env.DATABASE_URL_UNPOOLED);
  const after = evaluateAppliedJournalOrder(whens, summary.applied.map((row) => row.createdAt));
  if (!after.ok) fail([after.error]);

  console.log(
    JSON.stringify({
      ok: true,
      role: "migrate",
      appEnv: mapping.appEnv,
      endpointId: mapping.endpointId,
      appliedCount: summary.appliedCount,
      errors: [],
    }),
  );
}

const args = parseMigrationArgs(process.argv.slice(2));
if (args.schemaCheck) {
  schemaCheck();
} else if (args.generate) {
  generateMigration();
} else {
  await applyMigration(args);
}
