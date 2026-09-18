import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { agreementObjectKey, cappedPresignExpires } from "./agreement-object-key.mjs";

describe("agreement object key", () => {
  it("builds the server-owned live-document key", () => {
    assert.equal(
      agreementObjectKey({
        appEnv: "development",
        customerId: "cust-a",
        liveAgreementId: "repo-1",
        version: 2,
        documentId: "doc-9",
      }),
      "development/agreements/cust-a/repo-1/v2-doc-9.pdf",
    );
  });

  it("caps presign lifetime at five minutes", () => {
    assert.equal(cappedPresignExpires(120), 120);
    assert.equal(cappedPresignExpires(9999), 300);
    assert.equal(cappedPresignExpires(0), 300);
  });
});
