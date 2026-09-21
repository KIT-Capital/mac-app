import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { APPLICATION_TERMS } from "./contract/repo-scale.mjs";
import {
  chooseBookState,
  liveDeskOverlay,
  evaluateLiveBookRuntime,
  freshReconciliationAction,
  mergeLocalDataPreviews,
  parseLiveBookResponse,
  selectLiveUser,
  shouldPersistBrowserBook,
  operationDisposition,
  shouldApplyReconciliation,
  liveBookFailureState,
  mergeLiveSettings,
  parseLiveBookMutationResponse,
  readAfterInFlight,
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

  it("does not inherit demo catalog, shells, or settings from the browser book", () => {
    const overlay = liveDeskOverlay({
      timepieces: [],
      agreements: [],
      users: [],
      photos: [],
      profiles: {},
    });
    assert.deepEqual(overlay, { catalog: [], brands: [], shells: [], settings: null });
    const supplied = liveDeskOverlay({
      catalog: [{ id: "ref-1" }],
      shells: [{ id: "shell-1" }],
      settings: { companyName: "Mechanical Art Capital" },
    });
    assert.deepEqual(supplied.catalog, [{ id: "ref-1" }]);
    assert.deepEqual(supplied.shells, [{ id: "shell-1" }]);
    assert.equal(supplied.settings.companyName, "Mechanical Art Capital");
  });

  it("preserves client-owned appearance across live settings reconciliation", () => {
    assert.deepEqual(
      mergeLiveSettings(
        { maxLtv: 0.55, appearance: "dark" },
        { appearance: "light" },
        null,
      ),
      { maxLtv: 0.55, appearance: "light" },
    );
    assert.equal(
      mergeLiveSettings(
        { maxLtv: 0.55, appearance: "dark" },
        { appearance: "dark" },
        { preferences: { appearance: "light" } },
      ).appearance,
      "light",
    );
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
    for (const appEnv of ["development", "staging", "ci", "production"]) {
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

  it("keeps password rotation distinct from an unknown live-book failure", () => {
    assert.deepEqual(
      parseLiveBookResponse(409, {
        mode: "live",
        error: "PASSWORD_ROTATION_REQUIRED",
      }),
      {
        ok: false,
        mode: "rotation",
        error: "PASSWORD_ROTATION_REQUIRED",
      },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(409, {
        mode: "live",
        error: "PASSWORD_ROTATION_REQUIRED",
      }),
      {
        ok: false,
        mode: "rotation",
        error: "PASSWORD_ROTATION_REQUIRED",
      },
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
        book: {
          timepieces: [],
          agreements: [],
          users: [],
          photos: [],
          appraisalAttempts: [],
          appraisalAttemptPhotos: [],
          profiles: {},
          catalog: [],
          shells: [],
          settings: { maxLtv: 0.6 },
          applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.55 },
        },
      }),
      {
        ok: true,
        mode: "live",
        viewer: { role: "collector", email: "collector@example.com", customerId: "c1" },
        book: {
          timepieces: [],
          agreements: [],
          users: [],
          photos: [],
          appraisalAttempts: [],
          appraisalAttemptPhotos: [],
          profiles: {},
          catalog: [],
          shells: [],
          settings: { maxLtv: 0.6 },
          applicationPurchaseShares: { 3: 0.55, 6: 0.55, 8: 0.55, 9: 0.45, 12: 0.55 },
        },
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
    assert.deepEqual(
      parseLiveBookResponse(200, {
        mode: "live",
        viewer: { role: "appraiser", email: "desk@example.com" },
        book: {
          timepieces: [],
          agreements: [],
          users: [],
          photos: [],
          profiles: {},
          applicationPurchaseShares: { 12: 0.55 },
        },
      }),
      { ok: false, mode: "unknown" },
    );
    const completeBook = {
      timepieces: [],
      agreements: [],
      users: [],
      photos: [],
      appraisalAttempts: [],
      appraisalAttemptPhotos: [],
      profiles: {},
      catalog: [],
      shells: [],
      settings: { maxLtv: 0.6 },
      applicationPurchaseShares: Object.fromEntries(APPLICATION_TERMS.map((term) => [term, 0.55])),
    };
    for (const role of ["admin", "appraiser", "super_admin"]) {
      const viewer = { role, email: "desk@example.com" };
      assert.deepEqual(
        parseLiveBookResponse(200, { mode: "live", viewer, book: completeBook }),
        { ok: true, mode: "live", viewer, book: completeBook },
        role,
      );
    }
    // The retired staff role is no longer a valid live viewer.
    assert.deepEqual(
      parseLiveBookResponse(200, {
        mode: "live",
        viewer: { role: "staff", email: "desk@example.com" },
        book: completeBook,
      }),
      { ok: false, mode: "unknown" },
    );
    assert.deepEqual(
      parseLiveBookResponse(200, {
        mode: "live",
        viewer: { role: "collector", email: "collector@example.com", customerId: "c1" },
        book: {
          timepieces: [],
          agreements: [],
          users: [],
          photos: [],
          profiles: {},
          catalog: [],
          shells: [],
          settings: { maxLtv: 0.6 },
        },
      }),
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
    const desk = { email: "desk@mechartcap.com", role: "appraiser" };
    assert.deepEqual(
      selectLiveUser({ role: "appraiser", email: "desk@mechartcap.com" }, desk, {}),
      desk,
    );
    assert.deepEqual(
      selectLiveUser({ role: "admin", email: "admin@mechartcap.com" }, null, {}),
      { role: "admin", email: "admin@mechartcap.com" },
    );
    assert.deepEqual(
      selectLiveUser({ role: "super_admin", email: "rc@mechartcap.com" }, null, {}),
      { role: "super_admin", email: "rc@mechartcap.com" },
    );
    assert.deepEqual(
      selectLiveUser(
        { role: "appraiser", email: "desk@mechartcap.com" },
        { role: "collector", email: "old@example.com" },
        {},
      ),
      { role: "appraiser", email: "desk@mechartcap.com" },
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
      appraisalAttempts: [{ id: "server-attempt" }],
      appraisalAttemptPhotos: [{ attemptId: "server-attempt", photoId: "server-photo" }],
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
      appraisalAttempts: [{ id: "browser-attempt" }],
      appraisalAttemptPhotos: [{ attemptId: "browser-attempt", photoId: "browser-photo" }],
    };
    const merged = mergeLocalDataPreviews(server, local);
    assert.deepEqual(merged.timepieces[0].images, ["/server.jpg", "data:image/jpeg;base64,one"]);
    assert.deepEqual(merged.photos.map((row) => row.id), ["local-1"]);
    assert.equal(JSON.stringify(merged).includes("removed"), false);
    assert.equal(JSON.stringify(merged).includes("other"), false);
    assert.deepEqual(merged.appraisalAttempts, [{ id: "server-attempt" }]);
    assert.deepEqual(merged.appraisalAttemptPhotos, [
      { attemptId: "server-attempt", photoId: "server-photo" },
    ]);
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

  it("discards an in-flight pre-mutation read before starting the fresh read", async () => {
    let release;
    const order = [];
    const inFlight = new Promise((resolve) => {
      release = () => {
        order.push("stale-finished");
        resolve({ book: "stale" });
      };
    });
    const fresh = readAfterInFlight(inFlight, async () => {
      order.push("fresh-started");
      return { book: "fresh" };
    });
    await Promise.resolve();
    assert.deepEqual(order, []);
    release();
    assert.deepEqual(await fresh, { book: "fresh" });
    assert.deepEqual(order, ["stale-finished", "fresh-started"]);
  });

  it("honors an authoritative browser rollback on the fresh post-mutation read", () => {
    assert.equal(
      freshReconciliationAction({ ok: true, mode: "browser" }),
      "browser",
    );
    assert.equal(
      freshReconciliationAction({ ok: true, mode: "live", book: {} }),
      "live",
    );
    assert.equal(
      freshReconciliationAction({ ok: false, mode: "unknown" }),
      "ignore",
    );
  });

  it("parses durable mutation acknowledgement independently from reads", () => {
    assert.deepEqual(
      parseLiveBookMutationResponse(200, { mode: "live", acknowledged: true }),
      { ok: true, mode: "live", acknowledged: true },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(200, {
        mode: "live",
        acknowledged: true,
        rangeWarning: "above",
      }),
      { ok: true, mode: "live", acknowledged: true, rangeWarning: "above" },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(200, { mode: "browser" }),
      { ok: true, mode: "browser" },
    );
    assert.deepEqual(
      parseLiveBookMutationResponse(422, { mode: "live", error: "AMOUNT_ABOVE_CAP" }),
      { ok: false, mode: "live", error: "AMOUNT_ABOVE_CAP" },
    );
  });

  it("publishes a hydrated empty safe state after bounded read failure", () => {
    const failed = liveBookFailureState({ catalog: ["local"], settings: { appearance: "dark" } });
    assert.equal(failed.hydrated, true);
    assert.deepEqual(failed.timepieces, []);
    assert.deepEqual(failed.agreements, []);
    assert.deepEqual(failed.appraisalAttempts, []);
    assert.deepEqual(failed.appraisalAttemptPhotos, []);
    assert.deepEqual(failed.catalog, ["local"]);
  });
});
