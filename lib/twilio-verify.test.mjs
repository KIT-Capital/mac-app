import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkTwilioSmsVerification,
  readTwilioVerifyConfig,
  startTwilioSmsVerification,
} from "./twilio-verify.mjs";

const env = {
  TWILIO_ACCOUNT_SID: "ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  TWILIO_AUTH_TOKEN: "test-token",
  TWILIO_VERIFY_SERVICE_SID: "VAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
};

describe("Twilio Verify adapter", () => {
  it("reads complete key names and ignores incomplete env", () => {
    assert.equal(readTwilioVerifyConfig({}), null);
    assert.equal(readTwilioVerifyConfig({ TWILIO_ACCOUNT_SID: env.TWILIO_ACCOUNT_SID }), null);
    const config = readTwilioVerifyConfig(env);
    assert.equal(config.accountSid, env.TWILIO_ACCOUNT_SID);
    assert.equal(config.serviceSid, env.TWILIO_VERIFY_SERVICE_SID);
  });

  it("starts an SMS verification without putting the code or token in the URL", async () => {
    const calls = [];
    await startTwilioSmsVerification("+12125550100", env, async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true };
    });
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/Verifications$/);
    assert.doesNotMatch(calls[0].url, /test-token|12125550100|Code=/);
    assert.match(String(calls[0].init.body), /To=%2B12125550100/);
    assert.match(String(calls[0].init.body), /Channel=sms/);
  });

  it("treats only an approved check as success and hides provider detail", async () => {
    const approved = await checkTwilioSmsVerification(
      "+12125550100",
      "424242",
      env,
      async () => ({ ok: true, json: async () => ({ status: "approved" }) }),
    );
    assert.equal(approved, true);
    await assert.rejects(
      () => startTwilioSmsVerification("+12125550100", env, async () => {
        throw new Error("sid ACaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa code 424242");
      }),
      (error) => {
        assert.equal(error.message, "COLLECTOR_ACCESS_SMS_FAILED");
        return true;
      },
    );
  });
});
