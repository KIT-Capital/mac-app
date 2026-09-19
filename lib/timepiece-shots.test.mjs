import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  TIMEPIECE_SHOTS,
  formatIntakeList,
  intakePhotoErrors,
  missingRequiredShots,
  packShots,
  requiredShotKinds,
  slotsFromExisting,
} from "./timepiece-shots.mjs";

describe("timepiece shots", () => {
  it("guides collectors through five required barrel and clasp photos plus optional box and papers", () => {
    const prompts = TIMEPIECE_SHOTS.map((shot) => shot.prompt);
    assert.ok(prompts.includes("Upload a photo of the right side of the barrel"));
    assert.ok(prompts.includes("Upload a photo of the clasp"));
    assert.deepEqual(requiredShotKinds(true), ["front", "back", "left", "right", "clasp"]);
    assert.deepEqual(requiredShotKinds(false), ["front", "back", "left"]);
    assert.deepEqual(
      TIMEPIECE_SHOTS.filter((shot) => shot.optional).map((shot) => shot.kind),
      ["box", "papers"],
    );
  });

  it("blocks Save until required shots and both custody statements are present", () => {
    const empty = ["", "", "", "", "", "", ""];
    assert.deepEqual(missingRequiredShots(empty, true), ["front", "back", "left", "right", "clasp"]);
    const five = ["f", "b", "l", "r", "c", "", ""];
    assert.deepEqual(missingRequiredShots(five, true), []);
    assert.match(
      intakePhotoErrors({ slots: five, hasBox: false, hasPapers: false, requireFourPhotos: true }).join(" "),
      /box/,
    );
    assert.match(
      intakePhotoErrors({ slots: five, hasBox: true, hasPapers: false, requireFourPhotos: true }).join(" "),
      /original documentation/,
    );
    assert.deepEqual(
      intakePhotoErrors({ slots: five, hasBox: true, hasPapers: true, requireFourPhotos: true }),
      [],
    );
    const liveSlots = [
      { status: "stored", value: "photo-front" },
      { status: "stored", value: "photo-back" },
      { status: "stored", value: "photo-left" },
      { status: "selected", value: "preview-right" },
      { status: "failed", value: "preview-clasp" },
      null,
      null,
    ];
    assert.deepEqual(
      intakePhotoErrors({ slots: liveSlots, hasBox: true, hasPapers: true, requireFourPhotos: true }),
      ["a photo of the right side of the barrel", "a photo of the clasp"],
    );
  });

  it("packs filled shots with kinds so optional papers is not stored as the box", () => {
    const slots = ["front-url", "", "left-url", "", "clasp-url", "", "papers-url"];
    assert.deepEqual(packShots(slots), [
      { url: "front-url", kind: "front" },
      { url: "left-url", kind: "left" },
      { url: "clasp-url", kind: "clasp" },
      { url: "papers-url", kind: "papers" },
    ]);
  });

  it("restores saved kinds into the guided slots", () => {
    const slots = slotsFromExisting(["papers-url", "front-url"], ["papers", "front"]);
    assert.equal(slots[0], "front-url");
    assert.equal(slots[6], "papers-url");
    assert.equal(formatIntakeList(["a photo of the clasp", "confirmation you have the box"]), "a photo of the clasp and confirmation you have the box");
  });
});
