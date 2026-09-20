import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb } from "./client";

/**
 * What migration 0026 refuses to store. Each case drives the shipped database
 * rules directly, because a rule the application merely agrees to is not a
 * rule — a console session or a future code path would walk straight past it.
 */
const skip = !process.env.DATABASE_URL;
const schema = `u5_rules_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const rootDb = createDb();

/** The migration's trigger block, verbatim, from its first function to the end. */
function triggerSql(): string {
  const file = readFileSync(join(process.cwd(), "drizzle", "0026_repo_requests.sql"), "utf8");
  const start = file.indexOf('CREATE OR REPLACE FUNCTION "prevent_agreement_record_mutation"()');
  assert.ok(start >= 0, "migration 0026 must keep the append-only function");
  const block = file.slice(start).replaceAll("--> statement-breakpoint", "");
  assert.match(block, /agreement_events_append_only/);
  assert.match(block, /agreement_signatures_append_only/);
  assert.match(block, /agreement_signatures_validate_document/);
  return block;
}

/** 0027's hardening, verbatim, between its two sentinels. */
function hardeningSql(): string {
  const file = readFileSync(
    join(process.cwd(), "drizzle", "0027_request_evidence_hardening.sql"),
    "utf8",
  );
  const start = file.indexOf("-- BEGIN EVIDENCE HARDENING");
  const end = file.indexOf("-- END EVIDENCE HARDENING");
  assert.ok(start >= 0 && end > start, "migration 0027 must keep its hardening sentinels");
  return file.slice(start, end).replaceAll("--> statement-breakpoint", "");
}

/** The driver wraps the database's refusal, so read the whole chain. */
async function fails(run: Promise<unknown>, expected: RegExp): Promise<void> {
  await assert.rejects(run, (error: Error) => {
    const reasons: string[] = [];
    for (let cursor: unknown = error; cursor instanceof Error; cursor = cursor.cause) {
      reasons.push(cursor.message);
    }
    assert.match(reasons.join(" | "), expected);
    return true;
  });
}

describe("repo request database rules", { skip }, () => {
  before(async () => {
    await rootDb.execute(sql.raw(`
      create schema "${schema}";
      create table "${schema}"."agreement_documents" (
        "id" text primary key, "live_agreement_id" text not null, "version" integer not null,
        "status" text not null, "snapshot_hash" text not null,
        "snapshot" jsonb not null default '{}'::jsonb, "stage" text not null default 'proposal',
        "object_key" text, "checksum" text
      );
      create unique index on "${schema}"."agreement_documents" ("id", "live_agreement_id");
      create table "${schema}"."agreement_events" (
        "id" text primary key, "agreement_id" text not null, "actor_kind" text not null,
        "actor_id" text, "action" text not null, "from_status" text, "to_status" text not null,
        "amount_cents" integer, "version" integer not null, "note" text not null default '',
        "internal" boolean not null default false,
        "created_at" timestamptz not null default now()
      );
      create table "${schema}"."agreement_signatures" (
        "id" text primary key, "agreement_id" text not null, "version" integer not null,
        "party" text not null, "signer_id" text, "typed_name" text not null,
        "document_id" text not null, "snapshot_hash" text not null, "client_address" text,
        "book" text not null default 'live',
        "signed_at" timestamptz not null default now(),
        constraint "sig_document_fk" foreign key ("document_id", "agreement_id")
          references "${schema}"."agreement_documents" ("id", "live_agreement_id")
      );
      create unique index "sig_version_party_uidx"
        on "${schema}"."agreement_signatures" ("agreement_id", "version", "party");
      insert into "${schema}"."agreement_documents"
        ("id","live_agreement_id","version","status","snapshot_hash")
      values
        ('doc-v1', 'repo-1', 1, 'stored', 'hash-v1'),
        ('doc-v2', 'repo-1', 2, 'stored', 'hash-v2'),
        ('doc-building', 'repo-1', 3, 'building', 'hash-v3'),
        ('doc-other', 'repo-2', 1, 'stored', 'hash-other');
      insert into "${schema}"."agreement_events"
        ("id","agreement_id","actor_kind","action","to_status","version")
      values ('evt-1', 'repo-1', 'desk', 'deskReturn', 'returned', 1);
    `));
    // Transaction-local: the pooled connection is shared with other suites.
    await rootDb.execute(sql.raw(`
      begin;
      set local search_path to "${schema}";
      ${triggerSql()}
      ${hardeningSql()}
      commit;
    `));
    // In production these resolve their tables through the default path. Here
    // they must find this schema's copies whatever the caller's path is.
    await rootDb.execute(sql.raw(`
      alter function "${schema}"."validate_agreement_signature_document"() set search_path = "${schema}";
      alter function "${schema}"."prevent_agreement_record_mutation"() set search_path = "${schema}";
      alter function "${schema}"."prevent_signed_document_mutation"() set search_path = "${schema}";
    `));
  });

  after(async () => {
    await rootDb.execute(sql.raw(`drop schema if exists "${schema}" cascade;`));
  });

  const sign = (values: string) => rootDb.execute(sql.raw(`
    insert into "${schema}"."agreement_signatures"
      ("id","agreement_id","version","party","typed_name","document_id","snapshot_hash")
    values ${values};
  `));

  it("refuses to edit or erase a recorded event", async () => {
    await fails(
      rootDb.execute(sql.raw(`update "${schema}"."agreement_events" set "note" = 'revised' where "id" = 'evt-1'`)),
      /AGREEMENT_RECORD_IMMUTABLE/,
    );
    await fails(
      rootDb.execute(sql.raw(`delete from "${schema}"."agreement_events" where "id" = 'evt-1'`)),
      /AGREEMENT_RECORD_IMMUTABLE/,
    );
  });

  it("refuses a signature bound to another version's document", async () => {
    await fails(
      sign(`('sig-bad-version', 'repo-1', 1, 'collector', 'A Collector', 'doc-v2', 'hash-v2')`),
      /SIGNATURE_VERSION_MISMATCH/,
    );
  });

  it("refuses a signature whose document changed under it", async () => {
    await fails(
      sign(`('sig-bad-hash', 'repo-1', 1, 'collector', 'A Collector', 'doc-v1', 'hash-tampered')`),
      /SIGNATURE_DOCUMENT_MISMATCH/,
    );
  });

  it("refuses a signature on a document that is not stored yet", async () => {
    await fails(
      sign(`('sig-building', 'repo-1', 3, 'collector', 'A Collector', 'doc-building', 'hash-v3')`),
      /DOCUMENT_NOT_READY/,
    );
  });

  it("refuses a signature on another agreement's document", async () => {
    await fails(
      sign(`('sig-foreign', 'repo-1', 1, 'collector', 'A Collector', 'doc-other', 'hash-other')`),
      /sig_document_fk|foreign key/i,
    );
  });

  it("records a signature that names the document it was shown, then freezes it", async () => {
    await sign(`('sig-good', 'repo-1', 1, 'collector', 'A Collector', 'doc-v1', 'hash-v1')`);
    await fails(
      rootDb.execute(sql.raw(`update "${schema}"."agreement_signatures" set "typed_name" = 'Someone Else' where "id" = 'sig-good'`)),
      /AGREEMENT_RECORD_IMMUTABLE/,
    );
    await fails(
      rootDb.execute(sql.raw(`delete from "${schema}"."agreement_signatures" where "id" = 'sig-good'`)),
      /AGREEMENT_RECORD_IMMUTABLE/,
    );
  });

  it("refuses to rewrite a document once someone has signed it", async () => {
    // sig-good, recorded above, names doc-v1 and hash-v1.
    await fails(
      rootDb.execute(sql.raw(`
        update "${schema}"."agreement_documents"
        set "snapshot_hash" = 'hash-rewritten' where "id" = 'doc-v1'
      `)),
      /DOCUMENT_SIGNED_IMMUTABLE/,
    );
    await fails(
      rootDb.execute(sql.raw(`
        update "${schema}"."agreement_documents" set "version" = 9 where "id" = 'doc-v1'
      `)),
      /DOCUMENT_SIGNED_IMMUTABLE/,
    );
  });

  it("still lets a render finish on a document nobody has signed", async () => {
    await rootDb.execute(sql.raw(`
      update "${schema}"."agreement_documents"
      set "status" = 'stored', "object_key" = 'k', "checksum" = 'c' where "id" = 'doc-building'
    `));
    // And a signed one may still record where its bytes landed.
    await rootDb.execute(sql.raw(`
      update "${schema}"."agreement_documents"
      set "object_key" = 'moved', "checksum" = 'c2' where "id" = 'doc-v1'
    `));
    await rootDb.execute(sql.raw(`
      update "${schema}"."agreement_documents"
      set "snapshot_hash" = 'hash-v2b' where "id" = 'doc-v2'
    `));
  });

  it("refuses to empty the thread with a truncate", async () => {
    await fails(
      rootDb.execute(sql.raw(`truncate "${schema}"."agreement_events"`)),
      /AGREEMENT_RECORD_IMMUTABLE/,
    );
    await fails(
      rootDb.execute(sql.raw(`truncate "${schema}"."agreement_signatures"`)),
      /AGREEMENT_RECORD_IMMUTABLE/,
    );
  });

  it("refuses a second signature from the same party on the same version", async () => {
    await fails(
      sign(`('sig-twice', 'repo-1', 1, 'collector', 'A Collector', 'doc-v1', 'hash-v1')`),
      /sig_version_party_uidx|duplicate key/i,
    );
    // MAC still signs the same version — the pair is (version, party).
    await sign(`('sig-mac', 'repo-1', 1, 'mac', 'MAC', 'doc-v1', 'hash-v1')`);
  });
});

describe("repo request row shapes", { skip }, () => {
  const customerId = `cus-u5-${Math.random().toString(36).slice(2, 8)}`;
  // The isolated suite above leaves its own search_path on the pooled
  // connection, so every statement here names the schema it means.
  const insertAgreement = (id: string, columns: string, values: string) => rootDb.execute(sql.raw(`
    insert into "live_agreements"
      ("id","customer_id","amount_cents","term_months","owner_name","email","created_on"${columns})
    values ('${id}', '${customerId}', 100000, 12, 'Owner', 'owner@example.com', '2026-01-01'${values});
  `));

  before(async () => {
    // Clear anything a previous run left behind before claiming the names.
    await rootDb.execute(sql.raw(`
      delete from "live_agreement_members" where "agreement_id" like 'u5-shape-%';
      delete from "timepieces" where "customer_id" like 'cus-u5-%';
      delete from "live_agreements" where "id" like 'u5-shape-%';
      delete from "customers" where "id" like 'cus-u5-%';
      insert into "customers" ("id","email","name")
      values ('${customerId}', '${customerId}@example.com', 'U5 Fixture');
    `));
  });

  after(async () => {
    await rootDb.execute(sql.raw(`
      delete from "live_agreement_members" where "agreement_id" like 'u5-shape-%';
      delete from "timepieces" where "customer_id" = '${customerId}';
      delete from "live_agreements" where "customer_id" = '${customerId}';
      delete from "customers" where "id" = '${customerId}';
    `));
  });

  it("refuses a status outside the request vocabulary", async () => {
    await fails(
      insertAgreement("u5-shape-bad-status", `,"status"`, `,'whatever'`),
      /live_agreements_status_check/,
    );
  });

  it("refuses a repo on the book with no day it went there", async () => {
    await fails(
      insertAgreement("u5-shape-no-date", `,"status"`, `,'executed'`),
      /live_agreements_executed_shape_check/,
    );
  });

  it("refuses a book date on a request that has not executed", async () => {
    await fails(
      insertAgreement("u5-shape-early-date", `,"status","executed_on"`, `,'submitted','2026-01-01'`),
      /live_agreements_executed_shape_check/,
    );
  });

  it("refuses a closed request with no reason, and a reason nobody named", async () => {
    await fails(
      insertAgreement("u5-shape-no-reason", `,"status"`, `,'closed'`),
      /live_agreements_closed_shape_check/,
    );
    await fails(
      insertAgreement("u5-shape-bad-reason", `,"status","close_reason"`, `,'closed','because'`),
      /live_agreements_close_reason_check/,
    );
  });

  it("refuses a book date that is not a date", async () => {
    // The term clock is computed from this value, so free text cannot reach it.
    await fails(
      insertAgreement("u5-shape-bad-date", `,"status","executed_on"`, `,'executed','sometime in 2019'`),
      /live_agreements_executed_on_check/,
    );
    await fails(
      insertAgreement("u5-shape-empty-date", `,"status","executed_on"`, `,'executed',''`),
      /live_agreements_executed_on_check/,
    );
    await fails(
      insertAgreement("u5-shape-bad-delivery", `,"status","delivered_on"`, `,'submitted','soon'`),
      /live_agreements_delivered_on_check/,
    );
  });

  it("holds a piece on one request or repo at a time", async () => {
    await insertAgreement("u5-shape-held-a", `,"status","executed_on"`, `,'executed','2026-01-01'`);
    await insertAgreement("u5-shape-held-b", `,"status"`, `,'submitted'`);
    await rootDb.execute(sql.raw(`
      insert into "timepieces" ("id","customer_id","brand","model")
      values ('u5-shape-piece', '${customerId}', 'Brand', 'Model')
      on conflict ("id") do nothing;
      insert into "live_agreement_members" ("id","agreement_id","timepiece_id","status")
      values ('u5-shape-held-a:piece', 'u5-shape-held-a', 'u5-shape-piece', 'live');
    `));
    await fails(
      rootDb.execute(sql.raw(`
        insert into "live_agreement_members" ("id","agreement_id","timepiece_id","status")
        values ('u5-shape-held-b:piece', 'u5-shape-held-b', 'u5-shape-piece', 'reserved');
      `)),
      /live_agreement_members_held_timepiece_uidx|duplicate key/i,
    );
    // Releasing it hands the piece to the request that asked next.
    await rootDb.execute(sql.raw(`
      update "live_agreement_members" set "status" = 'released' where "id" = 'u5-shape-held-a:piece';
      insert into "live_agreement_members" ("id","agreement_id","timepiece_id","status")
      values ('u5-shape-held-b:piece', 'u5-shape-held-b', 'u5-shape-piece', 'reserved');
    `));
    await rootDb.execute(sql.raw(`
      delete from "live_agreement_members" where "timepiece_id" = 'u5-shape-piece';
      delete from "timepieces" where "id" = 'u5-shape-piece';
    `));
  });
});
