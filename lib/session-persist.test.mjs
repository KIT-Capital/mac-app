import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  persistableState,
  readSessionUser,
  writeSessionUser,
} from "./session-persist.mjs";

function memoryStorage() {
  const data = new Map();
  return {
    getItem(key) {
      return data.has(key) ? data.get(key) : null;
    },
    setItem(key, value) {
      data.set(key, String(value));
    },
    removeItem(key) {
      data.delete(key);
    },
  };
}

describe("session persist", () => {
  it("strips the signed-in user before writing the collection blob", () => {
    const saved = persistableState({
      hydrated: true,
      user: { email: "jonathan.hale@mechartcap.com", name: "Jonathan Hale" },
      timepieces: [{ id: "tp-1" }],
      profiles: { "jonathan.hale@mechartcap.com": { email: "jonathan.hale@mechartcap.com" } },
    });
    assert.equal(saved.user, null);
    assert.equal(saved.timepieces[0].id, "tp-1");
    assert.equal(saved.profiles["jonathan.hale@mechartcap.com"].email, "jonathan.hale@mechartcap.com");
  });

  it("does not restore a user from a leftover localStorage blob", () => {
    const saved = persistableState({
      user: { email: "old.session@example.com" },
    });
    assert.equal(saved.user, null);
    assert.equal(readSessionUser(memoryStorage()), null);
  });

  it("keeps the live user only in tab session storage", () => {
    const storage = memoryStorage();
    const hale = { email: "jonathan.hale@mechartcap.com", name: "Jonathan Hale" };
    writeSessionUser(storage, hale);
    assert.deepEqual(readSessionUser(storage), hale);
    writeSessionUser(storage, null);
    assert.equal(readSessionUser(storage), null);
  });

  it("ignores a malformed session payload", () => {
    const storage = memoryStorage();
    storage.setItem("mac-app-session-user-v1", "{not json");
    assert.equal(readSessionUser(storage), null);
    storage.setItem("mac-app-session-user-v1", JSON.stringify({ name: "No Email" }));
    assert.equal(readSessionUser(storage), null);
  });
});
