import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { legacyAgreementToRequest } from "../contract/legacy-agreement.mjs";
import { createDb } from "./client";

/**
 * KTD21 has one mapping and two readers: `legacyAgreementToRequest()` and the
 * SQL backfill in migration 0026. This runs the migration's own statements —
 * sliced out of the shipped file, never retyped — over fixtures covering every
 * branch, and fails if the two ever answer differently.
 */
const skip = !process.env.DATABASE_URL;
const schema = `u5_backfill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const rootDb = createDb();

/** The migration's backfill, verbatim, between its two sentinels. */
function backfillSql(): string {
  const file = readFileSync(join(process.cwd(), "drizzle", "0026_repo_requests.sql"), "utf8");
  const start = file.indexOf("-- BEGIN KTD21 BACKFILL");
  const end = file.indexOf("-- END KTD21 BACKFILL");
  assert.ok(start >= 0 && end > start, "migration 0026 must keep its backfill sentinels");
  return file.slice(start, end).replaceAll("--> statement-breakpoint", "");
}

/**
 * Every branch of the mapping: both legacy dated shapes, a draft, a row whose
 * date cannot be read, a date carried as a timestamp, and a row already in the
 * new model that the backfill must not touch.
 */
const FIXTURES = [
  { id: "bf-pending", status: "pending_signature", createdOn: "2021-03-14", signedOn: null },
  { id: "bf-signed", status: "signed", createdOn: "2022-01-01", signedOn: "2022-05-02" },
  { id: "bf-signed-undated", status: "signed", createdOn: "2023-02-03", signedOn: null },
  { id: "bf-draft", status: "draft", createdOn: "2024-04-04", signedOn: null },
  { id: "bf-unreadable", status: "pending_signature", createdOn: "sometime in 2019", signedOn: null },
  { id: "bf-timestamp", status: "signed", createdOn: "2024-07-08T12:30:00.000Z", signedOn: null },
  { id: "bf-already-new", status: "submitted", createdOn: "2026-09-01", signedOn: null },
];

const updatedAt = "2026-02-02T10:00:00.000Z";

describe("KTD21 legacy backfill", { skip }, () => {
  before(async () => {
    const rows = FIXTURES.map(
      (row) => `(
        '${row.id}', 'cus-bf', 250000, 12, '', 'Owner', 'owner@example.com',
        '${row.status}', '${row.createdOn}',
        ${row.signedOn ? `'${row.signedOn}'` : "null"},
        timestamptz '${updatedAt}', timestamptz '${updatedAt}'
      )`,
    ).join(",");
    // The pre-0026 shape of the rows the backfill converts, plus the columns
    // the migration has already added by the time it runs.
    await rootDb.execute(sql.raw(`
      create schema "${schema}";
      create table "${schema}"."live_agreements" (
        "id" text primary key, "customer_id" text not null, "amount_cents" integer not null,
        "term_months" integer not null, "delivery" text not null default '',
        "owner_name" text not null, "email" text not null, "status" text not null,
        "created_on" text not null, "signed_on" text,
        "created_at" timestamptz not null default now(), "updated_at" timestamptz not null,
        "executed_on" text, "delivered_on" text, "version" integer not null default 1,
        "last_action_at" timestamptz not null default now(), "close_reason" text,
        "customer_success" boolean not null default false, "payment_reference" text,
        "piece_caps" jsonb
      );
      create table "${schema}"."live_agreement_members" (
        "id" text primary key, "agreement_id" text not null, "timepiece_id" text not null,
        "status" text not null default 'live',
        "created_at" timestamptz not null default now()
      );
      create table "${schema}"."agreement_events" (
        "id" text primary key, "agreement_id" text not null, "actor_kind" text not null,
        "actor_id" text, "action" text not null, "from_status" text, "to_status" text not null,
        "amount_cents" integer, "version" integer not null, "note" text not null default '',
        "internal" boolean not null default false,
        "created_at" timestamptz not null default now()
      );
      insert into "${schema}"."live_agreements" (
        "id","customer_id","amount_cents","term_months","delivery","owner_name","email",
        "status","created_on","signed_on","updated_at","created_at"
      ) values ${rows};
      insert into "${schema}"."live_agreement_members" ("id","agreement_id","timepiece_id","status")
      select "id" || ':piece', "id", "id" || '-piece', 'live' from "${schema}"."live_agreements";
    `));
    // `search_path` lets the shipped statements run unqualified and unedited.
    // It is set inside the transaction so it cannot outlive this statement:
    // the pooled connection is shared, and a stray path breaks other suites.
    await rootDb.execute(sql.raw(`
      begin;
      set local search_path to "${schema}";
      ${backfillSql()}
      commit;
    `));
  });

  after(async () => {
    await rootDb.execute(sql.raw(`drop schema if exists "${schema}" cascade;`));
  });

  for (const fixture of FIXTURES) {
    it(`maps ${fixture.status} the same way the module does (${fixture.id})`, async () => {
      const expected = legacyAgreementToRequest({
        status: fixture.status,
        createdAt: fixture.createdOn,
        signedOn: fixture.signedOn ?? undefined,
        updatedAt,
      });
      const { rows } = await rootDb.execute(sql.raw(`
        select "status", "executed_on", "close_reason", "version",
               to_char("last_action_at" at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as "last_action_at"
        from "${schema}"."live_agreements" where "id" = '${fixture.id}'
      `));
      const row = rows[0] as Record<string, unknown>;
      assert.equal(row.status, expected.status);
      assert.equal(row.executed_on, expected.executedOn ?? null);
      assert.equal(row.close_reason, expected.closeReason ?? null);
      assert.equal(row.version, expected.version);
      assert.equal(row.last_action_at, expected.lastActionAt);
    });
  }

  it("carries a signing date onto a signed row that never recorded one", async () => {
    const { rows } = await rootDb.execute(sql.raw(`
      select "id", "signed_on" from "${schema}"."live_agreements"
      where "id" in ('bf-signed', 'bf-signed-undated', 'bf-timestamp') order by "id"
    `));
    assert.deepEqual(rows.map((row) => (row as Record<string, unknown>).signed_on), [
      "2022-05-02",
      "2023-02-03",
      "2024-07-08",
    ]);
  });

  it("releases the pieces a closed row was holding and leaves the rest", async () => {
    const { rows } = await rootDb.execute(sql.raw(`
      select "agreement_id", "status" from "${schema}"."live_agreement_members" order by "agreement_id"
    `));
    const byAgreement = new Map(
      rows.map((row) => {
        const record = row as Record<string, unknown>;
        return [record.agreement_id, record.status];
      }),
    );
    assert.equal(byAgreement.get("bf-draft"), "released");
    assert.equal(byAgreement.get("bf-unreadable"), "released");
    assert.equal(byAgreement.get("bf-pending"), "live");
    assert.equal(byAgreement.get("bf-signed"), "live");
  });

  it("records one desk-only event per converted row and none for a new-model row", async () => {
    const { rows } = await rootDb.execute(sql.raw(`
      select "agreement_id", "from_status", "to_status", "internal", "version"
      from "${schema}"."agreement_events" order by "agreement_id"
    `));
    assert.equal(rows.length, FIXTURES.length - 1, "the already-new row is not converted");
    for (const row of rows) {
      const record = row as Record<string, unknown>;
      assert.equal(record.internal, true);
      assert.equal(record.version, 1);
      assert.ok(["executed", "closed"].includes(String(record.to_status)));
    }
    const drafted = rows.find((row) => (row as Record<string, unknown>).agreement_id === "bf-draft");
    assert.equal((drafted as Record<string, unknown>).to_status, "closed");
  });

  it("leaves output the shipped constraints accept", async () => {
    // The migration adds these after the backfill, so they are its post-check.
    await rootDb.execute(sql.raw(`
      alter table "${schema}"."live_agreements"
        add constraint "bf_executed_shape" check (("status" = 'executed') = ("executed_on" is not null)),
        add constraint "bf_closed_shape" check (("status" = 'closed') = ("close_reason" is not null)),
        add constraint "bf_status" check ("status" in (
          'submitted','returned','collector_signed','inspecting','executed','closed',
          'draft','pending_signature','signed'
        ));
    `));
    const { rows } = await rootDb.execute(sql.raw(`
      select count(*)::int as "n" from "${schema}"."live_agreements"
      where "status" in ('draft', 'pending_signature', 'signed')
    `));
    assert.equal((rows[0] as Record<string, unknown>).n, 0, "no legacy status survives");
  });
});
