import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_INTERNAL_EMAIL,
  internalEmail,
  routeInternalRecipients,
} from "./internal-mail.mjs";

describe("internal MAC recipient routing", () => {
  it("uses the owner mailbox as the safe development prototype default", () => {
    assert.equal(DEFAULT_INTERNAL_EMAIL, "ricardo.cidale@norfolkgroup.io");
    assert.equal(internalEmail({}), DEFAULT_INTERNAL_EMAIL);
  });

  it("routes canonical MAC desk addresses through one configured recipient", () => {
    const env = { MAC_INTERNAL_EMAIL: " Owner+Mac@Example.com " };
    assert.deepEqual(
      routeInternalRecipients(
        [
          "info@mechartcap.com",
          "finance@mechartcap.com",
          "financing@mechartcap.com",
          "collector@example.com",
        ],
        env,
      ),
      ["owner+mac@example.com", "collector@example.com"],
    );
  });

  it("keeps collector copies addressed to collectors while desk copies route", () => {
    const env = { MAC_INTERNAL_EMAIL: "ricardo.cidale@norfolkgroup.io" };
    assert.deepEqual(routeInternalRecipients(["collector@example.com"], env), [
      "collector@example.com",
    ]);
    assert.deepEqual(routeInternalRecipients(["financing@mechartcap.com"], env), [
      "ricardo.cidale@norfolkgroup.io",
    ]);
  });

  it("rejects an invalid configured internal mailbox", () => {
    assert.throws(
      () => routeInternalRecipients(["info@mechartcap.com"], { MAC_INTERNAL_EMAIL: "not-email" }),
      /MAC_INTERNAL_EMAIL_INVALID/,
    );
  });
});
