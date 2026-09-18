import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import {
  hashStaffPassword,
  staffScryptConcurrency,
  verifyStaffPassword,
} from "./staff-password.mjs";

describe("staff password hashing", () => {
  it("uses the approved memory-hard parameters and verifies in bounded time", async () => {
    const started = performance.now();
    const serialized = await hashStaffPassword("correct horse battery staple");
    const elapsedMs = performance.now() - started;
    assert.match(serialized, /^\$scrypt\$131072\$8\$1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
    assert.equal(await verifyStaffPassword("correct horse battery staple", serialized), true);
    assert.equal(await verifyStaffPassword("wrong password", serialized), false);
    assert.ok(elapsedMs < 1_000, `scrypt took ${elapsedMs.toFixed(0)}ms`);
  });

  it("refuses malformed serialized hashes without throwing", async () => {
    for (const value of ["", "plain text", "$scrypt$2$8$1$salt$hash"]) {
      assert.equal(await verifyStaffPassword("password", value), false);
    }
  });

  it("prints only a verifiable hash when the CLI reads stdin", async () => {
    const password = "cli temporary password 123";
    const result = spawnSync(
      process.execPath,
      ["scripts/hash-staff-password.mjs"],
      { cwd: process.cwd(), input: `${password}\n`, encoding: "utf8" },
    );
    assert.equal(result.status, 0, result.stderr);
    const serialized = result.stdout.trim();
    assert.match(serialized, /^\$scrypt\$/);
    assert.equal(await verifyStaffPassword(password, serialized), true);
    assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, new RegExp(password));
  });

  it("bounds real concurrent scrypt memory work to two slots", async (context) => {
    const beforeKiB = process.resourceUsage().maxRSS;
    await Promise.all(
      Array.from({ length: 6 }, (_, index) =>
        hashStaffPassword(`concurrent password value ${index}`)),
    );
    const afterKiB = process.resourceUsage().maxRSS;
    const concurrency = staffScryptConcurrency();
    assert.equal(concurrency.limit, 2);
    assert.ok(concurrency.peak <= concurrency.limit);
    assert.equal(concurrency.active, 0);
    assert.equal(concurrency.waiting, 0);
    context.diagnostic(
      `scrypt maxRSS delta: ${Math.max(0, afterKiB - beforeKiB).toFixed(0)} KiB; peak slots: ${concurrency.peak}`,
    );
  });
});
