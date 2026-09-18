import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it } from "node:test";
import {
  deskAuthenticationMode,
  developmentDeskFixture,
} from "./auth.server";

describe("development desk fixture", () => {
  it("exists only in development and takes its password from the environment", () => {
    const env = {
      APP_ENV: "development",
      DESK_DEVELOPMENT_PASSWORD: "runtime-only-password",
    };
    assert.deepEqual(
      developmentDeskFixture("admin@mechartcap.com", "runtime-only-password", env),
      {
        id: "development:admin@mechartcap.com",
        email: "admin@mechartcap.com",
        name: "Development Admin",
        role: "admin",
        mustRotate: false,
        sessionValidAfter: new Date(0),
        disabledAt: null,
      },
    );
    assert.equal(
      developmentDeskFixture("admin@mechartcap.com", "wrong", env),
      null,
    );
    assert.equal(
      developmentDeskFixture("admin@mechartcap.com", "runtime-only-password", {
        ...env,
        APP_ENV: "staging",
      }),
      null,
    );
  });

  it("keeps credential verification out of client-imported source", () => {
    const root = new URL("..", import.meta.url).pathname;
    for (const file of sourceFiles(root, ["app", "components", "lib"])) {
      const source = readFileSync(file, "utf8");
      assert.doesNotMatch(source, /MAC-Desk-2022/);
      if (/^["']use client["'];/m.test(source)) {
        assert.doesNotMatch(
          source,
          /staff-password|auth\.server|DESK_DEVELOPMENT_PASSWORD|DESK_SESSION_KEYS/,
          relative(root, file),
        );
      }
    }
  });

  it("routes staging, production, and live development only to the database", () => {
    assert.equal(deskAuthenticationMode({
      APP_ENV: "development",
      MAC_LIVE_BOOK: "off",
    }), "development-fixture");
    for (const env of [
      { APP_ENV: "development", MAC_LIVE_BOOK: "1" },
      { APP_ENV: "staging", MAC_LIVE_BOOK: "off" },
      { APP_ENV: "production", MAC_LIVE_BOOK: "1" },
    ]) {
      assert.equal(deskAuthenticationMode(env), "database");
    }
  });
});

function sourceFiles(root: string, directories: string[]) {
  const files: string[] = [];
  const visit = (directory: string) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (/\.(?:ts|tsx|mjs)$/.test(entry.name) && !/\.test\./.test(entry.name)) {
        files.push(path);
      }
    }
  };
  for (const directory of directories) visit(join(root, directory));
  return files;
}
