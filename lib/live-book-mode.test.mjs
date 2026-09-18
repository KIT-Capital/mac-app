import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  chooseBookState,
  evaluateLiveBookRuntime,
  mergeLocalDataPreviews,
  parseLiveBookResponse,
  selectLiveUser,
  shouldPersistBrowserBook,
  operationDisposition,
  shouldApplyReconciliation,
  liveBookFailureState,
  parseLiveBookMutationResponse,
  shouldRecheckLiveBook,
} from "./live-book-mode.mjs";

const browser = {
  timepieces: [{ id: "blob-piece" }],
  agreements: [{ id: "blob-repo" }],
  users: [{ id: "blob-user" }],
  photos: [{ id: "blob-photo" }],
  profiles: { "blob@example.com": { email: "blob@example.com" } },
};

describe("live-book selection", () => {
  it("keeps browser rows when the flag is off even if Neon has rows", () => {
    const neon = {
      timepieces: [{ id: "neon-piece" }],
      agreements: [{ id: "neon-repo" }],
      users: [{ id: "neon-user" }],
      photos: [],
      profiles: {},
    };
    assert.equal(chooseBookState("browser", browser, neon), browser);
  });

  it("uses an empty live book without falling back to browser rows", () => {
    const selected = chooseBookState("live", browser, {
      timepieces: [],
      agreements: [],
      users: [],
      photos: [],
      profiles: {},
    });
    assert.deepEqual(selected.timepieces, []);
    assert.deepEqual(selected.agreements, []);
    assert.notEqual(selected, browser);
  });

  it("opens the database only for an enabled runtime on a known APP_ENV", () => {
    assert.deepEqual(evaluateLiveBookRuntime({}), { ok: true, mode: "browser" });
    for (const appEnv of ["development", "staging", "production"]) {
      assert.deepEqual(
        evaluateLiveBookRuntime({ MAC_LIVE_BOOK: "1", APP_ENV: appEnv }),
        { ok: true, mode: "live" },
      );
    }
    assert.deepEqual(
      evaluateLiveBookRuntime({ MAC_LIVE_BOOK: "1", APP_ENV: "preview" }),
      { ok: false, mode: "live", error: "LIVE_BOOK_APP_ENV_INVALID" },
    );
  });

  it("treats an unavailable body as its own mode at any status", () => {
    assert.deepEqual(
      parseLiveBookResponse(503, { mode: "unavailable", error: "COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED" }),
      { ok: false, mode: "unavailable", error: "COLLECTOR_MAGIC_LINK_ORIGIN_REQUIRED" },
    );
    assert.deepEqual(
      parseLiveBookResponse(200, { mode: "unavailable" }),
      { ok: false, mode: "unavailable", error: "LIVE_BOOK_UNAVAILABLE" },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(503, { mode: "unavailable", error: "R2_REQUIRED" }),
      { ok: false, mode: "unavailable", error: "R2_REQUIRED" },
    );
  });

  it("does not re-check the server while unavailable", () => {
    assert.equal(shouldRecheckLiveBook("unavailable"), false);
    assert.equal(shouldRecheckLiveBook("unknown"), true);
    assert.equal(shouldRecheckLiveBook("browser"), true);
    assert.equal(shouldRecheckLiveBook("live"), true);
  });

  it("enters live mode only for an ok response with a valid book", () => {
    assert.deepEqual(
      parseLiveBookResponse(200, {
        mode: "live",
        viewer: { role: "collector", email: "collector@example.com", customerId: "c1" },
        book: { timepieces: [], agreements: [], users: [], photos: [], profiles: {} },
      }),
      {
        ok: true,
        mode: "live",
        viewer: { role: "collector", email: "collector@example.com", customerId: "c1" },
        book: { timepieces: [], agreements: [], users: [], photos: [], profiles: {} },
      },
    );
    assert.deepEqual(
      parseLiveBookResponse(401, { mode: "live", book: { timepieces: [] } }),
      { ok: false, mode: "unknown" },
    );
    assert.deepEqual(
      parseLiveBookResponse(200, { mode: "live", book: { timepieces: [] } }),
      { ok: false, mode: "unknown" },
    );
  });

  it("honors owner rollback to browser mode", () => {
    assert.deepEqual(parseLiveBookResponse(200, { mode: "browser" }), {
      ok: true,
      mode: "browser",
    });
  });

  it("hydrates a verified collector from their one scoped server profile", () => {
    const profile = { email: "collector@example.com", role: "collector" };
    const viewer = { role: "collector", email: "collector@example.com", customerId: "c1" };
    assert.equal(selectLiveUser(viewer, null, { "collector@example.com": profile }), profile);
    const stale = { email: "old@example.com", role: "collector" };
    assert.equal(selectLiveUser(viewer, stale, { "collector@example.com": profile }), profile);
    const desk = { email: "desk@mechartcap.com", role: "staff" };
    assert.deepEqual(
      selectLiveUser({ role: "staff", email: "desk@mechartcap.com" }, desk, {}),
      desk,
    );
    assert.deepEqual(
      selectLiveUser({ role: "admin", email: "admin@mechartcap.com" }, null, {}),
      { role: "admin", email: "admin@mechartcap.com" },
    );
    assert.deepEqual(
      selectLiveUser(
        { role: "staff", email: "desk@mechartcap.com" },
        { role: "collector", email: "old@example.com" },
        {},
      ),
      { role: "staff", email: "desk@mechartcap.com" },
    );
    assert.equal(selectLiveUser(viewer, desk, { "collector@example.com": profile }), profile);
    assert.equal(selectLiveUser(null, null, {
      "a@example.com": profile,
      "b@example.com": { ...profile, email: "b@example.com" },
    }), null);
  });

  it("merges only matching local data previews into authoritative live rows", () => {
    const server = {
      timepieces: [{ id: "piece-1", images: ["/server.jpg"], photoKinds: ["front"] }],
      agreements: [],
      users: [],
      photos: [],
      profiles: {},
    };
    const local = {
      timepieces: [
        { id: "piece-1", images: ["data:image/jpeg;base64,one"], photoKinds: ["back"] },
        { id: "removed-piece", images: ["data:image/jpeg;base64,removed"], photoKinds: ["front"] },
      ],
      photos: [
        { id: "local-1", assetId: "piece-1", url: "data:image/jpeg;base64,one", kind: "back" },
        { id: "local-2", assetId: "other-piece", url: "data:image/jpeg;base64,other", kind: "front" },
      ],
    };
    const merged = mergeLocalDataPreviews(server, local);
    assert.deepEqual(merged.timepieces[0].images, ["/server.jpg", "data:image/jpeg;base64,one"]);
    assert.deepEqual(merged.photos.map((row) => row.id), ["local-1"]);
    assert.equal(JSON.stringify(merged).includes("removed"), false);
    assert.equal(JSON.stringify(merged).includes("other"), false);
  });

  it("never persists a rollback book while mode is unknown", () => {
    assert.equal(shouldPersistBrowserBook("unknown"), false);
    assert.equal(shouldPersistBrowserBook("live"), false);
    assert.equal(shouldPersistBrowserBook("browser"), true);
  });

  it("deliberately dispatches only after live activation", () => {
    assert.equal(operationDisposition("live"), "dispatch");
    assert.equal(operationDisposition("browser"), "browser-only");
    assert.equal(operationDisposition("unknown"), "discover");
    assert.equal(operationDisposition("unavailable"), "refuse");
  });

  it("never persists a browser book while unavailable", () => {
    assert.equal(shouldPersistBrowserBook("unavailable"), false);
  });

  it("forces failed-operation rollback across newer optimistic generations", () => {
    assert.equal(shouldApplyReconciliation(false, 1, 2), false);
    assert.equal(shouldApplyReconciliation(true, 1, 2), true);
  });

  it("parses durable mutation acknowledgement independently from reads", () => {
    assert.deepEqual(
      parseLiveBookMutationResponse(200, { mode: "live", acknowledged: true }),
      { ok: true, mode: "live", acknowledged: true },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(200, { mode: "browser" }),
      { ok: true, mode: "browser" },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(422, { mode: "live", error: "OVER_LTV" }),
      { ok: false, mode: "live", error: "OVER_LTV" },
    );
  });

  it("publishes a hydrated empty safe state after bounded read failure", () => {
    const failed = liveBookFailureState({ catalog: ["local"], settings: { appearance: "dark" } });
    assert.equal(failed.hydrated, true);
    assert.deepEqual(failed.timepieces, []);
    assert.deepEqual(failed.agreements, []);
    assert.deepEqual(failed.catalog, ["local"]);
  });
});
