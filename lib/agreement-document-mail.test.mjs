import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PENDING_COUNSEL_LABEL } from "./contract/repo-agreement-snapshot.mjs";
import {
  composeAgreementDocumentMail,
  confirmOtherRecipient,
  dispatchAgreementDocumentMail,
  resolveSendRecipient,
} from "./agreement-document-mail.mjs";

describe("agreement document mail", () => {
  it("uses the pending-counsel label in the subject and body", () => {
    const mail = composeAgreementDocumentMail({
      agreementCode: "MAC-400K-12",
      recipientEmail: "seller@mac.test",
    });
    assert.match(mail.subject, /pending legal approval/);
    assert.match(mail.subject, /not for signature/);
    assert.match(mail.text, new RegExp(PENDING_COUNSEL_LABEL));
    assert.match(mail.html, /not for signature/);
    const injected = composeAgreementDocumentMail({
      agreementCode: 'MAC-<script>alert(1)</script>',
      recipientEmail: "seller@mac.test",
    });
    assert.match(injected.html, /MAC-&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(injected.html, /<script>/);
    assert.equal(mail.to[0], "seller@mac.test");
  });

  it("emails self from the verified collector address and ignores a client address", () => {
    const resolved = resolveSendRecipient(
      { role: "collector", customerId: "c1", email: "Owner@Mac.Test" },
      { recipientKind: "self", address: "other@example.com", confirmAddress: "other@example.com" },
    );
    assert.deepEqual(resolved, { recipientKind: "self", recipientEmail: "owner@mac.test" });
  });

  it("requires two identical confirmed other addresses", () => {
    assert.equal(
      confirmOtherRecipient(" Friend@Mac.Test ", "friend@mac.test"),
      "friend@mac.test",
    );
    assert.throws(
      () => confirmOtherRecipient("friend@mac.test", "other@mac.test"),
      { message: "DOCUMENT_RECIPIENT_UNCONFIRMED" },
    );
    assert.throws(
      () => confirmOtherRecipient("friend@mac.test", ""),
      { message: "DOCUMENT_RECIPIENT_UNCONFIRMED" },
    );
    assert.throws(
      () => resolveSendRecipient(
        { role: "collector", customerId: "c1", email: "owner@mac.test" },
        { recipientKind: "other", address: "friend@mac.test" },
      ),
      { message: "DOCUMENT_RECIPIENT_UNCONFIRMED" },
    );
  });

  it("does not call Resend when checksum work is skipped and preview has no key", async () => {
    let called = 0;
    const result = await dispatchAgreementDocumentMail(
      {
        ...composeAgreementDocumentMail({ agreementCode: "MAC-1", recipientEmail: "a@mac.test" }),
        bytes: new Uint8Array([1, 2, 3]),
      },
      {
        env: {},
        sendEmail: async () => {
          called += 1;
          return { data: { id: "re_x" }, error: null };
        },
      },
    );
    assert.equal(result.status, "preview");
    assert.equal(called, 0);
  });

  it("attaches the supplied bytes when a sender is injected", async () => {
    let payload;
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const result = await dispatchAgreementDocumentMail(
      {
        ...composeAgreementDocumentMail({ agreementCode: "MAC-1", recipientEmail: "a@mac.test" }),
        bytes,
      },
      {
        env: { RESEND_API_KEY: "re_test", RESEND_FROM_EMAIL: "Mechanical Art Capital <info@mechartcap.com>" },
        sendEmail: async (message) => {
          payload = message;
          return { data: { id: "re_ok" }, error: null };
        },
      },
    );
    assert.equal(result.status, "accepted");
    assert.equal(result.id, "re_ok");
    assert.equal(payload.from, "Mechanical Art Capital <info@mechartcap.com>");
    assert.deepEqual(payload.to, ["a@mac.test"]);
    assert.equal(payload.attachments[0].filename, "MAC-1.pdf");
    assert.deepEqual(Uint8Array.from(payload.attachments[0].content), bytes);
    assert.match(payload.subject, /pending legal approval/);
  });
});
