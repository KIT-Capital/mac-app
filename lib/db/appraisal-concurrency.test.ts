import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { sql } from "drizzle-orm";
import { createDb, type Database } from "./client";
import { executeLiveBookOperation } from "./live-book-mutations";
import { deskActor } from "./records";

const skip = !process.env.DATABASE_URL;
const schema = `u3_race_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const rootDb = createDb();

describe("appraisal decision concurrency", { skip }, () => {
  before(async () => {
    await rootDb.execute(sql.raw(`
      create schema "${schema}";
      create table "${schema}"."staff_accounts" (
        "id" text primary key, "name" text not null, "email" text not null,
        "password_hash" text, "password_salt" text, "password_params" jsonb,
        "role" text not null, "is_master" boolean not null default false,
        "must_rotate" boolean not null default false, "password_set_at" timestamptz,
        "session_valid_after" timestamptz not null default 'epoch',
        "disabled_at" timestamptz, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
      create table "${schema}"."desk_audit_log" (
        "id" text primary key, "actor_email" text not null, "actor_role" text not null,
        "action" text not null, "target_id" text, "client_address" text not null,
        "detail" jsonb not null default '{}'::jsonb, "created_at" timestamptz not null default now()
      );
      create table "${schema}"."timepieces" (
        "id" text primary key, "customer_id" text not null, "brand" text not null,
        "model" text not null, "reference" text, "serial" text,
        "status" text not null default 'not_evaluated',
        "financeable" boolean not null default false, "condition" text not null default '',
        "box_papers" text not null default '', "case_metal" text not null default '',
        "case_type" text not null default '', "case_diameter" text not null default '',
        "dial_color" text not null default '', "buckle" text not null default '',
        "band" text not null default 'strap', "band_material" text not null default '',
        "complication" text not null default '', "evaluated_at" timestamptz,
        "asset_code" text, "value_low_cents" integer, "value_high_cents" integer,
        "provenance" text, "custody" text, "created_at" timestamptz not null default now(),
        "updated_at" timestamptz not null default now()
      );
      create table "${schema}"."appraisal_attempts" (
        "id" text primary key, "timepiece_id" text not null, "customer_id" text not null,
        "attempt_no" integer not null, "decision_no" integer, "status" text not null,
        "note" text not null default '', "response_note" text, "snapshot" jsonb not null,
        "submitted_at" timestamptz not null default now(), "evidence_sealed_at" timestamptz,
        "decided_by_staff_id" text, "decided_at" timestamptz, "value_cents" integer,
        "range_low_cents" integer, "range_high_cents" integer, "finalized_at" timestamptz,
        "finalized_by_staff_id" text, "finalized_agreement_id" text,
        "inspected_value_cents" integer,
        "reopened_count" integer not null default 0, "updated_at" timestamptz not null default now()
      );
      create unique index "appraisal_attempts_timepiece_decision_uidx"
        on "${schema}"."appraisal_attempts" ("timepiece_id", "decision_no")
        where "decision_no" is not null;
      create unique index "appraisal_attempts_open_timepiece_uidx"
        on "${schema}"."appraisal_attempts" ("timepiece_id")
        where "status" = 'under_review';
      insert into "${schema}"."staff_accounts" ("id","name","email","role")
      values ('staff-a','A','a@mac.test','appraiser'),('staff-b','B','b@mac.test','appraiser');
      insert into "${schema}"."timepieces" ("id","customer_id","brand","model","status")
      values ('piece','customer','Cartier','Crash','reviewing');
      insert into "${schema}"."appraisal_attempts"
        ("id","timepiece_id","customer_id","attempt_no","decision_no","status","snapshot","decided_by_staff_id","decided_at")
      values
        ('attempt-1','piece','customer',1,1,'refused','{}','staff-a',now()),
        ('attempt-2','piece','customer',2,2,'refused','{}','staff-a',now()),
        ('attempt-3','piece','customer',3,null,'under_review','{}',null,null);
    `));
  });

  after(async () => {
    await rootDb.execute(sql.raw(`drop schema if exists "${schema}" cascade`));
  });

  it("allows one independent transaction to decide the third attempt", async () => {
    let arrivals = 0;
    let release!: () => void;
    const ready = new Promise<void>((resolve) => { release = resolve; });
    const run = (staffId: string, email: string) =>
      rootDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        arrivals += 1;
        if (arrivals === 2) release();
        await ready;
        return executeLiveBookOperation(
          tx as unknown as Database,
          deskActor("appraiser", email, staffId),
          { action: "appraisal.decide", id: "attempt-3", decision: "refuse" },
          {
            env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
            clientAddress: "127.0.0.1",
          },
        );
      });

    const results = await Promise.allSettled([
      run("staff-a", "a@mac.test"),
      run("staff-b", "b@mac.test"),
    ]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(results.filter((result) => result.status === "rejected").length, 1);

    await rootDb.transaction(async (tx) => {
      await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
      const row = await tx.execute(sql`select decision_no, status from appraisal_attempts where id = 'attempt-3'`);
      assert.deepEqual(row.rows, [{ decision_no: 3, status: "refused" }]);
    });
  });

  for (const action of ["timepiece.update", "timepiece.deskUpdate"] as const) {
    it(`serializes ${action} with the first appraisal submission`, async () => {
      const pieceId = `piece-${action.replace(".", "-")}`;
      const attemptId = `attempt-${action.replace(".", "-")}`;
      await rootDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        await tx.execute(sql`
          insert into timepieces (id, customer_id, brand, model)
          values (${pieceId}, 'customer', 'Cartier', 'Crash')
        `);
      });

      let lockAcquired!: () => void;
      let releaseSubmission!: () => void;
      const locked = new Promise<void>((resolve) => { lockAcquired = resolve; });
      const release = new Promise<void>((resolve) => { releaseSubmission = resolve; });
      const submission = rootDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        await tx.execute(sql`select id from timepieces where id = ${pieceId} for update`);
        lockAcquired();
        await release;
        await tx.execute(sql`
          insert into appraisal_attempts
            (id, timepiece_id, customer_id, attempt_no, status, snapshot)
          values
            (${attemptId}, ${pieceId}, 'customer', 1, 'under_review', '{}'::jsonb)
        `);
      });
      await locked;

      const legacyWrite = rootDb.transaction(async (tx) => {
        await tx.execute(sql.raw(`set local search_path to "${schema}", public`));
        return executeLiveBookOperation(
          tx as unknown as Database,
          deskActor("appraiser", "b@mac.test", "staff-b"),
          {
            action,
            id: pieceId,
            patch: {
              status: "appraised",
              valueLow: 500_000,
              valueHigh: 600_000,
              financeable: true,
            },
          },
          {
            env: { APP_ENV: "development", MAC_LIVE_BOOK: "1" } as NodeJS.ProcessEnv,
            clientAddress: "127.0.0.1",
          },
        );
      }).then(
        (value) => ({ status: "fulfilled" as const, value }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      );

      const beforeRelease = await Promise.race([
        legacyWrite.then(() => "settled" as const),
        new Promise<"pending">((resolve) =>
          setTimeout(() => resolve("pending"), 2_000),
        ),
      ]);
      assert.equal(beforeRelease, "pending");
      releaseSubmission();
      await submission;
      const outcome = await legacyWrite;
      assert.equal(outcome.status, "rejected");
      if (outcome.status === "rejected") {
        assert.match(String(outcome.error), /ATTEMPT_STATE_CONFLICT/);
      }
    });
  }
});
