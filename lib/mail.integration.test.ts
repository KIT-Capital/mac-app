import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dispatchCollectorAccessMail,
  dispatchMail,
  listOutbox,
} from "./mail";

const INTERNAL_EMAIL = "ricardo.cidale@norfolkgroup.io";

describe("mail delivery boundaries", () => {
  it("previews ordinary routed copies but refuses and forgets access mail", async () => {
    const env = { MAC_INTERNAL_EMAIL: INTERNAL_EMAIL };
    const collectorEmail = "collector@example.com";
    const result = await dispatchMail(
      {
        kind: "inquiry",
        name: "Collector",
        email: collectorEmail,
        message: "Please contact me about my collection.",
      },
      { env },
    );

    assert.equal(result.preview, true);
    assert.deepEqual(
      result.messages.map((message) => message.to),
      [[INTERNAL_EMAIL], [collectorEmail]],
    );

    const accessUrl =
      "https://development.example.com/api/collector-session/verify?token=secret-token-marker";
    await assert.rejects(
      () =>
        dispatchCollectorAccessMail(
          {
            to: collectorEmail,
            name: "Collector",
            action: "login",
            url: accessUrl,
          },
          { env },
        ),
      /COLLECTOR_ACCESS_EMAIL_REQUIRED/,
    );
    assert.equal(listOutbox().some((item) => item.kind === "access"), false);
    assert.equal(
      listOutbox().some((item) => item.text.includes("secret-token-marker")),
      false,
    );
  });

  it("fails access requests when Resend returns an error and retains no token", async () => {
    const accessUrl =
      "https://development.example.com/api/collector-session/verify?token=failed-token-marker";
    await assert.rejects(
      () =>
        dispatchCollectorAccessMail(
          {
            to: "collector@example.com",
            name: "Collector",
            action: "login",
            url: accessUrl,
          },
          {
            env: {
              RESEND_API_KEY: "test-api-key",
              MAC_INTERNAL_EMAIL: INTERNAL_EMAIL,
            },
            sendEmail: async () => ({
              data: null,
              error: { message: "Resend refused the message", name: "validation_error" },
            }),
          },
        ),
      /COLLECTOR_ACCESS_EMAIL_FAILED/,
    );
    assert.equal(listOutbox().some((item) => item.kind === "access"), false);
    assert.equal(
      listOutbox().some((item) => item.text.includes("failed-token-marker")),
      false,
    );
  });

  it("delivers access mail without retaining its URL in the desk outbox", async () => {
    const accessUrl =
      "https://development.example.com/api/collector-session/verify?token=delivered-token-marker";
    const delivered = await dispatchCollectorAccessMail(
      {
        to: "collector@example.com",
        name: "Collector",
        action: "login",
        url: accessUrl,
      },
      {
        env: {
          RESEND_API_KEY: "test-api-key",
          MAC_INTERNAL_EMAIL: INTERNAL_EMAIL,
        },
        sendEmail: async () => ({
          data: { id: "resend-test-id" },
          error: null,
        }),
      },
    );
    assert.equal(delivered.status, "sent");
    assert.equal(delivered.resendId, "resend-test-id");
    assert.equal(listOutbox().some((item) => item.kind === "access"), false);
    assert.equal(
      listOutbox().some((item) => item.text.includes("delivered-token-marker")),
      false,
    );
  });
});
