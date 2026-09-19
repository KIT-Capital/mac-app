import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { COLLECTOR_GUIDE, COLLECTOR_LINKS, COLLECTOR_PRIMARY } from "./nav";

describe("collector navigation", () => {
  it("keeps the 2022 five-tab bar and guide in the drawer only", () => {
    assert.deepEqual(
      COLLECTOR_PRIMARY.map(({ label }) => label),
      ["Timepieces", "Add a timepiece", "Repurchase", "Contact us", "Account"],
    );
    assert.equal(COLLECTOR_PRIMARY.length, 5);
    assert.equal(COLLECTOR_PRIMARY.some(({ href }) => href === COLLECTOR_GUIDE.href), false);
    assert.equal(COLLECTOR_LINKS.includes(COLLECTOR_GUIDE), true);
  });
});
