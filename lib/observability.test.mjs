import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  captureOperationalError,
  captureOperationalErrorOnce,
  filterSentryTransaction,
  scrubSentryEvent,
} from "./observability.mjs";

describe("Sentry observability", () => {
  it("scrubs credentials, recipient details, object keys, and signed URLs", () => {
    const event = scrubSentryEvent({
      request: {
        url: "https://example.r2.cloudflarestorage.com/private/key?X-Amz-Signature=secret",
        headers: {
          Cookie: "mac_collector=secret",
          "Idempotency-Key": "send-123",
          "X-Amz-Credential": "credential",
          accept: "application/json",
        },
        cookies: { mac_collector: "secret" },
        query_string: "token=secret",
      },
      breadcrumbs: [{
        category: "fetch",
        data: {
          to: "collector@example.com",
          recipientEmail: "collector@example.com",
          objectKey: "production/originals/customer/photo",
          path: "production/previews/customer/photo",
          url: "/verify?token=secret",
        },
      }],
      extra: {
        databaseUrl: "postgresql://user:password@example.invalid/database",
        token: "secret",
        note: "Send to collector@example.com",
        provider: "X-Amz-Credential=credential Cookie: secret",
        providerMessage: "request used Bearer secret-value",
        resendMessage: "provider key re_abcdefghijklmnopqrstuvwxyz",
      },
      tags: {
        error_code: "PHOTO_CHECKSUM_MISMATCH",
        record_id: "photo-123",
      },
    });

    assert.equal(event.request.url, "[Filtered URL]");
    assert.deepEqual(event.request.headers, { accept: "application/json" });
    assert.deepEqual(event.breadcrumbs[0].data, {
      path: "[Filtered Object Key]",
      url: "/verify",
    });
    assert.deepEqual(event.extra, {
      note: "Send to [Filtered Email]",
      provider: "X-Amz-Credential=[Filtered] Cookie=[Filtered]",
      providerMessage: "[Filtered Credential]",
      resendMessage: "[Filtered Credential]",
    });
    assert.deepEqual(event.tags, {
      error_code: "PHOTO_CHECKSUM_MISMATCH",
      record_id: "photo-123",
    });
  });

  it("drops health transactions and scrubs all other transactions", () => {
    assert.equal(filterSentryTransaction({ transaction: "GET /api/health" }), null);
    assert.deepEqual(
      filterSentryTransaction({
        transaction: "POST /api/photos",
        request: { url: "/api/photos?token=secret" },
      }),
      {
        transaction: "POST /api/photos",
        request: { url: "/api/photos" },
      },
    );
  });

  it("does nothing without a DSN and captures only safe operational context with one", async () => {
    const calls = [];
    await captureOperationalError(
      new Error("provider failed"),
      { operation: "mail.send", errorCode: "MAIL_SEND_FAILED", recordId: "send-123" },
      {
        env: {},
        captureException: (...args) => calls.push(args),
      },
    );
    assert.equal(calls.length, 0);

    const providerError = new Error("provider failed");
    await captureOperationalError(
      providerError,
      { operation: "mail.send", errorCode: "MAIL_SEND_FAILED", recordId: "send-123" },
      {
        env: { SENTRY_DSN: "https://public@example.invalid/1" },
        captureException: (...args) => calls.push(args),
      },
    );
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1], {
      tags: {
        operation: "mail.send",
        error_code: "MAIL_SEND_FAILED",
        record_id: "send-123",
      },
    });

    await captureOperationalError(
      providerError,
      { operation: "mail.send", errorCode: "MAIL_SEND_FAILED", recordId: "send-123" },
      {
        env: { SENTRY_DSN: "https://public@example.invalid/1" },
        captureException: (...args) => calls.push(args),
      },
    );
    assert.equal(calls.length, 1);
  });

  it("captures a repeated record failure once and never breaks the operation", async () => {
    const calls = [];
    const options = {
      env: { SENTRY_DSN: "https://public@example.invalid/1" },
      captureException: (...args) => calls.push(args),
    };
    const context = {
      operation: "photo.confirm",
      errorCode: "PHOTO_CHECKSUM_MISMATCH",
      recordId: "photo-dedupe-test",
    };
    await captureOperationalErrorOnce(new Error("first"), context, options);
    await captureOperationalErrorOnce(new Error("retry"), context, options);
    assert.equal(calls.length, 1);

    await assert.doesNotReject(() => captureOperationalError(
      new Error("provider failed"),
      { operation: "mail.send", errorCode: "MAIL_SEND_FAILED", recordId: "send-throw-test" },
      {
        env: { SENTRY_DSN: "https://public@example.invalid/1" },
        captureException: () => {
          throw new Error("Sentry unavailable");
        },
      },
    ));
  });

  it("allows a retry when the first deduplicated capture fails", async () => {
    let calls = 0;
    const options = {
      env: { SENTRY_DSN: "https://public@example.invalid/1" },
      captureException: () => {
        calls += 1;
        if (calls === 1) throw new Error("Sentry unavailable");
        return "event-retry";
      },
    };
    const context = {
      operation: "agreement.reconcile",
      errorCode: "DOCUMENT_CHECKSUM_MISMATCH",
      recordId: "document-retry-test",
    };

    assert.equal(
      await captureOperationalErrorOnce(new Error("first"), context, options),
      undefined,
    );
    assert.equal(
      await captureOperationalErrorOnce(new Error("retry"), context, options),
      "event-retry",
    );
    assert.equal(calls, 2);
  });
});
