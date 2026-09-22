import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { runDailySweeps } from "./daily-sweeps.mjs";

afterEach(() => {
  process.exitCode = undefined;
});

function standInDb() {
  const calls = [];
  return {
    calls,
    db: {
      $client: {
        async end() {
          calls.push("end");
        },
      },
    },
  };
}

describe("daily sweeps shutdown", () => {
  it("awaits pool end after a successful sweep and leaves the exit code unset", async () => {
    const { db, calls } = standInDb();
    await runDailySweeps({
      createDatabase: () => db,
      sweepAccess: async () => ({ tokens: 1 }),
      sweepPhotos: async () => ({ stored: 1 }),
      log: () => {},
    });

    assert.deepEqual(calls, ["end"]);
    assert.equal(process.exitCode, undefined);
  });

  it("awaits pool end and sets a non-zero exit code when a sweep throws", async () => {
    const { db, calls } = standInDb();
    await runDailySweeps({
      createDatabase: () => db,
      sweepAccess: async () => {
        throw new Error("ACCESS_SWEEP_FAILED");
      },
      sweepPhotos: async () => ({ stored: 0 }),
      log: () => {},
      logError: () => {},
    });

    assert.deepEqual(calls, ["end"]);
    assert.equal(process.exitCode, 1);
  });

  it("still ends the pool when the success log throws", async () => {
    const { db, calls } = standInDb();
    await runDailySweeps({
      createDatabase: () => db,
      sweepAccess: async () => ({ tokens: 0 }),
      sweepPhotos: async () => ({ stored: 0 }),
      log: () => {
        throw new Error("LOG_FAILED");
      },
      logError: () => {},
    });

    assert.deepEqual(calls, ["end"]);
    assert.equal(process.exitCode, 1);
  });

  it("does not use the long-lived getDb singleton", () => {
    const source = readFileSync(new URL("./daily-sweeps.mjs", import.meta.url), "utf8");
    assert.equal(source.includes("getDb"), false);
  });
});
