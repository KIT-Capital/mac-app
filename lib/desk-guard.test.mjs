import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DESK_FORBIDDEN, deskApiStatus, deskPageStatus, isDeskPage } from "./desk-guard.mjs";

const session = { email: "admin@mechartcap.com", role: "admin" };

describe("desk page matching", () => {
  it("treats /admin and nested desk routes as desk pages", () => {
    assert.equal(isDeskPage("/admin"), true);
    assert.equal(isDeskPage("/admin/"), true);
    assert.equal(isDeskPage("/admin/mail"), true);
    assert.equal(isDeskPage("/admin/assets"), true);
  });

  it("does not treat lookalike or collector paths as desk pages", () => {
    assert.equal(isDeskPage("/administration"), false);
    assert.equal(isDeskPage("/admin-tools"), false);
    assert.equal(isDeskPage("/collection"), false);
    assert.equal(isDeskPage("/api/mail"), false);
    assert.equal(isDeskPage("/"), false);
  });
});

describe("desk page status", () => {
  it("returns 403 for desk pages without a staff session", () => {
    assert.equal(deskPageStatus("/admin", null), DESK_FORBIDDEN);
    assert.equal(deskPageStatus("/admin/mail", undefined), DESK_FORBIDDEN);
    assert.equal(DESK_FORBIDDEN, 403);
  });

  it("allows desk pages with a staff session and leaves other paths open", () => {
    assert.equal(deskPageStatus("/admin", session), 200);
    assert.equal(deskPageStatus("/admin/mail", session), 200);
    assert.equal(deskPageStatus("/collection", null), 200);
    assert.equal(deskPageStatus("/api/mail", null), 200);
  });
});

describe("desk API status", () => {
  it("returns 403 without a staff session and 200 with one", () => {
    assert.equal(deskApiStatus(null), 403);
    assert.equal(deskApiStatus(session), 200);
  });

  it("does not treat a raw cookie string or a collector stub as a session", () => {
    assert.equal(deskPageStatus("/admin", "payload.sig"), 403);
    assert.equal(deskPageStatus("/admin", { email: "jonathan.hale@mechartcap.com", role: "collector" }), 403);
    assert.equal(deskApiStatus("payload.sig"), 403);
    assert.equal(deskApiStatus({ email: "jonathan.hale@mechartcap.com", role: "collector" }), 403);
  });
});
